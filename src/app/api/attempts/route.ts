import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attemptLogs, problems } from "@/db/schema";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const problemId = body?.problemId as string | undefined;
  const code = body?.code as string | undefined;
  const passed = Boolean(body?.passed);
  const hintsUsed = Number(body?.hintsUsed ?? 0);
  const isReview = Boolean(body?.isReview);

  if (!problemId || typeof code !== "string") {
    return NextResponse.json(
      { error: "problemId 和 code 不能为空" },
      { status: 400 },
    );
  }

  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);

  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  await db.insert(attemptLogs).values({
    problemId,
    code,
    passed,
    hintsUsed,
    isReview,
  });

  const successIncrements: {
    successNoHintCount?: ReturnType<typeof sql>;
    success1HintCount?: ReturnType<typeof sql>;
    success2HintCount?: ReturnType<typeof sql>;
  } = {};

  if (passed) {
    if (hintsUsed <= 0) {
      successIncrements.successNoHintCount = sql`${problems.successNoHintCount} + 1`;
    } else if (hintsUsed === 1) {
      successIncrements.success1HintCount = sql`${problems.success1HintCount} + 1`;
    } else {
      successIncrements.success2HintCount = sql`${problems.success2HintCount} + 1`;
    }
  }

  const [updated] = await db
    .update(problems)
    .set({
      totalAttempts: sql`${problems.totalAttempts} + 1`,
      firstPracticeAt: problem.firstPracticeAt ?? new Date(),
      ...successIncrements,
      ...(isReview
        ? {
            reviewCount: sql`${problems.reviewCount} + 1`,
            lastReviewedAt: new Date(),
          }
        : {}),
    })
    .where(eq(problems.id, problemId))
    .returning();

  return NextResponse.json(updated);
}
