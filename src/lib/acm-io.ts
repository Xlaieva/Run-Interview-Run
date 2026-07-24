/**
 * ACM 模式的纯文本 stdin/stdout 转换——固定确定性规则，TS worker、Python worker、
 * 题目描述里的"输入输出格式说明"三处共用同一套逻辑，保证展示的格式说明和真实判题
 * 用的数据不会不一致。
 */

type AcmShape = "boolean" | "number" | "string" | "matrix" | "array" | "raw";

function classifyAcmValue(value: unknown): AcmShape {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) {
    return value.length > 0 && Array.isArray(value[0]) ? "matrix" : "array";
  }
  return "raw";
}

function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return String(value);
}

/** 把一个值按固定规则序列化成若干行纯文本。 */
export function serializeAcmValue(value: unknown): string[] {
  switch (classifyAcmValue(value)) {
    case "boolean":
      return [value ? "true" : "false"];
    case "number":
    case "string":
      return [String(value)];
    case "matrix": {
      const rows = value as unknown[][];
      return [String(rows.length), ...rows.map((row) => row.map(formatScalar).join(" "))];
    }
    case "array": {
      const arr = value as unknown[];
      return [String(arr.length), arr.map(formatScalar).join(" ")];
    }
    default:
      try {
        return [JSON.stringify(value)];
      } catch {
        return [String(value)];
      }
  }
}

/** 按函数参数顺序，把整组 input 依次序列化拼成完整 stdin 文本。 */
export function buildAcmStdin(input: unknown[] | undefined): string {
  return (input ?? []).flatMap((v) => serializeAcmValue(v)).join("\n");
}

/** 把单个返回值序列化成期望的 stdout 文本。 */
export function buildAcmExpectedOutput(expected: unknown): string {
  return serializeAcmValue(expected).join("\n");
}

/** 判题比对前的归一化：去掉每行末尾空白、去掉末尾空行，不做其它"聪明"处理。 */
export function normalizeAcmOutput(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * 从函数签名字符串里解析出参数名列表，按括号深度切分，取每段冒号前的标识符。
 * 兼容 TS（"function twoSum(nums: number[], target: number): number[]"）和
 * Python（"def two_sum(nums: list[int], target: int) -> list[int]:"）风格。
 * 解析失败（没有括号等）返回空数组，调用方要 fallback 成"参数1/参数2"这样的占位名。
 */
export function parseFunctionParamNames(functionSignature: string): string[] {
  const start = functionSignature.indexOf("(");
  if (start === -1) return [];

  let depth = 0;
  let end = -1;
  for (let i = start; i < functionSignature.length; i++) {
    const ch = functionSignature[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  const inner = functionSignature.slice(start + 1, end).trim();
  if (!inner) return [];

  const parts: string[] = [];
  let partStart = 0;
  let d = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(" || ch === "[" || ch === "{") d++;
    else if (ch === ")" || ch === "]" || ch === "}") d--;
    else if (ch === "," && d === 0) {
      parts.push(inner.slice(partStart, i));
      partStart = i + 1;
    }
  }
  parts.push(inner.slice(partStart));

  return parts
    .map((part) => {
      const trimmed = part.trim();
      const colonIdx = trimmed.indexOf(":");
      return (colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)).trim();
    })
    .filter(Boolean);
}

function describeParam(value: unknown, name: string): string[] {
  switch (classifyAcmValue(value)) {
    case "boolean":
      return [`一个布尔值（true/false），表示 ${name}`];
    case "number":
      return [`一个整数，表示 ${name}`];
    case "string":
      return [`一个字符串，表示 ${name}`];
    case "matrix":
      return [
        `一个整数 m，表示 ${name} 的行数`,
        `接下来 m 行，每行是 ${name} 对应行、用空格分隔的元素`,
      ];
    case "array":
      return [`一个整数 n，表示 ${name} 的长度`, `n 个用空格分隔的值，表示 ${name}`];
    default:
      return [`${name}（原始 JSON 格式，此题参数类型较特殊）`];
  }
}

/**
 * 生成展示给用户看的"输入输出格式说明"——用步骤序号而不是绝对行号（矩阵这类
 * 变长参数之后的行号本来就无法提前定死），逻辑跟 serializeAcmValue 共享同一个
 * classifyAcmValue，保证文字说明和真实序列化结果不会对不上。
 */
export function describeAcmFormat(
  functionSignature: string | null | undefined,
  exampleInput: unknown[] | undefined,
  exampleExpected: unknown,
): string {
  const paramNames = functionSignature ? parseFunctionParamNames(functionSignature) : [];
  const inputSteps = (exampleInput ?? []).flatMap((value, i) =>
    describeParam(value, paramNames[i] || `参数${i + 1}`),
  );
  const outputSteps = describeParam(exampleExpected, "返回值");

  const numbered = (steps: string[]) =>
    steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "（无）";

  return `按顺序依次输入：\n${numbered(inputSteps)}\n\n程序需要按顺序打印：\n${numbered(outputSteps)}`;
}
