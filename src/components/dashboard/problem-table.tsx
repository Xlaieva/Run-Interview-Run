"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EditSolutionDialog } from "./edit-solution-dialog";
import { DeleteProblemButton } from "./delete-problem-button";
import type { Problem } from "@/db/schema";

const ALL = "__all__";
const UNCATEGORIZED = "未分类";

function getComplexityLabel(p: Problem) {
  return p.solutions?.[0]
    ? `${p.solutions[0].timeComplexity} / ${p.solutions[0].spaceComplexity}`
    : "—";
}

function getTotalCount(p: Problem) {
  return p.successNoHintCount + p.success1HintCount + p.success2HintCount;
}

function distinctNumberOptions(values: number[]) {
  return Array.from(new Set(values))
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: `${n} 次` }));
}

type Filters = {
  title: string;
  category: string;
  complexity: string;
  totalCount: string;
  successNoHint: string;
  success1Hint: string;
  success2Hint: string;
  started: string;
  reviewCount: string;
};

const EMPTY_FILTERS: Filters = {
  title: "",
  category: ALL,
  complexity: ALL,
  totalCount: ALL,
  successNoHint: ALL,
  success1Hint: ALL,
  success2Hint: ALL,
  started: ALL,
  reviewCount: ALL,
};

function ColumnFilterButton({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="筛选"
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground",
              active ? "text-primary" : "text-muted-foreground/50",
            )}
          >
            <Filter className={cn("size-3", active && "fill-primary/25")} />
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
  allLabel = "全部",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterableHead({
  label,
  active,
  className,
  children,
}: {
  label: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TableHead className={className}>
      <span className="inline-flex items-center justify-center gap-1">
        {label}
        <ColumnFilterButton active={active}>{children}</ColumnFilterButton>
      </span>
    </TableHead>
  );
}

