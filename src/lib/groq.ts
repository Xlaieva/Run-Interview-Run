const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
}

/**
 * Transcribes audio via Groq's OpenAI-compatible Whisper endpoint.
 * Throws on failure — callers decide how to surface that (503 "ai_unavailable"
 * pattern, matching the rest of the app's AI routes).
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", GROQ_STT_MODEL);
  form.append("response_format", "verbose_json");
  form.append("language", "zh");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq transcription failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    text: string;
    segments?: { start: number; end: number; text: string }[];
  };

  return {
    text: data.text ?? "",
    segments: (data.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}
