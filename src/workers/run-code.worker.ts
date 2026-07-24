import ts from "typescript";
import type {
  JudgeMode,
  RunLogLine,
  RunResult,
  TestCase,
  TestCaseResult,
} from "@/lib/types";

interface RunMessage {
  code: string;
  judgeMode?: JudgeMode;
  functionName?: string;
  inputVariableNames?: string[];
  testCases?: TestCase[];
  judgeScript?: string;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "undefined") return "undefined";
  // JSON.stringify(NaN | Infinity | -Infinity) silently returns "null",
  // which would misrepresent an actual NaN/Infinity result as null.
  if (typeof arg === "number" && !Number.isFinite(arg)) return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    const json = JSON.stringify(arg);
    return json === undefined ? String(arg) : json;
  } catch {
    return String(arg);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
}

/**
 * If the code ends with a bare expression statement (e.g. `solve(input)`
 * with no console.log), rewrite it to `return (...)` so the sandboxed
 * function resolves with that value. Mirrors REPL-style auto-printing.
 */
function captureTrailingExpression(code: string): string {
  const sourceFile = ts.createSourceFile(
    "input.ts",
    code,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS,
  );
  const statements = sourceFile.statements;
  if (statements.length === 0) return code;

  const last = statements[statements.length - 1];
  if (!ts.isExpressionStatement(last)) return code;

  const start = last.getStart(sourceFile);
  const end = last.getEnd();
  const exprText = last.expression.getText(sourceFile);

  return `${code.slice(0, start)}return (${exprText});${code.slice(end)}`;
}

/**
 * "log" judge mode: replaces the initializers of top-level variable
 * declarations whose name is in `values` with that test case's value, so
 * re-running the whole script exercises it against different inputs without
 * requiring a fixed callable function.
 */
function injectInputVariables(code: string, values: Record<string, unknown>): string {
  const sourceFile = ts.createSourceFile(
    "input.ts",
    code,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS,
  );

  const edits: { start: number; end: number; text: string }[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const name = decl.name.text;
      if (!(name in values)) continue;
      edits.push({
        start: decl.initializer.getStart(sourceFile),
        end: decl.initializer.getEnd(),
        text: JSON.stringify(values[name]),
      });
    }
  }
  edits.sort((a, b) => b.start - a.start);

  let result = code;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function transpile(code: string): string {
  const { outputText, diagnostics } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });

  const syntaxError = diagnostics?.find(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (syntaxError) {
    const message = ts.flattenDiagnosticMessageText(syntaxError.messageText, "\n");
    const line =
      syntaxError.file && syntaxError.start !== undefined
        ? syntaxError.file.getLineAndCharacterOfPosition(syntaxError.start).line + 1
        : undefined;
    throw new SyntaxError(line ? `第 ${line} 行：${message}` : message);
  }

  return outputText;
}

interface ExecResult {
  logs: RunLogLine[];
  lastLogValue: unknown;
  hasLog: boolean;
  returnValue: unknown;
  hasReturnValue: boolean;
  thrown: Error | null;
}

/** Runs already-transpiled JS in the sandbox, capturing console output and the trailing return value. */
async function executeScript(jsSource: string): Promise<ExecResult> {
  const logs: RunLogLine[] = [];
  let lastLogValue: unknown;
  let hasLog = false;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push({ level: "log", text: args.map(formatArg).join(" ") });
    lastLogValue = args.length === 1 ? args[0] : args;
    hasLog = true;
  };
  console.warn = (...args: unknown[]) => {
    logs.push({ level: "warn", text: args.map(formatArg).join(" ") });
  };
  console.error = (...args: unknown[]) => {
    logs.push({ level: "error", text: args.map(formatArg).join(" ") });
  };

  let returnValue: unknown;
  let hasReturnValue = false;
  let thrown: Error | null = null;

  try {
    const fn = new AsyncFunction(jsSource);
    const rv = await fn();
    if (rv !== undefined) {
      returnValue = rv;
      hasReturnValue = true;
    }
  } catch (err) {
    thrown = err instanceof Error ? err : new Error(String(err));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return { logs, lastLogValue, hasLog, returnValue, hasReturnValue, thrown };
}

async function runCallMode(
  code: string,
  functionName: string,
  testCases: TestCase[],
): Promise<RunResult> {
  const harness = `
const __results = [];
for (const __tc of self.__testCases) {
  try {
    const __actual = ${functionName}(...__tc.input);
    __results.push({ input: __tc.input, expected: __tc.expected, actual: __actual, passed: self.__deepEqual(__actual, __tc.expected) });
  } catch (__e) {
    __results.push({ input: __tc.input, expected: __tc.expected, actual: undefined, error: __e && __e.message ? __e.message : String(__e), passed: false });
  }
}
return __results;`;

  const outputText = transpile(code + "\n" + harness);
  (self as unknown as { __testCases: TestCase[] }).__testCases = testCases;
  (self as unknown as { __deepEqual: typeof deepEqual }).__deepEqual = deepEqual;

  const exec = await executeScript(outputText);
  if (exec.thrown) {
    return {
      ok: false,
      logs: exec.logs,
      error: { name: exec.thrown.name, message: exec.thrown.message, stack: exec.thrown.stack },
    };
  }
  const testResults = (exec.returnValue as TestCaseResult[]) ?? [];
  return {
    ok: testResults.every((r) => r.passed),
    logs: exec.logs,
    error: null,
    testResults,
  };
}

