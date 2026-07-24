"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProblemPanel } from "./problem-panel";
import { CodeEditorPanel } from "./code-editor-panel";
import { ChatPanel } from "./chat-panel";
import { HintBar } from "./hint-bar";
import { SolutionReveal } from "./solution-reveal";
import { DiffView } from "./diff-view";
import { runProblemCode } from "@/lib/run-problem-code";
import type { Problem } from "@/db/schema";
import type { ChatMessage, RunResult, SolveMode } from "@/lib/types";

const MODE_STORAGE_KEY = "problem-solve-mode";

const ACM_STARTER_TS = `// ACM 模式：readline() 每次返回下一行输入（string），没有更多输入时返回 undefined
// main() 里自己读取输入、计算，并用 console.log 打印结果

function main() {

}

main();
`;

const ACM_STARTER_PYTHON = `# ACM 模式：用 input() 逐行读取输入，用 print() 打印结果
def main():
    pass


main()
`;

function buildStarterTemplate(problem: Problem, mode: SolveMode): string {
  if (mode === "acm" && problem.judgeMode === "call") {
    return problem.language === "python" ? ACM_STARTER_PYTHON : ACM_STARTER_TS;
  }

  if (problem.language === "python") {
    if (problem.functionSignature) {
      return `${problem.functionSignature}\n    # 在这里编写你的解法\n    pass\n`;
    }
    return `def solution():\n    # 在这里编写你的解法\n    pass\n`;
  }

  if (problem.judgeMode === "log" && problem.inputVariableNames?.length) {
    const example = problem.testCases?.[0]?.values as
      | Record<string, unknown>
      | undefined;
    const declarations = problem.inputVariableNames
      .map((name) => `let ${name} = ${JSON.stringify(example?.[name] ?? null)};`)
      .join("\n");
    return `// 输入变量（名字不要改，判题时会被替换成每组测试用例的值）
${declarations}

// 在这里编写你的解法，最后用一次 console.log 打印结果
`;
  }
  if (problem.functionSignature) {
    return `${problem.functionSignature} {
  // 在这里编写你的解法

}
`;
  }
  if (problem.judgeMode === "spec") {
    return `// 按题目要求实现，判题脚本会直接调用你在这里定义的函数 / 类 / 原型方法

`;
  }
  return `function solution() {
  // 在这里编写你的解法

}

// 在下面调用你的函数验证结果，例如：
// console.log(solution());
// 如果最后一行是一个表达式（比如直接写 solution()），运行结果面板也会自动显示它的返回值
`;
}

function buildFailureSummary(runResult: RunResult | null): string | undefined {
  if (!runResult) return undefined;
  if (runResult.error) return runResult.error.message;
  if (runResult.testResults) {
    const failed = runResult.testResults.filter((t) => !t.passed);
    if (failed.length === 0) return undefined;
    return failed
      .map((t, i) => {
        if (t.name) {
          return `用例「${t.name}」失败：${t.error ?? "未通过"}`;
        }
        const actual = t.error
          ? `抛出异常：${t.error}`
          : `实际 ${JSON.stringify(t.actual)}`;
        return `用例${i + 1} 失败：输入 ${JSON.stringify(t.input)}，期望 ${JSON.stringify(t.expected)}，${actual}`;
      })
      .join("\n");
  }
  return undefined;
}

type HintStage = 0 | 1 | 2 | 3;

