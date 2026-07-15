import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { z } from "zod";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  if (!row) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }
  return NextResponse.json(row);
}

// Permissive shape for manual editing: "call" mode items need `input`
// (positional args), "log" mode items need `values` (named variables) —
// accept either since the client sends whichever matches judgeMode.
const manualTestCaseSchema = z
  .object({
    input: z.array(z.any()).optional(),
    values: z.record(z.string(), z.any()).optional(),
    expected: z.any(),
  })
  .refine((tc) => tc.input !== undefined || tc.values !== undefined, {
    message: "每条测试用例需要提供 input 或 values",
  });

const testCasesArraySchema = z.array(manualTestCaseSchema).min(1).max(20);

const manualSolutionSchema = z.object({
  approachName: z.string(),
  approachSummary: z.string(),
  verbalExplanation: z.string(),
  solutionCode: z.string(),
  timeComplexity: z.string(),
  spaceComplexity: z.string(),
});
const solutionsArraySchema = z.array(manualSolutionSchema).min(1).max(10);

/**
 * Manual fallback editing — lets the user fill in category/approach/solution
 * code/complexity/function signature/judge mode/test cases by hand when the
 * AI classification call failed or is unavailable (no network / no quota).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const stringFields = ["category", "functionName", "functionSignature"] as const;

  const update: Record<string, unknown> = {};
  for (const field of stringFields) {
    if (typeof body?.[field] === "string") {
      update[field] = body[field];
    }
  }

  if (body?.judgeMode === "call" || body?.judgeMode === "log") {
    update.judgeMode = body.judgeMode;
  }

  if (typeof body?.solutionsJson === "string" && body.solutionsJson.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.solutionsJson);
    } catch {
      return NextResponse.json(
        { error: "解法不是合法的 JSON" },
        { status: 400 },
      );
    }
    const result = solutionsArraySchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        {
          error:
            "解法格式不对：需要是数组，每项包含 approachName/approachSummary/solutionCode/timeComplexity/spaceComplexity，第一项应为最优解",
        },
        { status: 400 },
      );
    }
    update.solutions = result.data;
  }

  if (typeof body?.inputVariableNamesJson === "string" && body.inputVariableNamesJson.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.inputVariableNamesJson);
    } catch {
      return NextResponse.json(
        { error: "输入变量名不是合法的 JSON 数组" },
        { status: 400 },
      );
    }
    const result = z.array(z.string()).min(1).safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: "输入变量名需要是字符串数组，如 [\"nums\", \"target\"]" },
        { status: 400 },
      );
    }
    update.inputVariableNames = result.data;
  }

  if (typeof body?.testCasesJson === "string" && body.testCasesJson.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.testCasesJson);
    } catch {
      return NextResponse.json(
        { error: "测试用例不是合法的 JSON" },
        { status: 400 },
      );
    }
    const result = testCasesArraySchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        {
          error:
            "测试用例格式不对：需要是数组，每项包含 expected（期望结果），并按判题模式提供 input（参数数组）或 values（变量值对象）",
        },
        { status: 400 },
      );
    }
    update.testCases = result.data;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const [updated] = await db
    .update(problems)
    .set(update)
    .where(eq(problems.id, id))
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
    .delete(problems)
    .where(eq(problems.id, id))
    .returning({ id: problems.id });

  if (!deleted) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  return NextResponse.json({ id: deleted.id });
}
