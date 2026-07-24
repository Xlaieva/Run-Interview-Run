# 代码刷题「普通模式 / ACM 模式」Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给 `judgeMode === "call"` 的代码题加一个做题时可切换的「普通模式（现在的函数调用方式）/ ACM 模式（完整程序读 stdin、打印 stdout）」开关，模拟真实笔试/面试的 ACM 判题体验。

**Architecture:** 核心是一个新的共享模块 `src/lib/acm-io.ts`：用固定确定性规则把测试用例的结构化 `input`/`expected` 序列化成纯文本 stdin/stdout（不用 AI），TS worker 和 Python worker 各自新增一条 ACM 判题分支复用这个模块。UI 层是一个纯前端的做题偏好（`localStorage` 记住上次选择），不改 `problems` 表 schema。

**Tech Stack:** 现有 TypeScript sandbox worker（`ts.transpileModule` + `AsyncFunction`）、Pyodide（`setStdin`/`setStdout`）、React + shadcn `AlertDialog`。

**关于测试方式的说明：** 这个仓库没有自动化测试框架，验证方式统一是 `npx tsc --noEmit` + `npx eslint` + `npm run build` + `npm run dev` 手动过一遍浏览器交互，纯逻辑模块（`acm-io.ts`）额外用一次性 `tsx` 脚本手动跑一遍断言（跑完删掉脚本，不提交）。

---

## 已核实的关键事实

- `problems` 表（`src/db/schema.ts:13-68`）：`language`、`judgeMode`（`"call"|"log"|"spec"`）、`functionName`、`functionSignature`、`testCases`（`jsonb`，`TestCase { input?: unknown[]; values?: Record<string, unknown>; expected: unknown }`）。ACM 模式只对 `judgeMode === "call"` 生效。
- TS 判题在 `src/workers/run-code.worker.ts`：`new AsyncFunction(jsSource)` 把用户代码和 harness 拼成一个字符串一起编译执行，harness 用 `self.__xxx` 挂到 worker 全局上传数据（如 `self.__testCases`），这是本仓库现有的注入约定。`console.log`/`warn`/`error` 已经被 `executeScript()` 统一捕获成 `logs: RunLogLine[]`。
- Python 判题在 `src/workers/run-python.worker.ts`：Pyodide 用 `pyodide.setStdout({ batched })`/`setStderr` 捕获输出；`pyodide.d.ts` 确认 `setStdin({ stdin: () => number | string | null | ... })` 存在，`stdin` 回调每次返回一个字符的 char code，`null` 表示 EOF——这是 Pyodide 官方推荐的"喂固定 stdin 文本"手法，`input()`/`sys.stdin` 完全不用用户改代码。
- `run-log 模式已有的 `runLogMode`（`run-code.worker.ts:240-300`）证明了"每个测试用例单独跑一次全新的 `executeScript`（无状态残留）"这个模式在本仓库是可行且已验证的写法——ACM 模式的每个测试用例也要这样单独跑一次（模拟真实 ACM 判题"一个测试点一个全新进程"），而不是像 `runCallMode` 那样在一次执行里内部循环所有用例。
- `code-editor-panel.tsx` 的结果面板已经用 `whitespace-pre-wrap` 渲染 `input`/`expected`/`actual`（通过本地 `formatValue`，字符串类型直接原样返回），ACM 模式往这几个字段塞多行纯文本完全不需要改结果展示的组件结构。
- `Button` 组件（`src/components/ui/button.tsx`）支持的 `variant`：`default`/`outline`/`secondary`/`ghost`/`destructive`/`link`；`size`：`default`/`xs`/`sm`/`lg`/`icon` 等。
- `AlertDialog`（`src/components/ui/alert-dialog.tsx`，基于 `@base-ui/react/alert-dialog`）是受控组件：`<AlertDialog open={...} onOpenChange={...}>`，配 `AlertDialogContent`/`Header`/`Title`/`Description`/`Footer`/`Cancel`/`Action`。
- 设计文档：`docs/plans/2026-07-24-acm-mode-design.md`（已在 brainstorming 阶段确认）。

---

### Task 1: 新增 `src/lib/acm-io.ts`（核心序列化/格式说明模块）

**Files:**
- Create: `src/lib/acm-io.ts`

**Step 1: 写文件**

```ts
/**
 * ACM 模式的纯文本 stdin/stdout 转换——固定确定性规则，TS worker、Python worker、
 * 题目描述里的"输入输出格式说明"三处共用同一套逻辑，保证展示的格式说明和真实判题
 * 用的数据不会不一致。
 */

