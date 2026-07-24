import type { RunResult, TestCase } from "./types";

// Pyodide's first load (WASM + stdlib parse) is multi-second, so unlike the
// TS worker this one is kept alive and reused across "运行" clicks instead
// of being recreated every time.
const RUN_TIMEOUT_MS = 15000;

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/run-python.worker.ts", import.meta.url));
  }
  return worker;
}

export function runPythonCode(
  code: string,
  options?: {
    functionName?: string | null;
    testCases?: TestCase[] | null;
    mode?: "normal" | "acm";
  },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const w = getWorker();
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      w.terminate();
      worker = null; // force a fresh Pyodide load next run
      resolve({
        ok: false,
        logs: [],
        error: {
          name: "TimeoutError",
          message: `代码运行超过 ${RUN_TIMEOUT_MS / 1000} 秒，可能存在死循环`,
        },
        timedOut: true,
      });
    }, RUN_TIMEOUT_MS);

    w.onmessage = (event: MessageEvent<RunResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(event.data);
    };

    w.onerror = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      w.terminate();
      worker = null;
      resolve({
        ok: false,
        logs: [],
        error: {
          name: "WorkerError",
          message: event.message || "运行时出现未知错误",
        },
      });
    };

    w.postMessage({
      code,
      functionName: options?.functionName ?? undefined,
      testCases: options?.testCases ?? undefined,
      mode: options?.mode ?? undefined,
    });
  });
}
