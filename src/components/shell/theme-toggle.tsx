"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { id: "dark", label: "深色", className: "dark", swatch: "oklch(0.205 0 0)" },
  { id: "white", label: "白色", className: "theme-white", swatch: "oklch(1 0 0)" },
  { id: "pink", label: "淡粉色", className: "theme-pink", swatch: "oklch(0.92 0.05 15)" },
  { id: "yellow", label: "淡黄色", className: "theme-yellow", swatch: "oklch(0.92 0.06 95)" },
  { id: "blue", label: "淡蓝色", className: "theme-blue", swatch: "oklch(0.92 0.05 250)" },
  { id: "cyan", label: "淡青色", className: "theme-cyan", swatch: "oklch(0.92 0.06 195)" },
  { id: "purple", label: "淡紫色", className: "theme-purple", swatch: "oklch(0.92 0.05 300)" },
] as const;

const ALL_CLASS_NAMES = THEMES.map((t) => t.className);
const STORAGE_KEY = "theme";

function applyTheme(id: string) {
  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.classList.remove(...ALL_CLASS_NAMES);
  root.classList.add(theme.className);
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {}
}

export function ThemeToggle() {
  const [current, setCurrent] = useState<string>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored && THEMES.some((t) => t.id === stored) ? stored : "dark";
    } catch {
      return "dark";
    }
  });

  function handleSelect(id: string) {
    setCurrent(id);
    applyTheme(id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="切换背景主题"
            className="fixed top-3 right-3 z-50 rounded-full"
          >
            <Palette className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {THEMES.map((theme) => (
          <DropdownMenuItem key={theme.id} onClick={() => handleSelect(theme.id)}>
            <span
              className="size-3.5 shrink-0 rounded-full border border-black/10"
              style={{ background: theme.swatch }}
            />
            {theme.label}
            {current === theme.id && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
