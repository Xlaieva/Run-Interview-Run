"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ReciteProblemPanel } from "./recite-problem-panel";
import { ReciteCodeStage } from "./recite-code-stage";
import { ChatPanel } from "@/components/practice/chat-panel";
import type { Problem } from "@/db/schema";
import type { ChatMessage } from "@/lib/types";

export function ReciteView({ problem }: { problem: Problem }) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  const solutions = problem.solutions ?? [];

  async function handleChatSend(text: string) {
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMessages);
    setChatSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          messages: newMessages,
          code: focusedIndex !== null ? solutions[focusedIndex]?.solutionCode : undefined,
        }),
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
      setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>
        <span className="text-sm font-medium">{problem.title} · 背题模式</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_340px]">
        <ReciteProblemPanel problem={problem} focusedIndex={focusedIndex} />
        <ReciteCodeStage
          solutions={solutions}
          focusedIndex={focusedIndex}
          onFocus={setFocusedIndex}
          onUnfocus={() => setFocusedIndex(null)}
        />
        <ChatPanel
          messages={chatMessages}
          onSend={handleChatSend}
          sending={chatSending}
          aiAvailable={aiAvailable}
          onRetryAi={() => setAiAvailable(true)}
        />
      </div>
    </div>
  );
}
