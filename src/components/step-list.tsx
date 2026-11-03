import { Check } from "lucide-react";

import { REVIEW_STEPS } from "@/lib/options";
import { cn } from "cn";

export type StepVisual = "pending" | "active" | "complete" | "halt";

const STATUS_LABEL: Record<Exclude<StepVisual, "pending">, string> = {
  active: "进行中",
  complete: "已完成",
  halt: "已暂停",
};

export function StepList({ states }: { states: StepVisual[] }) {
  const total = REVIEW_STEPS.length;
  const completed = states.filter((state) => state === "complete").length;
  const allComplete = total > 0 && completed === total;
  const currentIndex = states.findIndex((state) => state === "active" || state === "halt");
  const current = currentIndex >= 0 ? REVIEW_STEPS[currentIndex] : undefined;
  const currentState = currentIndex >= 0 ? states[currentIndex] : undefined;
  const reached = allComplete ? total - 1 : currentIndex >= 0 ? currentIndex : Math.max(completed - 1, 0);
  const progress = allComplete || currentIndex > 0 || completed > 0 ? (reached / Math.max(total - 1, 1)) * 100 : 0;

  const heading = allComplete
    ? "审查流程已完成"
    : current && currentState === "active"
      ? `正在${current.title}`
      : current && currentState === "halt"
        ? `${current.title}已暂停`
        : "审查流程";

  return (
    <div className="mt-6 rounded-xl border border-border bg-white px-3 py-4 shadow-sm sm:px-6 sm:py-5">
      <div className="mb-4 flex items-baseline justify-between gap-3 px-1">
        <p className="min-w-0 text-sm font-medium text-foreground">{heading}</p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {completed}/{total}
        </p>
      </div>
      <ol className="relative grid grid-cols-4">
        <div
          className="pointer-events-none absolute top-3.5 right-[12.5%] left-[12.5%] h-1 overflow-hidden rounded-full bg-[#d7e3db]"
          aria-hidden
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        {REVIEW_STEPS.map((step, index) => {
          const state = states[index] ?? "pending";
          const caption = state === "pending" ? step.detail : STATUS_LABEL[state];
          return (
            <li
              key={step.title}
              className="relative flex min-w-0 flex-col items-center px-0.5 text-center"
              aria-current={state === "active" || state === "halt" ? "step" : undefined}
            >
              <span
                className={cn(
                  "relative z-10 grid size-7 place-items-center rounded-full text-xs font-semibold ring-4 ring-white",
                  state === "complete" && "bg-primary text-primary-foreground",
                  state === "active" && "bg-primary text-primary-foreground shadow-[0_0_0_4px_rgba(15,81,60,0.16)]",
                  state === "halt" && "bg-orange-500 text-white",
                  state === "pending" && "bg-[#e7f0ea] text-[#5d6f66]",
                )}
              >
                {state === "complete" ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
              </span>
              <p
                className={cn(
                  "mt-3 w-full text-xs leading-4 font-medium sm:text-sm sm:leading-5",
                  state === "pending" ? "text-[#4d6158]" : "text-foreground",
                )}
              >
                {step.title}
              </p>
              <p
                className={cn(
                  "mt-1 w-full text-[11px] leading-4 sm:text-xs",
                  state === "halt" && "font-medium text-orange-700",
                  state === "active" && "font-medium text-primary",
                  (state === "pending" || state === "complete") && "text-muted-foreground",
                )}
              >
                {caption}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
