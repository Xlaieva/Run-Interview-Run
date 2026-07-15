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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Problem } from "@/db/schema";
import type { JudgeMode } from "@/lib/types";

const CALL_MODE_PLACEHOLDER = `[
  { "input": [[2, 7, 11, 15], 9], "expected": [0, 1] },
  { "input": [[3, 2, 4], 6], "expected": [1, 2] }
]`;

const LOG_MODE_PLACEHOLDER = `[
  { "values": { "nums": [2, 7, 11, 15], "target": 9 }, "expected": [0, 1] },
  { "values": { "nums": [3, 2, 4], "target": 6 }, "expected": [1, 2] }
]`;

const SOLUTIONS_PLACEHOLDER = `[
  {
    "approachName": "哈希表",
    "approachSummary": "用哈希表记录已遍历的值和下标...",
    "verbalExplanation": "我们可以一边遍历数组一边把每个数存进哈希表，key 是数值、value 是下标。每次遍历到一个新数时，先看目标值减去它的差是不是已经在哈希表里出现过，如果出现过说明前面已经有一个数正好能和它凑成 target，直接返回这两个下标就行，这样只需要遍历一次数组。",
    "solutionCode": "function twoSum(nums: number[], target: number): number[] { ... }",
    "timeComplexity": "O(n)",
    "spaceComplexity": "O(n)"
  }
]`;

const IDENTIFIER_PATTERN: Record<"typescript" | "python", RegExp> = {
  typescript: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
  python: /^[A-Za-z_][A-Za-z0-9_]*$/,
};