type AcmShape = "boolean" | "number" | "string" | "matrix" | "array" | "raw";

function classifyAcmValue(value: unknown): AcmShape {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) {
    return value.length > 0 && Array.isArray(value[0]) ? "matrix" : "array";
  }
  return "raw";
}

function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return String(value);
}

/** 把一个值按固定规则序列化成若干行纯文本。 */
export function serializeAcmValue(value: unknown): string[] {
  switch (classifyAcmValue(value)) {
    case "boolean":
      return [value ? "true" : "false"];
    case "number":
    case "string":
      return [String(value)];
    case "matrix": {
      const rows = value as unknown[][];
      return [String(rows.length), ...rows.map((row) => row.map(formatScalar).join(" "))];
    }
    case "array": {
      const arr = value as unknown[];
      return [String(arr.length), arr.map(formatScalar).join(" ")];
    }
    default:
      try {
        return [JSON.stringify(value)];
      } catch {
        return [String(value)];
      }
  }
}

/** 按函数参数顺序，把整组 input 依次序列化拼成完整 stdin 文本。 */
export function buildAcmStdin(input: unknown[] | undefined): string {
  return (input ?? []).flatMap((v) => serializeAcmValue(v)).join("\n");
}

/** 把单个返回值序列化成期望的 stdout 文本。 */
export function buildAcmExpectedOutput(expected: unknown): string {
  return serializeAcmValue(expected).join("\n");
}

/** 判题比对前的归一化：去掉每行末尾空白、去掉末尾空行，不做其它"聪明"处理。 */
export function normalizeAcmOutput(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * 从函数签名字符串里解析出参数名列表，按括号深度切分，取每段冒号前的标识符。
 * 兼容 TS（"function twoSum(nums: number[], target: number): number[]"）和
 * Python（"def two_sum(nums: list[int], target: int) -> list[int]:"）风格。
 * 解析失败（没有括号等）返回空数组，调用方要 fallback 成"参数1/参数2"这样的占位名。
 */
export function parseFunctionParamNames(functionSignature: string): string[] {
  const start = functionSignature.indexOf("(");
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  for (let i = start; i < functionSignature.length; i++) {
    const ch = functionSignature[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  const inner = functionSignature.slice(start + 1, end).trim();
  if (!inner) return [];

  const parts: string[] = [];
  let partStart = 0;
  let d = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") d--;
    else if (ch === "," && d === 0) {
      parts.push(inner.slice(partStart, i));
      partStart = i + 1;
    }
  }
  parts.push(inner.slice(partStart));

  return parts
    .map((part) => {
      const trimmed = part.trim();
      const colonIdx = trimmed.indexOf(":");
      return (colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)).trim();
    })
    .filter(Boolean);
}

function describeParam(value: unknown, name: string): string[] {
  switch (classifyAcmValue(value)) {
    case "boolean":
      return [`一个布尔值（true/false），表示 ${name}`];
    case "number":
      return [`一个整数，表示 ${name}`];
    case "string":
      return [`一个字符串，表示 ${name}`];
    case "matrix":
      return [
        `一个整数 m，表示 ${name} 的行数`,
        `接下来 m 行，每行是 ${name} 对应行、用空格分隔的元素`,
      ];
    case "array":
      return [`一个整数 n，表示 ${name} 的长度`, `n 个用空格分隔的值，表示 ${name}`];
    default:
      return [`${name}（原始 JSON 格式，此题参数类型较特殊）`];
  }
}

/**
 * 生成展示给用户看的"输入输出格式说明"——用步骤序号而不是绝对行号（矩阵这类
 * 变长参数之后的行号本来就无法提前定死），逻辑跟 serializeAcmValue 共享同一个
 * classifyAcmValue，保证文字说明和真实序列化结果不会对不上。
 */
export function describeAcmFormat(
  functionSignature: string | null | undefined,
  exampleInput: unknown[] | undefined,
  exampleExpected: unknown,
): string {
  const paramNames = functionSignature ? parseFunctionParamNames(functionSignature) : [];
  const inputSteps = (exampleInput ?? []).flatMap((value, i) =>
    describeParam(value, paramNames[i] || `参数${i + 1}`),
  );
  const outputSteps = describeParam(exampleExpected, "返回值");

  const numbered = (steps: string[]) =>
    steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "（无）";

  return `按顺序依次输入：\n${numbered(inputSteps)}\n\n程序需要按顺序打印：\n${numbered(outputSteps)}`;
}
```

**Step 2: 写一次性验证脚本，手动跑一遍核对逻辑**

创建临时文件 `acm-io.check.tmp.ts`（不提交，跑完删掉）：

```ts
import {
  serializeAcmValue,
  buildAcmStdin,
  buildAcmExpectedOutput,
  normalizeAcmOutput,
  parseFunctionParamNames,
  describeAcmFormat,
} from "./src/lib/acm-io";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}: got ${a}, want ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`ok ${label}`);
  }
}

