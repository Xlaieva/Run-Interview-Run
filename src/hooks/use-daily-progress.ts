"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export interface DailyPlanProgress {
  problemsAttempted: number;
  problemsPassed: number;
  interviewAttempts: number;
}

export interface DailyPlanRecord {
  id: string;
  date: string;
  planText: string;
  problemsTarget: number | null;
  interviewTarget: number | null;
  summary: string | null;
}

const EMPTY_PROGRESS: DailyPlanProgress = {
  problemsAttempted: 0,
  problemsPassed: 0,
  interviewAttempts: 0,
};

/** "今天"按浏览器本地日历日计算，避免服务器/客户端时区不一致。 */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDayRange(d: Date): { rangeStart: string; rangeEnd: string } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

/** Fetches today's plan + actual progress, and exposes a submit function that upserts a new plan text via AI parsing. Shared by the mascot bubble (progress text) and the phone dialog (full comparison + input). */
export function useDailyProgress() {
  const [plan, setPlan] = useState<DailyPlanRecord | null>(null);
  const [progress, setProgress] = useState<DailyPlanProgress>(EMPTY_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchToday = useCallback(async () => {
    const now = new Date();
    const date = localDateKey(now);
    const { rangeStart, rangeEnd } = localDayRange(now);
    try {
      const res = await fetch(
        `/api/daily-plan?date=${date}&rangeStart=${encodeURIComponent(rangeStart)}&rangeEnd=${encodeURIComponent(rangeEnd)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setPlan(data.plan ?? null);
      setProgress(data.progress ?? EMPTY_PROGRESS);
    } catch {
      // 网络错误时静默失败——吉祥物退化成"今天没有数据"，不打断其它交互
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 挂载时拉取"今天"的计划/进度数据——setState 发生在网络请求返回之后（异步回调里），
    // 是"订阅外部数据源"这类 effect 的标准写法，故对 react-hooks/set-state-in-effect 规则做局部豁免。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchToday();
  }, [fetchToday]);

  const submitPlan = useCallback(async (planText: string): Promise<boolean> => {
    const now = new Date();
    const date = localDateKey(now);
    const { rangeStart, rangeEnd } = localDayRange(now);
    setSubmitting(true);
    try {
      const res = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, rangeStart, rangeEnd, planText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "保存失败");
        return false;
      }
      setPlan(data.plan ?? null);
      setProgress(data.progress ?? EMPTY_PROGRESS);
      setAiAvailable(data.aiAvailable !== false);
      if (data.aiAvailable === false) {
        toast.warning("计划已保存，AI 暂时没法解析目标数量");
      } else {
        toast.success("今日计划已保存");
      }
      return true;
    } catch {
      toast.error("网络错误，请检查连接后重试");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { plan, progress, loading, aiAvailable, submitting, submitPlan, refresh: fetchToday };
}
