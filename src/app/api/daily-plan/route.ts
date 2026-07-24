import { NextRequest, NextResponse } from "next/server";
import { and, count, countDistinct, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { attemptLogs, interviewAttempts, dailyPlans } from "@/db/schema";
import { classifyDailyPlan } from "@/lib/classify-daily-plan";

/**
 * Counts today's activity across both platforms. `rangeStart`/`rangeEnd` are
 * ISO instants computed client-side from the browser's local calendar day —
 * doing the day-boundary math on the client avoids server/client timezone
 * mismatches (the server has no idea what timezone the user is in).
 *
 * problemsAttempted/problemsPassed count distinct problems, not raw attempt
 * rows — running (or passing) the same problem multiple times today still
 * only counts once, matching "点开题目 + 点过运行" as a per-problem yes/no.
 */
async function getProgress(rangeStart: Date, rangeEnd: Date) {
  const [[problemsRow], [passedRow], [interviewRow]] = await Promise.all([
    db
      .select({ value: countDistinct(attemptLogs.problemId) })
      .from(attemptLogs)
      .where(and(gte(attemptLogs.createdAt, rangeStart), lt(attemptLogs.createdAt, rangeEnd))),
    db
      .select({ value: countDistinct(attemptLogs.problemId) })
      .from(attemptLogs)
      .where(
        and(
          gte(attemptLogs.createdAt, rangeStart),
          lt(attemptLogs.createdAt, rangeEnd),
          eq(attemptLogs.passed, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(interviewAttempts)
      .where(and(gte(interviewAttempts.createdAt, rangeStart), lt(interviewAttempts.createdAt, rangeEnd))),
  ]);

  return {
    problemsAttempted: problemsRow?.value ?? 0,
    problemsPassed: passedRow?.value ?? 0,
    interviewAttempts: interviewRow?.value ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const rangeStart = req.nextUrl.searchParams.get("rangeStart");
  const rangeEnd = req.nextUrl.searchParams.get("rangeEnd");

  if (!date || !rangeStart || !rangeEnd) {
    return NextResponse.json(
      { error: "date、rangeStart、rangeEnd 不能为空" },
      { status: 400 },
    );
  }

  const [plan] = await db.select().from(dailyPlans).where(eq(dailyPlans.date, date)).limit(1);
  const progress = await getProgress(new Date(rangeStart), new Date(rangeEnd));

  return NextResponse.json({ plan: plan ?? null, progress });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = typeof body?.date === "string" ? body.date : undefined;
  const rangeStart = typeof body?.rangeStart === "string" ? body.rangeStart : undefined;
  const rangeEnd = typeof body?.rangeEnd === "string" ? body.rangeEnd : undefined;
  const planText = typeof body?.planText === "string" ? body.planText.trim() : "";

  if (!date || !rangeStart || !rangeEnd || !planText) {
    return NextResponse.json(
      { error: "date、rangeStart、rangeEnd、planText 不能为空" },
      { status: 400 },
    );
  }

  let problemsTarget: number | null = null;
  let interviewTarget: number | null = null;
  let summary: string | null = null;
  let aiAvailable = true;

  try {
    const parsed = await classifyDailyPlan(planText);
    problemsTarget = parsed.problemsTarget;
    interviewTarget = parsed.interviewTarget;
    summary = parsed.summary;
  } catch (err) {
    // AI 解析失败也要把用户的原始计划文本存下来，不能因为 AI 挂了就整体失败。
    console.error("AI daily plan analysis failed", err);
    aiAvailable = false;
  }

  const [plan] = await db
    .insert(dailyPlans)
    .values({ date, planText, problemsTarget, interviewTarget, summary })
    .onConflictDoUpdate({
      target: dailyPlans.date,
      set: { planText, problemsTarget, interviewTarget, summary, updatedAt: new Date() },
    })
    .returning();

  const progress = await getProgress(new Date(rangeStart), new Date(rangeEnd));

  return NextResponse.json({ plan, progress, aiAvailable });
}
