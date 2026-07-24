import type { JudgeMode, RunResult, TestCase } from "./types";

const RUN_TIMEOUT_MS = 5000;
/** "spec" problems await real timers (debounce/throttle tests), so they get more headroom. */
const SPEC_RUN_TIMEOUT_MS = 10000;

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
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("../workers/run-code.worker.ts", import.meta.url),
    );
    let settled = false;

    const timeoutMs =
      options?.judgeMode === "spec" ? SPEC_RUN_TIMEOUT_MS : RUN_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve({
        ok: false,
        logs: [],
        error: {
          name: "TimeoutError",
          message: `代码运行超过 ${timeoutMs / 1000} 秒，可能存在死循环`,
        },
        timedOut: true,
      });
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<RunResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve({
        ok: false,
        logs: [],
        error: {
          name: "WorkerError",
          message: event.message || "运行时出现未知错误",
        },
      });
    };

    worker.postMessage({
      code,
      judgeMode: options?.judgeMode ?? undefined,
      functionName: options?.functionName ?? undefined,
      inputVariableNames: options?.inputVariableNames ?? undefined,
      testCases: options?.testCases ?? undefined,
      judgeScript: options?.judgeScript ?? undefined,
      mode: options?.mode ?? undefined,
    });
  });
}
