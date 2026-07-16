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
import type { ChatRole, JudgeMode, Language, Solution, TestCase } from "@/lib/types";

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

  /** User's own solution approach, entered at creation time; stored verbatim, AI never rewrites it. */
  userAnswer: text("user_answer"),
  /** AI's critique of userAnswer against the generated solutions; only set when the AI found an issue. */
  answerFeedback: text("answer_feedback"),

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

export const interviewQuestions = pgTable("interview_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  userDescription: text("user_description").notNull(),
  category: text("category"),
  /** AI-generated, hand-editable single reference answer (spoken-style, same voice as Solution.verbalExplanation). */
  standardAnswer: text("standard_answer"),
  /** User's own answer, entered at creation time; stored verbatim, AI never rewrites it. */
  userAnswer: text("user_answer"),

  totalAttempts: integer("total_attempts").notNull().default(0),
  /** Most recent recording only — overwritten (and the old Blob file deleted) on every new attempt. */
  lastRecordingUrl: text("last_recording_url"),
  lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),

  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewCount: integer("review_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const interviewAttempts = pgTable("interview_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => interviewQuestions.id, { onDelete: "cascade" }),
  /** Transcribed text with inline "（沉默N秒）" markers already inserted (silences ≥3s only). */
  transcript: text("transcript").notNull(),
  silenceTotalSeconds: integer("silence_total_seconds").notNull().default(0),
  recordingDurationSeconds: integer("recording_duration_seconds").notNull().default(0),
  /** AI feedback comparing this transcript against standardAnswer, informed by prior attempts. */
  aiFeedback: text("ai_feedback").notNull(),
  isReview: boolean("is_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const interviewChatMessages = pgTable("interview_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => interviewQuestions.id, { onDelete: "cascade" }),
  role: text("role").$type<ChatRole>().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const interviewQuestionsRelations = relations(interviewQuestions, ({ many }) => ({
  attempts: many(interviewAttempts),
  chatMessages: many(interviewChatMessages),
}));

export const interviewAttemptsRelations = relations(interviewAttempts, ({ one }) => ({
  question: one(interviewQuestions, {
    fields: [interviewAttempts.questionId],
    references: [interviewQuestions.id],
  }),
}));

export const interviewChatMessagesRelations = relations(interviewChatMessages, ({ one }) => ({
  question: one(interviewQuestions, {
    fields: [interviewChatMessages.questionId],
    references: [interviewQuestions.id],
  }),
}));

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type AttemptLog = typeof attemptLogs.$inferSelect;
export type NewAttemptLog = typeof attemptLogs.$inferInsert;
export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
export type NewInterviewQuestion = typeof interviewQuestions.$inferInsert;
export type InterviewAttempt = typeof interviewAttempts.$inferSelect;
export type NewInterviewAttempt = typeof interviewAttempts.$inferInsert;
export type InterviewChatMessage = typeof interviewChatMessages.$inferSelect;
export type NewInterviewChatMessage = typeof interviewChatMessages.$inferInsert;
