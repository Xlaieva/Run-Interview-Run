import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { interviewQuestions, interviewChatMessages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { classifyInterviewQuestion, reviewInterviewAnswer } from "@/lib/classify-interview";

export async function GET() {
  // Ascending createdAt reproduces the interview doc's priority order (see
  // scripts/reclassify-interview-questions-by-doc.ts); manually added
  // questions get a real, later createdAt and naturally sort after.
  const rows = await db
    .select()
    .from(interviewQuestions)
    .orderBy(asc(interviewQuestions.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = (body?.title ?? "").trim();
  const userDescription = (body?.userDescription ?? "").trim();
  const userAnswer = typeof body?.userAnswer === "string" ? body.userAnswer.trim() : "";

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
      .set({
        category: object.category,
        standardAnswer: object.standardAnswer,
        userAnswer: userAnswer || null,
      })
      .where(eq(interviewQuestions.id, row.id))
      .returning();

    let ts = Date.now();
    const nextCreatedAt = () => new Date(ts++);

    await db.insert(interviewChatMessages).values({
      questionId: row.id,
      role: "user",
      content: title === userDescription ? title : `${title}\n\n${userDescription}`,
      createdAt: nextCreatedAt(),
    });

    if (object.standardAnswer) {
      await db.insert(interviewChatMessages).values({
        questionId: row.id,
        role: "assistant",
        content: object.standardAnswer,
        createdAt: nextCreatedAt(),
      });
    }

    let answerFeedback: string | null = null;
    if (userAnswer) {
      try {
        const review = await reviewInterviewAnswer(
          title,
          userDescription,
          object.standardAnswer,
          userAnswer,
        );
        answerFeedback = review.feedback;
        await db.insert(interviewChatMessages).values([
          { questionId: row.id, role: "user", content: userAnswer, createdAt: nextCreatedAt() },
          { questionId: row.id, role: "assistant", content: review.feedback, createdAt: nextCreatedAt() },
        ]);
      } catch (err) {
        console.error("Interview answer review failed", err);
      }
    }

    return NextResponse.json({ ...updated, answerFeedback }, { status: 201 });
  } catch (err) {
    console.error("Interview AI classification failed", err);
    return NextResponse.json(row, { status: 201 });
  }
}
