"use client";

import { Loader2, Mic, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { InterviewTimelineEntry } from "@/lib/types";

export function InterviewTimeline({
  entries,
  pending,
}: {
  entries: InterviewTimelineEntry[];
  pending?: boolean;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-3 px-4 py-4">
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            还没有练习记录，开始一次录音或提问吧
          </p>
        )}
        {entries.map((entry) =>
          entry.kind === "attempt" ? (
            <div key={entry.data.id} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mic className="size-3.5" />
                <span>{formatDateTime(entry.data.createdAt)}</span>
                {entry.data.isReview && <Badge variant="secondary">复习</Badge>}
                <span className="ml-auto font-mono">
                  {entry.data.recordingDurationSeconds}s · 静音{entry.data.silenceTotalSeconds}s
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{entry.data.transcript}</p>
              <div className="flex items-start gap-1.5 rounded-md bg-violet-500/10 p-2 text-sm">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
                <p className="whitespace-pre-wrap">{entry.data.aiFeedback}</p>
              </div>
            </div>
          ) : (
            <div
              key={entry.data.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                entry.data.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-violet-500/10 text-foreground",
              )}
            >
              {entry.data.content}
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            AI 正在思考...
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
