import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Not validated at import time so `next build` can still collect route/page
// metadata before DASHSCOPE_API_KEY is configured. A missing/invalid key
// surfaces as a request-time error from the DashScope API, which the AI
// route handlers already catch and turn into a 503 "ai_unavailable" response.
const qwenProvider = createOpenAICompatible({
  name: "qwen",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
});

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen-turbo";

export const qwen = qwenProvider(QWEN_MODEL);
