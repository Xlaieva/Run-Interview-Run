/**
 * Counts a function signature's top-level parameters, e.g.
 * "function twoSum(nums: number[], target: number): number[]" -> 2
 * "def two_sum(nums: list[int], target: int) -> list[int]:" -> 2
 * Returns null if no balanced parameter list could be found.
 *
 * Splits on commas at bracket-depth 0 so nested generics/collection types
 * (e.g. "dict[str, int]", "Map<string, number>") aren't mistaken for extra
 * parameters.
 */
export function countSignatureParams(signature: string): number | null {
  const start = signature.indexOf("(");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") {
      depth--;
      if (depth === 0 && ch === ")") {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const inner = signature.slice(start + 1, end).trim();
  if (inner === "") return 0;

  let paramDepth = 0;
  let count = 1;
  for (const ch of inner) {
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") paramDepth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") paramDepth--;
    else if (ch === "," && paramDepth === 0) count++;
  }
  return count;
}

/**
 * True if every test case's `input` array length matches the signature's
 * parameter count — catches cases where a weaker model flattened a nested
 * array parameter or dropped/duplicated an argument, which would otherwise
 * silently make every judge run fail (or call the function with wrong args).
 */
export function testCasesMatchSignature(
  functionSignature: string,
  testCases: { input?: unknown[] }[],
): boolean {
  const paramCount = countSignatureParams(functionSignature);
  if (paramCount === null) return true; // can't verify, don't block on it
  return testCases.every((tc) => Array.isArray(tc.input) && tc.input.length === paramCount);
}
