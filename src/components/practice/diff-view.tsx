"use client";

import { diffLines } from "@/lib/diff";
import { cn } from "@/lib/utils";

export function DiffView({
  original,
  updated,
}: {
  original: string;
  updated: string;
}) {
  const lines = diffLines(original, updated);

  return (
    <div className="max-h-64 overflow-y-auto rounded-md border bg-muted font-mono text-xs">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap border-l-2 px-2 py-0.5",
            line.type === "add" &&
              "border-emerald-500 bg-emerald-500/10 text-emerald-300",
            line.type === "remove" &&
              "border-red-500 bg-red-500/10 text-red-300",
            line.type === "same" && "border-transparent text-muted-foreground",
          )}
        >
          <span className="mr-2 select-none">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}
