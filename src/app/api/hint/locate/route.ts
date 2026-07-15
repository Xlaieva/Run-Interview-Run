import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { qwen } from "@/lib/ai";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { locateSchema, buildLocatePrompt } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const problemId = body?.problemId as string | undefined;
  const code = body?.code as string | undefined;
  const errorMessage = body?.errorMessage as string | undefined;

  if (!problemId || !code) {
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

  const numberedCode = code
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: qwen,
      schema: locateSchema,
      prompt: buildLocatePrompt({
        title: problem.title,
        description: problem.userDescription,
        numberedCode,
        errorMessage,
      }),
    });

    return NextResponse.json(object);
  } catch (err) {
    console.error("AI hint locate failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI 暂时不可用，请稍后重试或切换到手动对比模式" },
      { status: 503 },
    );
  }
}
