import { Check } from "lucide-react";

import { REVIEW_STEPS } from "@/lib/options";
import { cn } from "cn";

export type StepVisual = "pending" | "active" | "complete" | "halt";

export function StepList({ states }: { states: StepVisual[] }) {
  return (
    <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {REVIEW_STEPS.map((step, index) => {
        const state = states[index] ?? "pending";
        return (
          <li key={step.title} className="min-w-0 rounded-xl border border-border bg-white px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  state === "complete" && "bg-primary text-primary-foreground",
                  state === "active" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  state === "halt" && "bg-orange-100 text-orange-800",
                  state === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "complete" ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {index + 1}. {step.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {state === "active" ? "进行中" : state === "complete" ? "已完成" : state === "halt" ? "已暂停" : step.detail}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
