# 面试问答背诵平台 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Add a second product surface — a self-added interview Q&A recitation platform (practice-by-recording + recite-with-history) — alongside the existing LeetCode practice platform, wrapped in a shared navigation shell, with mobile/iOS support.

**Architecture:** Mirrors the existing `problems`/`attempt_logs` → `/problem/[id]` pattern exactly: new `interview_questions`/`interview_attempts`/`interview_chat_messages` Drizzle tables, new `/api/interview/*` routes reusing the existing Qwen (`generateObject`/`generateText`) AI plumbing, new `/interview` dashboard + `/interview/[id]` practice + `/interview/[id]/recite` recite routes built from the same shadcn/Base UI component set already in `src/components/ui`. Audio is recorded client-side (`MediaRecorder` + `AnalyserNode`), uploaded to a new `POST /api/interview/[id]/attempt` route that stores it in Vercel Blob (latest-only), transcribes it with Groq Whisper, aligns client-detected silence gaps into the transcript text, and asks Qwen for feedback using a system prompt built from the question's full history (permanent cross-session AI memory).

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + Neon Postgres, Vercel AI SDK v6 (`ai` + `@ai-sdk/openai-compatible`) against DashScope/Qwen, Groq Whisper REST API (via `fetch`, no SDK needed), `@vercel/blob` for audio storage, shadcn/ui (Base UI) + Tailwind v4.

**Testing approach:** This project has no test framework (confirmed with the user — matches the existing LeetCode practice feature, which also ships without tests). Each task is verified with `npm run lint`, `npx tsc --noEmit`, and/or a manual dev-server/browser check instead of automated tests. Don't introduce Vitest/Jest.

**Env vars to add to `.env.local` before starting** (ask the user for these if missing — they are not something Claude can generate):
- `GROQ_API_KEY` — from https://console.groq.com/keys
- `BLOB_READ_WRITE_TOKEN` — from Vercel Blob store (`vercel blob store add`, or Storage tab in the Vercel dashboard)

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

**Step 1:** Run:
```bash
npm install @vercel/blob
```
No Groq SDK needed — Task 8 talks to Groq's REST API directly via `fetch`.

**Step 2:** Verify: `cat package.json | grep vercel/blob` shows the new dependency.

**Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "Add @vercel/blob dependency for interview audio storage"
```

---

## Task 2: Database schema — new tables

**Files:**
- Modify: `src/db/schema.ts`

**Step 1:** Add three new tables + relations + inferred types, following the exact style of the existing `problems`/`attemptLogs` tables. Insert after the existing `attemptLogsRelations` block, before the final type exports:

```ts
export const interviewQuestions = pgTable("interview_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  userDescription: text("user_description").notNull(),
  category: text("category"),
  /** AI-generated, hand-editable single reference answer (spoken-style, same voice as Solution.verbalExplanation). */
  standardAnswer: text("standard_answer"),

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

export type InterviewQuestion = typeof interviewQuestions.$inferSelect;
export type NewInterviewQuestion = typeof interviewQuestions.$inferInsert;
export type InterviewAttempt = typeof interviewAttempts.$inferSelect;
export type NewInterviewAttempt = typeof interviewAttempts.$inferInsert;
export type InterviewChatMessage = typeof interviewChatMessages.$inferSelect;
export type NewInterviewChatMessage = typeof interviewChatMessages.$inferInsert;
```

Also add `ChatRole` to the existing type import line at the top of the file:
```ts
import type { ChatRole, JudgeMode, Language, Solution, TestCase } from "@/lib/types";
```

**Step 2:** Push schema to the database:
```bash
npm run db:push
```
Expected: drizzle-kit reports the 3 new tables created, no errors. If it prompts about ambiguous changes, confirm creating new tables (not renaming existing ones).

**Step 3:** Verify: `npx tsc --noEmit` passes.

**Step 4: Commit**
```bash
git add src/db/schema.ts
git commit -m "Add interview_questions/interview_attempts/interview_chat_messages tables"
```

---

## Task 3: Shared types for the interview timeline

**Files:**
- Modify: `src/lib/types.ts`

**Step 1:** Add a discriminated union used by both the practice and recite UIs to render attempts + chat messages as one merged, time-ordered feed:

```ts
import type { InterviewAttempt, InterviewChatMessage } from "@/db/schema";

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
```

Place this at the end of the file. `db/schema` importing from `lib/types` and `lib/types` importing from `db/schema` would be circular — check: `schema.ts` only imports `ChatRole`/`JudgeMode`/`Language`/`Solution`/`TestCase` (plain type aliases, not the new interview types), so importing `InterviewAttempt`/`InterviewChatMessage` (schema → inferred types) into `types.ts` is safe, no cycle.

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/lib/types.ts
git commit -m "Add InterviewTimelineEntry type and merge helper"
```

---

## Task 4: AI prompts — classification + shared context builder

**Files:**
- Modify: `src/lib/prompts.ts`

**Step 1:** Add the following to `src/lib/prompts.ts` (append near the bottom, after `buildLocatePrompt`):

```ts
export const interviewClassificationSchema = z.object({
  category: z
    .string()
    .describe("这道面试问答题所属的分类，如“系统设计”“项目经验”“行为面试”“计算机基础”，2-6个汉字"),
  standardAnswer: z
    .string()
    .describe(
      "用口语化、连贯自然的一段话给出这道题的标准回答，就像在面试里讲给面试官听一样，不要写成分点列表、不要堆砌术语，控制在300字左右",
    ),
});

export function buildInterviewClassificationPrompt(title: string, description: string) {
  return `你是一个资深技术面试官。请阅读下面这道面试问答题，完成以下工作：
1. 判断这道题所属的分类（如"系统设计""项目经验""行为面试""计算机基础"等）
2. 给出一段口语化、连贯自然的标准回答，就像在面试里讲给面试官听一样，不要分点、不要堆砌术语

题目标题：${title}

题目描述：
${description}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名：
- category: string，中文，2-6个汉字
- standardAnswer: string，中文，口语化的一段话，300字左右`;
}

/**
 * Builds the shared history block fed into both the practice-feedback and
 * recite-chat system prompts, giving the AI permanent cross-session memory
 * of this question: every past recording (transcript + feedback) and every
 * past freeform Q&A exchange, in chronological order.
 */
export function buildInterviewContext(options: {
  title: string;
  description: string;
  standardAnswer: string | null;
  timeline: { kind: "attempt" | "chat"; createdAt: Date; text: string }[];
}) {
  const { title, description, standardAnswer, timeline } = options;

  const historyBlock =
    timeline.length === 0
      ? "（这是第一次接触这道题，还没有历史记录）"
      : timeline
          .map((entry, i) => {
            const date = new Intl.DateTimeFormat("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(entry.createdAt);
            const label = entry.kind === "attempt" ? "练习" : "问答";
            return `[第${i + 1}条 · ${label} · ${date}]\n${entry.text}`;
          })
          .join("\n\n");

  return `你是一个耐心、专业的面试教练，正在陪用户准备这道面试问答题：

题目：${title}
${description}

标准答案：
${standardAnswer ?? "（还没有标准答案）"}

这道题目前的练习历史（按时间顺序，包含每次录音转写+AI建议，以及历史问答）：
${historyBlock}

回答用中文，语气专业但友善。回复时可以参考历史记录里用户的进步或反复出现的问题，帮助用户看到自己的变化趋势。`;
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/lib/prompts.ts
git commit -m "Add interview classification schema/prompt and shared context builder"
```

---

## Task 5: `classifyInterviewQuestion` helper

**Files:**
- Create: `src/lib/classify-interview.ts`

**Step 1:** Mirror `src/lib/classify.ts`'s shape (no retry logic needed here — there's no arity-matching constraint like the coding side's test cases):

```ts
import { generateObject } from "ai";
import { qwen } from "@/lib/ai";
import { interviewClassificationSchema, buildInterviewClassificationPrompt } from "@/lib/prompts";

export async function classifyInterviewQuestion(title: string, description: string) {
  const prompt = buildInterviewClassificationPrompt(title, description);
  const { object } = await generateObject({
    model: qwen,
    schema: interviewClassificationSchema,
    prompt,
  });
  return object;
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/lib/classify-interview.ts
git commit -m "Add classifyInterviewQuestion AI helper"
```

---

## Task 6: Groq Whisper transcription helper

**Files:**
- Create: `src/lib/groq.ts`

**Step 1:**

```ts
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
}

/**
 * Transcribes audio via Groq's OpenAI-compatible Whisper endpoint.
 * Throws on failure — callers decide how to surface that (503 "ai_unavailable"
 * pattern, matching the rest of the app's AI routes).
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", GROQ_STT_MODEL);
  form.append("response_format", "verbose_json");
  form.append("language", "zh");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq transcription failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    text: string;
    segments?: { start: number; end: number; text: string }[];
  };

  return {
    text: data.text ?? "",
    segments: (data.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes. (Functional verification happens end-to-end in Task 12/25.)

**Step 3: Commit**
```bash
git add src/lib/groq.ts
git commit -m "Add Groq Whisper transcription helper"
```

---

## Task 7: Silence-marker insertion

**Files:**
- Create: `src/lib/interview-silence.ts`

**Step 1:** Pure function — takes Whisper's segments and the client-detected silence ranges, and produces the final transcript text with inline `（沉默N秒）` markers spliced in at the right position. Also export a helper to sum total silence for stats:

```ts
import type { TranscriptSegment } from "./groq";

export interface SilenceRange {
  start: number;
  end: number;
}

const MIN_SILENCE_SECONDS = 3;

/**
 * Inserts "（沉默N秒）" markers into the transcript at the position matching
 * each silence range's timestamp. A silence range is placed right after the
 * last Whisper segment that ends at or before the range's start, and before
 * the next one — so it reads inline where the pause actually happened.
 * Silences shorter than MIN_SILENCE_SECONDS are ignored.
 */
export function insertSilenceMarkers(
  segments: TranscriptSegment[],
  silenceRanges: SilenceRange[],
): string {
  const significant = silenceRanges
    .map((r) => ({ ...r, duration: r.end - r.start }))
    .filter((r) => r.duration >= MIN_SILENCE_SECONDS)
    .sort((a, b) => a.start - b.start);

  if (segments.length === 0) {
    return significant
      .map((r) => `（沉默${Math.round(r.duration)}秒）`)
      .join(" ");
  }

  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let silenceIdx = 0;

  function flushSilencesBefore(time: number) {
    while (
      silenceIdx < significant.length &&
      significant[silenceIdx].start <= time
    ) {
      parts.push(`（沉默${Math.round(significant[silenceIdx].duration)}秒）`);
      silenceIdx++;
    }
  }

  for (const seg of sorted) {
    flushSilencesBefore(seg.start);
    if (seg.text) parts.push(seg.text);
  }
  // Any remaining silences (after the last segment) go at the end.
  while (silenceIdx < significant.length) {
    parts.push(`（沉默${Math.round(significant[silenceIdx].duration)}秒）`);
    silenceIdx++;
  }

  return parts.join(" ");
}

export function totalSilenceSeconds(silenceRanges: SilenceRange[]): number {
  return Math.round(
    silenceRanges
      .filter((r) => r.end - r.start >= MIN_SILENCE_SECONDS)
      .reduce((sum, r) => sum + (r.end - r.start), 0),
  );
}
```

**Step 2:** Sanity-check by hand: create a throwaway script or just reason through — `segments = [{start:0,end:2,text:"你好"},{start:6,end:8,text:"这是回答"}]`, `silenceRanges=[{start:2,end:5.5}]` (3.5s ≥ 3) → `flushSilencesBefore(0)` no-op, push "你好"; `flushSilencesBefore(6)` → `2 <= 6` true → push "（沉默4秒）"; push "这是回答" → result `"你好 （沉默4秒） 这是回答"`. Matches spec.

**Step 3:** Verify: `npx tsc --noEmit` passes.

**Step 4: Commit**
```bash
git add src/lib/interview-silence.ts
git commit -m "Add silence-marker insertion logic for interview transcripts"
```

---

## Task 8: Vercel Blob upload/delete helper

**Files:**
- Create: `src/lib/interview-blob.ts`

**Step 1:**

```ts
import { put, del } from "@vercel/blob";

export async function uploadRecording(
  questionId: string,
  audio: Blob,
  extension: string,
): Promise<string> {
  const blob = await put(`interview-recordings/${questionId}.${extension}`, audio, {
    access: "public",
    addRandomSuffix: true,
    contentType: audio.type || undefined,
  });
  return blob.url;
}

export async function deleteRecording(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await del(url);
  } catch (err) {
    // Best-effort cleanup — a failed delete shouldn't block saving the new attempt.
    console.error("Failed to delete previous recording from Blob", err);
  }
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/lib/interview-blob.ts
git commit -m "Add Vercel Blob upload/delete helpers for interview recordings"
```

---

## Task 9: `POST /api/interview` + `GET /api/interview`

**Files:**
- Create: `src/app/api/interview/route.ts`

**Step 1:** Mirror `src/app/api/problems/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interviewQuestions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { classifyInterviewQuestion } from "@/lib/classify-interview";

export async function GET() {
  const rows = await db
    .select()
    .from(interviewQuestions)
    .orderBy(desc(interviewQuestions.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = (body?.title ?? "").trim();
  const userDescription = (body?.userDescription ?? "").trim();

  if (!title || !userDescription) {
    return NextResponse.json(
      { error: "title 和 userDescription 不能为空" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(interviewQuestions)
    .values({ title, userDescription })
    .returning();

  try {
    const object = await classifyInterviewQuestion(title, userDescription);

    const [updated] = await db
      .update(interviewQuestions)
      .set({ category: object.category, standardAnswer: object.standardAnswer })
      .where(eq(interviewQuestions.id, row.id))
      .returning();

    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    console.error("Interview AI classification failed", err);
    return NextResponse.json(row, { status: 201 });
  }
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes. Manual check comes once the dashboard UI exists (Task 19).

**Step 3: Commit**
```bash
git add src/app/api/interview/route.ts
git commit -m "Add POST/GET /api/interview routes"
```

---

## Task 10: `PATCH`/`DELETE /api/interview/[id]`

**Files:**
- Create: `src/app/api/interview/[id]/route.ts`

**Step 1:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interviewQuestions } from "@/db/schema";
import { deleteRecording } from "@/lib/interview-blob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/** Manual editing — category / standardAnswer, both plain strings. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body?.category === "string") update.category = body.category;
  if (typeof body?.standardAnswer === "string") update.standardAnswer = body.standardAnswer;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const [updated] = await db
    .update(interviewQuestions)
    .set(update)
    .where(eq(interviewQuestions.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [deleted] = await db
    .delete(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .returning({ id: interviewQuestions.id, lastRecordingUrl: interviewQuestions.lastRecordingUrl });

  if (!deleted) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  await deleteRecording(deleted.lastRecordingUrl);

  return NextResponse.json({ id: deleted.id });
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add "src/app/api/interview/[id]/route.ts"
git commit -m "Add GET/PATCH/DELETE /api/interview/[id] routes"
```

---

## Task 11: `POST /api/interview/[id]/classify` (regenerate)

**Files:**
- Create: `src/app/api/interview/[id]/classify/route.ts`

**Step 1:** Mirror `src/app/api/problems/[id]/classify/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interviewQuestions } from "@/db/schema";
import { classifyInterviewQuestion } from "@/lib/classify-interview";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  try {
    const object = await classifyInterviewQuestion(question.title, question.userDescription);

    const [updated] = await db
      .update(interviewQuestions)
      .set({ category: object.category, standardAnswer: object.standardAnswer })
      .where(eq(interviewQuestions.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Interview AI classification retry failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI 暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add "src/app/api/interview/[id]/classify/route.ts"
git commit -m "Add POST /api/interview/[id]/classify regenerate route"
```

---

## Task 12: `GET /api/interview/review` (independent review picker)

**Files:**
- Create: `src/app/api/interview/review/route.ts`

**Step 1:** Same active-day algorithm as `src/app/api/review/route.ts`, but scoped to `interviewAttempts`/`interviewQuestions` — copy the file and swap the table references:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interviewAttempts } from "@/db/schema";

const ALLOWED_COUNTS = [1, 3, 5, 8, 10];

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Identical exclusion algorithm to /api/review, run over interview_attempts'
 * own activity-day calendar (independent from the coding-problem one). */
export async function GET(req: NextRequest) {
  const countParam = Number(req.nextUrl.searchParams.get("count") ?? "1");
  const count = ALLOWED_COUNTS.includes(countParam) ? countParam : 1;

  const logs = await db
    .select({ questionId: interviewAttempts.questionId, createdAt: interviewAttempts.createdAt })
    .from(interviewAttempts);

  if (logs.length === 0) {
    return NextResponse.json(
      { error: "还没有已经练习过的题目，先去练几道吧" },
      { status: 404 },
    );
  }

  const questionDates = new Map<string, Set<string>>();
  const allDates = new Set<string>();
  for (const log of logs) {
    const key = dateKey(log.createdAt);
    allDates.add(key);
    if (!questionDates.has(log.questionId)) {
      questionDates.set(log.questionId, new Set());
    }
    questionDates.get(log.questionId)!.add(key);
  }

  const sortedDates = [...allDates].sort().reverse();

  let eligibleIds: string[];
  if (sortedDates.length >= 3) {
    const exclude = new Set(sortedDates.slice(0, 2));
    eligibleIds = [...questionDates.entries()]
      .filter(([, dates]) => ![...dates].some((d) => exclude.has(d)))
      .map(([id]) => id);
  } else if (sortedDates.length === 2) {
    const [recent, earlier] = sortedDates;
    eligibleIds = [...questionDates.entries()]
      .filter(([, dates]) => dates.has(earlier) && !dates.has(recent))
      .map(([id]) => id);
  } else {
    eligibleIds = [...questionDates.keys()];
  }

  if (eligibleIds.length === 0) {
    eligibleIds = [...questionDates.keys()];
  }

  const ids = shuffle(eligibleIds).slice(0, count);
  return NextResponse.json({ ids });
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/app/api/interview/review/route.ts
git commit -m "Add independent review picker for interview questions"
```

---

## Task 13: `POST /api/interview/[id]/attempt` — the recording pipeline

**Files:**
- Create: `src/app/api/interview/[id]/attempt/route.ts`

**Step 1:** This is the core route: receives multipart form data (audio blob + client-detected silence ranges + isReview flag), uploads to Blob, transcribes, aligns silence, calls AI, persists, updates stats.

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq, sql, asc } from "drizzle-orm";
import { generateText } from "ai";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { qwen } from "@/lib/ai";
import { buildInterviewContext } from "@/lib/prompts";
import { transcribeAudio } from "@/lib/groq";
import { insertSilenceMarkers, totalSilenceSeconds, type SilenceRange } from "@/lib/interview-silence";
import { uploadRecording, deleteRecording } from "@/lib/interview-blob";
import { mergeInterviewTimeline } from "@/lib/types";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const form = await req.formData();
  const audio = form.get("audio") as File | null;
  const mimeType = (form.get("mimeType") as string | null) ?? audio?.type ?? "audio/webm";
  const durationSeconds = Number(form.get("durationSeconds") ?? "0");
  const isReview = form.get("isReview") === "true";
  let silenceRanges: SilenceRange[] = [];
  try {
    silenceRanges = JSON.parse((form.get("silenceRangesJson") as string | null) ?? "[]");
  } catch {
    silenceRanges = [];
  }

  if (!audio) {
    return NextResponse.json({ error: "audio 不能为空" }, { status: 400 });
  }

  const extension = EXTENSION_BY_MIME[mimeType] ?? "webm";

  let transcription;
  try {
    transcription = await transcribeAudio(audio, `recording.${extension}`);
  } catch (err) {
    console.error("Interview transcription failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "语音转文字暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }

  const transcript = insertSilenceMarkers(transcription.segments, silenceRanges);
  const silenceTotal = totalSilenceSeconds(silenceRanges);

  // Upload latest recording, replacing the previous one.
  const recordingUrl = await uploadRecording(id, audio, extension);
  await deleteRecording(question.lastRecordingUrl);

  // Build AI context from existing history (before this attempt is inserted).
  const [pastAttempts, pastChat] = await Promise.all([
    db
      .select()
      .from(interviewAttempts)
      .where(eq(interviewAttempts.questionId, id))
      .orderBy(asc(interviewAttempts.createdAt)),
    db
      .select()
      .from(interviewChatMessages)
      .where(eq(interviewChatMessages.questionId, id))
      .orderBy(asc(interviewChatMessages.createdAt)),
  ]);

  const timeline = mergeInterviewTimeline(pastAttempts, pastChat).map((entry) => ({
    kind: entry.kind,
    createdAt: entry.data.createdAt,
    text:
      entry.kind === "attempt"
        ? `转写：${entry.data.transcript}\nAI建议：${entry.data.aiFeedback}`
        : `${entry.data.role === "user" ? "用户提问" : "AI回答"}：${entry.data.content}`,
  }));

  const system = buildInterviewContext({
    title: question.title,
    description: question.userDescription,
    standardAnswer: question.standardAnswer,
    timeline,
  });

  let aiFeedback: string;
  try {
    const { text } = await generateText({
      model: qwen,
      system,
      prompt: `这是这次新的录音转写：\n${transcript}\n\n请对照标准答案，给出具体、可操作的反馈建议。`,
    });
    aiFeedback = text;
  } catch (err) {
    console.error("Interview AI feedback failed", err);
    aiFeedback = "（AI 暂时不可用，未能生成本次反馈，可以稍后在问答框里重新提问）";
  }

  const [attempt] = await db
    .insert(interviewAttempts)
    .values({
      questionId: id,
      transcript,
      silenceTotalSeconds: silenceTotal,
      recordingDurationSeconds: Math.round(durationSeconds),
      aiFeedback,
      isReview,
    })
    .returning();

  const [updatedQuestion] = await db
    .update(interviewQuestions)
    .set({
      totalAttempts: sql`${interviewQuestions.totalAttempts} + 1`,
      lastRecordingUrl: recordingUrl,
      lastPracticedAt: new Date(),
      ...(isReview
        ? { reviewCount: sql`${interviewQuestions.reviewCount} + 1`, lastReviewedAt: new Date() }
        : {}),
    })
    .where(eq(interviewQuestions.id, id))
    .returning();

  return NextResponse.json({ attempt, question: updatedQuestion });
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes. Full functional verification happens in Task 26 (once the recording UI exists) — at that point, manually record a short answer and confirm a row appears in `interview_attempts` (check via `npm run db:studio`) with a non-empty `transcript` and `aiFeedback`.

**Step 3: Commit**
```bash
git add "src/app/api/interview/[id]/attempt/route.ts"
git commit -m "Add POST /api/interview/[id]/attempt recording pipeline"
```

---

## Task 14: `POST /api/interview/[id]/chat` — freeform Q&A

**Files:**
- Create: `src/app/api/interview/[id]/chat/route.ts`

**Step 1:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { generateText } from "ai";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { qwen } from "@/lib/ai";
import { buildInterviewContext } from "@/lib/prompts";
import { mergeInterviewTimeline } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const message = (body?.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "message 不能为空" }, { status: 400 });
  }

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const [pastAttempts, pastChat] = await Promise.all([
    db.select().from(interviewAttempts).where(eq(interviewAttempts.questionId, id)).orderBy(asc(interviewAttempts.createdAt)),
    db.select().from(interviewChatMessages).where(eq(interviewChatMessages.questionId, id)).orderBy(asc(interviewChatMessages.createdAt)),
  ]);

  const timeline = mergeInterviewTimeline(pastAttempts, pastChat).map((entry) => ({
    kind: entry.kind,
    createdAt: entry.data.createdAt,
    text:
      entry.kind === "attempt"
        ? `转写：${entry.data.transcript}\nAI建议：${entry.data.aiFeedback}`
        : `${entry.data.role === "user" ? "用户提问" : "AI回答"}：${entry.data.content}`,
  }));

  const system = buildInterviewContext({
    title: question.title,
    description: question.userDescription,
    standardAnswer: question.standardAnswer,
    timeline,
  });

  let reply: string;
  try {
    const { text } = await generateText({ model: qwen, system, prompt: message });
    reply = text;
  } catch (err) {
    console.error("Interview chat failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI 暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }

  const [userMsg, assistantMsg] = await db
    .insert(interviewChatMessages)
    .values([
      { questionId: id, role: "user", content: message },
      { questionId: id, role: "assistant", content: reply },
    ])
    .returning();

  return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add "src/app/api/interview/[id]/chat/route.ts"
git commit -m "Add POST /api/interview/[id]/chat freeform Q&A route"
```

---

## Task 15: App shell — header with hamburger nav

**Files:**
- Create: `src/components/shell/app-header.tsx`
- Modify: `src/app/layout.tsx`

**Step 1:** Create the header component. Uses the existing `DropdownMenu` primitives (Task read `src/components/ui/dropdown-menu.tsx` already confirms the Base UI `render` prop pattern used across this codebase):

```tsx
"use client";

import Link from "next/link";
import { Menu, Code2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="菜单">
              <Menu className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            render={
              <Link href="/" className="hidden items-center gap-2 md:flex">
                <Code2 className="size-4" />
                算法刷题
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href="/interview" className="flex items-center gap-2">
                <MessageSquareText className="size-4" />
                面试问答
              </Link>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-sm font-medium">刷题台</span>
    </header>
  );
}
```

Note: the "算法刷题" `DropdownMenuItem`'s `Link` has `hidden md:flex` so the entry itself is invisible below the `md` breakpoint — mobile users only ever see "面试问答" in the menu, per the design decision.

**Step 2:** Wire it into `src/app/layout.tsx`. Current body is:
```tsx
<body className="min-h-full flex flex-col bg-background text-foreground">
  <TooltipProvider delay={200}>
    {children}
    <Toaster richColors position="top-center" />
  </TooltipProvider>
</body>
```
Change to:
```tsx
<body className="min-h-full flex flex-col bg-background text-foreground">
  <TooltipProvider delay={200}>
    <AppHeader />
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    <Toaster richColors position="top-center" />
  </TooltipProvider>
</body>
```
Add the import: `import { AppHeader } from "@/components/shell/app-header";`

Also add the `viewport` export for iOS safe-area support (per `generateViewport` docs read from `node_modules/next/dist/docs`) — add above `export const metadata`:
```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  viewportFit: "cover",
};
```
(Change the existing `import type { Metadata } from "next";` line to include `Viewport` too.)

**Step 3:** Verify: `npx tsc --noEmit` passes.

**Step 4: Commit**
```bash
git add src/components/shell/app-header.tsx src/app/layout.tsx
git commit -m "Add app shell header with hamburger nav, wire into root layout"
```

---

## Task 16: Fix existing coding-practice pages to fit under the new header

**Files:**
- Modify: `src/components/practice/practice-view.tsx:291`
- Modify: `src/components/recite/recite-view.tsx:54`

**Step 1:** Both currently start with `<div className="flex h-screen flex-col">`. Since `layout.tsx` (Task 15) now wraps `{children}` in a `flex-1 min-h-0` container, these views should fill that container instead of the full viewport (avoiding a double scrollbar / content pushed below the fold). Change both from:
```tsx
<div className="flex h-screen flex-col">
```
to:
```tsx
<div className="flex h-full flex-col">
```

**Step 2:** Verify manually: `npm run dev`, open `http://localhost:3000`, click into an existing problem's practice page and recite page — confirm no double scrollbar, header is visible at top, editor/panels fill the remaining height correctly. (This is exercising pre-existing code, so this is the one place a real dev-server check matters before moving on — everything above was pure addition.)

**Step 3: Commit**
```bash
git add src/components/practice/practice-view.tsx src/components/recite/recite-view.tsx
git commit -m "Fit existing practice/recite views under the new shell header"
```

---

## Task 17: `use-audio-recorder` hook

**Files:**
- Create: `src/hooks/use-audio-recorder.ts`

**Step 1:** Encapsulates `MediaRecorder` + a `AnalyserNode`-based silence timeline. iOS Safari only supports `audio/mp4` for `MediaRecorder`; probe `isTypeSupported` and fall back.

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import type { SilenceRange } from "@/lib/interview-silence";

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const SILENCE_VOLUME_THRESHOLD = 0.02; // RMS amplitude 0-1
const SILENCE_POLL_MS = 200;

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  silenceRanges: SilenceRange[];
}

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceRangesRef = useRef<SilenceRange[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const lastPollRef = useRef<number>(0);

  const pollVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const now = performance.now();
    if (now - lastPollRef.current >= SILENCE_POLL_MS) {
      lastPollRef.current = now;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const v of data) {
        const normalized = (v - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const elapsed = (now - startedAtRef.current) / 1000;

      if (rms < SILENCE_VOLUME_THRESHOLD) {
        if (silenceStartRef.current === null) silenceStartRef.current = elapsed;
      } else if (silenceStartRef.current !== null) {
        silenceRangesRef.current.push({ start: silenceStartRef.current, end: elapsed });
        silenceStartRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(pollVolume);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;

      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextCtor();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      startedAtRef.current = performance.now();
      lastPollRef.current = 0;
      silenceRangesRef.current = [];
      silenceStartRef.current = null;
      rafRef.current = requestAnimationFrame(pollVolume);

      setRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
      setError("无法访问麦克风，请检查权限设置");
    }
  }, [pollVolume]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const durationSeconds = (performance.now() - startedAtRef.current) / 1000;
        if (silenceStartRef.current !== null) {
          silenceRangesRef.current.push({ start: silenceStartRef.current, end: durationSeconds });
          silenceStartRef.current = null;
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setRecording(false);
        resolve({
          blob,
          mimeType: mimeTypeRef.current,
          durationSeconds,
          silenceRanges: silenceRangesRef.current,
        });
      };
      recorder.stop();
    });
  }, []);

  return { recording, error, start, stop };
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes. (Functional check happens once wired into the recorder panel — Task 20.)

**Step 3: Commit**
```bash
git add src/hooks/use-audio-recorder.ts
git commit -m "Add useAudioRecorder hook with client-side silence detection"
```

---

## Task 18: Shared `InterviewTimeline` component

**Files:**
- Create: `src/components/interview/interview-timeline.tsx`

**Step 1:** Renders the merged attempt/chat feed — used by both the practice page's right panel and the recite page's right panel. Mirrors `ChatPanel`'s visual language (message bubbles) but attempt entries get a richer card (transcript + stats + feedback):

```tsx
"use client";

import { Loader2, Mic, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { InterviewTimelineEntry } from "@/lib/types";

export function InterviewTimeline({
  entries,
  pending,
}: {
  entries: InterviewTimelineEntry[];
  pending?: boolean;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 px-4 py-4">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            还没有练习记录，开始一次录音或提问吧
          </p>
        )}
        {entries.map((entry) =>
          entry.kind === "attempt" ? (
            <div key={entry.data.id} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mic className="size-3.5" />
                <span>{formatDateTime(entry.data.createdAt)}</span>
                {entry.data.isReview && <Badge variant="secondary">复习</Badge>}
                <span className="ml-auto font-mono">
                  {entry.data.recordingDurationSeconds}s · 静音{entry.data.silenceTotalSeconds}s
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{entry.data.transcript}</p>
              <div className="flex items-start gap-1.5 rounded-md bg-violet-500/10 p-2 text-sm">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
                <p className="whitespace-pre-wrap">{entry.data.aiFeedback}</p>
              </div>
            </div>
          ) : (
            <div
              key={entry.data.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                entry.data.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-violet-500/10 text-foreground",
              )}
            >
              {entry.data.content}
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            AI 正在思考...
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/components/interview/interview-timeline.tsx
git commit -m "Add shared InterviewTimeline component"
```

---

## Task 19: Interview dashboard — add/list/edit/delete/review

**Files:**
- Create: `src/components/interview/add-question-dialog.tsx`
- Create: `src/components/interview/edit-answer-dialog.tsx`
- Create: `src/components/interview/delete-question-button.tsx`
- Create: `src/components/interview/interview-review-button.tsx`
- Create: `src/components/interview/question-table.tsx`
- Create: `src/components/interview/interview-dashboard-view.tsx`
- Create: `src/app/interview/page.tsx`

**Step 1: `add-question-dialog.tsx`** — copy `src/components/dashboard/add-problem-dialog.tsx` and adapt: drop the language `Select` entirely (no `language` concept here), post to `/api/interview` with `{ title, userDescription }`, success toast checks `problem.category` → `question.category`.

```tsx
"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { InterviewQuestion } from "@/db/schema";

export function AddQuestionDialog({
  onCreated,
}: {
  onCreated: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast.error("请填写题目标题和描述");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, userDescription: description }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "添加失败");
        return;
      }
      const question = data as InterviewQuestion;
      onCreated(question);
      if (!question.standardAnswer) {
        toast.warning("题目已保存，但 AI 生成答案暂时失败，可以在表格里手动编辑");
      } else {
        toast.success("题目已添加，AI 已生成标准答案");
      }
      setTitle("");
      setDescription("");
      setOpen(false);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            添加题目
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加面试问答题</DialogTitle>
          <DialogDescription>
            输入题目标题与描述，AI 会自动生成分类和标准答案，之后可以手动编辑。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="q-title">题目标题</Label>
            <Input
              id="q-title"
              placeholder="例如：讲讲你对 REST 和 GraphQL 的理解"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="q-description">题目描述</Label>
            <Textarea
              id="q-description"
              rows={6}
              placeholder="补充问题的具体要求或背景（可以和标题相同）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                AI 生成中...
              </>
            ) : (
              "添加并生成答案"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: `edit-answer-dialog.tsx`** — simpler than the coding side's `EditSolutionDialog`: category + standardAnswer text fields, PATCH `/api/interview/[id]`, plus a "用 AI 重新生成" button hitting `/api/interview/[id]/classify`.

```tsx
"use client";

import { useState } from "react";
import { Pencil, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { InterviewQuestion } from "@/db/schema";

export function EditAnswerDialog({
  question,
  onUpdated,
}: {
  question: InterviewQuestion;
  onUpdated: (question: InterviewQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(question.category ?? "");
  const [standardAnswer, setStandardAnswer] = useState(question.standardAnswer ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/interview/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, standardAnswer }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "保存失败");
        return;
      }
      onUpdated(data as InterviewQuestion);
      toast.success("已保存");
      setOpen(false);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/interview/${question.id}/classify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? data?.error ?? "生成失败");
        return;
      }
      const updated = data as InterviewQuestion;
      setCategory(updated.category ?? "");
      setStandardAnswer(updated.standardAnswer ?? "");
      onUpdated(updated);
      toast.success("已重新生成");
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" title="编辑标准答案">
            <Pencil className="size-4" />
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑「{question.title}」</DialogTitle>
          <DialogDescription>手动修改分类和标准答案，或用 AI 重新生成。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="edit-category">分类</Label>
            <Input id="edit-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={submitting} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-answer">标准答案</Label>
            <Textarea
              id="edit-answer"
              rows={10}
              value={standardAnswer}
              onChange={(e) => setStandardAnswer(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="outline" onClick={handleRegenerate} disabled={regenerating || submitting}>
            {regenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            用 AI 重新生成
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: `delete-question-button.tsx`** — copy `src/components/dashboard/delete-problem-button.tsx` verbatim, swap `problems/${problemId}` → `interview/${questionId}`, "这道题" copy, prop names `questionId`/`questionTitle`.

**Step 4: `interview-review-button.tsx`** — copy `src/components/dashboard/review-button.tsx`, swap endpoint to `/api/interview/review`, and route to `/interview/${first}?mode=review${queue}` instead of `/problem/...`.

**Step 5: `question-table.tsx`** — copy `src/components/dashboard/problem-table.tsx`'s structure, with columns: 标题 / 分类 / 练习次数 / 上次练习时间 / 被抽查次数 / 操作 (no language badge, no complexity column, no 一/二/三次成功 badges — those don't apply here). Actions column: `EditAnswerDialog`, `DeleteQuestionButton`, "背题" link to `/interview/${q.id}/recite`, "练习" link to `/interview/${q.id}`.

```tsx
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { EditAnswerDialog } from "./edit-answer-dialog";
import { DeleteQuestionButton } from "./delete-question-button";
import type { InterviewQuestion } from "@/db/schema";

export function QuestionTable({
  questions,
  onUpdated,
  onDeleted,
}: {
  questions: InterviewQuestion[];
  onUpdated: (question: InterviewQuestion) => void;
  onDeleted: (id: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <p>还没有面试问答题，点击右上角「添加题目」开始准备吧</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>题目</TableHead>
            <TableHead>分类</TableHead>
            <TableHead className="text-right">练习次数</TableHead>
            <TableHead>上次练习</TableHead>
            <TableHead>被抽查</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-medium max-w-[260px]">
                <span className="truncate">{q.title}</span>
              </TableCell>
              <TableCell>
                {q.category ? (
                  <Badge variant="secondary">{q.category}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">未分类</Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{q.totalAttempts}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(q.lastPracticedAt)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(q.lastReviewedAt)}
                {q.reviewCount > 0 && <span className="ml-1 text-muted-foreground/70">×{q.reviewCount}</span>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <EditAnswerDialog question={q} onUpdated={onUpdated} />
                  <DeleteQuestionButton questionId={q.id} questionTitle={q.title} onDeleted={onDeleted} />
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/interview/${q.id}/recite`}>背题</Link>} />
                  <Button size="sm" nativeButton={false} render={<Link href={`/interview/${q.id}`}>练习</Link>} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 6: `interview-dashboard-view.tsx`** — copy `src/components/dashboard/dashboard-view.tsx`, fetch `/api/interview`, swap in `AddQuestionDialog`/`InterviewReviewButton`/`QuestionTable`, title "面试问答".

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AddQuestionDialog } from "./add-question-dialog";
import { InterviewReviewButton } from "./interview-review-button";
import { QuestionTable } from "./question-table";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewDashboardView() {
  const [questions, setQuestions] = useState<InterviewQuestion[] | null>(null);

  useEffect(() => {
    fetch("/api/interview")
      .then((res) => res.json())
      .then((data) => setQuestions(data))
      .catch(() => setQuestions([]));
  }, []);

  function handleCreated(question: InterviewQuestion) {
    setQuestions((prev) => [question, ...(prev ?? [])]);
  }
  function handleUpdated(question: InterviewQuestion) {
    setQuestions((prev) => (prev ?? []).map((q) => (q.id === question.id ? question : q)));
  }
  function handleDeleted(id: string) {
    setQuestions((prev) => (prev ?? []).filter((q) => q.id !== id));
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">面试问答</h1>
          <p className="text-sm text-muted-foreground">记录每道题的标准答案与练习进度</p>
        </div>
        <div className="flex items-center gap-2">
          <InterviewReviewButton />
          <AddQuestionDialog onCreated={handleCreated} />
        </div>
      </div>

      {questions === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载中...
        </div>
      ) : (
        <QuestionTable questions={questions} onUpdated={handleUpdated} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
```

**Step 7: `src/app/interview/page.tsx`**:
```tsx
import { InterviewDashboardView } from "@/components/interview/interview-dashboard-view";

export default function InterviewHome() {
  return <InterviewDashboardView />;
}
```

**Step 8:** Verify: `npx tsc --noEmit` and `npm run lint` pass. Manual check: `npm run dev`, navigate to `/interview`, add a question, confirm AI-generated category + standard answer appear, edit them, delete the question.

**Step 9: Commit**
```bash
git add src/components/interview/ src/app/interview/page.tsx
git commit -m "Add interview dashboard: add/edit/delete/review question list"
```

---

## Task 20: Recorder panel (practice page, bottom-left)

**Files:**
- Create: `src/components/interview/recorder-panel.tsx`

**Step 1:** Wraps `useAudioRecorder`. Shows a big record/stop toggle button (≥44px touch target per iOS HIG), an elapsed-time readout while recording, and calls `onComplete` with the `RecordingResult` when stopped so the parent can upload it.

```tsx
"use client";

import { useEffect, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder, type RecordingResult } from "@/hooks/use-audio-recorder";
import { toast } from "sonner";

export function RecorderPanel({
  onComplete,
  uploading,
}: {
  onComplete: (result: RecordingResult) => void;
  uploading: boolean;
}) {
  const { recording, error, start, stop } = useAudioRecorder();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  async function handleClick() {
    if (uploading) return;
    if (recording) {
      const result = await stop();
      if (result) onComplete(result);
    } else {
      await start();
    }
  }

  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Button
        size="lg"
        className="h-14 min-w-40 gap-2 text-base"
        variant={recording ? "destructive" : "default"}
        onClick={handleClick}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            处理中...
          </>
        ) : recording ? (
          <>
            <Square className="size-5" />
            结束录音 {elapsed}s
          </>
        ) : (
          <>
            <Mic className="size-5" />
            开始录音
          </>
        )}
      </Button>
      {!recording && !uploading && (
        <p className="text-xs text-muted-foreground">点击开始，说完后再点一下结束</p>
      )}
    </div>
  );
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/components/interview/recorder-panel.tsx
git commit -m "Add recorder panel with start/stop toggle and elapsed timer"
```

---

## Task 21: Interview question panel (top-left, shared shape for practice/recite)

**Files:**
- Create: `src/components/interview/interview-question-panel.tsx`

**Step 1:** Read-only title/category/description block, reused verbatim by both practice and recite pages:

```tsx
import { Badge } from "@/components/ui/badge";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewQuestionPanel({ question }: { question: InterviewQuestion }) {
  return (
    <div className="border-b px-4 py-3">
      <h2 className="font-semibold leading-tight">{question.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {question.category ? (
          <Badge variant="secondary">{question.category}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">未分类</Badge>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {question.userDescription}
      </p>
    </div>
  );
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/components/interview/interview-question-panel.tsx
git commit -m "Add shared read-only interview question panel"
```

---

## Task 22: Chat input box (shared by practice + recite right panels)

**Files:**
- Create: `src/components/interview/interview-chat-input.tsx`

**Step 1:** Same shape as `ChatPanel`'s input row, extracted standalone since the practice/recite pages compose it below `InterviewTimeline` rather than inside one monolithic panel:

```tsx
"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function InterviewChatInput({
  onSend,
  sending,
  disabled,
}: {
  onSend: (text: string) => void;
  sending: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function handleSend() {
    const text = draft.trim();
    if (!text || sending || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex items-end gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <Textarea
        rows={2}
        placeholder={disabled ? "AI 暂时不可用" : "输入你的问题..."}
        value={draft}
        disabled={disabled || sending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        className="resize-none"
      />
      <Button size="icon" onClick={handleSend} disabled={disabled || sending || !draft.trim()}>
        <Send className="size-4" />
      </Button>
    </div>
  );
}
```

**Step 2:** Verify: `npx tsc --noEmit` passes.

**Step 3: Commit**
```bash
git add src/components/interview/interview-chat-input.tsx
git commit -m "Add shared interview chat input box"
```

---

## Task 23: Practice view — wires recorder + timeline + chat + review queue

**Files:**
- Create: `src/components/interview/interview-practice-view.tsx`
- Create: `src/app/interview/[id]/page.tsx`

**Step 1: `interview-practice-view.tsx`** — client component, mirrors `PracticeView`'s review-queue header (`ArrowLeft` back link, `复习模式` badge, "下一题"/"结束复习"), but body is the recorder/timeline/chat layout instead of the code editor. Responsive: `flex-col md:flex-row` so mobile stacks vertically (question → recorder → timeline → chat input).

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InterviewQuestionPanel } from "./interview-question-panel";
import { RecorderPanel } from "./recorder-panel";
import { InterviewTimeline } from "./interview-timeline";
import { InterviewChatInput } from "./interview-chat-input";
import type { InterviewQuestion, InterviewAttempt, InterviewChatMessage } from "@/db/schema";
import { mergeInterviewTimeline } from "@/lib/types";
import type { RecordingResult } from "@/hooks/use-audio-recorder";

export function InterviewPracticeView({
  question: initialQuestion,
  attempts: initialAttempts,
  chatMessages: initialChatMessages,
  isReview,
  reviewQueue = [],
}: {
  question: InterviewQuestion;
  attempts: InterviewAttempt[];
  chatMessages: InterviewChatMessage[];
  isReview: boolean;
  reviewQueue?: string[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [uploading, setUploading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const timeline = mergeInterviewTimeline(attempts, chatMessages);

  async function handleRecordingComplete(result: RecordingResult) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", result.blob, `recording.${result.mimeType.split("/")[1] ?? "webm"}`);
      form.append("mimeType", result.mimeType);
      form.append("durationSeconds", String(result.durationSeconds));
      form.append("silenceRangesJson", JSON.stringify(result.silenceRanges));
      form.append("isReview", String(isReview));

      const res = await fetch(`/api/interview/${question.id}/attempt`, {
        method: "POST",
        body: form,
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，请稍后重试");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "处理失败");
        return;
      }
      setAttempts((prev) => [...prev, data.attempt]);
      setQuestion(data.question);
      toast.success("已生成 AI 反馈");
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setUploading(false);
    }
  }

  async function handleChatSend(text: string) {
    setChatSending(true);
    try {
      const res = await fetch(`/api/interview/${question.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，请稍后重试");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "AI 回复失败");
        return;
      }
      setChatMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setChatSending(false);
    }
  }

  function handleNextInQueue() {
    if (reviewQueue.length === 0) {
      router.push("/interview");
      return;
    }
    const [next, ...rest] = reviewQueue;
    const queueParam = rest.length ? `&queue=${rest.join(",")}` : "";
    router.push(`/interview/${next}?mode=review${queueParam}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/interview" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{question.title}</span>
        {isReview && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">复习模式</Badge>
            {reviewQueue.length > 0 && (
              <span className="text-xs text-muted-foreground">还剩 {reviewQueue.length} 道</span>
            )}
            <Button variant="ghost" size="sm" onClick={handleNextInQueue}>
              {reviewQueue.length > 0 ? "下一题" : "结束复习"}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr_360px]">
        <div className="flex min-h-0 flex-col border-r md:overflow-y-auto">
          <InterviewQuestionPanel question={question} />
        </div>

        <div className="flex min-h-0 flex-col border-r">
          <RecorderPanel onComplete={handleRecordingComplete} uploading={uploading} />
        </div>

        <div className="flex min-h-0 flex-col">
          <InterviewTimeline entries={timeline} pending={uploading || chatSending} />
          <InterviewChatInput onSend={handleChatSend} sending={chatSending} disabled={!aiAvailable} />
        </div>
      </div>
    </div>
  );
}
```

Note: this reuses the same `md:grid-cols-[300px_1fr_360px]` desktop three-column layout as the coding practice page, collapsing to a single stacked column below `md` (design's "Section 4"/"Section 7" mobile requirement — question → recorder → timeline → input, top to bottom, matches `grid-cols-1` default order).

**Step 2: `src/app/interview/[id]/page.tsx`** — server component fetching the question + full history, mirroring `src/app/problem/[id]/page.tsx`:

```tsx
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { InterviewPracticeView } from "@/components/interview/interview-practice-view";

export const dynamic = "force-dynamic";

export default async function InterviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; queue?: string }>;
}) {
  const { id } = await params;
  const { mode, queue } = await searchParams;

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    notFound();
  }

  const [attempts, chatMessages] = await Promise.all([
    db.select().from(interviewAttempts).where(eq(interviewAttempts.questionId, id)).orderBy(asc(interviewAttempts.createdAt)),
    db.select().from(interviewChatMessages).where(eq(interviewChatMessages.questionId, id)).orderBy(asc(interviewChatMessages.createdAt)),
  ]);

  const reviewQueue = queue ? queue.split(",").filter(Boolean) : [];

  return (
    <InterviewPracticeView
      question={question}
      attempts={attempts}
      chatMessages={chatMessages}
      isReview={mode === "review"}
      reviewQueue={reviewQueue}
    />
  );
}
```

**Step 3:** Verify: `npx tsc --noEmit` and `npm run lint` pass.

**Step 4: Commit**
```bash
git add src/components/interview/interview-practice-view.tsx "src/app/interview/[id]/page.tsx"
git commit -m "Add interview practice page: recording, timeline, chat, review queue"
```

---

## Task 24: Recite view

**Files:**
- Create: `src/components/interview/interview-answer-panel.tsx`
- Create: `src/components/interview/interview-recite-view.tsx`
- Create: `src/app/interview/[id]/recite/page.tsx`

**Step 1: `interview-answer-panel.tsx`** — bottom-left panel showing the standard answer read-only (no recording control here):

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InterviewQuestion } from "@/db/schema";

export function InterviewAnswerPanel({ question }: { question: InterviewQuestion }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-2">
        <p className="text-xs font-medium text-muted-foreground">标准答案</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 text-sm leading-relaxed">
          {question.standardAnswer ? (
            <p className="whitespace-pre-wrap">{question.standardAnswer}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              这道题还没有标准答案，可以在仪表盘表格里用 AI 重新生成或手动填写。
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: `interview-recite-view.tsx`** — no recording, just question + answer on the left, shared timeline + chat input on the right. Same responsive grid pattern as the practice view:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { InterviewQuestionPanel } from "./interview-question-panel";
import { InterviewAnswerPanel } from "./interview-answer-panel";
import { InterviewTimeline } from "./interview-timeline";
import { InterviewChatInput } from "./interview-chat-input";
import type { InterviewQuestion, InterviewAttempt, InterviewChatMessage } from "@/db/schema";
import { mergeInterviewTimeline } from "@/lib/types";

export function InterviewReciteView({
  question,
  attempts,
  chatMessages: initialChatMessages,
}: {
  question: InterviewQuestion;
  attempts: InterviewAttempt[];
  chatMessages: InterviewChatMessage[];
}) {
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatSending, setChatSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const timeline = mergeInterviewTimeline(attempts, chatMessages);

  async function handleChatSend(text: string) {
    setChatSending(true);
    try {
      const res = await fetch(`/api/interview/${question.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，请稍后重试");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "AI 回复失败");
        return;
      }
      setChatMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/interview" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{question.title} · 背题模式</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_1fr]">
        <div className="flex min-h-0 flex-col border-r">
          <InterviewQuestionPanel question={question} />
          <InterviewAnswerPanel question={question} />
        </div>

        <div className="flex min-h-0 flex-col">
          <InterviewTimeline entries={timeline} pending={chatSending} />
          <InterviewChatInput onSend={handleChatSend} sending={chatSending} disabled={!aiAvailable} />
        </div>
      </div>
    </div>
  );
}
```

**Step 3: `src/app/interview/[id]/recite/page.tsx`**:

```tsx
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { InterviewReciteView } from "@/components/interview/interview-recite-view";

export const dynamic = "force-dynamic";

export default async function InterviewRecitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    notFound();
  }

  const [attempts, chatMessages] = await Promise.all([
    db.select().from(interviewAttempts).where(eq(interviewAttempts.questionId, id)).orderBy(asc(interviewAttempts.createdAt)),
    db.select().from(interviewChatMessages).where(eq(interviewChatMessages.questionId, id)).orderBy(asc(interviewChatMessages.createdAt)),
  ]);

  return <InterviewReciteView question={question} attempts={attempts} chatMessages={chatMessages} />;
}
```

**Step 4:** Verify: `npx tsc --noEmit` and `npm run lint` pass.

**Step 5: Commit**
```bash
git add src/components/interview/interview-answer-panel.tsx src/components/interview/interview-recite-view.tsx "src/app/interview/[id]/recite/page.tsx"
git commit -m "Add interview recite page: answer review, history, freeform Q&A"
```

---

## Task 25: End-to-end manual verification

**Files:** none (verification only)

**Step 1:** `npm run dev`, open `http://localhost:3000`.

**Step 2 — Desktop nav:** confirm the hamburger menu shows both "算法刷题" and "面试问答"; clicking each navigates correctly; existing coding dashboard/practice/recite pages still render correctly under the new header (no double scrollbar, from Task 16).

**Step 3 — Add a question:** go to `/interview`, add a question (e.g. "讲讲你对 REST 和 GraphQL 的理解"), confirm AI-generated category + standard answer appear in a few seconds.

**Step 4 — Practice flow:** click "练习", grant microphone permission, click "开始录音", speak an answer with at least one deliberate ≥3s pause, click "结束录音". Confirm: uploading state shows, then a new timeline entry appears with the transcript (including a `（沉默N秒）` marker roughly where you paused) and AI feedback referencing the standard answer. Check `npm run db:studio` → `interview_attempts` has the new row, and `interview_questions.last_recording_url` is set.

**Step 5 — Repeat practice:** record a second answer on the same question. Confirm the AI feedback references the first attempt (e.g. mentions improvement) — this validates the cross-session memory (`buildInterviewContext`).

**Step 6 — Recite flow:** click "背题" from the dashboard for the same question. Confirm the standard answer is shown, and the timeline shows both prior practice attempts. Ask a freeform question in the input box; confirm a new user/assistant exchange appears and persists on page reload.

**Step 7 — Review flow:** on `/interview`, use "开始复习" — confirm it routes into `/interview/[id]?mode=review` with the "复习模式" badge and "下一题"/"结束复习" controls working, and that a recording done in review mode increments `review_count`/`last_reviewed_at` on the question (check via `npm run db:studio`).

**Step 8 — Mobile:** open Chrome DevTools device toolbar (or an actual iPhone on the same network), simulate an iPhone viewport. Confirm: hamburger menu on mobile only shows "面试问答" (not "算法刷题"); practice/recite pages stack single-column (question → recorder/answer → timeline → input); the record button and chat input aren't clipped by the bottom safe area; recording works (Safari will request mic permission — grant it, note that `MediaRecorder` will use `audio/mp4` there per Task 17's fallback logic).

**Step 9 — Delete cascade:** delete the test question from `/interview`; confirm `interview_attempts`/`interview_chat_messages` rows are gone (cascade) and the Blob file was deleted (check Vercel dashboard's Blob store, or that fetching the old `last_recording_url` 404s).

If any step fails, fix the specific task's code before moving on — don't accumulate multiple broken pieces.

---

## Task 26: Update README

**Files:**
- Modify: `README.md`

**Step 1:** Add a new "背诵面试问答平台" section to `README.md` (after the existing "5. 仪表盘" section, before "技术栈"), documenting: `/interview` dashboard, practice (`/interview/[id]`) recording→transcription→AI-feedback flow with cross-attempt memory, recite (`/interview/[id]/recite`), and the independent review picker. Add `interview_questions`/`interview_attempts`/`interview_chat_messages` to the "数据模型" section (same table format as `problems`/`attempt_logs`). Add `GROQ_API_KEY` and `BLOB_READ_WRITE_TOKEN` to the "首次运行前需要你手动配置" section as a new "3. Groq（语音转文字）" and "4. Vercel Blob（录音存储）" subsection, and to the "部署到 Vercel" `vercel env add` list.

**Step 2:** Verify: proofread the diff for consistency with the existing doc's tone/formatting.

**Step 3: Commit**
```bash
git add README.md
git commit -m "Document interview Q&A recitation platform in README"
```

---

## Task 27: Final review pass

**Files:** none

**Step 1:** Run `npm run lint` and `npx tsc --noEmit` one more time on the full tree to catch any drift across tasks.

**Step 2:** Re-read `docs/plans/2026-07-16-interview-qa-design.md` against what was actually built — confirm no scope crept in beyond it (single standard answer, latest-recording-only audio, no multi-version answers, no background audio).

**Step 3:** Report completion to the user and hand off to `superpowers:finishing-a-development-branch` for merge/PR decision — do not merge or push without the user's explicit go-ahead.