// twoSum(nums=[2,7,11,15], target=9) -> [0,1]
assertEqual(buildAcmStdin([[2, 7, 11, 15], 9]), "4\n2 7 11 15\n9", "buildAcmStdin twoSum");
assertEqual(buildAcmExpectedOutput([0, 1]), "2\n0 1", "buildAcmExpectedOutput array");
assertEqual(serializeAcmValue(true), ["true"], "serialize boolean");
assertEqual(serializeAcmValue("hello"), ["hello"], "serialize string");
assertEqual(
  serializeAcmValue([[1, 2], [3, 4]]),
  ["2", "1 2", "3 4"],
  "serialize matrix",
);
assertEqual(
  normalizeAcmOutput("2\n0 1   \n\n"),
  "2\n0 1",
  "normalizeAcmOutput trims trailing whitespace/blank lines",
);
assertEqual(
  parseFunctionParamNames("function twoSum(nums: number[], target: number): number[]"),
  ["nums", "target"],
  "parseFunctionParamNames TS",
);
assertEqual(
  parseFunctionParamNames("def two_sum(nums: list[int], target: int) -> list[int]:"),
  ["nums", "target"],
  "parseFunctionParamNames Python",
);
console.log(describeAcmFormat(
  "function twoSum(nums: number[], target: number): number[]",
  [[2, 7, 11, 15], 9],
  [0, 1],
));
```

Run: `npx tsx acm-io.check.tmp.ts`
Expected: 全部输出 `ok ...`，没有 `FAIL`；最后打印出的格式说明大致是：

```
按顺序依次输入：
1. 一个整数 n，表示 nums 的长度
2. n 个用空格分隔的值，表示 nums
3. 一个整数，表示 target

程序需要按顺序打印：
1. 一个整数 n，表示 返回值 的长度
2. n 个用空格分隔的值，表示 返回值
```

跑完删掉临时文件：`rm acm-io.check.tmp.ts`

**Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

**Step 4: Commit**

```bash
git add src/lib/acm-io.ts
git commit -m "新增 acm-io.ts：ACM 模式纯文本 stdin/stdout 序列化与格式说明生成"
```

---

### Task 2: TS worker 新增 ACM 判题分支

**Files:**
- Modify: `src/workers/run-code.worker.ts`

**Step 1: 顶部新增 import**

在文件顶部 `import type { ... } from "@/lib/types";` 后面加：

```ts
import { buildAcmStdin, buildAcmExpectedOutput, normalizeAcmOutput } from "@/lib/acm-io";
```

**Step 2: `RunMessage` 接口新增字段**

```ts
interface RunMessage {
  code: string;
  judgeMode?: JudgeMode;
  functionName?: string;
  inputVariableNames?: string[];
  testCases?: TestCase[];
  judgeScript?: string;
  mode?: "normal" | "acm";
}
```

**Step 3: 在 `runLegacy` 函数后面（`self.onmessage` 之前）新增 `runAcmMode`**

```ts
/**
 * ACM 模式：每个测试用例单独跑一次全新的 executeScript（不共享全局状态，模拟
 * 真实 ACM 判题"一个测试点一个全新进程"），注入一个全局同步 readline()（不是
 * 真实的 Node process.stdin 事件流程——判题时输入本来就是一次性全量已知的，没
 * 有对应的真实收益），把用户完整程序的打印输出跟期望文本做精确比对。
 */
