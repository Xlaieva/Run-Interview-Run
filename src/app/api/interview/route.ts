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
