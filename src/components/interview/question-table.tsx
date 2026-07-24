"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_FILTER as ALL,
  distinctNumberOptions,
  FilterableHead,
  SelectFilter,
} from "@/components/table-filters";
import { formatDateTime } from "@/lib/format";
import { EditAnswerDialog } from "./edit-answer-dialog";
import { DeleteQuestionButton } from "./delete-question-button";
import type { InterviewQuestion } from "@/db/schema";

const UNCATEGORIZED = "未分类";
const PAGE_SIZES = [5, 10, 15] as const;
const DEFAULT_PAGE_SIZE = 10;

type Filters = {
  title: string;
  category: string;
  totalAttempts: string;
  started: string;
  reviewCount: string;
};

const EMPTY_FILTERS: Filters = {
  title: "",
  category: ALL,
  totalAttempts: ALL,
  started: ALL,
  reviewCount: ALL,
};

export function QuestionTable({
  questions,
  onUpdated,
  onDeleted,
}: {
  questions: InterviewQuestion[];
  onUpdated: (question: InterviewQuestion) => void;
  onDeleted: (id: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [titleDraft, setTitleDraft] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearTitleFilter() {
    setTitleDraft("");
    setFilter("title", "");
  }

  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(questions.map((q) => q.category).filter((c): c is string => Boolean(c))),
      ).sort((a, b) => a.localeCompare(b, "zh")),
    [questions],
  );
  const totalAttemptsOptions = useMemo(
    () => distinctNumberOptions(questions.map((q) => q.totalAttempts)),
    [questions],
  );
  const reviewCountOptions = useMemo(
    () => distinctNumberOptions(questions.map((q) => q.reviewCount)),
    [questions],
  );

  const filteredQuestions = questions.filter((q) => {
    const title = filters.title.trim().toLowerCase();
    if (title && !q.title.toLowerCase().includes(title)) return false;
    if (filters.category !== ALL && (q.category ?? UNCATEGORIZED) !== filters.category) {
      return false;
    }
    if (filters.totalAttempts !== ALL && String(q.totalAttempts) !== filters.totalAttempts) {
      return false;
    }
    if (filters.started !== ALL) {
      const started = q.lastPracticedAt ? "YES" : "NO";
      if (started !== filters.started) return false;
    }
    if (filters.reviewCount !== ALL && String(q.reviewCount) !== filters.reviewCount) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <p>还没有面试问答题，点击右上角「添加题目」开始准备吧</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <FilterableHead label="题目" active={filters.title.trim() !== ""}>
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setFilter("title", titleDraft);
                  }}
                  placeholder="搜索题目..."
                  className="h-8"
                />
                <Button size="sm" onClick={() => setFilter("title", titleDraft)}>
                  搜索
                </Button>
              </div>
              {filters.title.trim() !== "" && (
                <button
                  type="button"
                  onClick={clearTitleFilter}
                  className="mt-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  清除筛选
                </button>
              )}
            </FilterableHead>
            <FilterableHead label="分类" active={filters.category !== ALL}>
              <SelectFilter
                value={filters.category}
                onChange={(v) => setFilter("category", v)}
                options={[
                  { value: UNCATEGORIZED, label: UNCATEGORIZED },
                  ...existingCategories.map((c) => ({ value: c, label: c })),
                ]}
              />
            </FilterableHead>
            <FilterableHead label="练习次数" active={filters.totalAttempts !== ALL}>
              <SelectFilter
                value={filters.totalAttempts}
                onChange={(v) => setFilter("totalAttempts", v)}
                options={totalAttemptsOptions}
              />
            </FilterableHead>
            <FilterableHead label="上次练习" active={filters.started !== ALL}>
              <SelectFilter
                value={filters.started}
                onChange={(v) => setFilter("started", v)}
                options={[
                  { value: "YES", label: "已开始" },
                  { value: "NO", label: "未开始" },
                ]}
              />
            </FilterableHead>
            <FilterableHead label="被抽查" active={filters.reviewCount !== ALL}>
              <SelectFilter
                value={filters.reviewCount}
                onChange={(v) => setFilter("reviewCount", v)}
                options={reviewCountOptions}
              />
            </FilterableHead>
            <TableHead className="sticky right-0 z-10 bg-background border-l">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredQuestions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                没有符合筛选条件的题目
              </TableCell>
            </TableRow>
          ) : (
            paginatedQuestions.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="w-[100px] min-w-0 max-w-[200px] truncate font-medium">
                  {q.title}
                </TableCell>
                <TableCell className="text-center">
                  {q.category ? (
                    <Badge variant="secondary">{q.category}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">未分类</Badge>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">{q.totalAttempts}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(q.lastPracticedAt)}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(q.lastReviewedAt)}
                  {q.reviewCount > 0 && <span className="ml-1 text-muted-foreground/70">×{q.reviewCount}</span>}
                </TableCell>
                <TableCell className="sticky right-0 z-10 bg-background border-l text-center">
                  <div className="flex items-center justify-center gap-1">
                    <EditAnswerDialog question={q} onUpdated={onUpdated} />
                    <DeleteQuestionButton questionId={q.id} questionTitle={q.title} onDeleted={onDeleted} />
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/interview/${q.id}/recite`}>背题</Link>} />
                    <Button size="sm" nativeButton={false} render={<Link href={`/interview/${q.id}`}>练习</Link>} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-4 border-t px-3 py-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span>每页</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v ?? DEFAULT_PAGE_SIZE));
              setPage(1);
            }}
          >
            <SelectTrigger size="sm" className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>条</span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            共 {filteredQuestions.length} 题 · 第 {currentPage} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              title="上一页"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              title="下一页"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
