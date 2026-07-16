import { z } from "zod";
import type { Language, Solution } from "./types";
import { INTERVIEW_CATEGORIES } from "./types";

export const testCaseSchema = z.object({
  input: z
    .array(z.any())
    .describe(
      "严格按函数签名的参数顺序排列的参数值数组（第1个元素对应第1个参数，第2个元素对应第2个参数，以此类推，不能颠倒顺序），值必须是 JSON 可表示的类型（数字/字符串/布尔/数组/对象/null）",
    ),
  expected: z.any().describe("这组输入对应的期望返回值，同样必须是 JSON 可表示的类型"),
});

export const solutionSchema = z.object({
  approachName: z.string().describe("解法名称，简短，如“暴力法”“哈希表”“双指针”"),
  approachSummary: z
    .string()
    .describe("这个解法思路的简要中文说明，包含核心步骤，控制在150字以内"),
  verbalExplanation: z
    .string()
    .describe(
      "用口语化、连贯自然的一段话讲解这个解法的思路，就像在面试里讲给面试官听一样，不要写成分点列表、不要堆砌术语、不要有生硬的书面语，控制在200字左右",
    ),
  solutionCode: z
    .string()
    .describe(
      "完整可运行的代码，必须定义一个名为 functionName 的函数且签名与 functionSignature 一致，不要包含额外的测试调用代码",
    ),
  timeComplexity: z.string().describe("这个解法的时间复杂度，如 O(n)、O(n log n)"),
  spaceComplexity: z.string().describe("这个解法的空间复杂度，如 O(1)、O(n)"),
});

export const classificationSchema = z.object({
  category: z.string().describe("题目所属的算法/数据结构分类，如“动态规划”“双指针”“二叉树”，2-6个汉字"),
  functionName: z
    .string()
    .describe("题目要求实现的函数名，必须是合法的标识符（字母/数字/下划线，不能以数字开头），如 twoSum 或 two_sum"),
  functionSignature: z
    .string()
    .describe(
      '完整的函数签名声明，只要签名不要函数体，函数名必须与 functionName 完全一致',
    ),
  solutions: z
    .array(solutionSchema)
    .min(1)
    .max(4)
    .describe(
      "这道题的多种解法，按时间复杂度从优到劣排序（时间复杂度相同则按空间复杂度从优到劣），数组第一项必须是最优解。如果只有一种常见解法就给1项，如果有明显更优的解法（比如从暴力法到哈希表/双指针优化）就都列出来，最多4项。每一项都必须实现同一个 functionName/functionSignature，这样才能用同一套测试用例判题",
    ),
  testCases: z
    .array(testCaseSchema)
    .min(1)
    .max(6)
    .describe("从题目描述里给出的示例（输入/输出）中提取的测试用例，按出现顺序，至少1组最多6组"),
});

const LANGUAGE_LABEL: Record<Language, string> = {
  typescript: "TypeScript",
  python: "Python",
};

const LANGUAGE_GUIDANCE: Record<Language, string> = {
  typescript:
    '函数用 TypeScript 书写，functionSignature 只要签名不要函数体，例如 "function twoSum(nums: number[], target: number): number[]"；functionName 用 camelCase，如 "twoSum"。solutionCode 是完整的 TypeScript 实现。',
  python:
    '函数用 Python 书写，是一个模块级别的普通函数（不要包在 class 里，不要用 self），functionSignature 只要函数头（以冒号结尾，不要函数体），带类型标注，例如 "def two_sum(nums: list[int], target: int) -> list[int]:"；functionName 用 snake_case，如 "two_sum"，必须是合法的 Python 标识符（不能用 $，不能是 Python 关键字）。solutionCode 是完整的 Python 3 实现，可以用标准库（如 collections、itertools），不要用需要额外安装的第三方库。',
};

