import { loadPyodide, type PyodideAPI } from "pyodide";
import type { RunLogLine, RunResult, TestCase, TestCaseResult } from "@/lib/types";
import { buildAcmStdin, buildAcmExpectedOutput, normalizeAcmOutput } from "@/lib/acm-io";

interface RunMessage {
  code: string;
  functionName?: string;
  testCases?: TestCase[];
  mode?: "normal" | "acm";
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
  const nonLogLines: RunLogLine[] = [];

  for (const tc of testCases) {
    const stdinText = buildAcmStdin(tc.input);
    const expectedText = buildAcmExpectedOutput(tc.expected);
    const stdinBytes = new TextEncoder().encode(stdinText);
    let cursor = 0;

    pyodide.setStdin({
      stdin: () => (cursor < stdinBytes.length ? stdinBytes[cursor++] : null),
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

    const globals = pyodide.toPy({ __name__: "__main__" });
    try {
      await pyodide.runPythonAsync(code, { globals });
      // Pyodide's `batched` stdout/stderr writer buffers any trailing bytes
      // that don't end in a newline in its OWN JS-side buffer, separate from
      // CPython's io buffering. sys.stdout.flush()/sys.stderr.flush() only
      // pushes CPython's buffer down to that JS writer — it does NOT drain
      // the JS writer's own held-back partial line. Only calling fsync() on
      // the underlying fd (which Pyodide wires to the writer's fsync method)
      // actually flushes that last unterminated chunk out to the callback.
      // Confirmed empirically: flush() alone drops a trailing `print(x,
      // end="")`; flush() + os.fsync() recovers it.
      await pyodide.runPythonAsync(
        [
          "import sys as __acm_sys, os as __acm_os",
          "__acm_sys.stdout.flush()",
          "__acm_sys.stderr.flush()",
          "for __acm_fd in (__acm_sys.stdout.fileno(), __acm_sys.stderr.fileno()):",
          "    try:",
          "        __acm_os.fsync(__acm_fd)",
          "    except OSError:",
          "        pass",
        ].join("\n"),
        { globals },
      );
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
      nonLogLines.push(...caseLogs.filter((l) => l.level !== "log"));
    }
  }

  return {
    ok: testResults.length > 0 && testResults.every((r) => r.passed),
    logs: nonLogLines,
    error: null,
    testResults,
  };
}

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
    // Non-ACM problems never expect stdin input — reset it so a previous ACM
    // run's exhausted byte-cursor closure (Pyodide's instance is persistent
    // across runs, see getPyodide()) doesn't leak into this run.
    pyodide.setStdin({ stdin: () => null });

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
