"use client";

import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { solutionColor } from "@/lib/solution-colors";
import type { Solution } from "@/lib/types";

export function ReciteCodeStage({
  solutions,
  focusedIndex,
  onFocus,
  onUnfocus,
}: {
  solutions: Solution[];
  focusedIndex: number | null;
  onFocus: (index: number) => void;
  onUnfocus: () => void;
}) {
  if (solutions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        这道题还没有解法数据，先去仪表盘用 AI 重新生成，或手动填写解法。
      </div>
    );
  }

  if (focusedIndex !== null && solutions[focusedIndex]) {
    const color = solutionColor(focusedIndex);
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button variant="ghost" size="sm" onClick={onUnfocus}>
            <ArrowLeft className="size-4" />
            显示全部解法
          </Button>
          <Tabs
            value={String(focusedIndex)}
            onValueChange={(v) => onFocus(Number(v))}
            className="flex-1"
          >
            <TabsList>
              {solutions.map((sol, i) => (
                <TabsTrigger key={i} value={String(i)} className="gap-1">
                  {i === 0 && (
                    <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30 px-1 py-0 text-[0.65rem]">
                      最优
                    </Badge>
                  )}
                  {sol.approachName}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="m-3 flex flex-col gap-3">
            <section className={cn("rounded-md border-l-4 bg-muted/40 p-4", color.border)}>
              <h2 className="mb-2 text-sm font-medium">口述思路</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {solutions[focusedIndex].verbalExplanation}
              </p>
            </section>
            <pre
              className={cn(
                "rounded-md border-l-4 bg-black/40 p-4 font-mono text-sm whitespace-pre-wrap",
                color.border,
              )}
            >
              {solutions[focusedIndex].solutionCode}
            </pre>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="flex flex-col gap-3 p-3">
        {solutions.map((sol, i) => {
          const color = solutionColor(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onFocus(i)}
              className={cn(
                "group rounded-md border-l-4 bg-black/40 p-3 text-left transition-colors hover:bg-black/60",
                color.border,
              )}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                {i === 0 && (
                  <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">
                    最优
                  </Badge>
                )}
                <span className={cn("text-xs font-medium", color.text)}>
                  {sol.approachName}
                </span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {sol.timeComplexity} / {sol.spaceComplexity}
                </span>
                <span className="ml-auto text-[0.7rem] text-muted-foreground opacity-0 group-hover:opacity-100">
                  点击放大
                </span>
              </div>
              <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">
                {sol.verbalExplanation}
              </p>
              <pre className="max-h-40 overflow-hidden font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {sol.solutionCode}
              </pre>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
