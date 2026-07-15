import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { InterviewPracticeView } from "@/components/interview/interview-practice-view";

export const dynamic = "force-dynamic";

export default async function InterviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; queue?: string }>;
}) {
  const { id } = await params;
  const { mode, queue } = await searchParams;

  const [question] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);

  if (!question) {
    notFound();
  }

  const [attempts, chatMessages] = await Promise.all([
    db.select().from(interviewAttempts).where(eq(interviewAttempts.questionId, id)).orderBy(asc(interviewAttempts.createdAt)),
    db.select().from(interviewChatMessages).where(eq(interviewChatMessages.questionId, id)).orderBy(asc(interviewChatMessages.createdAt)),
  ]);

  const reviewQueue = queue ? queue.split(",").filter(Boolean) : [];

  return (
    <InterviewPracticeView
      question={question}
      attempts={attempts}
      chatMessages={chatMessages}
      isReview={mode === "review"}
      reviewQueue={reviewQueue}
    />
  );
}
