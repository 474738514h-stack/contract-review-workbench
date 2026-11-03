import "server-only";

import { fieldsFromContent, mergeFields, type WorkflowFields } from "@/lib/parse-review";

const DEFAULT_BASE = "https://api.coze.cn";

export class CozeRequestError extends Error {
  code?: number;
  userMessage: string;

  constructor(userMessage: string, code?: number) {
    super(userMessage);
    this.name = "CozeRequestError";
    this.userMessage = userMessage;
    this.code = code;
  }
}

export type StreamOutcome = {
  fields: WorkflowFields;
  interrupt: {
    nodeTitle: string;
    eventId: string;
    interruptType: number;
    authUrl: string | null;
  } | null;
};

function redact(value: string) {
  return value.replace(/pat_[A-Za-z0-9]+/g, "[REDACTED]").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || "";
}

export function cozeConfigured() {
  return Boolean(env("COZE_PAT") && env("COZE_WORKFLOW_ID"));
}

export function reviewUsesMock() {
  const source = env("REVIEW_SOURCE").toLowerCase();
  if (source === "mock" || source === "demo") return true;
  if (source === "live") return !cozeConfigured();
  return !cozeConfigured();
}

function apiBase() {
  return (env("COZE_API_BASE") || DEFAULT_BASE).replace(/\/$/, "");
}

function token() {
  const value = env("COZE_PAT");
  if (!value) throw new CozeRequestError("扣子访问令牌未配置，当前无法调用工作流。");
  return value;
}

function workflowId() {
  const value = env("COZE_WORKFLOW_ID");
  if (!value) throw new CozeRequestError("扣子工作流未配置，当前无法调用工作流。");
  return value;
}

export function toUserMessage(code: number | undefined, message: string) {
  const clean = redact(message).replace(/\s+/g, " ").trim().slice(0, 180);
  if (code === 4100 || /authentication|unauthorized|access token|token/i.test(clean)) {
    return "扣子访问令牌无效或权限不足，请更新服务端配置后重试。";
  }
  if (code === 4200) return "扣子工作流不存在或尚未发布，请确认后再试。";
  if (/timeout|timed out|超时|abort/i.test(clean)) return "扣子工作流响应超时，请稍后重新尝试。";
  if (!clean) return "扣子工作流暂时无法调用，请稍后重新尝试。";
  return `扣子工作流暂时无法调用：${clean}`;
}

function safeAuthUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "open.feishu.cn" ||
      host === "accounts.feishu.cn" ||
      host.endsWith(".feishu.cn") ||
      host.endsWith(".larksuite.com") ||
      host.endsWith(".larkoffice.com");
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function collectAuthUrl(value: unknown, found: string[] = []): string | null {
  if (typeof value === "string") {
    const parsed = value.trim().startsWith("{") || value.trim().startsWith("[") ? safeJson(value) : null;
    if (parsed) collectAuthUrl(parsed, found);
    const matches = value.match(/https:\/\/[^\s"\\]+/g) ?? [];
    for (const match of matches) {
      const url = safeAuthUrl(match.replace(/\\u0026/g, "&"));
      if (url) found.push(url);
    }
    return found[0] ?? null;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectAuthUrl(nested, found);
  }
  return found[0] ?? null;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

type SseEvent = { event: string; data: string };

async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);
      if (parsed) yield parsed;
    }
  }
  const last = parseSseChunk(buffer);
  if (last) yield last;
}

function parseSseChunk(chunk: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of chunk.split(/\n/)) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (trimmed.startsWith("event:")) event = trimmed.slice(6).trim();
    else if (trimmed.startsWith("data:")) data.push(trimmed.slice(5).trim());
  }
  if (!data.length) return null;
  return { event, data: data.join("\n") };
}

