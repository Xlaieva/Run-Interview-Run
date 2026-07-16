import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { classifyProblem, reviewUserSolution } from "@/lib/classify";
import type { Language } from "@/lib/types";

export async function GET() {
  const rows = await db
    .select()
    .from(problems)
    .orderBy(desc(problems.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = (body?.title ?? "").trim();
  const userDescription = (body?.userDescription ?? "").trim();
  const language: Language = body?.language === "python" ? "python" : "typescript";
  const userAnswer = typeof body?.userAnswer === "string" ? body.userAnswer.trim() : "";

  if (!title || !userDescription) {
    return NextResponse.json(
      { error: "title 和 userDescription 不能为空" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(problems)
    .values({ title, userDescription, language })
    .returning();

  try {
    const object = await classifyProblem(title, userDescription, language);

    const update: Record<string, unknown> = {
      category: object.category,
      solutions: object.solutions,
      functionName: object.functionName,
      functionSignature: object.functionSignature,
      testCases: object.testCases,
    };

    if (userAnswer) {
      update.userAnswer = userAnswer;
      try {
        const review = await reviewUserSolution(title, userDescription, userAnswer, object.solutions);
        if (review.hasIssue) {
          update.answerFeedback = review.feedback;
        }
      } catch (err) {
        console.error("Solution review failed", err);
      }
    }

    const [updated] = await db
      .update(problems)
      .set(update)
      .where(eq(problems.id, row.id))
      .returning();

    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    console.error("AI classification failed", err);
    return NextResponse.json(row, { status: 201 });
  }
}
