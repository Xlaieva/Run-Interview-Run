"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Solution } from "@/lib/types";

function SolutionBlock({ solution }: { solution: Solution }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          时间 {solution.timeComplexity} · 空间 {solution.spaceComplexity}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{solution.approachSummary}</p>
      <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
        {solution.solutionCode}
      </pre>
    </div>
  );
}

export function SolutionReveal({ solutions }: { solutions: Solution[] }) {
  if (solutions.length === 1) {
    return (
      <div className="border-t px-3 py-2">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">参考答案</p>
        <SolutionBlock solution={solutions[0]} />
      </div>
    );
  }

  return (
    <div className="border-t px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        参考答案（按效率从优到劣）
      </p>
      <Tabs defaultValue="0">
        <TabsList className="w-full">
          {solutions.map((sol, i) => (
            <TabsTrigger key={i} value={String(i)} className="flex-1 gap-1">
              {i === 0 && (
                <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30 px-1 py-0 text-[0.65rem]">
                  最优
                </Badge>
              )}
              {sol.approachName}
            </TabsTrigger>
          ))}
        </TabsList>
        {solutions.map((sol, i) => (
          <TabsContent key={i} value={String(i)} className="pt-2">
            <SolutionBlock solution={sol} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
