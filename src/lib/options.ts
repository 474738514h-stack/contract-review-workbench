export const CONTRACT_TYPES = [
  "采购合同",
  "销售合同",
  "服务合同",
  "劳动合同",
  "保密协议",
] as const;

export const STANCES = ["甲方", "乙方", "中立"] as const;

export const FOCUS_OPTIONS = [
  "付款与结算",
  "违约责任",
  "知识产权",
  "交付验收",
  "解除终止",
] as const;

export const REVIEW_STEPS = [
  { title: "提取合同内容", detail: "读取正文与附件" },
  { title: "查询企业信息", detail: "核验合同主体" },
  { title: "审查合同条款", detail: "按立场识别风险" },
  { title: "生成审查报告", detail: "整理意见与建议" },
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REQUIREMENTS = 2000;
export const MAX_TEXT_CHARS = 400_000;

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt", ".md"]);

export function fileExtension(name: string) {
  const base = name.split(/[/\\]/).pop() || "";
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index).toLowerCase() : "";
}

export function validateUpload(file: { name: string; size: number }) {
  const extension = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return "仅支持 PDF、Word、TXT、MD 文件。";
  }
  if (file.size <= 0) return "文件是空的，请重新选择。";
  if (file.size > MAX_FILE_BYTES) {
    return "文件超过 10MB，请压缩或拆分后再上传。";
  }
  return null;
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatShanghai(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}
