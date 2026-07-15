import { loadPyodide, type PyodideAPI } from "pyodide";
import type { RunLogLine, RunResult, TestCase, TestCaseResult } from "@/lib/types";

interface RunMessage {
  code: string;
  functionName?: string;
  testCases?: TestCase[];
}

const VALID_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESULT_MARKER = "__JUDGE_RESULT__:";

// Loaded once per worker instance and reused across runs — Pyodide's WASM +
// stdlib parse is expensive (multi-second), so the caller (run-python-code.ts)
// keeps this worker alive between "运行" clicks instead of recreating it.
let pyodidePromise: Promise<PyodideAPI> | null = null;

function getPyodide(): Promise<PyodideAPI> {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({ indexURL: "/pyodide/" });
  }
  return pyodidePromise;
}

function buildHarness(functionName: string): string {
  return `
import json as __json

def __safe(v):
    try:
        __json.dumps(v)
        return v
    except Exception:
        return repr(v)

__test_cases = __json.loads(__test_cases_json)
__results = []
for __tc in __test_cases:
    try:
        __actual = ${functionName}(*__tc['input'])
        __results.append({'input': __tc['input'], 'expected': __tc['expected'], 'actual': __safe(__actual), 'passed': __actual == __tc['expected']})
    except Exception as __e:
        __results.append({'input': __tc['input'], 'expected': __tc['expected'], 'actual': None, 'error': str(__e), 'passed': False})
print(${JSON.stringify(RESULT_MARKER)} + __json.dumps(__results))
`;
}

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
      batched: (msg: string) => {
        if (msg.startsWith(RESULT_MARKER)) {
          resultLine = msg.slice(RESULT_MARKER.length);
        } else if (msg.length > 0) {
          logs.push({ level: "log", text: msg });
        }
      },
    });
    pyodide.setStderr({
      batched: (msg: string) => {
        if (msg.length > 0) logs.push({ level: "error", text: msg });
      },
    });

    if (structuredMode) {
      // Fresh globals per run — otherwise function/variable definitions from
      // a previous submission would silently linger in Pyodide's persistent
      // interpreter and could make a run that should fail (e.g. a renamed or
      // missing function) spuriously reuse the old one.
      const globals = pyodide.toPy({});
      try {
        globals.set("__test_cases_json", JSON.stringify(testCases));
        await pyodide.runPythonAsync(code + "\n" + buildHarness(functionName!), {
          globals,
        });
      } finally {
        globals.destroy();
      }

      if (resultLine === null) {
        self.postMessage({
          ok: false,
          logs,
          error: { name: "JudgeError", message: "判题脚本没有正常输出结果" },
        } satisfies RunResult);
        return;
      }

      let testResults: TestCaseResult[];
      try {
        testResults = JSON.parse(resultLine);
      } catch {
        self.postMessage({
          ok: false,
          logs,
          error: { name: "JudgeError", message: "判题结果不是合法的 JSON，可能是返回值里包含无法序列化的内容" },
        } satisfies RunResult);
        return;
      }

      self.postMessage({
        ok: testResults.every((r) => r.passed),
        logs,
        error: null,
        testResults,
      } satisfies RunResult);
      return;
    }

    // No structured test cases yet (AI classification hasn't produced them,
    // or manual fallback wasn't filled in) — just execute and surface prints
    // / exceptions. No auto-printed trailing-expression value in Python mode.
    const globals = pyodide.toPy({});
    try {
      await pyodide.runPythonAsync(code, { globals });
    } finally {
      globals.destroy();
    }
    self.postMessage({ ok: true, logs, error: null } satisfies RunResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      ok: false,
      logs,
      error: { name: "PythonError", message },
    } satisfies RunResult);
  }
};
