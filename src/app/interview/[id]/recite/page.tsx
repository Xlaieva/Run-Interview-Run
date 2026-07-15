import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { interviewQuestions, interviewAttempts, interviewChatMessages } from "@/db/schema";
import { InterviewReciteView } from "@/components/interview/interview-recite-view";

export const dynamic = "force-dynamic";

export default async function InterviewRecitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  return <InterviewReciteView question={question} attempts={attempts} chatMessages={chatMessages} />;
}
