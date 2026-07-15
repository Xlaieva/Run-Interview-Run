import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { PracticeView } from "@/components/practice/practice-view";

export const dynamic = "force-dynamic";

export default async function ProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; queue?: string }>;
}) {
  const { id } = await params;
  const { mode, queue } = await searchParams;

  const [problem] = await db
    .select()
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);

  if (!problem) {
    notFound();
  }

  const reviewQueue = queue ? queue.split(",").filter(Boolean) : [];

  return (
    <PracticeView
      problem={problem}
      isReview={mode === "review"}
      reviewQueue={reviewQueue}
    />
  );
}
