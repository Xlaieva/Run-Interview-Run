"use client";

import { useState } from "react";
import { Pencil, Loader2, Sparkles } from "lucide-react";
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

export function EditAnswerDialog({
  question,
  onUpdated,
}: {
  question: InterviewQuestion;
  onUpdated: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(question.category ?? "");
  const [standardAnswer, setStandardAnswer] = useState(question.standardAnswer ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/interview/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, standardAnswer }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "保存失败");
        return;
      }
      onUpdated(data as InterviewQuestion);
      toast.success("已保存");
      setOpen(false);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/interview/${question.id}/classify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? data?.error ?? "生成失败");
        return;
      }
      const updated = data as InterviewQuestion;
      setCategory(updated.category ?? "");
      setStandardAnswer(updated.standardAnswer ?? "");
      onUpdated(updated);
      toast.success("已重新生成");
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" title="编辑标准答案">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑「{question.title}」</DialogTitle>
          <DialogDescription>手动修改分类和标准答案，或用 AI 重新生成。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="edit-category">分类</Label>
            <Input id="edit-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={submitting} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-answer">标准答案</Label>
            <Textarea
              id="edit-answer"
              rows={10}
              value={standardAnswer}
              onChange={(e) => setStandardAnswer(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="outline" onClick={handleRegenerate} disabled={regenerating || submitting}>
            {regenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            用 AI 重新生成
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
