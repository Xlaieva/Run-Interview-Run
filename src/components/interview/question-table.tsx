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
import { EditAnswerDialog } from "./edit-answer-dialog";
import { DeleteQuestionButton } from "./delete-question-button";
import type { InterviewQuestion } from "@/db/schema";

export function QuestionTable({
  questions,
  onUpdated,
  onDeleted,
}: {
  questions: InterviewQuestion[];
  onUpdated: (question: InterviewQuestion) => void;
  onDeleted: (id: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <p>还没有面试问答题，点击右上角「添加题目」开始准备吧</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>题目</TableHead>
            <TableHead>分类</TableHead>
            <TableHead className="text-right">练习次数</TableHead>
            <TableHead>上次练习</TableHead>
            <TableHead>被抽查</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-medium max-w-[260px]">
                <span className="truncate">{q.title}</span>
              </TableCell>
              <TableCell>
                {q.category ? (
                  <Badge variant="secondary">{q.category}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">未分类</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{q.totalAttempts}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(q.lastPracticedAt)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(q.lastReviewedAt)}
                {q.reviewCount > 0 && <span className="ml-1 text-muted-foreground/70">×{q.reviewCount}</span>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <EditAnswerDialog question={q} onUpdated={onUpdated} />
                  <DeleteQuestionButton questionId={q.id} questionTitle={q.title} onDeleted={onDeleted} />
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/interview/${q.id}/recite`}>背题</Link>} />
                  <Button size="sm" nativeButton={false} render={<Link href={`/interview/${q.id}`}>练习</Link>} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
