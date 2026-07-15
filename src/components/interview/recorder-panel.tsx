"use client";

import { useEffect, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioRecorder, type RecordingResult } from "@/hooks/use-audio-recorder";
import { toast } from "sonner";

export function RecorderPanel({
  onComplete,
  uploading,
}: {
  onComplete: (result: RecordingResult) => void;
  uploading: boolean;
}) {
  const { recording, error, start, stop } = useAudioRecorder();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  async function handleClick() {
    if (uploading) return;
    if (recording) {
      const result = await stop();
      if (result) onComplete(result);
    } else {
      await start();
    }
  }

  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Button
        size="lg"
        className="h-14 min-w-40 gap-2 text-base"
        variant={recording ? "destructive" : "default"}
        onClick={handleClick}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            处理中...
          </>
        ) : recording ? (
          <>
            <Square className="size-5" />
            结束录音 {elapsed}s
          </>
        ) : (
          <>
            <Mic className="size-5" />
            开始录音
          </>
        )}
      </Button>
      {!recording && !uploading && (
        <p className="text-xs text-muted-foreground">点击开始，说完后再点一下结束</p>
      )}
    </div>
  );
}