export function PracticeView({
  problem: initialProblem,
  isReview,
  reviewQueue = [],
}: {
  problem: Problem;
  isReview: boolean;
  reviewQueue?: string[];
}) {
  const router = useRouter();
  const [problem, setProblem] = useState(initialProblem);
  const canToggleAcmMode =
    problem.judgeMode === "call" &&
    !!problem.functionName &&
    (problem.testCases?.length ?? 0) > 0;
  const [mode, setMode] = useState<SolveMode>("normal");
  const [code, setCode] = useState(() => buildStarterTemplate(initialProblem, "normal"));
  const [pendingMode, setPendingMode] = useState<SolveMode | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [hintStage, setHintStage] = useState<HintStage>(0);
  const [errorLines, setErrorLines] = useState<number[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    initialProblem.userAnswer && initialProblem.answerFeedback
      ? [
          { role: "user", content: initialProblem.userAnswer },
          { role: "assistant", content: initialProblem.answerFeedback },
        ]
      : [],
  );
  const [chatSending, setChatSending] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (!canToggleAcmMode) return;
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved !== "acm") return;
    // 首次挂载时按上次记住的偏好切一次起始模板——依赖 window/localStorage，
    // 只能在客户端挂载后计算，故对 react-hooks/set-state-in-effect 规则做局部豁免。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("acm");
    setCode(buildStarterTemplate(initialProblem, "acm"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestModeChange(next: SolveMode) {
    if (next === mode) return;
    const currentTemplate = buildStarterTemplate(problem, mode);
    if (code === currentTemplate) {
      applyModeChange(next);
      return;
    }
    setPendingMode(next);
  }

  function applyModeChange(next: SolveMode) {
    setMode(next);
    setCode(buildStarterTemplate(problem, next));
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
    setRunResult(null);
    setErrorLines([]);
    setHintStage(0);
    setSolutionRevealed(false);
    setShowDiff(false);
  }

  const submitAttempt = useCallback(
    async (passed: boolean, stage: HintStage) => {
      try {
        const res = await fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemId: problem.id,
            code,
            passed,
            hintsUsed: stage,
            isReview,
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          setProblem((prev) => ({ ...prev, ...updated }));
        }
      } catch {
        // stats update failing shouldn't block the practice flow
      }
    },
    [problem.id, code, isReview],
  );

  const executeRun = useCallback(async () => {
    setRunning(true);
    const result = await runProblemCode(problem, code, mode);
    setRunning(false);
    setRunResult(result);
    if (result.ok) {
      setErrorLines([]);
    }
    await submitAttempt(result.ok, hintStage);
    if (result.ok) {
      toast.success(
        hintStage === 0 ? "一次通过！" : "通过了，继续加油",
      );
      setHintStage(0);
      setSolutionRevealed(false);
      setShowDiff(false);
    }
    return result;
  }, [code, hintStage, submitAttempt, problem, mode]);

  async function handleDegradedHint() {
    setHintLoading(true);
    await executeRun();
    setShowDiff(true);
    setHintLoading(false);
  }

  async function handleLocate() {
    setHintLoading(true);
    try {
      const res = await fetch("/api/hint/locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          code,
          errorMessage: buildFailureSummary(runResult),
        }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，已切换到手动对比模式");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "定位失败");
        return;
      }
      setErrorLines(data.lines ?? []);
      setHintStage(1);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setHintLoading(false);
    }
  }

  async function handleChatHint() {
    const hintPrompt = "我目前还是没通过，能不能给个引导性的提示？不要直接给答案。";
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: hintPrompt },
    ];
    setChatMessages(newMessages);
    setHintLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          messages: newMessages,
          code,
        }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，已切换到手动对比模式");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "AI 回复失败");
        return;
      }
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: data.reply },
      ]);
      setHintStage(2);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setHintLoading(false);
    }
  }

  function handleReveal() {
    setSolutionRevealed(true);
    setHintStage(3);
  }

  function handleHintClick() {
    if (!aiAvailable) {
      handleDegradedHint();
      return;
    }
    if (hintStage === 0) handleLocate();
    else if (hintStage === 1) handleChatHint();
    else if (hintStage === 2) handleReveal();
  }

  async function handleChatSend(text: string) {
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: text },
    ];
    setChatMessages(newMessages);
    setChatSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          messages: newMessages,
          code,
        }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，已切换到手动对比模式");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "AI 回复失败");
        return;
      }
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setChatSending(false);
    }
  }

  const canUseHint = runResult !== null && !runResult.ok && hintStage < 3;

  function handleNextInQueue() {
    if (reviewQueue.length === 0) {
      router.push("/");
      return;
    }
    const [next, ...rest] = reviewQueue;
    const queueParam = rest.length ? `&queue=${rest.join(",")}` : "";
    router.push(`/problem/${next}?mode=review${queueParam}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{problem.title}</span>
        {isReview && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">复习模式</Badge>
            {reviewQueue.length > 0 && (
              <span className="text-xs text-muted-foreground">
                还剩 {reviewQueue.length} 道
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleNextInQueue}>
              {reviewQueue.length > 0 ? "下一题" : "结束复习"}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_340px]">
        <ProblemPanel problem={problem} onUpdated={setProblem} />

        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <CodeEditorPanel
              code={code}
              onChange={setCode}
              onRun={executeRun}
              running={running}
              runResult={runResult}
              errorLines={errorLines}
              language={problem.language}
              showModeToggle={canToggleAcmMode}
              mode={mode}
              onModeChange={requestModeChange}
            />
          </div>
          <div className="border-t">
            <HintBar
              aiAvailable={aiAvailable}
              hintStage={hintStage}
              canUseHint={aiAvailable ? canUseHint : true}
              loading={hintLoading}
              onClick={handleHintClick}
            />
            {solutionRevealed && problem.solutions && problem.solutions.length > 0 && (
              <SolutionReveal solutions={problem.solutions} />
            )}
            {showDiff && (
              <div className="border-t px-3 py-2">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  与最优参考答案的差异（- 参考答案 / + 你的代码）
                </p>
                {problem.solutions?.[0] ? (
                  <DiffView original={problem.solutions[0].solutionCode} updated={code} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    这道题还没有参考答案，可以点击左上角的编辑按钮手动填写一份，之后就能对比了
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <ChatPanel
          messages={chatMessages}
          onSend={handleChatSend}
          sending={chatSending}
          aiAvailable={aiAvailable}
          onRetryAi={() => setAiAvailable(true)}
        />
      </div>

      <AlertDialog
        open={pendingMode !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>切换模式会重置当前代码</AlertDialogTitle>
            <AlertDialogDescription>
              切换到{pendingMode === "acm" ? "ACM 模式" : "普通模式"}
              后，编辑器里的代码会被重置成新模式的起始模板，当前写的代码会丢失，确定要切换吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingMode(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingMode) applyModeChange(pendingMode);
                setPendingMode(null);
              }}
            >
              确定切换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
