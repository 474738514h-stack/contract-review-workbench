import { buildDemoReview } from "@/lib/demo-review";
import { buildDocx } from "@/lib/docx";
import {
  CozeRequestError,
  buildRequirement,
  resumeContractWorkflow,
  reviewUsesMock,
  runContractWorkflow,
  uploadContractFile,
  type StreamOutcome,
} from "@/lib/coze";
import {
  CONTRACT_TYPES,
  FOCUS_OPTIONS,
  MAX_REQUIREMENTS,
  MAX_TEXT_CHARS,
  STANCES,
  fileExtension,
  validateUpload,
} from "@/lib/options";
import { parseWorkflowFields, type WorkflowFields } from "@/lib/parse-review";
import type { ReviewApiResponse, ResumeTicket } from "@/lib/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FILE_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": DOCX_MIME,
  ".txt": "text/plain; charset=utf-8",
};

type ReviewContext = {
  contractType: string;
  stance: string;
  focus: string[];
  requirements: string;
};

function mockReview(context: ReviewContext): ReviewApiResponse {
  return {
    ok: true,
    demo: true,
    error: null,
    authUrl: null,
    resume: null,
    result: buildDemoReview(context),
  };
}

function failure(error: string): ReviewApiResponse {
  return { ok: false, demo: false, error, authUrl: null, resume: null, result: null };
}

function demoFailure(error: string, context: ReviewContext, resume: ResumeTicket | null = null, authUrl: string | null = null): ReviewApiResponse {
  return {
    ok: false,
    demo: true,
    error,
    authUrl,
    resume,
    result: buildDemoReview(context),
  };
}

function safeFilename(name: string, fallback: string) {
  const base = name.split(/[/\\]/).pop() || fallback;
  const cleaned = base.replace(/[^\w.\-\u4e00-\u9fff]+/g, "_").slice(0, 80);
  return cleaned || fallback;
}

function allowedValue(value: string, options: readonly string[]) {
  return options.includes(value);
}

function meaningful(fields: WorkflowFields) {
  return Boolean(fields.output.trim() || fields.output1.trim() || fields.enterprise.trim() || fields.url.trim());
}

function resumeTicket(outcome: StreamOutcome): ResumeTicket | null {
  const interrupt = outcome.interrupt;
  if (!interrupt) return null;
  if (!/^\d+\/\d+$/.test(interrupt.eventId)) return null;
  if (!Number.isInteger(interrupt.interruptType)) return null;
  return { eventId: interrupt.eventId, interruptType: interrupt.interruptType };
}

function interruptError(nodeTitle: string) {
  const title = nodeTitle.replace(/\s+/g, " ").trim().slice(0, 40) || "飞书报告";
  return `扣子工作流已暂停：节点「${title}」需要先授权飞书云文档。请打开授权页面完成授权，然后点击“我已完成授权，继续审查”。`;
}

function fromOutcome(outcome: StreamOutcome, context: ReviewContext): ReviewApiResponse {
  const ticket = resumeTicket(outcome);
  const authUrl = outcome.interrupt?.authUrl ?? null;
  if (!meaningful(outcome.fields)) {
    if (outcome.interrupt) return demoFailure(interruptError(outcome.interrupt.nodeTitle), context, ticket, authUrl);
    return demoFailure("扣子工作流没有返回可展示的审查内容，请重新尝试。", context);
  }
  const result = parseWorkflowFields(outcome.fields);
  if (outcome.interrupt) {
    return {
      ok: false,
      demo: false,
      error: interruptError(outcome.interrupt.nodeTitle),
      authUrl,
      resume: ticket,
      result,
    };
  }
  return { ok: true, demo: false, error: null, authUrl: null, resume: null, result };
}

