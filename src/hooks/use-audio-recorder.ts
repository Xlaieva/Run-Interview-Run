"use client";

import { useCallback, useRef, useState } from "react";
import type { SilenceRange } from "@/lib/interview-silence";

const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const SILENCE_VOLUME_THRESHOLD = 0.02; // RMS amplitude 0-1
const SILENCE_POLL_MS = 200;

function pickMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  silenceRanges: SilenceRange[];
}

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceRangesRef = useRef<SilenceRange[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const lastPollRef = useRef<number>(0);

  const pollVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const now = performance.now();
    if (now - lastPollRef.current >= SILENCE_POLL_MS) {
      lastPollRef.current = now;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const v of data) {
        const normalized = (v - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const elapsed = (now - startedAtRef.current) / 1000;

      if (rms < SILENCE_VOLUME_THRESHOLD) {
        if (silenceStartRef.current === null) silenceStartRef.current = elapsed;
      } else if (silenceStartRef.current !== null) {
        silenceRangesRef.current.push({ start: silenceStartRef.current, end: elapsed });
        silenceStartRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(pollVolume);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;

      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextCtor();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      startedAtRef.current = performance.now();
      lastPollRef.current = 0;
      silenceRangesRef.current = [];
      silenceStartRef.current = null;
      rafRef.current = requestAnimationFrame(pollVolume);

      setRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
      setError("无法访问麦克风，请检查权限设置");
    }
  }, [pollVolume]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const durationSeconds = (performance.now() - startedAtRef.current) / 1000;
        if (silenceStartRef.current !== null) {
          silenceRangesRef.current.push({ start: silenceStartRef.current, end: durationSeconds });
          silenceStartRef.current = null;
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setRecording(false);
        resolve({
          blob,
          mimeType: mimeTypeRef.current,
          durationSeconds,
          silenceRanges: silenceRangesRef.current,
        });
      };
      recorder.stop();
    });
  }, []);

  return { recording, error, start, stop };
}
