"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function InterviewChatInput({
  onSend,
  sending,
  disabled,
}: {
  onSend: (text: string) => void;
  sending: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function handleSend() {
    const text = draft.trim();
    if (!text || sending || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex items-end gap-2 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <Textarea
        rows={2}
        placeholder={disabled ? "AI 暂时不可用" : "输入你的问题..."}
        value={draft}
        disabled={disabled || sending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        className="resize-none"
      />
      <Button size="icon" onClick={handleSend} disabled={disabled || sending || !draft.trim()}>
        <Send className="size-4" />
      </Button>
    </div>
  );
}
