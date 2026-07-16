export const SOLUTION_COLORS = [
  { border: "border-solution-1", text: "text-solution-1" },
  { border: "border-solution-2", text: "text-solution-2" },
  { border: "border-solution-3", text: "text-solution-3" },
  { border: "border-solution-4", text: "text-solution-4" },
] as const;

export function solutionColor(index: number) {
  return SOLUTION_COLORS[index % SOLUTION_COLORS.length];
}
