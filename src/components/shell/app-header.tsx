"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Code2, MessageSquareText, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 112;
const MENU_HEIGHT = 44;
const EXPOSED_WIDTH = 28;
const EXPOSED_HEIGHT = 11;
const SNAP_DISTANCE = 24;

type DockSide = "left" | "right" | "top" | "bottom";

export function AppHeader() {
  const pathname = usePathname();
  const [dockSide, setDockSide] = useState<DockSide | null>("left");
  const [position, setPosition] = useState({ x: 0, y: 12 });
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    position: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const isOpen = isHovered || isPinned || isDragging;
  const hiddenOffset = MENU_WIDTH - EXPOSED_WIDTH;

  function clampPosition(x: number, y: number) {
    return {
      x: Math.max(0, Math.min(window.innerWidth - MENU_WIDTH, x)),
      y: Math.max(0, Math.min(window.innerHeight - MENU_HEIGHT, y)),
    };
  }

  function snapPosition(x: number, y: number) {
    const distances = {
      left: x,
      right: window.innerWidth - MENU_WIDTH - x,
      top: y,
      bottom: window.innerHeight - MENU_HEIGHT - y,
    } as const;
    const [side, distance] = Object.entries(distances).reduce((closest, entry) =>
      entry[1] < closest[1] ? entry : closest,
    );

    if (distance > SNAP_DISTANCE) {
      return { position: { x, y }, side: null };
    }

    switch (side as DockSide) {
      case "left":
        return { position: { x: 0, y }, side: "left" as const };
      case "right":
        return { position: { x: window.innerWidth - MENU_WIDTH, y }, side: "right" as const };
      case "top":
        return { position: { x, y: 0 }, side: "top" as const };
      case "bottom":
        return { position: { x, y: window.innerHeight - MENU_HEIGHT }, side: "bottom" as const };
    }
  }

  function handleDragStart(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a, button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position,
      moved: false,
    };
    setIsDragging(true);
  }

  function handleDragMove(event: React.PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const next = clampPosition(
      start.position.x + event.clientX - start.x,
      start.position.y + event.clientY - start.y,
    );
    start.moved ||= Math.abs(next.x - start.position.x) > 2 || Math.abs(next.y - start.position.y) > 2;
    const snapped = snapPosition(next.x, next.y);
    setPosition(snapped.position);
    setDockSide(snapped.side);
  }

  function handleDragEnd(event: React.PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;

    suppressClick.current = start.moved;
    dragStart.current = null;
    setIsDragging(false);
  }

  if (/^\/problem\/[^/]+(?:\/recite)?$/.test(pathname)) {
    return null;
  }

  return (
    <header
      className={cn(
        "fixed z-50 flex h-11 w-[112px] items-center justify-between rounded-full border bg-background/95 px-1.5 shadow-lg backdrop-blur transition-[left,top,transform,box-shadow] duration-200",
        isOpen ? "shadow-xl" : "shadow-md",
      )}
      style={{
        top: position.y,
        left: position.x,
        transform: !isOpen
          ? dockSide === "left"
            ? `translateX(-${hiddenOffset}px)`
            : dockSide === "right"
              ? `translateX(${hiddenOffset}px)`
              : dockSide === "top"
                ? `translateY(-${MENU_HEIGHT - EXPOSED_HEIGHT}px)`
                : dockSide === "bottom"
                  ? `translateY(${MENU_HEIGHT - EXPOSED_HEIGHT}px)`
                  : undefined
          : undefined,
        transitionDuration: isDragging ? "0ms" : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsPinned(true)}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
    >
      <nav className="flex items-center gap-0.5" aria-label="主导航">
        <Link
          href="/"
          title="算法刷题"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Code2 className="size-3.5" />
          <span className="sr-only">算法刷题</span>
        </Link>
        <Link
          href="/interview"
          title="面试问答"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageSquareText className="size-3.5" />
          <span className="sr-only">面试问答</span>
        </Link>
      </nav>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={isPinned ? "取消固定菜单" : "固定菜单"}
        title={isPinned ? "取消固定菜单" : "固定菜单"}
        className="rounded-full"
        onClick={(event) => {
          event.stopPropagation();
          setIsPinned((pinned) => !pinned);
        }}
      >
        {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </Button>
    </header>
  );
}
