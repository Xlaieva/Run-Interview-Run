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

// Matches Groq's own upload cap — reject oversized uploads before spending a
// transcription call or Blob storage on them.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

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

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "录音文件过大" }, { status: 400 });
  }

  // Match on the MIME type's prefix (strip any ";codecs=..." suffix) so
  // e.g. "audio/webm;codecs=opus" still resolves to "webm", not the
  // fallback default by coincidence.
  const mimeBase = mimeType.split(";")[0].trim();
  const extension = EXTENSION_BY_MIME[mimeBase] ?? "webm";

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

  // Upload the new recording, but don't delete the previous one yet — if
  // anything below fails, the DB should still point at a file that exists
  // rather than one we just deleted. The old file is only removed once the
  // question row is confirmed to point at the new one.
  const recordingUrl = await uploadRecording(id, audio, extension);

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

  // Only delete the old recording now that the question row is confirmed to
  // point at the new one. Known limitation: two concurrent attempts on the
  // same question can each upload+persist their own recording, and whichever
  // update commits last "wins" — the other's file is orphaned in Blob rather
  // than cleaned up. Acceptable for a single-user tool with no auth; a real
  // fix would need a DB-level compare-and-swap on lastRecordingUrl.
  await deleteRecording(question.lastRecordingUrl);

  return NextResponse.json({ attempt, question: updatedQuestion });
}
