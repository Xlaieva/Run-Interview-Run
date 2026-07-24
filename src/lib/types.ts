import type { InterviewAttempt, InterviewChatMessage } from "@/db/schema";

export type ChatRole = "user" | "assistant";

export const INTERVIEW_CATEGORIES = ["实习", "AI八股", "前端八股", "项目"] as const;
export type InterviewCategory = (typeof INTERVIEW_CATEGORIES)[number];

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface RunLogLine {
  level: "log" | "warn" | "error";
  text: string;
}

export type JudgeMode = "call" | "log" | "spec";

export type Language = "typescript" | "python";

/**
 * One way to solve the problem. `problems.solutions` stores these ordered
 * best-to-worst (by time complexity, then space complexity as tiebreaker) —
 * index 0 is the most efficient. All solutions for a problem implement the
 * same functionName/functionSignature so any of them can back the diff/reveal
 * hint mechanisms interchangeably.
 */
export interface Solution {
  approachName: string;
  approachSummary: string;
  /**
   * A natural, spoken-style paragraph explaining this solution's train of
   * thought — meant to be recited/memorized (e.g. as if explaining it out
   * loud in an interview), not a terse technical summary.
   */
  verbalExplanation: string;
  solutionCode: string;
  timeComplexity: string;
  spaceComplexity: string;
}

/**
 * One example extracted from the problem description's "输入/输出" samples.
 * - "call" mode: `input` holds positional args passed to `functionName`.
 * - "log" mode: `values` holds named values injected into the top-level
 *   variables listed in `inputVariableNames`; judged by comparing the last
 *   `console.log` call against `expected` instead of a function's return value.
 */
export interface TestCase {
  input?: unknown[];
  values?: Record<string, unknown>;
  expected: unknown;
}

export interface TestCaseResult {
  input: unknown;
  expected: unknown;
  actual?: unknown;
  passed: boolean;
  error?: string;
  /** "spec" mode only: the it() description of this behavioral test. */
  name?: string;
}

export interface RunResult {
  ok: boolean;
  logs: RunLogLine[];
  error: {
    name: string;
    message: string;
    stack?: string;
  } | null;
  timedOut?: boolean;
  /**
   * Value of the trailing expression statement, if the code ends with one
   * (e.g. `solve(input)` with no explicit console.log) — auto-captured
   * REPL-style. Only used in legacy free-run mode (no structured test cases).
   */
  returnValue?: string;
  /**
   * Per-test-case pass/fail breakdown when the problem has structured test
   * cases (either "call" or "log" judge mode). `ok` is true only when every
   * case passes.
   */
  testResults?: TestCaseResult[];
}

export type InterviewTimelineEntry =
  | { kind: "attempt"; data: InterviewAttempt }
  | { kind: "chat"; data: InterviewChatMessage };

export function mergeInterviewTimeline(
  attempts: InterviewAttempt[],
  chatMessages: InterviewChatMessage[],
): InterviewTimelineEntry[] {
  const entries: InterviewTimelineEntry[] = [
    ...attempts.map((data) => ({ kind: "attempt" as const, data })),
    ...chatMessages.map((data) => ({ kind: "chat" as const, data })),
  ];
  return entries.sort(
    (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime(),
  );
}
