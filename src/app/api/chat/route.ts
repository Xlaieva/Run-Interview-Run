import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { qwen } from "@/lib/ai";
import { db } from "@/db";
import { problems } from "@/db/schema";
import type { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const problemId = body?.problemId as string | undefined;
  const messages = body?.messages as ChatMessage[] | undefined;
  const code = body?.code as string | undefined;

  if (!problemId || !messages?.length) {
    return NextResponse.json(
      { error: "problemId 和 messages 不能为空" },
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

  const system = `你是一个耐心、简洁的算法面试助教，正在陪用户练习这道题：

题目：${problem.title}
${problem.userDescription}
${problem.category ? `分类：${problem.category}` : ""}

回答用中文，语气友善。除非用户明确要求，否则不要直接给出完整正确答案代码，优先引导用户自己想清楚思路。${
    code ? `\n\n用户当前的代码：\n${code}` : ""
  }`;

  try {
    const { text } = await generateText({
      model: qwen,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    return NextResponse.json({ reply: text });
  } catch (err) {
    console.error("AI chat failed", err);
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI 暂时不可用，请稍后重试或切换到手动对比模式" },
      { status: 503 },
    );
  }
}
