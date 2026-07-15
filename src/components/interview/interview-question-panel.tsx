import { Badge } from "@/components/ui/badge";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewQuestionPanel({ question }: { question: InterviewQuestion }) {
  return (
    <div className="border-b px-4 py-3">
      <h2 className="font-semibold leading-tight">{question.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {question.category ? (
          <Badge variant="secondary">{question.category}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">未分类</Badge>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {question.userDescription}
      </p>
    </div>
  );
}