export function buildClassificationPrompt(
  title: string,
  description: string,
  language: Language = "typescript",
) {
  const languageLabel = LANGUAGE_LABEL[language];
  const languageGuidance = LANGUAGE_GUIDANCE[language];

  return `你是一个算法教练。请阅读下面这道 LeetCode 风格的题目，完成以下工作：
1. 判断题目分类
2. 设计一个合理的 ${languageLabel} 函数签名（如果题目本身已经暗示了函数名/参数，优先沿用）。${languageGuidance}
3. 从题目描述给出的示例中提取输入输出，构造测试用例。**input 数组的长度必须正好等于函数参数的个数，且顺序和函数签名的参数顺序逐一对应**——例如函数签名是 "function twoSum(nums, target)"，有 2 个参数，那么每组 input 就必须正好是 2 个元素：[nums的值, target的值]。如果某个参数本身是数组/列表（比如 nums 是 [2,7,11,15]），那么 input 里对应位置就是一个完整的数组，不能把数组里的元素拆散平铺到 input 里——错误示范：input 写成 [2,7,11,15]（把 nums 拆散了，还丢了 target）；正确示范：input 写成 [[2,7,11,15], 9]（nums 整体作为第1个元素，target 作为第2个元素）。生成完 testCases 之后，请自己再检查一遍每一项 input 的元素个数是不是正好等于参数个数、顺序和嵌套结构是否和 functionSignature 完全一致，错了会导致判题全部失败
4. 给出这道题的多种解法（如果存在从暴力到优化的多个级别，都列出来），每种解法都要实现同一个函数（函数名、参数顺序都要和 functionSignature 完全一致，这样用户提交的代码和所有解法才能用同一套测试用例判题），并按时间复杂度从优到劣排序（相同则按空间复杂度排序），第一项必须是最优解

题目标题：${title}

题目描述：
${description}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名（不要使用中文字段名或其他名称）：
- category: string，中文，题目分类，如"动态规划"
- functionName: string，合法的标识符
- functionSignature: string，完整的 ${languageLabel} 函数签名（只要签名，不要函数体）
- solutions: 数组，按时间复杂度从优到劣排序（第一项是最优解），每项包含：
  - approachName: string，中文，解法名称，如"哈希表"
  - approachSummary: string，中文，这个解法的思路，150字以内
  - verbalExplanation: string，中文，用口语化、自然连贯的一段话讲解这个解法（像讲给面试官听一样，不要分点、不要术语堆砌），200字左右
  - solutionCode: string，完整可运行的 ${languageLabel} 代码，必须定义名为 functionName 的函数
  - timeComplexity: string，如 "O(n)"
  - spaceComplexity: string，如 "O(1)"
- testCases: 数组，每项包含 input（严格按 functionSignature 参数顺序排列的数组，第1项对应第1个参数）和 expected（期望返回值），至少1组最多6组，来自题目描述中的示例`;
}

export const solutionReviewSchema = z.object({
  hasIssue: z
    .boolean()
    .describe(
      "用户自己写的解法思路是否存在问题：思路错误、会导致结果错误、遗漏重要边界条件，或复杂度明显劣于题目应有水平且并非用户刻意选择的简化实现。如果思路基本正确，只是描述简略或者和最优解不同但依然正确，就是 false",
    ),
  feedback: z
    .string()
    .describe(
      "中文说明，仅当 hasIssue 为 true 时需要认真填写：指出思路的问题所在，给出具体的改进建议，并对涉及的专业术语（如“双指针”“回溯”“记忆化搜索”等）做简单解释，帮助用户理解；控制在250字左右。hasIssue 为 false 时留空字符串即可",
    ),
});

export function buildSolutionReviewPrompt(options: {
  title: string;
  description: string;
  userAnswer: string;
  solutions: Solution[];
}) {
  const { title, description, userAnswer, solutions } = options;
  const solutionsBlock = solutions
    .map(
      (s, i) =>
        `解法${i + 1}（${s.approachName}，时间复杂度 ${s.timeComplexity}，空间复杂度 ${s.spaceComplexity}）：${s.approachSummary}`,
    )
    .join("\n");

  return `你是一个耐心的算法教练。下面是一道题目、AI 给出的参考解法列表，以及用户自己写的解法思路。请判断用户的思路是否存在问题。

题目：${title}
${description}

参考解法：
${solutionsBlock}

用户自己的解法思路：
${userAnswer}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名：
- hasIssue: boolean，用户的思路是否存在问题
- feedback: string，中文。如果 hasIssue 为 true，说明问题所在、给出改进建议，并解释涉及的专业术语；如果为 false，留空字符串`;
}

export const interviewAnswerReviewSchema = z.object({
  feedback: z
    .string()
    .describe(
      "中文，像一位面试教练点评用户的回答：对比标准答案指出用户回答里遗漏或可以补充的要点，给出改进建议，并对回答中涉及或应该涉及的专业术语做简明解释；即使用户回答基本正确也要指出可以完善的地方，不要只说“回答正确”；控制在250字左右",
    ),
});

export function buildInterviewAnswerReviewPrompt(options: {
  title: string;
  description: string;
  standardAnswer: string | null;
  userAnswer: string;
}) {
  const { title, description, standardAnswer, userAnswer } = options;
  return `你是一位资深技术面试教练。下面是一道面试问答题、AI 给出的标准答案，以及用户自己写的回答。请对比两者，给用户一些点评。

题目：${title}
${description}

标准答案：
${standardAnswer ?? "（暂无标准答案）"}

用户自己的回答：
${userAnswer}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名：
- feedback: string，中文，对比标准答案点评用户的回答，指出可以补充或改进的地方，并解释涉及的专业术语，250字左右`;
}

