import type { Opinion, ReviewPayload, RiskLevel } from "@/lib/types";

export type WorkflowFields = {
  output: string;
  output1: string;
  enterprise: string;
  url: string;
};

const EMPTY_FIELDS: WorkflowFields = {
  output: "",
  output1: "",
  enterprise: "",
  url: "",
};

function parseJsonDeep(input: string, depth = 0): unknown {
  if (depth > 4) return input;
  const trimmed = input.trim();
  if (!trimmed) return "";
  const first = trimmed[0];
  if (first !== "{" && first !== "[" && first !== '"') return input;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (typeof value === "string") return parseJsonDeep(value, depth + 1);
    return value;
  } catch {
    return input;
  }
}

function asText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function absorb(value: unknown, fields: WorkflowFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, raw] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (typeof raw === "string" || typeof raw === "number") {
      const text = asText(raw);
      if (!text) continue;
      if (normalized === "output" && !fields.output) fields.output = text;
      if (normalized === "output1" && !fields.output1) fields.output1 = text;
      if (
        (normalized === "enterprise" || normalized === "company" || normalized === "enterpriseinfo") &&
        !fields.enterprise
      ) {
        fields.enterprise = text;
      }
      if ((normalized === "url" || normalized === "reporturl" || normalized === "feishuurl") && !fields.url) {
        fields.url = text;
      }
      if (typeof raw === "string") {
        const nested = parseJsonDeep(raw);
        if (nested !== raw) absorb(nested, fields);
      }
    } else if (raw && typeof raw === "object") {
      absorb(raw, fields);
    }
  }
}

export function fieldsFromContent(content: string): WorkflowFields {
  const parsed = parseJsonDeep(content);
  if (Array.isArray(parsed)) {
    return { ...EMPTY_FIELDS, output: JSON.stringify(parsed) };
  }
  if (parsed && typeof parsed === "object") {
    const fields = { ...EMPTY_FIELDS };
    absorb(parsed, fields);
    if (fields.output || fields.output1 || fields.enterprise || fields.url) return fields;
  }
  return { ...EMPTY_FIELDS, output: content.trim() };
}

export function mergeFields(base: WorkflowFields, next: WorkflowFields): WorkflowFields {
  return {
    output: next.output || base.output,
    output1: next.output1 || base.output1,
    enterprise: next.enterprise || base.enterprise,
    url: next.url || base.url,
  };
}

function detectLevel(text: string): RiskLevel | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "高" || trimmed === "high" || /高风险|风险等级\s*[:：]\s*高|【高】|重大风险|风险较高/.test(text)) {
    return "high";
  }
  if (trimmed === "中" || trimmed === "medium" || /中风险|风险等级\s*[:：]\s*中|【中】/.test(text)) {
    return "medium";
  }
  if (trimmed === "低" || trimmed === "low" || /低风险|风险等级\s*[:：]\s*低|【低】/.test(text)) {
    return "low";
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLabeled(text: string, labels: string[], stops: string[]) {
  const start = new RegExp(
    `^(?:#{1,4}\\s*)?(?:${labels.map(escapeRegExp).join("|")})\\s*[:：]?\\s*(.*)$`,
  );
  const stop = new RegExp(
    `^(?:#{1,4}\\s*)?(?:${stops.map(escapeRegExp).join("|")})\\s*[:：]?`,
  );
  const lines = text.split(/\n/);
  let capturing = false;
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!capturing) {
      const match = trimmed.match(start);
      if (!match) continue;
      capturing = true;
      if (match[1]?.trim()) collected.push(match[1].trim());
      continue;
    }
    if (stop.test(trimmed)) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

function shortenTitle(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= 42) return clean;
  return `${clean.slice(0, 42)}…`;
}

