"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditSolutionDialog } from "@/components/dashboard/edit-solution-dialog";
import type { Problem } from "@/db/schema";
import { buildAcmExpectedOutput, buildAcmStdin, describeAcmFormat } from "@/lib/acm-io";
import type { SolveMode } from "@/lib/types";

export function ProblemPanel({
  problem,
  onUpdated,
  mode,
}: {
  problem: Problem;
  onUpdated: (problem: Problem) => void;
  mode: SolveMode;
}) {
  const best = problem.solutions?.[0];

  return (
    <div className="flex h-full min-h-0 flex-col border-r">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div>
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
        <EditSolutionDialog problem={problem} onUpdated={onUpdated} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-4 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap">{problem.userDescription}</p>
          {mode === "acm" && problem.judgeMode === "call" && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                输入输出格式说明（ACM 模式）
              </p>
              <p className="whitespace-pre-wrap font-mono text-xs">
                {describeAcmFormat(
                  problem.functionSignature,
                  problem.testCases?.[0]?.input,
                  problem.testCases?.[0]?.expected,
                )}
              </p>
              {problem.testCases?.[0] && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[0.65rem] text-muted-foreground">示例输入</p>
                    <pre className="whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-xs">
                      {buildAcmStdin(problem.testCases[0].input)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[0.65rem] text-muted-foreground">示例输出</p>
                    <pre className="whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-xs">
                      {buildAcmExpectedOutput(problem.testCases[0].expected)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
          {problem.solutions && problem.solutions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                常用解法思路（按效率从优到劣）
              </p>
              {problem.solutions.map((sol, i) => (
                <div key={i} className="rounded-md border bg-muted/40 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    {i === 0 && (
                      <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">
                        最优
                      </Badge>
                    )}
                    <span className="text-xs font-medium">{sol.approachName}</span>
                    <span className="font-mono text-[0.7rem] text-muted-foreground">
                      {sol.timeComplexity} / {sol.spaceComplexity}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{sol.approachSummary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
