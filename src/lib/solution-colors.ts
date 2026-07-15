export const SOLUTION_COLORS = [
  {
    border: "border-emerald-500",
    text: "text-emerald-400",
    badge: "bg-emerald-600/15 text-emerald-500 border-emerald-600/30",
  },
  {
    border: "border-blue-500",
    text: "text-blue-400",
    badge: "bg-blue-600/15 text-blue-500 border-blue-600/30",
  },
  {
    border: "border-violet-500",
    text: "text-violet-400",
    badge: "bg-violet-600/15 text-violet-500 border-violet-600/30",
  },
  {
    border: "border-amber-500",
    text: "text-amber-400",
    badge: "bg-amber-600/15 text-amber-500 border-amber-600/30",
  },
] as const;

export function solutionColor(index: number) {
  return SOLUTION_COLORS[index % SOLUTION_COLORS.length];
}
