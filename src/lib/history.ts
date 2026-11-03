import type { ReviewApiResponse } from "@/lib/types";

export type HistoryItem = {
  id: string;
  name: string;
  reviewedAt: string;
  opinionCount: number;
  highRiskCount: number;
  demo: boolean;
  response: ReviewApiResponse;
};

const STORAGE_KEY = "contract-review-history-v1";
const LIMIT = 8;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryItem).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, LIMIT)));
  } catch {
    // Ignore quota errors. The current review still stays on screen.
  }
}

function isHistoryItem(value: unknown): value is HistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<HistoryItem>;
  return Boolean(
    typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.reviewedAt === "string" &&
      typeof item.opinionCount === "number" &&
      typeof item.highRiskCount === "number" &&
      item.response &&
      typeof item.response === "object",
  );
}