export const locateSchema = z.object({
  lines: z
    .array(z.number().int().positive())
    .describe(
      "最可能出错的代码行号（从1开始计数）。错误不一定只出在一行，如果问题横跨多行（比如循环边界+循环体、一对括号、多处相关的判断条件）就把相关的行都列出来，最多给5行；如果确实只有一行有问题，就只给1行，不要为了凑数而多给",
    ),
  explanation: z.string().describe("一句话说明为什么怀疑这些行，不要透露修复方式"),
});

export function buildLocatePrompt(options: {
  title: string;
  description: string;
  numberedCode: string;
  errorMessage?: string;
}) {
  const { title, description, numberedCode, errorMessage } = options;
  return `你是一个耐心的算法面试官。用户正在解答下面这道题，运行代码后出现了错误。请指出最可能有问题的代码行号，不要给出修复建议或正确代码。

注意：错误不一定集中在单独一行。如果这个 bug 需要看多行代码才能理解（例如循环的起止条件和循环体配合出错、一段逻辑分散在相邻几行），请把所有相关行都列出来，不要只挑一行；但也不要为了"多给"而牵连无关的行。

题目：${title}
${description}

用户代码（已标注行号）：
${numberedCode}

运行时报错/判题信息：
${errorMessage ?? "(代码运行没有抛出异常，但结果大概率不正确，请通读代码找出逻辑最可疑的行)"}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名（不要使用中文字段名或其他名称）：
- lines: number[]，最可能出错的代码行号数组（从1开始计数），可以是1个或多个，最多5个
- explanation: string，中文，一句话说明怀疑原因，不要透露修复方式或正确答案`;
}

export const interviewClassificationSchema = z.object({
  category: z
    .enum(INTERVIEW_CATEGORIES)
    .describe(
      `这道面试问答题所属的分类，必须是「${INTERVIEW_CATEGORIES.join("」「")}」四者之一`,
    ),
  standardAnswer: z
    .string()
    .describe(
      "用口语化、连贯自然的一段话给出这道题的标准回答，就像在面试里讲给面试官听一样，不要写成分点列表、不要堆砌术语，控制在300字左右",
    ),
});

export function buildInterviewClassificationPrompt(title: string, description: string) {
  return `你是一个资深技术面试官。请阅读下面这道面试问答题，完成以下工作：
1. 判断这道题所属的分类，只能从「${INTERVIEW_CATEGORIES.join("」「")}」这四类中选一个：题目描述里通常会提及这道题属于哪一类（比如提到"实习面试""项目里""前端八股""AI/大模型相关"等字眼），请优先从描述中提取；如果描述里没有明确提及，你需要自己根据题目内容判断最贴切的一类
2. 给出一段口语化、连贯自然的标准回答，就像在面试里讲给面试官听一样，不要分点、不要堆砌术语

题目标题：${title}

题目描述：
${description}

请以 JSON 格式输出，JSON 必须且只能包含以下英文字段名：
- category: string，只能是「${INTERVIEW_CATEGORIES.join("」「")}」四者之一
- standardAnswer: string，中文，口语化的一段话，300字左右`;
}

/**
 * Builds the shared history block fed into both the practice-feedback and
 * recite-chat system prompts, giving the AI permanent cross-session memory
 * of this question: every past recording (transcript + feedback) and every
 * past freeform Q&A exchange, in chronological order.
 */
export function buildInterviewContext(options: {
  title: string;
  description: string;
  standardAnswer: string | null;
  timeline: { kind: "attempt" | "chat"; createdAt: Date; text: string }[];
}) {
  const { title, description, standardAnswer, timeline } = options;

  const historyBlock =
    timeline.length === 0
      ? "（这是第一次接触这道题，还没有历史记录）"
      : timeline
          .map((entry, i) => {
            const date = new Intl.DateTimeFormat("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(entry.createdAt);
            const label = entry.kind === "attempt" ? "练习" : "问答";
            return `[第${i + 1}条 · ${label} · ${date}]\n${entry.text}`;
          })
          .join("\n\n");

  return `你是一个耐心、专业的面试教练，正在陪用户准备这道面试问答题：

题目：${title}
${description}

标准答案：
${standardAnswer ?? "（还没有标准答案）"}

这道题目前的练习历史（按时间顺序，包含每次录音转写+AI建议，以及历史问答）：
${historyBlock}

回答用中文，语气专业但友善。回复时可以参考历史记录里用户的进步或反复出现的问题，帮助用户看到自己的变化趋势。`;
}
