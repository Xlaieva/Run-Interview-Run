"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Problem } from "@/db/schema";
import type { Language } from "@/lib/types";

export function AddProblemDialog({
  onCreated,
}: {
  onCreated: (problem: Problem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>("typescript");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast.error("请填写题目标题和描述");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, userDescription: description, language }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "添加失败");
        return;
      }
      const problem = data as Problem;
      onCreated(problem);
      if (!problem.category) {
        toast.warning("题目已保存，但 AI 分类暂时失败，可以在表格里手动编辑解法信息");
      } else {
        toast.success("题目已添加，AI 分类完成");
      }
      setTitle("");
      setDescription("");
      setOpen(false);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <DialogTitle>添加新题目</DialogTitle>
          <DialogDescription>
            粘贴题目标题与描述，AI 会自动完成分类、常用解法与时空复杂度分析。语言添加后不能再改。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="problem-title">题目标题</Label>
            <Input
              id="problem-title"
              placeholder="例如：两数之和"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="problem-language">代码语言</Label>
            <Select
              value={language}
              onValueChange={(v) => v && setLanguage(v as Language)}
            >
              <SelectTrigger id="problem-language" disabled={submitting}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="typescript">TypeScript</SelectItem>
                <SelectItem value="python">Python</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="problem-description">题目描述</Label>
            <Textarea
              id="problem-description"
              rows={8}
              placeholder="粘贴完整题目描述，包括示例输入输出"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                AI 分析中...
              </>
            ) : (
              "添加并分析"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