function parseBlock(block: string, index: number): Opinion {
  const lines = block
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rawTitle = (lines[0] || `审查意见 ${index + 1}`)
    .replace(/^#{1,4}\s+/, "")
    .replace(/^\d+[.、．]\s+/, "")
    .replace(/^【[高中低]风险】\s*/, "")
    .replace(/[（(](?:高|中|低)风险[）)]/g, "")
    .trim();
  const suggestion = extractLabeled(
    block,
    ["修改建议", "修订建议", "建议修改", "建议条款", "替换表述"],
    ["法律依据", "法律引用", "参考依据", "企业信息"],
  );
  let analysis = extractLabeled(
    block,
    ["问题分析", "风险分析", "分析说明", "条款分析", "分析"],
    ["修改建议", "修订建议", "建议修改", "建议条款", "替换表述", "法律依据"],
  );
  if (!analysis) {
    analysis = lines.slice(1).join("\n").trim() || block.trim();
    if (suggestion) analysis = analysis.replace(suggestion, "").trim();
  }
  return {
    id: `opinion-${index + 1}`,
    title: shortenTitle(rawTitle || `审查意见 ${index + 1}`),
    level: detectLevel(block) ?? "medium",
    analysis: analysis || "工作流未单独写明问题分析。",
    suggestion: suggestion || "工作流未单独给出可替换表述，请根据问题分析改写对应条款。",
  };
}

function splitBlocks(text: string) {
  const patterns = [
    /\n(?=#{1,4}\s+)/,
    /\n(?=【[高中低]风险】)/,
    /\n(?=\d+[.、．]\s+)/,
  ];
  for (const pattern of patterns) {
    const blocks = text
      .split(pattern)
      .map((block) => block.trim())
      .filter(Boolean);
    if (blocks.length >= 2) return blocks;
  }
  return [text.trim()].filter(Boolean);
}

function readOpinionObject(value: unknown, index: number): Opinion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = asText(
    record.title ?? record.name ?? record.问题 ?? record.问题标题 ?? record.标题 ?? record.issue,
  );
  const analysis = asText(
    record.analysis ?? record.问题分析 ?? record.分析 ?? record.reason ?? record.description ?? record.问题描述,
  );
  const suggestion = asText(
    record.suggestion ?? record.修改建议 ?? record.建议 ?? record.revision ?? record.advice,
  );
  const levelText = asText(record.level ?? record.risk ?? record.风险 ?? record.风险等级 ?? record.severity);
  if (!title && !analysis && !suggestion) return null;
  return {
    id: `opinion-${index + 1}`,
    title: shortenTitle(title || `审查意见 ${index + 1}`),
    level: detectLevel(levelText) ?? detectLevel(`${title}\n${analysis}`) ?? "medium",
    analysis: analysis || "工作流未单独写明问题分析。",
    suggestion: suggestion || "工作流未单独给出可替换表述，请根据问题分析改写对应条款。",
  };
}

function opinionsFromUnknown(value: unknown): Opinion[] {
  const parsed = typeof value === "string" ? parseJsonDeep(value) : value;
  const queue: unknown[] = [];
  if (Array.isArray(parsed)) queue.push(...parsed);
  else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const nested = [
      record.opinions,
      record.reviews,
      record.items,
      record.results,
      record.risks,
      record.审查意见,
      record.意见,
    ].find(Array.isArray);
    if (Array.isArray(nested)) queue.push(...nested);
    else {
      const single = readOpinionObject(parsed, 0);
      return single ? [single] : [];
    }
  }
  return queue
    .map((item, index) => readOpinionObject(item, index))
    .filter((item): item is Opinion => Boolean(item));
}

function opinionsFromText(text: string) {
  return splitBlocks(text).map(parseBlock);
}

function score(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function chooseOpinionText(output: string, output1: string) {
  if (!output.trim() && output1.trim()) {
    const legal = score(output1, /法律|法条|《|司法解释/g);
    const opinion = score(output1, /修改建议|风险/g);
    if (legal > opinion) return { opinionText: "", legalText: output1 };
    return { opinionText: output1, legalText: "" };
  }
  const outputOpinion = score(output, /修改建议|风险/g);
  const outputLegal = score(output, /法律|法条|《|司法解释/g);
  const otherOpinion = score(output1, /修改建议|风险/g);
  const otherLegal = score(output1, /法律|法条|《|司法解释/g);
  if (otherOpinion > outputOpinion && otherLegal < outputLegal) {
    return { opinionText: output1, legalText: output };
  }
  return { opinionText: output, legalText: output1 };
}

function findReportUrl(explicit: string, texts: string[]) {
  const candidates = [explicit, ...texts];
  const pattern = /https?:\/\/[^\s)）<>"']+/g;
  const found: string[] = [];
  for (const text of candidates) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) found.push(match.replace(/[.,，。；;]+$/, ""));
  }
  const feishu = found.find((url) => /feishu\.cn|larksuite\.com|larkoffice\.com|feishu\.net/i.test(url));
  if (feishu) return feishu;
  return (
    found.find((url) => {
      try {
        const host = new URL(url).hostname;
        return host !== "www.coze.cn" && host !== "coze.cn";
      } catch {
        return false;
      }
    }) ?? null
  );
}

export function parseWorkflowFields(fields: WorkflowFields): ReviewPayload {
  const { opinionText, legalText } = chooseOpinionText(fields.output, fields.output1);
  const structured = opinionsFromUnknown(opinionText);
  const opinions = structured.length > 0 ? structured : opinionText.trim() ? opinionsFromText(opinionText) : [];
  const legalSummary = legalText.trim();
  const enterpriseSummary = fields.enterprise.trim();
  return {
    opinions,
    legalSummary: legalSummary || "工作流未返回法律引用核验内容。",
    enterpriseSummary: enterpriseSummary || "工作流未返回企业信息核验内容。",
    reportUrl: findReportUrl(fields.url, [fields.output, fields.output1, fields.enterprise]),
  };
}
