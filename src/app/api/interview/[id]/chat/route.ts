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

  const now = new Date();
  const [userMsg, assistantMsg] = await db
    .insert(interviewChatMessages)
    .values([
      { questionId: id, role: "user", content: message, createdAt: now },
      { questionId: id, role: "assistant", content: reply, createdAt: new Date(now.getTime() + 1) },
    ])
    .returning();

  return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });
}
