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
