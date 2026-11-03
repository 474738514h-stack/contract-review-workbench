import { formatShanghai } from "@/lib/options";
import type { HistoryItem } from "@/lib/history";
import { Button } from "@/components/ui/button";

export function HistoryPanel({
  items,
  disabled,
  confirmClear,
  onOpen,
  onClear,
}: {
  items: HistoryItem[];
  disabled: boolean;
  confirmClear: boolean;
  onOpen: (item: HistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">最近审查</h2>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink px-2 text-muted-foreground"
          disabled={disabled || items.length === 0}
          onClick={onClear}
        >
          {confirmClear ? "确认清空" : "清空记录"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">还没有审查记录。完成一次审查后，会显示在这里。</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpen(item)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 text-left disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatShanghai(item.reviewedAt)}
                    {item.demo ? " · 演示" : ""}
                  </span>
                </span>
                <span className="text-right text-xs leading-5">
                  <span className="block text-foreground">{item.opinionCount} 条意见</span>
                  <span className={item.highRiskCount > 0 ? "block text-red-700" : "block text-muted-foreground"}>
                    {item.highRiskCount} 条高风险
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
