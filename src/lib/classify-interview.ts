import { generateObject } from "ai";
import { qwen } from "@/lib/ai";
import { interviewClassificationSchema, buildInterviewClassificationPrompt } from "@/lib/prompts";

export async function classifyInterviewQuestion(title: string, description: string) {
  const prompt = buildInterviewClassificationPrompt(title, description);
  const { object } = await generateObject({
    model: qwen,
    schema: interviewClassificationSchema,
    prompt,
  });
  return object;
}
