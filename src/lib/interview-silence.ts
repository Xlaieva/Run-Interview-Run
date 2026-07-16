import type { TranscriptSegment } from "./groq";

export interface SilenceRange {
  start: number;
  end: number;
}

const MIN_SILENCE_SECONDS = 3;

/** Silence ranges long enough to matter, with duration precomputed, sorted by start time. */
function significantRanges(silenceRanges: SilenceRange[]) {
  return silenceRanges
    .map((r) => ({ ...r, duration: r.end - r.start }))
    .filter((r) => r.duration >= MIN_SILENCE_SECONDS)
    .sort((a, b) => a.start - b.start);
}

/**
 * Inserts "（沉默N秒）" markers into the transcript at the position matching
 * each silence range's timestamp. A silence range is placed right after the
 * last Whisper segment that ends at or before the range's start, and before
 * the next one — so it reads inline where the pause actually happened.
 * Silences shorter than MIN_SILENCE_SECONDS are ignored.
 */
export function insertSilenceMarkers(
  segments: TranscriptSegment[],
  silenceRanges: SilenceRange[],
): string {
  const significant = significantRanges(silenceRanges);

  if (segments.length === 0) {
    return significant
      .map((r) => `（沉默${Math.round(r.duration)}秒）`)
      .join(" ");
  }

  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let silenceIdx = 0;

  function flushSilencesBefore(time: number) {
    while (
      silenceIdx < significant.length &&
      significant[silenceIdx].start <= time
    ) {
      parts.push(`（沉默${Math.round(significant[silenceIdx].duration)}秒）`);
      silenceIdx++;
    }
  }

  for (const seg of sorted) {
    flushSilencesBefore(seg.start);
    if (seg.text) parts.push(seg.text);
  }
  // Any remaining silences (after the last segment) go at the end.
  while (silenceIdx < significant.length) {
    parts.push(`（沉默${Math.round(significant[silenceIdx].duration)}秒）`);
    silenceIdx++;
  }

  return parts.join(" ");
}

export function totalSilenceSeconds(silenceRanges: SilenceRange[]): number {
  return Math.round(
    significantRanges(silenceRanges).reduce((sum, r) => sum + r.duration, 0),
  );
}
