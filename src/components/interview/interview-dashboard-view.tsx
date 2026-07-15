"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AddQuestionDialog } from "./add-question-dialog";
import { InterviewReviewButton } from "./interview-review-button";
import { QuestionTable } from "./question-table";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewDashboardView() {
  const [questions, setQuestions] = useState<InterviewQuestion[] | null>(null);

  useEffect(() => {
    fetch("/api/interview")
      .then((res) => res.json())
      .then((data) => setQuestions(data))
      .catch(() => setQuestions([]));
  }, []);

  function handleCreated(question: InterviewQuestion) {
    setQuestions((prev) => [question, ...(prev ?? [])]);
  }
  function handleUpdated(question: InterviewQuestion) {
    setQuestions((prev) => (prev ?? []).map((q) => (q.id === question.id ? question : q)));
  }
  function handleDeleted(id: string) {
    setQuestions((prev) => (prev ?? []).filter((q) => q.id !== id));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">面试问答</h1>
          <p className="text-sm text-muted-foreground">记录每道题的标准答案与练习进度</p>
        </div>
        <div className="flex items-center gap-2">
          <InterviewReviewButton />
          <AddQuestionDialog onCreated={handleCreated} />
        </div>
      </div>

      {questions === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载中...
        </div>
      ) : (
        <QuestionTable questions={questions} onUpdated={handleUpdated} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
