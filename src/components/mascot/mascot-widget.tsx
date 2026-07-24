"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MascotCanvas, type MascotAction } from "./mascot-canvas";
import { MascotPhoneDialog, PHONE_DIALOG_HEIGHT } from "./mascot-phone-dialog";
import { useDailyProgress, type DailyPlanProgress } from "@/hooks/use-daily-progress";
import { randomEncouragement } from "@/lib/encouragement-phrases";
import { cn } from "@/lib/utils";

const WIDGET_SIZE = 132;
const EDGE_MARGIN = 16;
const DIALOG_GAP = WIDGET_SIZE + 16;
const POSITION_STORAGE_KEY = "mascot-widget-position";
const DWELL_THRESHOLD_MS = 90_000;
const DWELL_PAGES = new Set(["/", "/interview"]);
const BUBBLE_MIN_INTERVAL_MS = 20_000;
const BUBBLE_MAX_INTERVAL_MS = 30_000;
const BUBBLE_VISIBLE_MS = 3_000;
const HOVER_DELAY_MS = 500;
const DRAG_MOVE_THRESHOLD_PX = 4;

interface WidgetPosition {
  top: number;
  left: number;
}

function clampPosition(pos: WidgetPosition): WidgetPosition {
  return {
    top: Math.min(Math.max(pos.top, EDGE_MARGIN), window.innerHeight - WIDGET_SIZE - EDGE_MARGIN),
    left: Math.min(Math.max(pos.left, EDGE_MARGIN), window.innerWidth - WIDGET_SIZE - EDGE_MARGIN),
  };
}

function defaultPosition(): WidgetPosition {
  return clampPosition({
    top: window.innerHeight - WIDGET_SIZE - EDGE_MARGIN,
    left: window.innerWidth - WIDGET_SIZE - EDGE_MARGIN,
  });
}

function loadPosition(): WidgetPosition {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return defaultPosition();
    const parsed = JSON.parse(raw);
    if (typeof parsed?.top === "number" && typeof parsed?.left === "number") {
      return clampPosition({ top: parsed.top, left: parsed.left });
    }
  } catch {
    // 存储格式不对就当没存过
  }
  return defaultPosition();
}

function formatProgressBubble(progress: DailyPlanProgress): string {
  return `今天刷题 ${progress.problemsAttempted} 次（通过 ${progress.problemsPassed}），面试练习 ${progress.interviewAttempts} 次，继续加油～`;
}

export function MascotWidget() {
  const pathname = usePathname();
  const { plan, progress, loading, aiAvailable, submitting, submitPlan } = useDailyProgress();

  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<WidgetPosition>({ top: 0, left: 0 });
  const [dragging, setDragging] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [action, setAction] = useState<MascotAction>("Idle");
  const [dialogOpen, setDialogOpen] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTop: number;
    startLeft: number;
    moved: boolean;
  } | null>(null);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const bubbleHideTimerRef = useRef<number | undefined>(undefined);
  const dwellAnnouncedRef = useRef(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    setPosition(loadPosition());
    setMounted(true);
  }, []);

  const showBubble = useCallback((text: string, gesture: MascotAction = "Idle") => {
    setBubbleText(text);
    setAction(gesture);
    if (bubbleHideTimerRef.current) window.clearTimeout(bubbleHideTimerRef.current);
    bubbleHideTimerRef.current = window.setTimeout(() => {
      setBubbleText(null);
      setAction("Idle");
    }, BUBBLE_VISIBLE_MS);
  }, []);

  // 周期性鼓励气泡（弹窗打开或正在拖拽时不打扰）。
  useEffect(() => {
    if (!mounted) return;
    let timer: number;
    const schedule = () => {
      const delay = BUBBLE_MIN_INTERVAL_MS + Math.random() * (BUBBLE_MAX_INTERVAL_MS - BUBBLE_MIN_INTERVAL_MS);
      timer = window.setTimeout(() => {
        if (!dialogOpen && !dragging) showBubble(randomEncouragement(), "Wave");
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [mounted, dialogOpen, dragging, showBubble]);

  // 在刷题台/面试问答台停留过久时，主动播报一次今日进度（每次进入该页面只播一次）。
  useEffect(() => {
    dwellAnnouncedRef.current = false;
    if (!mounted || !DWELL_PAGES.has(pathname)) return;
    const timer = window.setTimeout(() => {
      if (!dwellAnnouncedRef.current && !dialogOpen) {
        showBubble(formatProgressBubble(progressRef.current), "ThumbsUp");
        dwellAnnouncedRef.current = true;
      }
    }, DWELL_THRESHOLD_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, pathname, dialogOpen, showBubble]);

  function handleMouseEnter() {
    hoverTimerRef.current = window.setTimeout(() => {
      showBubble(formatProgressBubble(progressRef.current), "ThumbsUp");
    }, HOVER_DELAY_MS);
  }
  function handleMouseLeave() {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTop: position.top,
      startLeft: position.left,
      moved: false,
    };
    setDragging(true);
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_MOVE_THRESHOLD_PX || Math.abs(dy) > DRAG_MOVE_THRESHOLD_PX) {
      drag.moved = true;
    }
    setPosition(clampPosition({ top: drag.startTop + dy, left: drag.startLeft + dx }));
  }
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    setDragging(false);
    dragRef.current = null;
    if (!drag) return;

    if (!drag.moved) {
      setDialogOpen((open) => !open);
      return;
    }

    setPosition((prev) => {
      const snappedLeft =
        prev.left + WIDGET_SIZE / 2 < window.innerWidth / 2
          ? EDGE_MARGIN
          : window.innerWidth - WIDGET_SIZE - EDGE_MARGIN;
      const next = { top: prev.top, left: snappedLeft };
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (!mounted) return null;

  const side: "left" | "right" =
    position.left + WIDGET_SIZE / 2 < window.innerWidth / 2 ? "left" : "right";
  const dialogTop = Math.min(
    Math.max(position.top - (PHONE_DIALOG_HEIGHT - WIDGET_SIZE) / 2, EDGE_MARGIN),
    window.innerHeight - PHONE_DIALOG_HEIGHT - EDGE_MARGIN,
  );

  return (
    <>
      <div
        className="fixed z-40 touch-none select-none"
        style={{ top: position.top, left: position.left, width: WIDGET_SIZE, height: WIDGET_SIZE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {bubbleText && (
          <div
            className={cn(
              "absolute -top-3 max-w-48 -translate-y-full rounded-2xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
              side === "left" ? "left-0" : "right-0",
            )}
          >
            {bubbleText}
          </div>
        )}
        <MascotCanvas action={action} />
      </div>

      <MascotPhoneDialog
        open={dialogOpen}
        side={side}
        top={dialogTop}
        sideOffset={DIALOG_GAP}
        loading={loading}
        aiAvailable={aiAvailable}
        progress={progress}
        plan={plan}
        submitting={submitting}
        onSubmitPlan={submitPlan}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
