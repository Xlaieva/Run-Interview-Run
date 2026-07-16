"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Problem } from "@/db/schema";

export function ReciteProblemPanel({ problem }: { problem: Problem }) {
  const solutions = problem.solutions ?? [];
  const best = solutions[0];

  return (
    <div className="flex h-full min-h-0 flex-col border-r">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold leading-tight">{problem.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {problem.category ? (
            <Badge variant="secondary">{problem.category}</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              未分类
            </Badge>
          )}
          {best && (
            <>
              <Badge variant="outline" className="font-mono">
                时间 {best.timeComplexity}
              </Badge>
              <Badge variant="outline" className="font-mono">
                空间 {best.spaceComplexity}
              </Badge>
            </>
          )}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-4 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{problem.userDescription}</p>

          {problem.userAnswer && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">我的答案</p>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="whitespace-pre-wrap text-sm">{problem.userAnswer}</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
