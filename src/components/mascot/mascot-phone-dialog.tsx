"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DailyPlanProgress, DailyPlanRecord } from "@/hooks/use-daily-progress";

export const PHONE_DIALOG_WIDTH = 304;
export const PHONE_DIALOG_HEIGHT = 500;

function ProgressRow({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number | null;
}) {
  const percent = target && target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {actual}
          {target != null ? ` / ${target}` : " 次"}
        </span>
      </div>
      {percent !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function MascotPhoneDialog({
  open,
  side,
  top,
  sideOffset,
  loading,
  aiAvailable,
  progress,
  plan,
  submitting,
  onSubmitPlan,
  onClose,
}: {
  open: boolean;
  side: "left" | "right";
  top: number;
  sideOffset: number;
  loading: boolean;
  aiAvailable: boolean;
  progress: DailyPlanProgress;
  plan: DailyPlanRecord | null;
  submitting: boolean;
  onSubmitPlan: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");

  if (!open) return null;

  async function handleSend() {
    const text = draft.trim();
    if (!text || submitting) return;
    const ok = await onSubmitPlan(text);
    if (ok) setDraft("");
  }

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-[2rem] border bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/10"
      style={{
        width: PHONE_DIALOG_WIDTH,
        height: PHONE_DIALOG_HEIGHT,
        top,
        [side === "left" ? "left" : "right"]: sideOffset,
      }}
    >
      {/* 仿手机顶部"刘海" */}
      <div className="flex justify-center pt-2">
        <div className="h-1.5 w-16 rounded-full bg-foreground/15" />
      </div>

      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-sm font-semibold">今日小助手</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          title="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">加载中...</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-xl border bg-muted/40 p-3">
              <ProgressRow
                label="刷题"
                actual={progress.problemsAttempted}
                target={plan?.problemsTarget ?? null}
              />
              <ProgressRow
                label="面试练习"
                actual={progress.interviewAttempts}
                target={plan?.interviewTarget ?? null}
              />
              {progress.problemsAttempted > 0 && (
                <p className="text-[0.7rem] text-muted-foreground">
                  其中通过 {progress.problemsPassed} 道
                </p>
              )}
            </div>

            {plan ? (
              <div className="grid gap-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[0.65rem]">
                    今日计划
                  </Badge>
                  {!aiAvailable && (
                    <Badge variant="outline" className="text-[0.65rem] text-muted-foreground">
                      AI 暂时不可用
                    </Badge>
                  )}
                </div>
                <p className="text-sm">{plan.summary || plan.planText}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">今天还没有设置计划，跟我说说吧～</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="今天想做点什么？比如：刷5道数组题，练习3道面试题"
          rows={2}
          className="resize-none text-sm"
          disabled={submitting}
        />
        <Button size="icon" onClick={handleSend} disabled={submitting || !draft.trim()} title="发送">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
