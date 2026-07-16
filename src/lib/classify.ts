import { generateObject } from "ai";
import { qwen } from "@/lib/ai";
import {
  classificationSchema,
  buildClassificationPrompt,
  solutionReviewSchema,
  buildSolutionReviewPrompt,
} from "@/lib/prompts";
import { testCasesMatchSignature } from "@/lib/signature";
import type { Language, Solution } from "@/lib/types";

/**
 * Classifies a problem, with one retry if the model's testCases don't match
 * functionSignature's arity (weaker/free models occasionally flatten a
 * nested-array parameter or drop/duplicate an argument — silently keeping
 * that data would make every judge run fail even for a correct solution).
 * If both attempts fail validation, testCases is stripped so the problem
 * still saves usably and the user can fill it in manually.
 */
export async function classifyProblem(
  title: string,
  description: string,
  language: Language,
) {
  const prompt = buildClassificationPrompt(title, description, language);

  let object = (
    await generateObject({ model: qwen, schema: classificationSchema, prompt })
  ).object;

  if (!testCasesMatchSignature(object.functionSignature, object.testCases)) {
    console.warn("classifyProblem: testCases arity mismatch, retrying once");
    const retry = await generateObject({ model: qwen, schema: classificationSchema, prompt });
    object = retry.object;

    if (!testCasesMatchSignature(object.functionSignature, object.testCases)) {
      console.warn("classifyProblem: retry still mismatched, dropping testCases");
      return { ...object, testCases: [] };
    }
  }

  return object;
}

/**
 * Judges whether the user's own solution approach (entered alongside the
 * problem at creation time) has an issue, comparing it against the AI's
 * generated solutions. Returns hasIssue=false with an empty feedback when
 * the approach looks correct — the caller only surfaces feedback on true.
 */
export async function reviewUserSolution(
  title: string,
  description: string,
  userAnswer: string,
  solutions: Solution[],
) {
  const prompt = buildSolutionReviewPrompt({ title, description, userAnswer, solutions });
  const { object } = await generateObject({ model: qwen, schema: solutionReviewSchema, prompt });
  return object;
}
