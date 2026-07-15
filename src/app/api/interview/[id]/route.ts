import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { interviewQuestions } from "@/db/schema";
import { deleteRecording } from "@/lib/interview-blob";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/** Manual editing — category / standardAnswer, both plain strings. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body?.category === "string") update.category = body.category;
  if (typeof body?.standardAnswer === "string") update.standardAnswer = body.standardAnswer;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const [updated] = await db
    .update(interviewQuestions)
    .set(update)
    .where(eq(interviewQuestions.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [deleted] = await db
    .delete(interviewQuestions)
    .where(eq(interviewQuestions.id, id))
    .returning({ id: interviewQuestions.id, lastRecordingUrl: interviewQuestions.lastRecordingUrl });

  if (!deleted) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  await deleteRecording(deleted.lastRecordingUrl);

  return NextResponse.json({ id: deleted.id });
}