async function runLogMode(
  code: string,
  testCases: TestCase[],
): Promise<RunResult> {
  // Phase 1: run the user's own code once, unmodified, so the output panel
  // still shows their own debug prints (same as legacy free-run mode).
  const previewOutput = transpile(captureTrailingExpression(code));
  const preview = await executeScript(previewOutput);

  // Phase 2: for each test case, inject that case's values into the named
  // top-level variables and re-run fresh, comparing the last console.log
  // call against the expected value.
  const testResults: TestCaseResult[] = [];
  for (const tc of testCases) {
    const values = tc.values ?? {};
    try {
      const injectedSource = transpile(injectInputVariables(code, values));
      const exec = await executeScript(injectedSource);
      if (exec.thrown) {
        testResults.push({
          input: values,
          expected: tc.expected,
          passed: false,
          error: exec.thrown.message,
        });
        continue;
      }
      if (!exec.hasLog) {
        testResults.push({
          input: values,
          expected: tc.expected,
          passed: false,
          error: "没有 console.log 输出，请在代码最后打印结果",
        });
        continue;
      }
      testResults.push({
        input: values,
        expected: tc.expected,
        actual: exec.lastLogValue,
        passed: deepEqual(exec.lastLogValue, tc.expected),
      });
    } catch (err) {
      testResults.push({
        input: values,
        expected: tc.expected,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: testResults.every((r) => r.passed),
    logs: preview.logs,
    error: preview.thrown
      ? { name: preview.thrown.name, message: preview.thrown.message, stack: preview.thrown.stack }
      : null,
    testResults,
  };
}

/**
 * "spec" judge mode: appends the problem's judgeScript after the user's code
 * and runs it inside the same sandbox scope. The script registers behavioral
 * tests with a mini jest-style framework — it(name, fn) collects tests, which
 * are then run sequentially (awaiting async fns) so timer-based problems like
 * debounce/throttle and async ones like Promise.all can be verified.
 */
async function runSpecMode(code: string, judgeScript: string): Promise<RunResult> {
  const harness = `
const __tests = [];
function it(__name, __fn) { __tests.push({ name: __name, fn: __fn }); }
function sleep(__ms) { return new Promise((__r) => setTimeout(__r, __ms)); }
function assert(__cond, __msg) {
  if (!__cond) throw new Error(__msg || "断言失败");
}
function assertEqual(__actual, __expected, __msg) {
  if (!self.__deepEqual(__actual, __expected)) {
    throw new Error(
      (__msg ? __msg + "：" : "") +
      "期望 " + self.__formatArg(__expected) + "，实际 " + self.__formatArg(__actual),
    );
  }
}
${judgeScript}
const __results = [];
for (const __t of __tests) {
  try {
    await __t.fn();
    __results.push({ name: __t.name, input: __t.name, expected: "通过", actual: "通过", passed: true });
  } catch (__e) {
    __results.push({ name: __t.name, input: __t.name, expected: "通过", passed: false, error: __e && __e.message ? __e.message : String(__e) });
  }
}
return __results;`;

  const outputText = transpile(code + "\n" + harness);
  (self as unknown as { __deepEqual: typeof deepEqual }).__deepEqual = deepEqual;
  (self as unknown as { __formatArg: typeof formatArg }).__formatArg = formatArg;

  const exec = await executeScript(outputText);
  if (exec.thrown) {
    return {
      ok: false,
      logs: exec.logs,
      error: { name: exec.thrown.name, message: exec.thrown.message, stack: exec.thrown.stack },
    };
  }
  const testResults = (exec.returnValue as TestCaseResult[]) ?? [];
  return {
    ok: testResults.length > 0 && testResults.every((r) => r.passed),
    logs: exec.logs,
    error: null,
    testResults,
  };
}

async function runLegacy(code: string): Promise<RunResult> {
  const wrapped = captureTrailingExpression(code);
  const outputText = transpile(wrapped);
  const exec = await executeScript(outputText);

  if (exec.thrown) {
    return {
      ok: false,
      logs: exec.logs,
      error: { name: exec.thrown.name, message: exec.thrown.message, stack: exec.thrown.stack },
    };
  }
  return {
    ok: true,
    logs: exec.logs,
    error: null,
    returnValue: exec.hasReturnValue ? formatArg(exec.returnValue) : undefined,
  };
}

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { code, judgeMode, functionName, inputVariableNames, testCases, judgeScript } =
    event.data;

  const canSpecMode = judgeMode === "spec" && !!judgeScript?.trim();

  const canCallMode =
    judgeMode === "call" &&
    !!functionName &&
    VALID_IDENTIFIER.test(functionName) &&
    Array.isArray(testCases) &&
    testCases.length > 0;

  const canLogMode =
    judgeMode === "log" &&
    Array.isArray(inputVariableNames) &&
    inputVariableNames.length > 0 &&
    Array.isArray(testCases) &&
    testCases.length > 0;

  try {
    let result: RunResult;
    if (canSpecMode) {
      result = await runSpecMode(code, judgeScript!);
    } else if (canCallMode) {
      result = await runCallMode(code, functionName!, testCases!);
    } else if (canLogMode) {
      result = await runLogMode(code, testCases!);
    } else {
      result = await runLegacy(code);
    }
    self.postMessage(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    self.postMessage({ ok: false, logs: [], error: { name, message } } satisfies RunResult);
  }
};
