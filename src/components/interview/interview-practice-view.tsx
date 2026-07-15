"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InterviewQuestionPanel } from "./interview-question-panel";
import { RecorderPanel } from "./recorder-panel";
import { InterviewTimeline } from "./interview-timeline";
import { InterviewChatInput } from "./interview-chat-input";
import type { InterviewQuestion, InterviewAttempt, InterviewChatMessage } from "@/db/schema";
import { mergeInterviewTimeline } from "@/lib/types";
import type { RecordingResult } from "@/hooks/use-audio-recorder";

export function InterviewPracticeView({
  question: initialQuestion,
  attempts: initialAttempts,
  chatMessages: initialChatMessages,
  isReview,
  reviewQueue = [],
}: {
  question: InterviewQuestion;
  attempts: InterviewAttempt[];
  chatMessages: InterviewChatMessage[];
  isReview: boolean;
  reviewQueue?: string[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [uploading, setUploading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const timeline = mergeInterviewTimeline(attempts, chatMessages);

  async function handleRecordingComplete(result: RecordingResult) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", result.blob, `recording.${result.mimeType.split("/")[1] ?? "webm"}`);
      form.append("mimeType", result.mimeType);
      form.append("durationSeconds", String(result.durationSeconds));
      form.append("silenceRangesJson", JSON.stringify(result.silenceRanges));
      form.append("isReview", String(isReview));

      const res = await fetch(`/api/interview/${question.id}/attempt`, {
        method: "POST",
        body: form,
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，请稍后重试");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "处理失败");
        return;
      }
      setAttempts((prev) => [...prev, data.attempt]);
      setQuestion(data.question);
      toast.success("已生成 AI 反馈");
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setUploading(false);
    }
  }

  async function handleChatSend(text: string) {
    setChatSending(true);
    try {
      const res = await fetch(`/api/interview/${question.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 503) {
        setAiAvailable(false);
        toast.warning("AI 暂时不可用，请稍后重试");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "AI 回复失败");
        return;
      }
      setChatMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setChatSending(false);
    }
  }

  function handleNextInQueue() {
    if (reviewQueue.length === 0) {
      router.push("/interview");
      return;
    }
    const [next, ...rest] = reviewQueue;
    const queueParam = rest.length ? `&queue=${rest.join(",")}` : "";
    router.push(`/interview/${next}?mode=review${queueParam}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/interview" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{question.title}</span>
        {isReview && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">复习模式</Badge>
            {reviewQueue.length > 0 && (
              <span className="text-xs text-muted-foreground">还剩 {reviewQueue.length} 道</span>
            )}
            <Button variant="ghost" size="sm" onClick={handleNextInQueue}>
              {reviewQueue.length > 0 ? "下一题" : "结束复习"}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr_360px]">
        <div className="flex min-h-0 flex-col border-r md:overflow-y-auto">
          <InterviewQuestionPanel question={question} />
        </div>

        <div className="flex min-h-0 flex-col border-r">
          <RecorderPanel onComplete={handleRecordingComplete} uploading={uploading} />
        </div>

        <div className="flex min-h-0 flex-col">
          <InterviewTimeline entries={timeline} pending={uploading || chatSending} />
          <InterviewChatInput onSend={handleChatSend} sending={chatSending} disabled={!aiAvailable} />
        </div>
      </div>
    </div>
  );
}