export function EditSolutionDialog({
  problem,
  onUpdated,
}: {
  problem: Problem;
  onUpdated: (problem: Problem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(problem.category ?? "");
  const [solutionsJson, setSolutionsJson] = useState(
    problem.solutions ? JSON.stringify(problem.solutions, null, 2) : "",
  );
  const [judgeMode, setJudgeMode] = useState<JudgeMode>(
    problem.judgeMode ?? "call",
  );
  const [functionName, setFunctionName] = useState(problem.functionName ?? "");
  const [functionSignature, setFunctionSignature] = useState(
    problem.functionSignature ?? "",
  );
  const [inputVariableNamesText, setInputVariableNamesText] = useState(
    (problem.inputVariableNames ?? []).join(", "),
  );
  const [testCasesJson, setTestCasesJson] = useState(
    problem.testCases ? JSON.stringify(problem.testCases, null, 2) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const isPython = problem.language === "python";

  function applyProblem(updated: Problem) {
    setCategory(updated.category ?? "");
    setSolutionsJson(updated.solutions ? JSON.stringify(updated.solutions, null, 2) : "");
    setJudgeMode(updated.judgeMode ?? "call");
    setFunctionName(updated.functionName ?? "");
    setFunctionSignature(updated.functionSignature ?? "");
    setInputVariableNamesText((updated.inputVariableNames ?? []).join(", "));
    setTestCasesJson(updated.testCases ? JSON.stringify(updated.testCases, null, 2) : "");
    onUpdated(updated);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/problems/${problem.id}/classify`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.status === 503) {
        toast.warning(data?.message ?? "AI 暂时不可用");
        return;
      }
      if (!res.ok) {
        toast.error(data?.error ?? "重新生成失败");
        return;
      }
      applyProblem(data as Problem);
      toast.success("已用 AI 重新生成解法");
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSubmit() {
    const effectiveJudgeMode = isPython ? "call" : judgeMode;
    const idPattern = IDENTIFIER_PATTERN[isPython ? "python" : "typescript"];
    if (effectiveJudgeMode === "call" && functionName && !idPattern.test(functionName)) {
      toast.error(
        isPython
          ? "函数名必须是合法的 Python 标识符（字母/数字/下划线，不能以数字开头，不能用 $）"
          : "函数名必须是合法的标识符（字母/数字/下划线，不能以数字开头）",
      );
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        category,
        judgeMode: effectiveJudgeMode,
      };
      if (solutionsJson.trim()) {
        body.solutionsJson = solutionsJson;
      }
      if (effectiveJudgeMode === "call") {
        body.functionName = functionName;
        body.functionSignature = functionSignature;
      } else {
        const names = inputVariableNamesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        body.inputVariableNamesJson = JSON.stringify(names);
      }
      if (testCasesJson.trim()) {
        body.testCasesJson = testCasesJson;
      }

      const res = await fetch(`/api/problems/${problem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "保存失败");
        return;
      }
      onUpdated(data as Problem);
      toast.success("解法信息已保存");
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
          <Button variant="ghost" size="icon" title="手动编辑解法信息">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>手动编辑解法信息</DialogTitle>
          <DialogDescription>
            当 AI 分类失败或不可用时，可以在这里手动填写分类、解法和判题用例；也可以用 AI 重新生成。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto pr-1">
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="edit-category">分类</Label>
              <Input
                id="edit-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例如：动态规划"
                disabled={submitting || regenerating}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={submitting || regenerating}
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              用 AI 重新生成
            </Button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-solutions">
              解法（JSON 数组，按时间/空间复杂度从优到劣排序，第一项是最优解）
            </Label>
            <Textarea
              id="edit-solutions"
              rows={10}
              className="font-mono text-xs"
              value={solutionsJson}
              onChange={(e) => setSolutionsJson(e.target.value)}
              placeholder={SOLUTIONS_PLACEHOLDER}
              disabled={submitting || regenerating}
            />
          </div>

          {isPython ? (
            <div className="grid gap-3">
              <div>
                <Label>判题方式</Label>
                <p className="text-xs text-muted-foreground">
                  Python 题目目前只支持函数调用判题模式。
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-fn-name">函数名</Label>
                <Input
                  id="edit-fn-name"
                  value={functionName}
                  onChange={(e) => setFunctionName(e.target.value)}
                  placeholder="two_sum"
                  className="font-mono"
                  disabled={submitting || regenerating}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-fn-sig">函数签名</Label>
                <Input
                  id="edit-fn-sig"
                  value={functionSignature}
                  onChange={(e) => setFunctionSignature(e.target.value)}
                  placeholder="def two_sum(nums: list[int], target: int) -> list[int]:"
                  className="font-mono text-sm"
                  disabled={submitting || regenerating}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-testcases-call">
                  测试用例（JSON 数组，input 按参数顺序）
                </Label>
                <Textarea
                  id="edit-testcases-call"
                  rows={6}
                  className="font-mono text-xs"
                  value={testCasesJson}
                  onChange={(e) => setTestCasesJson(e.target.value)}
                  placeholder={CALL_MODE_PLACEHOLDER}
                  disabled={submitting || regenerating}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>判题方式</Label>
              <p className="text-xs text-muted-foreground">
                有 AI 时会自动用「函数调用模式」；没有 AI 时可以手动配置任意一种。
              </p>
              <Tabs value={judgeMode} onValueChange={(v) => setJudgeMode(v as JudgeMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="call" className="flex-1">
                    函数调用模式
                  </TabsTrigger>
                  <TabsTrigger value="log" className="flex-1">
                    变量 + 日志匹配模式
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="call" className="grid gap-3 pt-2">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-fn-name">函数名</Label>
                    <Input
                      id="edit-fn-name"
                      value={functionName}
                      onChange={(e) => setFunctionName(e.target.value)}
                      placeholder="twoSum"
                      className="font-mono"
                      disabled={submitting || regenerating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-fn-sig">函数签名</Label>
                    <Input
                      id="edit-fn-sig"
                      value={functionSignature}
                      onChange={(e) => setFunctionSignature(e.target.value)}
                      placeholder="function twoSum(nums: number[], target: number): number[]"
                      className="font-mono text-sm"
                      disabled={submitting || regenerating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-testcases-call">
                      测试用例（JSON 数组，input 按参数顺序）
                    </Label>
                    <Textarea
                      id="edit-testcases-call"
                      rows={6}
                      className="font-mono text-xs"
                      value={testCasesJson}
                      onChange={(e) => setTestCasesJson(e.target.value)}
                      placeholder={CALL_MODE_PLACEHOLDER}
                      disabled={submitting || regenerating}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="log" className="grid gap-3 pt-2">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-input-vars">
                      输入变量名（逗号分隔，会出现在起始代码顶部）
                    </Label>
                    <Input
                      id="edit-input-vars"
                      value={inputVariableNamesText}
                      onChange={(e) => setInputVariableNamesText(e.target.value)}
                      placeholder="nums, target"
                      className="font-mono"
                      disabled={submitting || regenerating}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-testcases-log">
                      测试用例（JSON 数组，values 是变量名到值的映射）
                    </Label>
                    <Textarea
                      id="edit-testcases-log"
                      rows={6}
                      className="font-mono text-xs"
                      value={testCasesJson}
                      onChange={(e) => setTestCasesJson(e.target.value)}
                      placeholder={LOG_MODE_PLACEHOLDER}
                      disabled={submitting || regenerating}
                    />
                    <p className="text-xs text-muted-foreground">
                      要求代码最后用一次 console.log 打印结果，判题时会把最后一次打印的值和 expected 比对。
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || regenerating}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