async function execute(context: ReviewContext, file: { filename: string; mime: string; bytes: Buffer }) {
  try {
    const fileId = await uploadContractFile(file.bytes, file.filename, file.mime);
    const outcome = await runContractWorkflow(fileId, buildRequirement(context));
    return fromOutcome(outcome, context);
  } catch (error) {
    const message = error instanceof CozeRequestError ? error.userMessage : "扣子工作流暂时无法调用，请稍后重新尝试。";
    console.error("[coze] review failed", error instanceof CozeRequestError ? error.code ?? "" : "unexpected");
    return demoFailure(message, context);
  }
}

export async function reviewForm(form: FormData): Promise<ReviewApiResponse> {
  const contractType = String(form.get("contractType") || "").trim();
  const stance = String(form.get("stance") || "").trim();
  const requirements = String(form.get("requirements") || "").trim();
  const text = String(form.get("text") || "");
  if (!allowedValue(contractType, CONTRACT_TYPES)) return failure("请选择有效的合同类型。");
  if (!allowedValue(stance, STANCES)) return failure("请选择有效的审查立场。");
  if (requirements.length > MAX_REQUIREMENTS) return failure("补充审查要求请控制在 2000 字以内。");
  if (text.length > MAX_TEXT_CHARS) return failure("粘贴的合同文本过长，请改为上传文件。");

  let focus: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("focus") || "[]")) as unknown;
    if (Array.isArray(parsed)) {
      focus = parsed.filter((item): item is string => typeof item === "string" && allowedValue(item, FOCUS_OPTIONS));
    }
  } catch {
    focus = [];
  }

  const uploaded = form.get("file");
  const hasFile = uploaded instanceof File && uploaded.size > 0;
  if (!hasFile && !text.trim()) return failure("请上传合同文件，或粘贴合同文本后再开始审查。");

  let filename = "粘贴的合同.docx";
  let mime = DOCX_MIME;
  let bytes: Buffer;
  if (hasFile && uploaded instanceof File) {
    const invalid = validateUpload(uploaded);
    if (invalid) return failure(invalid);
    const extension = fileExtension(uploaded.name);
    const raw = Buffer.from(await uploaded.arrayBuffer());
    if (extension === ".md") {
      filename = safeFilename(uploaded.name.replace(/\.md$/i, ".docx"), "contract.docx");
      mime = DOCX_MIME;
      bytes = buildDocx(raw.toString("utf8"));
    } else {
      filename = safeFilename(uploaded.name, "contract");
      mime = FILE_MIME[extension] || "application/octet-stream";
      bytes = raw;
    }
  } else {
    bytes = buildDocx(text.trim());
  }

  const context = { contractType, stance, focus, requirements };
  if (reviewUsesMock()) {
    await new Promise((resolve) => setTimeout(resolve, 3200));
    return mockReview(context);
  }
  return execute(context, { filename, mime, bytes });
}

export async function reviewResume(input: {
  eventId: string;
  interruptType: number;
  contractType: string;
  stance: string;
  focus: string[];
}): Promise<ReviewApiResponse> {
  if (!/^\d+\/\d+$/.test(input.eventId) || !Number.isInteger(input.interruptType)) {
    return failure("无法继续这次审查，请重新提交合同。");
  }
  const context: ReviewContext = {
    contractType: allowedValue(input.contractType, CONTRACT_TYPES) ? input.contractType : CONTRACT_TYPES[0],
    stance: allowedValue(input.stance, STANCES) ? input.stance : STANCES[0],
    focus: input.focus.filter((item) => allowedValue(item, FOCUS_OPTIONS)),
    requirements: "",
  };
  if (reviewUsesMock()) return mockReview(context);
  try {
    const outcome = await resumeContractWorkflow(input.eventId, input.interruptType);
    return fromOutcome(outcome, context);
  } catch (error) {
    const message = error instanceof CozeRequestError ? error.userMessage : "继续审查失败，请重新提交合同。";
    console.error("[coze] resume failed", error instanceof CozeRequestError ? error.code ?? "" : "unexpected");
    return demoFailure(message, context);
  }
}
