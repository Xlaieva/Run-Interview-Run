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
