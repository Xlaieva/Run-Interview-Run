"use client";

import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Sentinel value for "no filter applied" in column filter <Select>s. */
export const ALL_FILTER = "__all__";

/** Turns a list of raw numbers into deduped, sorted `{ value, label }` select options. */
export function distinctNumberOptions(values: number[]) {
  return Array.from(new Set(values))
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: `${n} 次` }));
}

/** Small funnel-icon trigger that pops open a filter control; highlighted when a filter is active. */
export function ColumnFilterButton({
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

/** Dropdown filter with a built-in "全部" (no filter) option. */
export function SelectFilter({
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
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL_FILTER)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_FILTER}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Table header cell with a label plus a column filter popover. */
export function FilterableHead({
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
