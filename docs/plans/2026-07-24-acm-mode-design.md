# 代码刷题「普通模式 / ACM 模式」设计

日期：2026-07-24

## 背景

现有代码刷题（`call` 判题模式）只要求实现一个函数（`functionName`/`functionSignature`），判题时由 harness 直接用测试用例的 `input` 数组调用这个函数、比对返回值。这跟真实的技术笔试/面试常见的「ACM 模式」（写一个完整程序，从标准输入读数据、把结果打印到标准输出）不一样。用户希望在做题页面加一个开关，让学习者可以自己选择：这道题（`call` 模式）到底用「普通模式」（现在的函数调用方式）还是「ACM 模式」（完整程序 + stdin/stdout）来做。

## 决策纪要（brainstorming 阶段已确认）

1. **切换范围**：做题时学习者自己临时选择（类似语言选择器的交互位置，但不是创建时固定的题目属性），不修改 `problems` 表结构，不需要新的判题模式存储。
2. **适用范围**：只对 `judgeMode === "call"` 的题目生效（有 `functionName` + `testCases`）。`log`/`spec` 模式的题目在做题页面不展示这个切换（这两种模式没有天然的「一个返回值」概念，硬套 stdin/stdout 复杂度太高，收益不明确）。
3. **输入输出格式**：用固定确定性规则把 `testCases` 的结构化 `input`/`expected` 序列化成纯文本，不用 AI 参与序列化本身，保证「格式说明文字」和「实际判题用的数据」不会对不上：
   - `number` → 一行：数字本身
   - `string` → 一行：原始字符串（不加引号）
   - `boolean` → 一行：`true`/`false`
   - 一维数组（数字/字符串/布尔） → 两行：第一行长度 `n`，第二行 `n` 个元素用空格分隔
   - 二维数组 → 多行：第一行行数，之后每行是该行用空格分隔的元素
   - 其它（罕见的嵌套对象） → 兜底：一行 JSON
   - 函数的每个参数按签名顺序，依次用上面规则序列化，拼成完整 stdin；`expected` 单个返回值也用同一套规则生成期望的 stdout 文本。
4. **执行方式**：
   - **Python**：用 Pyodide 的 `setStdin({ stdin: () => 下一个字符的 charCode })` 把生成的 stdin 文本喂给运行时，用户代码里的 `input()`/`sys.stdin` **完全不用改**，是最贴近真实面试的部分。
   - **TypeScript**：worker 沙箱没有真实的流式 stdin，判题时数据本来就是一次性全量已知的，所以不模拟 Node 的 `process.stdin` 事件流程（真实模板里那套 `on('data')`/`on('end')` 纯粹是为了应付真实流式输入，这里没有对应的真实收益）。改为注入一个全局同步函数 `readline()`：每次调用返回下一行输入（`string`），没有更多输入时返回 `undefined`。
   - **判题**：运行结束后，把用户程序打印的所有行（TS 是 `console.log`，Python 是 `print`，两边都已有现成的输出捕获机制）用 `\n` 拼起来、去掉首尾空白，跟同一套序列化规则生成的期望文本做**精确字符串比对**（不是 JSON 深比较）——这是真实 ACM 判题的标准行为。
   - `TestCaseResult` 复用现有字段：ACM 模式下 `input`/`expected`/`actual` 存的是多行字符串而不是结构化值，结果面板已经用 `whitespace-pre-wrap` 渲染，天然兼容，不需要改结果展示的组件结构。
5. **UI**：
   - 开关放在 `CodeEditorPanel` 工具栏（跟语言标签并排），只有 `judgeMode === "call"` 的题目才显示。
   - 切换模式时：如果编辑器内容还是当前模式的起始模板（没被改过），直接切换重置；否则弹 `AlertDialog` 确认（会丢失当前代码）后再重置。
   - ACM 模式的起始模板：TS 是 `readline()` + `main()`，Python 是 `input()` + `main()`。
   - ACM 模式下题目描述区域上方展示一段「输入输出格式说明」，用跟序列化同一套确定性规则 + 从 `functionSignature` 解析出的参数名生成（不调用 AI），保证展示的说明和真实判题数据不会不一致。
   - 上次选择的模式存 `localStorage`（键名如 `problem-solve-mode`），作为下次打开题目的默认值；首次默认「普通模式」，不影响任何现有使用者的行为。
6. **不涉及的改动**：`problems` 表 schema、`log`/`spec` 判题模式、语言/判题模式的创建时选择器都不变。

## 主要改动点（供实现阶段参考）

- `src/lib/acm-io.ts`（新增）：序列化规则的实现——`serializeAcmValue(value): string[]`（按类型生成行数组）、`buildAcmStdin(testCase, paramNames?): string`、`buildAcmExpectedOutput(testCase): string`、以及从 `functionSignature` 解析参数名的小工具、生成「输入输出格式说明」文本的函数。这个模块是 TS/Python 两条判题路径、格式说明展示三处共用的唯一数据源。
- `src/workers/run-code.worker.ts`：新增 `runAcmMode` 分支——注入 `self.__stdinLines` + `readline()`，运行用户完整程序（走 `executeScript`，跟 `runLegacy` 类似但不做尾表达式捕获），按测试用例循环，拼接 `logs` 里 level 为 `log` 的行文本，跟期望文本比对。
- `src/workers/run-python.worker.ts`：新增等价的 ACM 分支，用 `pyodide.setStdin` 喂字符流。
- `src/lib/run-problem-code.ts` / `run-code.ts` / `run-python-code.ts`：新增 `mode: "normal" | "acm"` 透传参数。
- `src/components/practice/code-editor-panel.tsx`：新增模式切换控件（只在 `judgeMode === "call"` 时渲染）。
- `src/components/practice/practice-view.tsx`：`buildStarterTemplate` 增加 `mode` 参数；新增模式状态、`localStorage` 读写、切换确认弹窗逻辑。
- `src/components/practice/problem-panel.tsx`：ACM 模式下展示「输入输出格式说明」区块。

## 验证方式

延续本仓库现有约定：`npx tsc --noEmit` + `npx eslint` + `npm run build` 自动检查，`npm run dev` 手动在浏览器验证——包括至少一道 `call` 模式题目在 ACM 模式下用 TS 和 Python 各写一版完整程序（读 stdin、打印结果）跑通判题，以及切换模式时的重置/确认弹窗行为。
