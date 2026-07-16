import { ScrollArea } from "@/components/ui/scroll-area";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewAnswerPanel({ question }: { question: InterviewQuestion }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground">我的答案</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 text-sm leading-relaxed">
          {question.userAnswer ? (
            <p className="whitespace-pre-wrap">{question.userAnswer}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              还没有填写自己的答案，标准答案和建议可以在右侧问答框里向 AI 询问。
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
