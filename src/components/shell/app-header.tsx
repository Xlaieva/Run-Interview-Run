"use client";

import Link from "next/link";
import { Menu, Code2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="菜单">
              <Menu className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            render={
              <Link href="/" className="hidden items-center gap-2 md:flex">
                <Code2 className="size-4" />
                算法刷题
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href="/interview" className="flex items-center gap-2">
                <MessageSquareText className="size-4" />
                面试问答
              </Link>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-sm font-medium">刷题台</span>
    </header>
  );
}
