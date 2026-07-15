"use client";

import { useState } from "react";
import { Send, Loader2, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

export function ChatPanel({
  messages,
  onSend,
  sending,
  aiAvailable,
  onRetryAi,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  sending: boolean;
  aiAvailable: boolean;
  onRetryAi: () => void;
}) {
  const [draft, setDraft] = useState("");

  function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-violet-400" />
        <span className="text-sm font-medium">AI 问答</span>
      </div>

      {!aiAvailable && (
        <div className="flex items-center justify-between gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-500">
          <span className="flex items-center gap-1.5">
            <WifiOff className="size-3.5" />
            AI 暂时不可用
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetryAi}>
            重试
          </Button>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-4 py-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              可以随时向 AI 提问思路、复杂度或语法问题
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-violet-500/10 text-foreground",
              )}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              AI 正在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          rows={2}
          placeholder={aiAvailable ? "输入你的问题..." : "AI 暂时不可用"}
          value={draft}
          disabled={!aiAvailable || sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="resize-none"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!aiAvailable || sending || !draft.trim()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
