"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { InterviewQuestionPanel } from "./interview-question-panel";
import { InterviewAnswerPanel } from "./interview-answer-panel";
import { InterviewTimeline } from "./interview-timeline";
import { InterviewChatInput } from "./interview-chat-input";
import type { InterviewQuestion, InterviewAttempt, InterviewChatMessage } from "@/db/schema";
import { mergeInterviewTimeline } from "@/lib/types";

export function InterviewReciteView({
  question,
  attempts,
  chatMessages: initialChatMessages,
}: {
  question: InterviewQuestion;
  attempts: InterviewAttempt[];
  chatMessages: InterviewChatMessage[];
}) {
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatSending, setChatSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const timeline = mergeInterviewTimeline(attempts, chatMessages);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link href="/interview" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{question.title} · 背题模式</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_1fr]">
        <div className="flex min-h-0 flex-col border-r">
          <InterviewQuestionPanel question={question} />
          <InterviewAnswerPanel question={question} />
        </div>

        <div className="flex min-h-0 flex-col">
          <InterviewTimeline entries={timeline} pending={chatSending} />
          <InterviewChatInput onSend={handleChatSend} sending={chatSending} disabled={!aiAvailable} />
        </div>
      </div>
    </div>
  );
}
