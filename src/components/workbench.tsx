"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { HistoryPanel } from "@/components/history-panel";
import { ReviewResult } from "@/components/review-result";
import { StepList, type StepVisual } from "@/components/step-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { loadHistory, saveHistory, type HistoryItem } from "@/lib/history";
import {
  CONTRACT_TYPES,
  FOCUS_OPTIONS,
  MAX_REQUIREMENTS,
  REVIEW_STEPS,
  STANCES,
  formatBytes,
  formatShanghai,
  validateUpload,
} from "@/lib/options";
import type { ReviewApiResponse } from "@/lib/types";

type Connection = "checking" | "connected" | "disconnected" | "unconfigured" | "mock";
type Phase = "idle" | "running" | "done";

const LOADING_HINTS = [
  "正在提取合同内容",
  "正在查询企业信息",
  "正在审查合同条款",
  "正在生成审查报告",
];

const typeItems = Object.fromEntries(CONTRACT_TYPES.map((item) => [item, item]));
const stanceItems = Object.fromEntries(STANCES.map((item) => [item, item]));

export function Workbench() {
  const [contractType, setContractType] = useState<string>(CONTRACT_TYPES[0]);
  const [stance, setStance] = useState<string>(STANCES[0]);
  const [focus, setFocus] = useState<string[]>([]);
  const [requirements, setRequirements] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [response, setResponse] = useState<ReviewApiResponse | null>(null);
  const [reviewedName, setReviewedName] = useState("");
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [connection, setConnection] = useState<Connection>("checking");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistory(loadHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal, cache: "no-store" })
      .then((res) => res.json())
      .then((data: { configured?: boolean; connected?: boolean; mock?: boolean }) => {
        if (data.mock || !data.configured) setConnection("mock");
        else if (data.connected) setConnection("connected");
        else setConnection("disconnected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnection("disconnected");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const timers = [1, 2, 3].map((step, index) => window.setTimeout(() => setActiveStep(step), (index + 1) * 1600));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") return;
    document.getElementById("review-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase, response]);

  const running = phase === "running";

  function stepState(index: number): StepVisual {
    if (phase === "done" && response?.result && !response.error) return "complete";
    if (phase === "done" && response?.error) {
      if (index < activeStep) return "complete";
      if (index === activeStep) return "halt";
      return "pending";
    }
    if (phase !== "running") return "pending";
    if (index < activeStep) return "complete";
    if (index === activeStep) return "active";
    return "pending";
  }

  function contractName() {
    if (file) return file.name.replace(/\.[^.]+$/, "") || file.name;
    const line = text
      .split(/\n/)
      .map((item) => item.trim())
      .find(Boolean);
    if (line) return line.slice(0, 32);
    return contractType;
  }

  function acceptFile(next: File) {
    const message = validateUpload(next);
    if (message) {
      setFile(null);
      setFormError(message);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(next);
    setFormError(null);
  }

  function remember(data: ReviewApiResponse, name: string) {
    if (!data.result) {
      setResponse(null);
      setFormError(data.error || "无法开始审查。");
      setPhase("idle");
      return;
    }
    const reviewedAtValue = new Date().toISOString();
    setReviewedName(name);
    setReviewedAt(reviewedAtValue);
    setResponse(data);
    setFormError(null);
    setPhase("done");
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      name,
      reviewedAt: reviewedAtValue,
      opinionCount: data.result.opinions.length,
      highRiskCount: data.result.opinions.filter((opinion) => opinion.level === "high").length,
      demo: data.demo,
      response: data,
    };
    setHistory((current) => {
      const next = [item, ...current].slice(0, 8);
      saveHistory(next);
      return next;
    });
  }

  async function startReview() {
    if (submittingRef.current) return;
    setFormError(null);
    if (requirements.length > MAX_REQUIREMENTS) {
      setFormError("补充审查要求请控制在 2000 字以内。");
      return;
    }
    if (file) {
      const message = validateUpload(file);
      if (message) {
        setFormError(message);
        return;
      }
    } else if (!text.trim()) {
      setFormError("请上传合同文件，或粘贴合同文本后再开始审查。");
      return;
    }

    const name = contractName();
    const body = new FormData();
    body.set("contractType", contractType);
    body.set("stance", stance);
    body.set("focus", JSON.stringify(focus));
    body.set("requirements", requirements);
    body.set("text", text);
    if (file) body.set("file", file);

    submittingRef.current = true;
    setConfirmClear(false);
    setActiveStep(0);
    setResponse(null);
    setPhase("running");
    try {
      const res = await fetch("/api/review", { method: "POST", body });
      const data = (await res.json()) as ReviewApiResponse;
      remember(data, name);
    } catch {
      setFormError("网络异常，审查请求没有完成。请重新尝试。");
      setPhase("idle");
    } finally {
      submittingRef.current = false;
    }
  }

  async function resumeReview() {
    if (submittingRef.current || !response?.resume) return;
    submittingRef.current = true;
    setActiveStep(0);
    setPhase("running");
    setFormError(null);
    try {
      const res = await fetch("/api/review/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...response.resume,
          contractType,
          stance,
          focus,
        }),
      });
      const data = (await res.json()) as ReviewApiResponse;
      remember(data, reviewedName || contractName());
    } catch {
      setFormError("继续审查失败，请重新尝试。");
      setPhase("done");
    } finally {
      submittingRef.current = false;
    }
  }

  function resetForm() {
    if (running) return;
    setContractType(CONTRACT_TYPES[0]);
    setStance(STANCES[0]);
    setFocus([]);
    setRequirements("");
    setText("");
    setFile(null);
    setFormError(null);
    setResponse(null);
    setReviewedName("");
    setReviewedAt(null);
    setPhase("idle");
    setActiveStep(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openHistory(item: HistoryItem) {
    setConfirmClear(false);
    setResponse(item.response);
    setReviewedName(item.name);
    setReviewedAt(item.reviewedAt);
    setPhase("done");
    setFormError(null);
  }

  function clearHistory() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    saveHistory([]);
    setHistory([]);
    setConfirmClear(false);
  }

  const connectionLabel = {
    checking: "正在检查连接",
    connected: "扣子工作流已连接",
    disconnected: "扣子工作流连接异常",
    unconfigured: "演示数据",
    mock: "演示数据",
  }[connection];

  return (
    <div className="min-h-full bg-[#e7eee9] text-foreground">
      <header className="sticky top-0 z-30 border-b border-[#d5e0d8] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">审</div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">合同审查工作台</p>
              <p className="truncate text-xs text-muted-foreground">企业法务与业务负责人</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-[#f4f8f5] px-2.5 py-1 text-xs sm:text-sm">
            <span
              className={`size-2 rounded-full ${
                connection === "connected"
                  ? "bg-green-600"
                  : connection === "mock" || connection === "unconfigured"
                    ? "bg-[#7d9488]"
                    : connection === "checking"
                      ? "bg-orange-500"
                      : "bg-red-600"
              }`}
            />
            <span className="max-w-36 truncate sm:max-w-none">{connectionLabel}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AI 合同风险识别</h1>
          <p className="mt-2 text-base text-foreground sm:text-lg">上传合同，快速获得清晰可执行的审查意见</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            系统可以提取合同内容、识别风险、检查法律引用，并生成修改建议。
          </p>
          <StepList states={REVIEW_STEPS.map((_, index) => stepState(index))} />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
          <form
            className="order-1 min-w-0 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void startReview();
            }}
          >
            <fieldset disabled={running} className="min-w-0 space-y-5 disabled:opacity-80">
              <div>
                <h2 className="text-sm font-semibold">审查设置</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="contract-type">合同类型</Label>
                    <Select
                      items={typeItems}
                      value={contractType}
                      onValueChange={(value) => {
                        if (value) setContractType(value);
                      }}
                    >
                      <SelectTrigger id="contract-type" className="h-10 w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {CONTRACT_TYPES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="stance">审查立场</Label>
                    <Select
                      items={stanceItems}
                      value={stance}
                      onValueChange={(value) => {
                        if (value) setStance(value);
                      }}
                    >
                      <SelectTrigger id="stance" className="h-10 w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {STANCES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>重点审查内容</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FOCUS_OPTIONS.map((item) => {
                    const checked = focus.includes(item);
                    return (
                      <label key={item} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setFocus((current) => (next ? [...current, item] : current.filter((value) => value !== item)));
                          }}
                        />
                        <span className="truncate">{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">补充审查要求</Label>
                <Textarea
                  id="requirements"
                  value={requirements}
                  maxLength={MAX_REQUIREMENTS}
                  onChange={(event) => setRequirements(event.target.value)}
                  placeholder="例如：重点关注自动续期、管辖法院，以及对我方不利的单方解除权。"
                  className="min-h-24"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract-file">合同文件</Label>
                <label
                  htmlFor="contract-file"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const next = event.dataTransfer.files?.[0];
                    if (next) acceptFile(next);
                  }}
                  className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center ${
                    dragging ? "border-primary bg-[#f4f8f5]" : "border-[#b7c9be] bg-[#f7faf8]"
                  }`}
                >
                  <Upload className="size-5 text-primary" />
                  <span className="mt-2 text-sm font-medium">点击上传或拖拽合同文件到此处</span>
                  <span className="mt-1 text-xs leading-5 text-muted-foreground">支持 PDF、Word、TXT、MD 文件，单个文件不超过 10MB</span>
                  <input
                    ref={fileInputRef}
                    id="contract-file"
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,text/plain,text/markdown"
                    className="sr-only"
                    onChange={(event) => {
                      const next = event.target.files?.[0];
                      if (next) acceptFile(next);
                    }}
                  />
                </label>
                {file ? (
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <p className="min-w-0 truncate text-sm">
                      {file.name}
                      <span className="text-muted-foreground"> · {formatBytes(file.size)}</span>
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-sm text-primary"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      移除
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract-text">或粘贴合同文本</Label>
                <Textarea
                  id="contract-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="在此粘贴合同全文。如果已经上传文件，可以留空。"
                  className="min-h-40"
                />
                <p className="text-xs leading-5 text-muted-foreground">同时上传文件和粘贴文本时，以上传的文件为准。</p>
              </div>

              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="h-10 w-full px-4 sm:w-auto" disabled={running}>
                  {running ? "正在审查" : "开始智能审查"}
                </Button>
                <Button type="button" variant="outline" className="h-10 w-full px-4 sm:w-auto" onClick={resetForm} disabled={running}>
                  重置
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">提交后将调用扣子工作流。审查可能需要几分钟，期间不能重复提交。</p>
            </fieldset>
          </form>

          <div className="order-3 min-w-0 lg:order-2">
            <HistoryPanel
              items={history}
              disabled={running}
              confirmClear={confirmClear}
              onOpen={openHistory}
              onClear={clearHistory}
            />
          </div>

          <section id="review-result" className="order-2 min-w-0 scroll-mt-20 lg:order-3 lg:col-span-2">
            {running ? (
              <div className="rounded-xl border border-border bg-white px-5 py-10 text-center shadow-sm" aria-live="polite">
                <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium">正在提取文本并逐项分析合同条款，请稍候</p>
                <p className="mt-2 text-sm text-muted-foreground">{LOADING_HINTS[Math.min(activeStep, LOADING_HINTS.length - 1)]}</p>
              </div>
            ) : null}
            {!running && response?.result ? (
              <ReviewResult
                key={reviewedAt || reviewedName}
                response={response}
                name={reviewedName}
                reviewedAt={reviewedAt ? formatShanghai(reviewedAt) : ""}
                running={running}
                onRetry={() => void startReview()}
                onResume={() => void resumeReview()}
              />
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
