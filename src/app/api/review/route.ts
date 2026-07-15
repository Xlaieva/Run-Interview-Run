import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attemptLogs } from "@/db/schema";

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

/**
 * Picks problems to re-quiz, excluding ones touched too recently — where
 * "recently" is measured in distinct activity days (days that have at least
 * one attempt), not raw calendar days since signup:
 * - 3+ activity days on record: exclude anything touched on the 2 most
 *   recent activity days.
 * - exactly 2 activity days: only draw from the earlier day, excluding
 *   anything also touched on the more recent day.
 * - exactly 1 activity day: draw from that day (nothing else to exclude).
 * Falls back to the full attempted-problem pool if the exclusion would
 * otherwise leave nothing to pick from.
 */
export async function GET(req: NextRequest) {
  const countParam = Number(req.nextUrl.searchParams.get("count") ?? "1");
  const count = ALLOWED_COUNTS.includes(countParam) ? countParam : 1;

  const logs = await db
    .select({ problemId: attemptLogs.problemId, createdAt: attemptLogs.createdAt })
    .from(attemptLogs);

  if (logs.length === 0) {
    return NextResponse.json(
      { error: "还没有已经刷过的题目，先去做几道题吧" },
      { status: 404 },
    );
  }

  const problemDates = new Map<string, Set<string>>();
  const allDates = new Set<string>();
  for (const log of logs) {
    const key = dateKey(log.createdAt);
    allDates.add(key);
    if (!problemDates.has(log.problemId)) {
      problemDates.set(log.problemId, new Set());
    }
    problemDates.get(log.problemId)!.add(key);
  }

  // ISO "YYYY-MM-DD" strings sort chronologically as plain strings.
  const sortedDates = [...allDates].sort().reverse();

  let eligibleIds: string[];
  if (sortedDates.length >= 3) {
    const exclude = new Set(sortedDates.slice(0, 2));
    eligibleIds = [...problemDates.entries()]
      .filter(([, dates]) => ![...dates].some((d) => exclude.has(d)))
      .map(([id]) => id);
  } else if (sortedDates.length === 2) {
    const [recent, earlier] = sortedDates;
    eligibleIds = [...problemDates.entries()]
      .filter(([, dates]) => dates.has(earlier) && !dates.has(recent))
      .map(([id]) => id);
  } else {
    eligibleIds = [...problemDates.keys()];
  }

  if (eligibleIds.length === 0) {
    eligibleIds = [...problemDates.keys()];
  }

  const ids = shuffle(eligibleIds).slice(0, count);
  return NextResponse.json({ ids });
}
