"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TimerOff, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS = [5, 10, 15] as const;

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ReciteCountdown({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [presetMinutes, setPresetMinutes] = useState<number>(PRESETS[0]);
  const [running, setRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const redirectToRef = useRef(redirectTo);
  redirectToRef.current = redirectTo;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (running && remainingSeconds === 0) {
      setRunning(false);
      router.push(redirectToRef.current);
    }
  }, [running, remainingSeconds, router]);

  function toggleRunning() {
    if (running) {
      setRunning(false);
      setRemainingSeconds(null);
    } else {
      setRemainingSeconds(presetMinutes * 60);
      setRunning(true);
    }
  }

  function addOneMinute() {
    setRemainingSeconds((prev) => (prev === null ? prev : prev + 60));
  }

  if (!running) {
    return (
      <div className="flex h-8 items-stretch overflow-hidden rounded-lg border border-input select-none dark:bg-input/30">
        <button
          type="button"
          onClick={toggleRunning}
          className="flex cursor-pointer items-center gap-1.5 pr-2 pl-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
        >
          <TimerIcon className="size-4" />
          开启倒计时
        </button>
        <Select
          value={String(presetMinutes)}
          onValueChange={(value) => setPresetMinutes(Number(value))}
        >
          <SelectTrigger
            size="sm"
            className="h-auto rounded-none border-0 bg-transparent px-2 dark:bg-transparent dark:hover:bg-muted"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {minutes} 分钟
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex select-none items-center gap-2">
      {remainingSeconds !== null && (
        <>
          <span className="min-w-11 text-center font-mono text-sm tabular-nums">
            {formatTime(remainingSeconds)}
          </span>
          <Button variant="outline" size="icon-sm" onClick={addOneMinute} title="增加 1 分钟">
            <Plus />
          </Button>
        </>
      )}

      <Button variant="secondary" size="sm" onClick={toggleRunning}>
        <TimerOff /> 关闭倒计时
      </Button>
    </div>
  );
}
