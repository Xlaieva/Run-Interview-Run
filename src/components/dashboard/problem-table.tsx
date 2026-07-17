"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { EditSolutionDialog } from "./edit-solution-dialog";
import { DeleteProblemButton } from "./delete-problem-button";
import type { Problem } from "@/db/schema";

export function ProblemTable({
  problems,
  onUpdated,
  onDeleted,
}: {
  problems: Problem[];
  onUpdated: (problem: Problem) => void;
  onDeleted: (id: string) => void;
}) {
  const existingCategories = Array.from(
    new Set(problems.map((p) => p.category).filter((c): c is string => Boolean(c))),
  ).sort((a, b) => a.localeCompare(b, "zh"));

  if (problems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <p>还没有题目，点击右上角「添加题目」开始刷题吧</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>题目</TableHead>
            <TableHead>分类</TableHead>
            <TableHead>最优复杂度</TableHead>
            <TableHead>刷题次数</TableHead>
            <TableHead>一/二/三次成功</TableHead>
            <TableHead>开始刷题</TableHead>
            <TableHead>被考察</TableHead>
            <TableHead className="sticky right-0 z-10 bg-background border-l">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium max-w-[220px]">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[0.65rem] text-muted-foreground"
                  >
                    {p.language === "python" ? "Py" : "TS"}
                  </Badge>
                  <span className="truncate">{p.title}</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {p.category ? (
                  <Badge variant="secondary">{p.category}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    未分类
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-center font-mono text-xs text-muted-foreground whitespace-nowrap">
                {p.solutions?.[0]
                  ? `${p.solutions[0].timeComplexity} / ${p.solutions[0].spaceComplexity}`
                  : "—"}
                {(p.solutions?.length ?? 0) > 1 && (
                  <span className="ml-1 text-muted-foreground/70">
                    +{p.solutions!.length - 1} 种解法
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {p.totalAttempts}
              </TableCell>
              <TableCell className="text-center whitespace-nowrap">
                <span className="inline-flex gap-1">
                  <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">
                    {p.successNoHintCount}
                  </Badge>
                  <Badge className="bg-amber-600/15 text-amber-500 border-amber-600/30">
                    {p.success1HintCount}
                  </Badge>
                  <Badge className="bg-orange-600/15 text-orange-500 border-orange-600/30">
                    {p.success2HintCount}
                  </Badge>
                </span>
              </TableCell>
              <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(p.firstPracticeAt)}
              </TableCell>
              <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(p.lastReviewedAt)}
                {p.reviewCount > 0 && (
                  <span className="ml-1 text-muted-foreground/70">
                    ×{p.reviewCount}
                  </span>
                )}
              </TableCell>
              <TableCell className="sticky right-0 z-10 bg-background border-l text-center">
                <div className="flex items-center justify-center gap-1">
                  <EditSolutionDialog
                    problem={p}
                    existingCategories={existingCategories}
                    onUpdated={onUpdated}
                  />
                  <DeleteProblemButton
                    problemId={p.id}
                    problemTitle={p.title}
                    onDeleted={onDeleted}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/problem/${p.id}/recite`}>背题</Link>}
                  />
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/problem/${p.id}`}>做题</Link>}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
