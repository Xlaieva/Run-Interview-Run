"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const COUNT_OPTIONS = [1, 3, 5, 8, 10];

export function ReviewButton() {
  const router = useRouter();
  const [count, setCount] = useState("1");
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/review?count=${count}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "暂时没有可复习的题目");
        return;
      }
      const ids = (data.ids ?? []) as string[];
      if (ids.length === 0) {
        toast.error("暂时没有可复习的题目");
        return;
      }
      if (ids.length < Number(count)) {
        toast.message(`符合条件的题目只有 ${ids.length} 道，已经全部安排`);
      }
      const [first, ...rest] = ids;
      const queue = rest.length ? `&queue=${rest.join(",")}` : "";
      router.push(`/problem/${first}?mode=review${queue}`);
    } catch {
      toast.error("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select value={count} onValueChange={(value) => value && setCount(value)}>
        <SelectTrigger className="w-16" size="default">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNT_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={handleClick} disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Shuffle className="size-4" />
        )}
        开始复习
      </Button>
    </div>
  );
}
