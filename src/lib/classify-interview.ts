import { generateObject } from "ai";
import { qwen } from "@/lib/ai";
import {
  interviewClassificationSchema,
  buildInterviewClassificationPrompt,
  interviewAnswerReviewSchema,
  buildInterviewAnswerReviewPrompt,
} from "@/lib/prompts";

export async function classifyInterviewQuestion(title: string, description: string) {
  const prompt = buildInterviewClassificationPrompt(title, description);
  const { object } = await generateObject({
    model: qwen,
    schema: interviewClassificationSchema,
    prompt,
  });
  return object;
}

/**
 * Compares the user's own answer (entered alongside the question at creation
 * time) against the AI-generated standard answer, always producing feedback
 * with suggestions and terminology explanations — unlike reviewUserSolution,
 * this isn't gated on finding a mistake.
 */
export async function reviewInterviewAnswer(
  title: string,
  description: string,
  standardAnswer: string | null,
  userAnswer: string,
) {
  const prompt = buildInterviewAnswerReviewPrompt({ title, description, standardAnswer, userAnswer });
  const { object } = await generateObject({
    model: qwen,
    schema: interviewAnswerReviewSchema,
    prompt,
  });
  return object;
}