async function readWorkflowStream(stream: ReadableStream<Uint8Array>): Promise<StreamOutcome> {
  let fields: WorkflowFields = { output: "", output1: "", enterprise: "", url: "" };
  const buffers = new Map<string, string>();
  let interrupt: StreamOutcome["interrupt"] = null;

  for await (const item of readSse(stream)) {
    const event = item.event.toLowerCase();
    if (event === "ping") continue;
    if (event === "error") {
      const payload = safeJson(item.data) as { error_code?: number; error_message?: string; code?: number; msg?: string } | null;
      const code = payload?.error_code ?? payload?.code;
      const message = payload?.error_message || payload?.msg || "";
      throw new CozeRequestError(toUserMessage(code, message), code);
    }
    if (event === "interrupt") {
      const payload = safeJson(item.data) as {
        node_title?: string;
        interrupt_data?: { event_id?: string; type?: number; data?: unknown };
      } | null;
      const info = payload?.interrupt_data;
      interrupt = {
        nodeTitle: payload?.node_title || "飞书报告",
        eventId: info?.event_id || "",
        interruptType: info?.type ?? 7,
        authUrl: collectAuthUrl(info?.data ?? payload),
      };
      continue;
    }
    if (event !== "message") continue;
    const payload = safeJson(item.data) as {
      content?: string;
      node_title?: string;
      node_is_finish?: boolean;
    } | null;
    const content = payload?.content || "";
    if (!content || content === "{}") continue;
    const key = payload?.node_title || "output";
    const next = `${buffers.get(key) || ""}${content}`;
    if (next.length > 2_000_000) {
      throw new CozeRequestError("扣子返回的审查内容过长，请缩短合同后重新尝试。");
    }
    if (payload?.node_is_finish) {
      buffers.delete(key);
      fields = mergeFields(fields, fieldsFromContent(next));
    } else {
      buffers.set(key, next);
    }
  }

  for (const content of buffers.values()) {
    fields = mergeFields(fields, fieldsFromContent(content));
  }
  return { fields, interrupt };
}

async function postWorkflow(path: string, body: unknown): Promise<StreamOutcome> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(360_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new CozeRequestError("扣子工作流响应超时，请稍后重新尝试。");
    }
    throw new CozeRequestError("无法连接扣子服务，请检查网络后重新尝试。");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = (await response.json().catch(() => null)) as { code?: number; msg?: string } | null;
    if (!response.ok || (json && json.code && json.code !== 0)) {
      throw new CozeRequestError(toUserMessage(json?.code ?? response.status, json?.msg || ""), json?.code);
    }
    if (json && "data" in json && typeof (json as { data?: unknown }).data === "string") {
      return { fields: fieldsFromContent((json as { data: string }).data), interrupt: null };
    }
    throw new CozeRequestError("扣子工作流返回了无法识别的结果，请重新尝试。");
  }

  if (!response.ok || !response.body) {
    throw new CozeRequestError("扣子工作流暂时无法调用，请稍后重新尝试。", response.status);
  }
  return readWorkflowStream(response.body);
}

export async function uploadContractFile(bytes: Buffer, filename: string, mime: string) {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  form.append("file", blob, filename);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new CozeRequestError("合同文件上传到扣子失败，请重新尝试。");
  }
  const json = (await response.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { id?: string };
  } | null;
  if (!response.ok || !json || json.code !== 0 || !json.data?.id) {
    throw new CozeRequestError(toUserMessage(json?.code ?? response.status, json?.msg || "文件上传失败"), json?.code);
  }
  return json.data.id;
}

export function buildRequirement(input: {
  contractType: string;
  stance: string;
  focus: string[];
  requirements: string;
}) {
  const focus = input.focus.length ? input.focus.join("、") : "未指定，请全面审查";
  const extra = input.requirements.trim() || "无";
  return [`合同类型：${input.contractType}`, `审查立场：${input.stance}`, `重点审查内容：${focus}`, `补充审查要求：${extra}`].join(
    "\n",
  );
}

export async function runContractWorkflow(fileId: string, requirement: string) {
  return postWorkflow("/v1/workflow/stream_run", {
    workflow_id: workflowId(),
    parameters: {
      wenjian: JSON.stringify({ file_id: fileId }),
      xuqiu: requirement,
    },
  });
}

export async function resumeContractWorkflow(eventId: string, interruptType: number) {
  return postWorkflow("/v1/workflow/stream_resume", {
    workflow_id: workflowId(),
    event_id: eventId,
    interrupt_type: interruptType,
    resume_data: "true",
  });
}

export async function checkCozeConnection() {
  if (!cozeConfigured()) return false;
  try {
    const response = await fetch(`${apiBase()}/v1/workflows/${workflowId()}?include_input_output=true`, {
      headers: { Authorization: `Bearer ${token()}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const json = (await response.json()) as { code?: number };
    return json.code === 0;
  } catch {
    return false;
  }
}
