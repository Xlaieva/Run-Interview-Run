import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { JudgeMode, Language, Solution, TestCase } from "@/lib/types";

export const problems = pgTable("problems", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  userDescription: text("user_description").notNull(),

  /** Set once when the problem is created; solutions/testCases/starter code are all in this language. */
  language: text("language").$type<Language>().notNull().default("typescript"),
  category: text("category"),
  /** Ordered best-to-worst by time then space complexity; index 0 is the most efficient. */
  solutions: jsonb("solutions").$type<Solution[]>(),

  /**
   * "call" (default): judge invokes functionName with each test case's
   * positional args and compares the return value — how the AI extraction
   * always works. "log": judge injects each test case's values into the
   * top-level variables named in inputVariableNames and compares the last
   * console.log call — manual fallback for when there's no AI available.
   */
  judgeMode: text("judge_mode").$type<JudgeMode>().notNull().default("call"),
  /** Function the judge calls in "call" mode, e.g. "twoSum". Must match solutionCode's definition. */
  functionName: text("function_name"),
  /** Signature-only declaration shown as the editor starter, e.g. "function twoSum(nums: number[], target: number): number[]". */
  functionSignature: text("function_signature"),
  /** Top-level variable names the judge injects values into, in "log" mode. */
  inputVariableNames: jsonb("input_variable_names").$type<string[]>(),
  /** Extracted from the problem description's examples; drives real judging (not just "no exception"). */
  testCases: jsonb("test_cases").$type<TestCase[]>(),

  totalAttempts: integer("total_attempts").notNull().default(0),
  successNoHintCount: integer("success_no_hint_count").notNull().default(0),
  success1HintCount: integer("success_1_hint_count").notNull().default(0),
  success2HintCount: integer("success_2_hint_count").notNull().default(0),

  firstPracticeAt: timestamp("first_practice_at", { withTimezone: true }),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewCount: integer("review_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const attemptLogs = pgTable("attempt_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  problemId: uuid("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  passed: boolean("passed").notNull(),
  hintsUsed: integer("hints_used").notNull().default(0),
  isReview: boolean("is_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const problemsRelations = relations(problems, ({ many }) => ({
  attempts: many(attemptLogs),
}));

export const attemptLogsRelations = relations(attemptLogs, ({ one }) => ({
  problem: one(problems, {
    fields: [attemptLogs.problemId],
    references: [problems.id],
  }),
}));

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type AttemptLog = typeof attemptLogs.$inferSelect;
export type NewAttemptLog = typeof attemptLogs.$inferInsert;
