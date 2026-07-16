"use client";

import { useState } from "react";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { InterviewQuestion } from "@/db/schema";

export function AddQuestionDialog({
  onCreated,
}: {
  onCreated: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFeedback(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast.error("请填写题目标题和描述");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          userDescription: description,
          userAnswer: userAnswer.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "添加失败");
        return;
      }
      const question = data as InterviewQuestion & { answerFeedback?: string | null };
      onCreated(question);
      if (!question.standardAnswer) {
        toast.warning("题目已保存，但 AI 生成答案暂时失败，可以在表格里手动编辑");
      } else {
        toast.success("题目已添加，AI 已生成标准答案");
      }
      setTitle("");
      setDescription("");
      setUserAnswer("");
      if (question.answerFeedback) {
        setFeedback(question.answerFeedback);
      } else {
        setOpen(false);
      }
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            添加题目
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{feedback ? "AI 建议" : "添加面试问答题"}</DialogTitle>
          <DialogDescription>
            {feedback
              ? "题目已添加。AI 对比了标准答案和你写的回答，给出以下建议和术语解释（不会修改你填写的原始内容）"
              : "输入题目标题与描述，AI 会自动生成分类和标准答案，之后可以手动编辑。"}
          </DialogDescription>
        </DialogHeader>
        {feedback ? (
          <div className="overflow-y-auto pr-1">
            <div className="flex items-start gap-1.5 rounded-md bg-violet-500/10 p-3 text-sm whitespace-pre-wrap">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
              <p>{feedback}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 overflow-y-auto pr-1">
            <div className="grid gap-2">
              <Label htmlFor="q-title">题目标题</Label>
              <Input
                id="q-title"
                placeholder="例如：讲讲你对 REST 和 GraphQL 的理解"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-description">题目描述</Label>
              <Textarea
                id="q-description"
                rows={6}
                placeholder="补充问题的具体要求或背景（可以和标题相同）"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-user-answer">你的答案（可选）</Label>
              <Textarea
                id="q-user-answer"
                rows={4}
                placeholder="写下你自己的回答，AI 会对比标准答案给出建议和术语解释"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {feedback ? (
            <Button onClick={() => handleOpenChange(false)}>知道了</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  AI 生成中...
                </>
              ) : (
                "添加并生成答案"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
