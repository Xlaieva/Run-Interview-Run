import { generateObject } from "ai";
import { qwen } from "@/lib/ai";
import { dailyPlanSchema, buildDailyPlanPrompt } from "@/lib/prompts";

/**
 * Extracts structured targets (problemsTarget/interviewTarget) and a display
 * summary from the user's free-form daily plan text. Throws on AI failure —
 * callers (the /api/daily-plan route) decide how to degrade, since the plan
 * text itself must still be saved even when this fails.
 */
export async function classifyDailyPlan(planText: string) {
  const { object } = await generateObject({
    model: qwen,
    schema: dailyPlanSchema,
    prompt: buildDailyPlanPrompt(planText),
  });
  return object;
}
