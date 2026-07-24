import { ScrollArea } from "@/components/ui/scroll-area";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewAnswerPanel({ question }: { question: InterviewQuestion }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground">标准答案</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 text-sm leading-relaxed">
          {question.standardAnswer ? (
            <p className="whitespace-pre-wrap">{question.standardAnswer}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              这道题还没有标准答案，可以在仪表盘表格里用 AI 重新生成或手动填写。
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-b px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground">我的答案</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 text-sm leading-relaxed">
          {question.userAnswer ? (
            <p className="whitespace-pre-wrap">{question.userAnswer}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              还没有填写自己的答案，可以在添加题目时或表格编辑对话框里补充。
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