export function ProblemTable({
  problems,
  onUpdated,
  onDeleted,
}: {
  problems: Problem[];
  onUpdated: (problem: Problem) => void;
  onDeleted: (id: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [titleDraft, setTitleDraft] = useState("");

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearTitleFilter() {
    setTitleDraft("");
    setFilter("title", "");
  }

  const existingCategories = Array.from(
    new Set(problems.map((p) => p.category).filter((c): c is string => Boolean(c))),
  ).sort((a, b) => a.localeCompare(b, "zh"));

  // Number rows by creation order (oldest = id 1), independent of any future sort/filter.
  const rows = useMemo(() => {
    const ordered = [...problems].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return ordered.map((p, index) => ({ ...p, seq: index + 1 }));
  }, [problems]);

  const complexityOptions = useMemo(
    () =>
      Array.from(new Set(rows.map(getComplexityLabel)))
        .sort((a, b) => a.localeCompare(b, "zh"))
        .map((label) => ({ value: label, label })),
    [rows],
  );
  const totalCountOptions = useMemo(() => distinctNumberOptions(rows.map(getTotalCount)), [rows]);
  const successNoHintOptions = useMemo(
    () => distinctNumberOptions(rows.map((p) => p.successNoHintCount)),
    [rows],
  );
  const success1HintOptions = useMemo(
    () => distinctNumberOptions(rows.map((p) => p.success1HintCount)),
    [rows],
  );
  const success2HintOptions = useMemo(
    () => distinctNumberOptions(rows.map((p) => p.success2HintCount)),
    [rows],
  );
  const reviewCountOptions = useMemo(
    () => distinctNumberOptions(rows.map((p) => p.reviewCount)),
    [rows],
  );

  const filteredRows = rows.filter((p) => {
    const title = filters.title.trim().toLowerCase();
    if (title && !p.title.toLowerCase().includes(title)) return false;
    if (filters.category !== ALL && (p.category ?? UNCATEGORIZED) !== filters.category) {
      return false;
    }
    if (filters.complexity !== ALL && getComplexityLabel(p) !== filters.complexity) return false;
    if (filters.totalCount !== ALL && String(getTotalCount(p)) !== filters.totalCount) return false;
    if (filters.successNoHint !== ALL && String(p.successNoHintCount) !== filters.successNoHint) {
      return false;
    }
    if (filters.success1Hint !== ALL && String(p.success1HintCount) !== filters.success1Hint) {
      return false;
    }
    if (filters.success2Hint !== ALL && String(p.success2HintCount) !== filters.success2Hint) {
      return false;
    }
    if (filters.started !== ALL) {
      const started = p.firstPracticeAt ? "YES" : "NO";
      if (started !== filters.started) return false;
    }
    if (filters.reviewCount !== ALL && String(p.reviewCount) !== filters.reviewCount) return false;
    return true;
  });

  if (problems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <p>还没有题目，点击右上角「添加题目」开始刷题吧</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">id</TableHead>
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
            <FilterableHead label="最优复杂度" active={filters.complexity !== ALL}>
              <SelectFilter
                value={filters.complexity}
                onChange={(v) => setFilter("complexity", v)}
                options={complexityOptions}
              />
            </FilterableHead>
            <FilterableHead label="刷题次数" active={filters.totalCount !== ALL}>
              <SelectFilter
                value={filters.totalCount}
                onChange={(v) => setFilter("totalCount", v)}
                options={totalCountOptions}
              />
            </FilterableHead>
            <FilterableHead
              label="一/二/三次成功"
              active={
                filters.successNoHint !== ALL ||
                filters.success1Hint !== ALL ||
                filters.success2Hint !== ALL
              }
            >
              <div className="grid gap-2">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">一次成功次数</span>
                  <SelectFilter
                    value={filters.successNoHint}
                    onChange={(v) => setFilter("successNoHint", v)}
                    options={successNoHintOptions}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">二次成功次数</span>
                  <SelectFilter
                    value={filters.success1Hint}
                    onChange={(v) => setFilter("success1Hint", v)}
                    options={success1HintOptions}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">三次成功次数</span>
                  <SelectFilter
                    value={filters.success2Hint}
                    onChange={(v) => setFilter("success2Hint", v)}
                    options={success2HintOptions}
                  />
                </div>
              </div>
            </FilterableHead>
            <FilterableHead label="开始刷题" active={filters.started !== ALL}>
              <SelectFilter
                value={filters.started}
                onChange={(v) => setFilter("started", v)}
                options={[
                  { value: "YES", label: "已开始" },
                  { value: "NO", label: "未开始" },
                ]}
              />
            </FilterableHead>
            <FilterableHead label="被考察" active={filters.reviewCount !== ALL}>
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
          {filteredRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                没有符合筛选条件的题目
              </TableCell>
            </TableRow>
          ) : (
            filteredRows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                  {p.seq}
                </TableCell>
                <TableCell className="font-medium max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="shrink-0 font-mono text-[0.65rem] text-muted-foreground"
                    >
                      {p.language === "python" ? "Py" : "TS"}
                    </Badge>
                    <span className="truncate">{p.title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {p.category ? (
                    <Badge variant="secondary">{p.category}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      未分类
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {p.solutions?.[0]
                    ? `${p.solutions[0].timeComplexity} / ${p.solutions[0].spaceComplexity}`
                    : "—"}
                  {(p.solutions?.length ?? 0) > 1 && (
                    <span className="ml-1 text-muted-foreground/70">
                      +{p.solutions!.length - 1} 种解法
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {p.successNoHintCount + p.success1HintCount + p.success2HintCount}
                </TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  <span className="inline-flex gap-1">
                    <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">
                      {p.successNoHintCount}
                    </Badge>
                    <Badge className="bg-amber-600/15 text-amber-500 border-amber-600/30">
                      {p.success1HintCount}
                    </Badge>
                    <Badge className="bg-orange-600/15 text-orange-500 border-orange-600/30">
                      {p.success2HintCount}
                    </Badge>
                  </span>
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(p.firstPracticeAt)}
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(p.lastReviewedAt)}
                  {p.reviewCount > 0 && (
                    <span className="ml-1 text-muted-foreground/70">×{p.reviewCount}</span>
                  )}
                </TableCell>
                <TableCell className="sticky right-0 z-10 bg-background border-l text-center">
                  <div className="flex items-center justify-center gap-1">
                    <EditSolutionDialog
                      problem={p}
                      existingCategories={existingCategories}
                      onUpdated={onUpdated}
                    />
                    <DeleteProblemButton
                      problemId={p.id}
                      problemTitle={p.title}
                      onDeleted={onDeleted}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/problem/${p.id}/recite`}>背题</Link>}
                    />
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/problem/${p.id}`}>做题</Link>}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
