import { put, del } from "@vercel/blob";

export async function uploadRecording(
  questionId: string,
  audio: Blob,
  extension: string,
): Promise<string> {
  const blob = await put(`interview-recordings/${questionId}.${extension}`, audio, {
    access: "public",
    addRandomSuffix: true,
    contentType: audio.type || undefined,
  });
  return blob.url;
}

export async function deleteRecording(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await del(url);
  } catch (err) {
    // Best-effort cleanup — a failed delete shouldn't block saving the new attempt.
    console.error("Failed to delete previous recording from Blob", err);
  }
}
