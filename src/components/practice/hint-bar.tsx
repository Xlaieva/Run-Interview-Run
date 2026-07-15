"use client";

import { Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HintBar({
  aiAvailable,
  hintStage,
  canUseHint,
  loading,
  onClick,
}: {
  aiAvailable: boolean;
  hintStage: 0 | 1 | 2 | 3;
  canUseHint: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const label = !aiAvailable
    ? "运行并对比参考答案"
    : hintStage === 0
      ? "提示 1：高亮可疑行"
      : hintStage === 1
        ? "提示 2：AI 引导"
        : hintStage === 2
          ? "提示 3：查看参考答案"
          : "已查看参考答案";

  const disabled = loading || (aiAvailable && (!canUseHint || hintStage >= 3));

  const colorClass = !aiAvailable
    ? "bg-slate-600 hover:bg-slate-500"
    : hintStage === 0
      ? "bg-orange-500 hover:bg-orange-400"
      : hintStage === 1
        ? "bg-red-500 hover:bg-red-400"
        : "bg-red-700 hover:bg-red-600";

  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2">
      {aiAvailable && !canUseHint && hintStage < 3 && (
        <span className="text-xs text-muted-foreground">
          先运行代码，失败后才能使用提示
        </span>
      )}
      <Button
        onClick={onClick}
        disabled={disabled}
        className={cn("text-white", colorClass)}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Flame className="size-4" />
        )}
        {label}
      </Button>
    </div>
  );
}
