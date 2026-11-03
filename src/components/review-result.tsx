"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import type { ReviewApiResponse } from "@/lib/types";
import type { RiskLevel } from "@/lib/types";
import { cn } from "cn";

const FILTERS: { id: "all" | RiskLevel; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "high", label: "高风险" },
  { id: "medium", label: "中风险" },
  { id: "low", label: "低风险" },
];

const RISK_STYLE: Record<RiskLevel, { label: string; badge: string; rail: string }> = {
  high: { label: "高风险", badge: "border-red-200 bg-red-50 text-red-700", rail: "border-l-red-600" },
  medium: { label: "中风险", badge: "border-orange-200 bg-orange-50 text-orange-700", rail: "border-l-orange-500" },
  low: { label: "低风险", badge: "border-green-200 bg-green-50 text-green-700", rail: "border-l-green-600" },
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

function formatAll(response: ReviewApiResponse, name: string, reviewedAt: string) {
  const result = response.result;
  if (!result) return "";
  const levelLabel = { high: "高风险", medium: "中风险", low: "低风险" };
  const lines = [
    response.demo ? "当前为演示结果" : "审查完成",
    `合同：${name}`,
    reviewedAt ? `审查时间：${reviewedAt}` : "",
    `审查意见：${result.opinions.length} 条`,
    "",
    "法律引用核验",
    result.legalSummary,
    "",
    "企业信息核验",
    result.enterpriseSummary,
    "",
  ];
  result.opinions.forEach((opinion, index) => {
    lines.push(
      `${index + 1}. 【${levelLabel[opinion.level]}】${opinion.title}`,
      `问题分析：${opinion.analysis}`,
      `修改建议：${opinion.suggestion}`,
      "",
    );
  });
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function ReviewResult({
  response,
  name,
  reviewedAt,
  running,
  onRetry,
  onResume,
}: {
  response: ReviewApiResponse;
  name: string;
  reviewedAt: string;
  running: boolean;
  onRetry: () => void;
  onResume: () => void;
}) {
  const [filter, setFilter] = useState<"all" | RiskLevel>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const result = response.result;
  if (!result) return null;

  const visible = result.opinions.filter((opinion) => filter === "all" || opinion.level === filter);
  const counts = {
    all: result.opinions.length,
    high: result.opinions.filter((opinion) => opinion.level === "high").length,
    medium: result.opinions.filter((opinion) => opinion.level === "medium").length,
    low: result.opinions.filter((opinion) => opinion.level === "low").length,
  };

  async function copy(key: string, value: string) {
    const ok = await copyText(value);
    const nextKey = ok ? key : `${key}:failed`;
    setCopiedKey(nextKey);
    window.setTimeout(() => setCopiedKey((current) => (current === nextKey ? null : current)), 2000);
  }

  return (
    <div className="min-w-0 space-y-4">
      {response.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <p className="leading-6">{response.error}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {response.authUrl ? (
              <a
                href={response.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full justify-center bg-white px-3 sm:w-auto")}
              >
                前往飞书授权
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            {response.resume ? (
              <Button type="button" className="h-10 w-full px-3 sm:w-auto" disabled={running} onClick={onResume}>
                我已完成授权，继续审查
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="h-10 w-full bg-white px-3 sm:w-auto" disabled={running} onClick={onRetry}>
              重新尝试
            </Button>
          </div>
        </div>
      ) : null}

      {response.demo ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">当前为演示结果</p>
          <p className="mt-1 leading-6">扣子工作流尚未返回正式审查意见。以下内容只用于查看界面，不能作为正式法律意见。</p>
        </div>
      ) : (
        <div className="rounded-xl border border-primary/15 bg-white px-4 py-3">
          <p className="text-base font-semibold text-primary">审查完成</p>
          <p className="mt-1 text-sm text-muted-foreground">
            发现 {result.opinions.length} 条审查意见
            {reviewedAt ? ` · ${reviewedAt}` : ""}
          </p>
        </div>
      )}

      {response.demo ? (
        <p className="text-sm text-foreground">发现 {result.opinions.length} 条审查意见</p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <article className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">法律引用核验</h3>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{result.legalSummary}</p>
        </article>
        <article className="min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">企业信息核验</h3>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{result.enterpriseSummary}</p>
        </article>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm",
                filter === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-foreground",
              )}
            >
              {item.label} {counts[item.id]}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full bg-white px-3 sm:w-auto"
            onClick={() => void copy("all", formatAll(response, name, reviewedAt))}
          >
            {copiedKey === "all" ? "已复制" : copiedKey === "all:failed" ? "复制失败" : "复制全部审查意见"}
          </Button>
          {result.reportUrl ? (
            <a
              href={result.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "h-10 w-full justify-center px-3 sm:w-auto")}
            >
              查看飞书完整审查报告
              <ExternalLink className="size-4" />
            </a>
          ) : (
            <div className="min-w-0">
              <Button type="button" disabled className="h-10 w-full px-3 sm:w-auto">
                查看飞书完整审查报告
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                {response.demo ? "演示结果不含飞书报告。" : "工作流未返回飞书报告地址。"}
              </p>
            </div>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
          该风险等级下没有审查意见。
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((opinion) => {
            const style = RISK_STYLE[opinion.level];
            return (
              <article key={opinion.id} className={cn("min-w-0 rounded-xl border border-border border-l-4 bg-white p-4 shadow-sm", style.rail)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="min-w-0 text-base font-semibold leading-6 break-words">{opinion.title}</h3>
                  <span className={cn("inline-flex h-6 w-fit shrink-0 items-center rounded-full border px-2 text-xs font-medium", style.badge)}>
                    {style.label}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">问题分析</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 break-words">{opinion.analysis}</p>
                  </div>
                  <div className="rounded-lg bg-[#f4f8f5] px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-medium text-primary">修改建议</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-full bg-white px-2.5 sm:w-auto"
                        onClick={() => void copy(opinion.id, opinion.suggestion)}
                      >
                        {copiedKey === opinion.id ? "已复制" : copiedKey === `${opinion.id}:failed` ? "复制失败" : "复制修改建议"}
                      </Button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 break-words">{opinion.suggestion}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
