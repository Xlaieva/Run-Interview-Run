import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { classifyProblem } from "@/lib/classify";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  try {
    const object = await classifyProblem(
      problem.title,
      problem.userDescription,
      problem.language,
    );

    const [updated] = await db
      .update(problems)
      .set({
        category: object.category,
        solutions: object.solutions,
        functionName: object.functionName,
        functionSignature: object.functionSignature,
        testCases: object.testCases,
      })
      .where(eq(problems.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("AI classification retry failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI 暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
