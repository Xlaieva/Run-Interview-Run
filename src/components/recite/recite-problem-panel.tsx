"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { solutionColor } from "@/lib/solution-colors";
import type { Problem } from "@/db/schema";

export function ReciteProblemPanel({
  problem,
  focusedIndex,
}: {
  problem: Problem;
  focusedIndex: number | null;
}) {
  const solutions = problem.solutions ?? [];
  const best = solutions[0];
  const shown =
    focusedIndex !== null && solutions[focusedIndex]
      ? [{ solution: solutions[focusedIndex], index: focusedIndex }]
      : solutions.map((solution, index) => ({ solution, index }));

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

          {solutions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              这道题还没有解法数据，可以在仪表盘表格里用 AI 重新生成。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {focusedIndex !== null ? "口述思路" : "口述思路（按效率从优到劣）"}
              </p>
              {shown.map(({ solution, index }) => {
                const color = solutionColor(index);
                return (
                  <div
                    key={index}
                    className={cn(
                      "rounded-md border-l-4 bg-muted/40 p-3",
                      color.border,
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {index === 0 && (
                        <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">
                          最优
                        </Badge>
                      )}
                      <span className={cn("text-xs font-medium", color.text)}>
                        {solution.approachName}
                      </span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {solution.timeComplexity} / {solution.spaceComplexity}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">
                      {solution.verbalExplanation}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