async function runAcmMode(code: string, testCases: TestCase[]): Promise<RunResult> {
  const testResults: TestCaseResult[] = [];

  for (const tc of testCases) {
    const stdinText = buildAcmStdin(tc.input);
    const expectedText = buildAcmExpectedOutput(tc.expected);
    const stdinLines = stdinText.length ? stdinText.split("\n") : [];
    (self as unknown as { __stdinLines: string[] }).__stdinLines = stdinLines;

    const harness = `
function readline() {
  return self.__stdinLines.length ? self.__stdinLines.shift() : undefined;
}
`;

    try {
      const outputText = transpile(harness + "\n" + code);
      const exec = await executeScript(outputText);
      if (exec.thrown) {
        testResults.push({
          input: stdinText,
          expected: expectedText,
          passed: false,
          error: exec.thrown.message,
        });
        continue;
      }
      const actualText = exec.logs
        .filter((l) => l.level === "log")
        .map((l) => l.text)
        .join("\n");
      testResults.push({
        input: stdinText,
        expected: expectedText,
        actual: actualText,
        passed: normalizeAcmOutput(actualText) === normalizeAcmOutput(expectedText),
      });
    } catch (err) {
      testResults.push({
        input: stdinText,
        expected: expectedText,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: testResults.length > 0 && testResults.every((r) => r.passed),
    logs: [],
    error: null,
    testResults,
  };
}
```

**Step 4: 在 `self.onmessage` 里接入新分支**

找到：

```ts
self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { code, judgeMode, functionName, inputVariableNames, testCases, judgeScript } =
    event.data;

  const canSpecMode = judgeMode === "spec" && !!judgeScript?.trim();
```

改成：

```ts
self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { code, judgeMode, functionName, inputVariableNames, testCases, judgeScript, mode } =
    event.data;

  const canAcmMode =
    mode === "acm" &&
    judgeMode === "call" &&
    Array.isArray(testCases) &&
    testCases.length > 0;

  const canSpecMode = judgeMode === "spec" && !!judgeScript?.trim();
```

然后找到分发逻辑：

```ts
  try {
    let result: RunResult;
    if (canSpecMode) {
      result = await runSpecMode(code, judgeScript!);
    } else if (canCallMode) {
```

在 `if (canSpecMode)` 前面加一个 `canAcmMode` 分支（ACM 优先级最高，因为它跟 `canCallMode` 的判断条件重叠——同一道题、同一个 `judgeMode === "call"`，靠 `mode` 字段区分走哪条路）：

```ts
  try {
    let result: RunResult;
    if (canAcmMode) {
      result = await runAcmMode(code, testCases!);
    } else if (canSpecMode) {
      result = await runSpecMode(code, judgeScript!);
    } else if (canCallMode) {
```

**Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

**Step 6: Commit**

```bash
git add src/workers/run-code.worker.ts
git commit -m "TS worker 新增 ACM 判题分支：注入 readline()，比对 stdout 纯文本"
```

---

### Task 3: Python worker 新增 ACM 判题分支

**Files:**
- Modify: `src/workers/run-python.worker.ts`

**Step 1: 顶部新增 import**

```ts
import { buildAcmStdin, buildAcmExpectedOutput, normalizeAcmOutput } from "@/lib/acm-io";
```

**Step 2: `RunMessage` 接口新增字段**

```ts
interface RunMessage {
  code: string;
  functionName?: string;
  testCases?: TestCase[];
  mode?: "normal" | "acm";
}
```

**Step 3: 在 `buildHarness` 函数后面新增 `runAcmMode`**

```ts
/**
 * ACM 模式：真实的 input()/sys.stdin 完全不用改——用 pyodide.setStdin 逐字符喂
 * 数据，这是 Pyodide 官方推荐的"固定 stdin 文本"写法。每个测试用例单独用一份
 * 全新的 globals 跑一次（避免上一个用例的变量/状态残留），print() 输出已经
 * 有现成的 setStdout 捕获机制，拼起来跟期望文本精确比对。
 */
async function runAcmMode(
  pyodide: PyodideAPI,
  code: string,
  testCases: TestCase[],
): Promise<RunResult> {
  const testResults: TestCaseResult[] = [];

  for (const tc of testCases) {
    const stdinText = buildAcmStdin(tc.input);
    const expectedText = buildAcmExpectedOutput(tc.expected);
    let cursor = 0;

    pyodide.setStdin({
      stdin: () => (cursor < stdinText.length ? stdinText.charCodeAt(cursor++) : null),
    });

    const caseLogs: RunLogLine[] = [];
    pyodide.setStdout({
      batched: (msg: string) => {
        if (msg.length > 0) caseLogs.push({ level: "log", text: msg });
      },
    });
    pyodide.setStderr({
      batched: (msg: string) => {
        if (msg.length > 0) caseLogs.push({ level: "error", text: msg });
      },
    });

    const globals = pyodide.toPy({});
    try {
      await pyodide.runPythonAsync(code, { globals });
      const actualText = caseLogs
        .filter((l) => l.level === "log")
        .map((l) => l.text)
        .join("\n");
      testResults.push({
        input: stdinText,
        expected: expectedText,
        actual: actualText,
        passed: normalizeAcmOutput(actualText) === normalizeAcmOutput(expectedText),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      testResults.push({
        input: stdinText,
        expected: expectedText,
        passed: false,
        error: message,
      });
    } finally {
      globals.destroy();
    }
  }

  return {
    ok: testResults.length > 0 && testResults.every((r) => r.passed),
    logs: [],
    error: null,
    testResults,
  };
}
```

**Step 4: 在 `self.onmessage` 里，`getPyodide()` 之后接入新分支**

找到：

```ts
self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { code, functionName, testCases } = event.data;
  const logs: RunLogLine[] = [];
  let resultLine: string | null = null;

  const structuredMode =
    !!functionName &&
    VALID_IDENTIFIER.test(functionName) &&
    Array.isArray(testCases) &&
    testCases.length > 0;

  try {
    const pyodide = await getPyodide();

    pyodide.setStdout({
```

改成：

```ts
self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { code, functionName, testCases, mode } = event.data;
  const logs: RunLogLine[] = [];
  let resultLine: string | null = null;

  const canAcmMode = mode === "acm" && Array.isArray(testCases) && testCases.length > 0;

  const structuredMode =
    !!functionName &&
    VALID_IDENTIFIER.test(functionName) &&
    Array.isArray(testCases) &&
    testCases.length > 0;

  try {
    const pyodide = await getPyodide();

    if (canAcmMode) {
      const result = await runAcmMode(pyodide, code, testCases!);
      self.postMessage(result);
      return;
    }

    pyodide.setStdout({
```

**Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

**Step 6: Commit**

```bash
git add src/workers/run-python.worker.ts
git commit -m "Python worker 新增 ACM 判题分支：pyodide.setStdin 喂纯文本 stdin"
```

---

### Task 4: `mode` 参数透传（dispatch 层）

**Files:**
- Modify: `src/lib/run-code.ts`
- Modify: `src/lib/run-python-code.ts`
- Modify: `src/lib/run-problem-code.ts`

**Step 1: `run-code.ts` 新增 `mode` 参数并透传**

在 `options` 类型和 `worker.postMessage` 里都加 `mode`：

```ts
export function runCode(
  code: string,
  options?: {
    judgeMode?: JudgeMode | null;
    functionName?: string | null;
    inputVariableNames?: string[] | null;
    testCases?: TestCase[] | null;
    judgeScript?: string | null;
    mode?: "normal" | "acm";
  },
): Promise<RunResult> {
```

以及 `worker.postMessage({...})` 里加一行 `mode: options?.mode ?? undefined,`。

**Step 2: `run-python-code.ts` 同样新增**

```ts
export function runPythonCode(
  code: string,
  options?: {
    functionName?: string | null;
    testCases?: TestCase[] | null;
    mode?: "normal" | "acm";
  },
): Promise<RunResult> {
```

`w.postMessage({...})` 里加一行 `mode: options?.mode ?? undefined,`。

**Step 3: `run-problem-code.ts` 新增 `mode` 形参并透传给两边**

```ts
import { runCode } from "./run-code";
import { runPythonCode } from "./run-python-code";
import type { RunResult } from "./types";
import type { Problem } from "@/db/schema";

/** Dispatches to the TS or Python sandbox worker based on the problem's language. */
export function runProblemCode(
  problem: Problem,
  code: string,
  mode: "normal" | "acm" = "normal",
): Promise<RunResult> {
  if (problem.language === "python") {
    return runPythonCode(code, {
      functionName: problem.functionName,
      testCases: problem.testCases,
      mode,
    });
  }

  return runCode(code, {
    judgeMode: problem.judgeMode,
    functionName: problem.functionName,
    inputVariableNames: problem.inputVariableNames,
    testCases: problem.testCases,
    judgeScript: problem.judgeScript,
    mode,
  });
}
```

**Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错（`practice-view.tsx` 里 `runProblemCode(problem, code)` 调用少传第三个参数也不会报错，因为给了默认值）。

**Step 5: Commit**

```bash
git add src/lib/run-code.ts src/lib/run-python-code.ts src/lib/run-problem-code.ts
git commit -m "run-code/run-python-code/run-problem-code 透传 ACM 模式参数"
```

---

### Task 5: `CodeEditorPanel` 新增模式切换按钮

**Files:**
- Modify: `src/components/practice/code-editor-panel.tsx`

**Step 1: 新增 props**

```ts
export function CodeEditorPanel({
  code,
  onChange,
  onRun,
  running,
  runResult,
  errorLines,
  language,
  showModeToggle,
  mode,
  onModeChange,
}: {
  code: string;
  onChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
  runResult: RunResult | null;
  errorLines: number[];
  language: Language;
  showModeToggle: boolean;
  mode: "normal" | "acm";
  onModeChange: (mode: "normal" | "acm") => void;
}) {
```

**Step 2: 工具栏里加切换按钮组（语言标签和「运行」按钮之间）**

找到：

```tsx
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">{LANGUAGE_LABEL[language]}</span>
        <Button size="sm" onClick={onRun} disabled={running}>
```

改成：

```tsx
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{LANGUAGE_LABEL[language]}</span>
          {showModeToggle && (
            <div className="flex items-center overflow-hidden rounded-md border">
              <Button
                type="button"
                size="sm"
                variant={mode === "normal" ? "default" : "ghost"}
                className="h-6 rounded-none px-2 text-[0.7rem]"
                onClick={() => onModeChange("normal")}
              >
                普通模式
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "acm" ? "default" : "ghost"}
                className="h-6 rounded-none px-2 text-[0.7rem]"
                onClick={() => onModeChange("acm")}
              >
                ACM 模式
              </Button>
            </div>
          )}
        </div>
        <Button size="sm" onClick={onRun} disabled={running}>
```

**Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 报错——`practice-view.tsx` 里调用 `<CodeEditorPanel>` 还没传新 props。这是预期的，下一个 Task 会修。先确认报错内容确实是"缺少 showModeToggle/mode/onModeChange 这三个 prop"，不是别的意外错误。

**Step 4: Commit**

先不 commit（这一步单独编译会报错），等 Task 6 把 `practice-view.tsx` 也改完、`tsc` 通过之后，Task 6 的 commit 里把这个文件也一起加进去。

---

### Task 6: `PracticeView` 接入模式状态、起始模板、持久化、确认弹窗

**Files:**
- Modify: `src/components/practice/practice-view.tsx`

**Step 1: 新增 imports**

在文件顶部现有 imports 后面加：

```ts
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
```

**Step 2: 改 `buildStarterTemplate`，新增 `mode` 参数**

把整个函数替换成：

```ts
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

function buildStarterTemplate(problem: Problem, mode: "normal" | "acm"): string {
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
```

**Step 3: 新增模式状态、localStorage 读写、切换逻辑**

找到组件内现有的 state 声明：

```ts
  const [problem, setProblem] = useState(initialProblem);
  const [code, setCode] = useState(() => buildStarterTemplate(initialProblem));
```

改成：

```ts
  const [problem, setProblem] = useState(initialProblem);
  const canToggleAcmMode =
    initialProblem.judgeMode === "call" &&
    !!initialProblem.functionName &&
    (initialProblem.testCases?.length ?? 0) > 0;
  const [mode, setMode] = useState<"normal" | "acm">("normal");
  const [code, setCode] = useState(() => buildStarterTemplate(initialProblem, "normal"));
  const [pendingMode, setPendingMode] = useState<"normal" | "acm" | null>(null);
```

在其它 `useEffect`/函数附近（比如紧接着这几个 state 声明之后）新增：

```ts
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

  function requestModeChange(next: "normal" | "acm") {
    if (next === mode) return;
    const currentTemplate = buildStarterTemplate(problem, mode);
    if (code === currentTemplate) {
      applyModeChange(next);
      return;
    }
    setPendingMode(next);
  }

  function applyModeChange(next: "normal" | "acm") {
    setMode(next);
    setCode(buildStarterTemplate(problem, next));
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
    setRunResult(null);
    setErrorLines([]);
  }
```

在文件顶部（`function buildStarterTemplate` 之前，跟其它模块级常量放一起）新增：

```ts
const MODE_STORAGE_KEY = "problem-solve-mode";
```

**Step 4: `executeRun` 里把 `mode` 传给 `runProblemCode`**

找到：

```ts
  const executeRun = useCallback(async () => {
    setRunning(true);
    const result = await runProblemCode(problem, code);
```

改成：

```ts
  const executeRun = useCallback(async () => {
    setRunning(true);
    const result = await runProblemCode(problem, code, mode);
```

并把 `executeRun` 的依赖数组从 `[code, hintStage, submitAttempt, problem]` 改成 `[code, hintStage, submitAttempt, problem, mode]`。

**Step 5: `<CodeEditorPanel>` 调用处传新 props**

找到：

```tsx
            <CodeEditorPanel
              code={code}
              onChange={setCode}
              onRun={executeRun}
              running={running}
              runResult={runResult}
              errorLines={errorLines}
              language={problem.language}
            />
```

改成：

```tsx
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
```

**Step 6: 在组件最外层 `return (...)` 的最后（`</div>` 结束标签前）加确认弹窗**

找到组件 `return` 语句的最后一行 `</div>\n  );`（整个组件最外层 `<div className="flex h-full flex-col">` 的闭合），在它前面加：

```tsx
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
```

**Step 7: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

**Step 8: Commit（连同 Task 5 的 code-editor-panel.tsx 一起）**

```bash
git add src/components/practice/code-editor-panel.tsx src/components/practice/practice-view.tsx
git commit -m "做题页面新增普通/ACM 模式切换：起始模板、localStorage 记忆、切换前确认弹窗"
```

---

### Task 7: `ProblemPanel` 展示 ACM 模式的输入输出格式说明

**Files:**
- Modify: `src/components/practice/problem-panel.tsx`
- Modify: `src/components/practice/practice-view.tsx`

**Step 1: `problem-panel.tsx` 新增 `mode` prop 和格式说明展示**

新增 import：

```ts
import { describeAcmFormat } from "@/lib/acm-io";
```

函数签名改成：

```ts
export function ProblemPanel({
  problem,
  onUpdated,
  mode,
}: {
  problem: Problem;
  onUpdated: (problem: Problem) => void;
  mode: "normal" | "acm";
}) {
```

在 `<p className="whitespace-pre-wrap">{problem.userDescription}</p>` 后面加：

```tsx
          {mode === "acm" && problem.judgeMode === "call" && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                输入输出格式说明（ACM 模式）
              </p>
              <p className="whitespace-pre-wrap font-mono text-xs">
                {describeAcmFormat(
                  problem.functionSignature,
                  problem.testCases?.[0]?.input,
                  problem.testCases?.[0]?.expected,
                )}
              </p>
            </div>
          )}
```

**Step 2: `practice-view.tsx` 传 `mode` 给 `<ProblemPanel>`**

找到：

```tsx
        <ProblemPanel problem={problem} onUpdated={setProblem} />
```

改成：

```tsx
        <ProblemPanel problem={problem} onUpdated={setProblem} mode={mode} />
```

**Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

**Step 4: Commit**

```bash
git add src/components/practice/problem-panel.tsx src/components/practice/practice-view.tsx
git commit -m "ACM 模式下题目描述区域展示输入输出格式说明"
```

---

### Task 8: 完整手动验证（浏览器）

**Files:** 无新文件，纯验证。

**Step 1: 找一道 `judgeMode === "call"` 的已有题目（TS 和 Python 各至少一道），启动开发服务器**

Run: `npm run dev`，浏览器打开对应题目的做题页面（`/problem/<id>`）。

**Step 2: 验证切换开关只在 call 模式题目上出现**

- 打开一道 `call` 模式的题目：确认编辑器工具栏语言标签旁边出现「普通模式 / ACM 模式」按钮组，默认选中「普通模式」。
- 打开一道 `log` 或 `spec` 模式的题目（如果有）：确认不出现这个按钮组。

**Step 3: 验证切换到 ACM 模式**

- 点击「ACM 模式」（编辑器内容还是初始模板，不会弹确认框）：确认编辑器内容变成 `main()` + `readline()`（TS）的模板，题目描述区域上方出现「输入输出格式说明」，内容跟这道题的参数/返回值形状对得上。
- 在编辑器里改几个字符，再点回「普通模式」：确认弹出确认框（"切换模式会重置当前代码"），点「取消」代码不变，再点一次「ACM 模式」→ 弹框 → 点「确定切换」→ 代码重置为普通模式的函数体模板。

**Step 4: 验证 ACM 模式实际判题（TypeScript）**

以一道 `twoSum`-类似的题目为例，在 ACM 模式模板的 `main()` 里写：

```ts
function main() {
  const n = Number(readline());
  const nums = (readline() ?? "").split(" ").map(Number);
  const target = Number(readline());
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        console.log(`${2}`);
        console.log(`${i} ${j}`);
        return;
      }
    }
  }
}

main();
```

点击「运行」，确认结果面板显示用例通过（`actual`/`expected` 都是形如 `2\n0 1` 的两行文本）。故意打印错误结果（比如顺序反过来），确认显示未通过、`actual` 跟 `expected` 都能在面板里看到完整的多行文本。

**Step 5: 验证 ACM 模式实际判题（Python）**

用一道 Python 语言的 `call` 模式题目，ACM 模板里写等价逻辑（`input()` 读三行，`print()` 打印两行），确认判题通过；同时确认本地没有额外配置就能直接工作（不依赖 `DASHSCOPE_API_KEY`，这条路径完全不涉及 AI）。

**Step 6: 验证 localStorage 记忆**

切到 ACM 模式后刷新页面（或换一道 `call` 模式的题目），确认新页面默认直接是 ACM 模式（而不是普通模式）。清掉 `localStorage`（或在无痕窗口打开）确认默认是普通模式。

**Step 7: 最终检查**

Run: `npx tsc --noEmit && npx eslint src && npm run build`
Expected: 三个命令都无报错通过（`npx eslint src` 只允许剩下 `recite-countdown.tsx` 那一条已知的、跟这次改动无关的历史报错）。

---

## 收尾

全部任务完成后：`judgeMode === "call"` 的代码题在做题页面可以切换「普通模式」（现有函数调用方式，零行为变化）和「ACM 模式」（完整程序读 stdin、打印 stdout，贴近真实笔试/面试体验），切换偏好记在 `localStorage`，`log`/`spec` 模式题目和 `problems` 表结构完全不受影响。
