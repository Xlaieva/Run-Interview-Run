"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AddProblemDialog } from "./add-problem-dialog";
import { ReviewButton } from "./review-button";
import { ProblemTable } from "./problem-table";
import type { Problem } from "@/db/schema";

export function DashboardView() {
  const [problems, setProblems] = useState<Problem[] | null>(null);

  useEffect(() => {
    fetch("/api/problems")
      .then((res) => res.json())
      .then((data) => setProblems(data))
      .catch(() => setProblems([]));
  }, []);

  function handleCreated(problem: Problem) {
    setProblems((prev) => [problem, ...(prev ?? [])]);
  }

  function handleUpdated(problem: Problem) {
    setProblems((prev) =>
      (prev ?? []).map((p) => (p.id === problem.id ? problem : p)),
    );
  }

  function handleDeleted(id: string) {
    setProblems((prev) => (prev ?? []).filter((p) => p.id !== id));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">刷题台</h1>
          <p className="text-sm text-muted-foreground">
            记录每道题的解法、复杂度与刷题进度
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReviewButton />
          <AddProblemDialog onCreated={handleCreated} />
        </div>
      </div>

      {problems === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载中...
        </div>
      ) : (
        <ProblemTable
          problems={problems}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
