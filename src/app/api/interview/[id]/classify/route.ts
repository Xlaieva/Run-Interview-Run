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
