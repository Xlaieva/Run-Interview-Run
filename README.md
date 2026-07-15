# Run Leetcode Run

个人力扣刷题练习平台，支持 TypeScript 和 Python。粘贴题目描述，AI（千问）自动分类、提取测试用例、给出多种按效率排序的解法；然后在仿面试的无提示代码环境里刷题，配合三级递进提示、AI 问答、背题模式和智能复习安排。

## 功能一览

### 1. 添加题目 & AI 分析

在仪表盘点"添加题目"，选语言（TypeScript / Python，**添加后不能再改**），粘贴标题和完整题目描述（包含示例输入输出）。AI 会一次性完成：

- **分类**：判断算法/数据结构类别（如"动态规划""双指针"）
- **函数签名**：设计一个函数名 + 参数签名（TS 用 camelCase，Python 用 snake_case + 类型标注），作为判题和刷题起始代码的统一约定
- **测试用例**：从题目描述里的示例中提取输入输出，构造成结构化测试用例（不是让你自己写 `console.log`/`print` 猜）。参数个数/顺序和函数签名对不上是免费小模型常见的出错点，加了一层校验：生成后自动核对参数个数，对不上会重试一次，还是不对就把测试用例留空，不会让一套错位的用例悄悄进去、把本来正确的解法判成失败
- **多种解法**：给出 1-4 种解法（比如"暴力法→哈希表优化"），按时间复杂度从优到劣排序，每种解法都包含：解法名、精简思路、**口述版讲解**（口语化、连贯的一段话，供背题时用）、参考代码、时间/空间复杂度

AI 调用失败（没连网/没配 key/额度用完）不会丢数据：题目照常保存，分类等字段留空，可以在表格里点铅笔图标手动补，或者用「用 AI 重新生成」按钮重试。

### 2. 刷题页（`/problem/[id]`）

三栏布局：左边题目描述 + 分类 + 最优解复杂度；中间 Monaco 编辑器（**关闭了自动补全/悬浮提示/IntelliSense**，模拟真实面试的无提示环境）+ 运行按钮 + 输出面板；右边 AI 问答。

**判题是真的跑代码**，两个语言各有一套沙箱，判题逻辑相同（都是"函数调用模式"：起始代码带上 AI 设计的函数签名，判题时调用这个函数、传入每组测试用例的参数，把返回值和期望输出做深度比较，全部通过才算过）：

- **TypeScript**：浏览器 Web Worker + TypeScript 编译器做类型剥离后直接跑，5 秒超时防死循环，每次点"运行"都是全新沙箱。没有 AI 时还有个手动兜底的"变量 + 日志匹配模式"——不要求固定函数名，只固定顶部输入变量名（比如 `nums`、`target`），判题时把每组用例的值替换进这些变量、重新跑一遍代码，抓取最后一次 `console.log` 的输出比较（可以在编辑弹窗里手动配置）。如果最后一行是裸表达式也会自动把返回值显示出来（REPL 风格）
- **Python**：浏览器里用 Pyodide（Python 编译成 WASM）跑，同一个 Worker 会在多次"运行"之间复用，避免每次都重新加载几秒的解释器；但每次判题会给一份全新的 Python 全局命名空间，避免上一次提交的函数/变量残留污染下一次判题。超时时间 15 秒（首次加载解释器较慢）。目前只支持函数调用判题模式，没有 AI 时的手动兜底还不支持

**三级递进提示按钮**（运行失败后才能点，橙→红渐进色）：

1. 第一下：把代码和报错/失败用例发给 AI，定位最可能出错的代码行（可以是多行），在编辑器里标红高亮；改对后自动消失
2. 第二下（仍失败才能点）：AI 在右侧聊天窗给出引导性提示，不直接给答案
3. 第三下：展开参考答案代码块（如果有多个解法，用 tab 切换查看）

本次做题用了几次提示会精确对应到"一/二/三次成功"的统计列。

**AI 不可用时的自动降级**：分类、定位错误行、AI 问答任何一个接口失败（没连网/没 key/没额度），都会返回统一的"AI 不可用"信号：

- 添加题目：照常保存，字段留空，可手动补
- 提示按钮：自动变成单一的「运行并对比参考答案」——跑代码 + 把你的代码和参考答案做纯文本 diff，完全不依赖 AI
- AI 问答窗：显示不可用提示 + 重试按钮

### 3. 背题模式（`/problem/[id]/recite`）

题目表格每行有独立的"背题"按钮，进入专门用来记忆解法的页面：

- 左边：题目名 + 分类 + 最优复杂度（固定）+ 完整描述 + 每种解法对应的**口述思路**
- 中间：所有解法先以不同颜色的代码块堆叠展示，点击任意一块会放大铺满，其余解法收进顶部的 tab 栏（像浏览器标签页一样）随时切换；放大某个解法时，左边的口述思路也会同步只显示对应的那一个
- 右边：AI 问答，可以就当前解法自由提问

### 4. 复习模式

仪表盘"开始复习"旁边可以选抽查题目数量（1/3/5/8/10），点击后按下面的规则抽题：

- 系统里有 **3 个或以上**"活跃天"（有刷题/被抽查记录的日期）时：排除最近 2 个活跃天做过的题（不管是自己写的还是被抽查的），从更早的记录里抽
- **恰好 2 个**活跃天：只从较早那天做过、且当天没有再做过的题里抽
- **恰好 1 个**活跃天：就从当天做过的题里抽（没有更多历史可排除）
- 如果按规则排除后没题可抽，自动放开限制，保证不会抽不出题

选了多道题后会依次跳转：练习页顶部显示"还剩 N 道"和"下一题"按钮，抽完后变成"结束复习"。每做完一题（无论对错）都会更新"被考察时间/次数"。

### 5. 仪表盘

题目表格列：标题、分类、最优解复杂度（多解法会标注"+N 种解法"）、刷题次数、一/二/三次成功次数（色徽章）、开始刷题时间、被考察时间/次数、操作（编辑解法 / 删除 / 背题 / 做题）。删除题目会弹确认对话框，连带删除这道题的所有刷题记录。

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript。开发环境用 `--webpack`（Turbopack 的 dev 错误浮层在渲染包含中文的代码帧时有 Rust panic，会崩溃整个 dev server，生产构建不受影响，仍用 Turbopack）
- **数据库**：Neon Postgres + Drizzle ORM（`jsonb` 存解法数组/测试用例等结构化数据）
- **UI**：shadcn/ui（CLI v4，Base UI 而非 Radix 作为底层组件库）+ Tailwind CSS v4，深色主题
- **代码编辑器**：Monaco Editor，按题目语言切换（TypeScript / Python），关闭所有智能提示
- **代码执行沙箱**：
  - TypeScript：浏览器 Web Worker + TypeScript 编译器（`ts.transpileModule` 做类型剥离，不用 esbuild-wasm）
  - Python：浏览器 Web Worker + Pyodide（WASM 版 CPython + 标准库，体积较大，`npm install` 后 `postinstall` 脚本会自动把它从 `node_modules/pyodide` 复制到 `public/pyodide/` 作为静态资源，不提交进 git，每次装包自动重新生成）
- **AI**：千问 DashScope 的 OpenAI 兼容接口，通过 Vercel AI SDK v6 的 `@ai-sdk/openai-compatible` 接入，默认模型 `qwen-turbo`（免费/基础档）
- **部署**：Vercel

## 数据模型

### `problems`

| 字段 | 说明 |
|---|---|
| title / user_description | 题目标题 / 用户输入的原始描述 |
| language | `typescript` 或 `python`，创建后不可更改 |
| category | AI 分类标签 |
| solutions | jsonb 数组，按效率从优到劣排序，每项含 approachName / approachSummary / verbalExplanation（口述思路）/ solutionCode / timeComplexity / spaceComplexity |
| judge_mode | `call`（函数调用判题，默认）或 `log`（变量注入 + console.log 匹配判题） |
| function_name / function_signature | `call` 模式下判题调用的函数名与签名 |
| input_variable_names | `log` 模式下判题注入值的变量名列表 |
| test_cases | jsonb 数组，从题目示例提取（或手动填写）的测试用例 |
| total_attempts | 刷题次数（每次点"运行"就是一次提交，无论对错） |
| success_no_hint_count / success_1_hint_count / success_2_hint_count | 一 / 二 / 三次成功次数，按本次做题用了几次提示精确分类 |
| first_practice_at | 开始刷题时间（首次提交写入，之后不变） |
| last_reviewed_at / review_count | 被考察时间 / 次数（复习模式下更新） |

### `attempt_logs`

每次提交的历史记录：`problem_id`、`code`、`passed`、`hints_used`（提交时用了几次提示）、`is_review`（是否复习模式产生）、`created_at`。删除题目会级联删除对应记录。

## 首次运行前需要你手动配置的两件事

### 1. 数据库（Neon Postgres）

1. 打开 https://console.neon.tech 注册/登录，创建一个新项目（免费额度够用）
2. 在项目的 Dashboard 里找到 **Connection string**，复制类似这样的地址：
   `postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require`
3. 打开 `web/.env.local`，把它填进 `DATABASE_URL=`
4. 在 `web/` 目录下执行，建表：
   ```bash
   npm run db:push
   ```

### 2. 千问（DashScope）API Key

1. 打开 https://dashscope.console.aliyun.com/apiKey 创建一个 API Key
2. 打开 `web/.env.local`，把它填进 `DASHSCOPE_API_KEY=`
3. `QWEN_MODEL` 默认是 `qwen-turbo`（免费/基础档），需要换模型时直接改这个值，不用改代码

### 3. 启动

```bash
npm run dev
```

打开 http://localhost:3000

## 数据库常用命令

```bash
npm run db:generate   # 根据 src/db/schema.ts 生成迁移文件（可选，团队协作时用）
npm run db:push       # 直接把 schema 同步到数据库（个人项目最省事）
npm run db:studio     # 打开 Drizzle Studio 网页界面查看/编辑数据
```

## 部署到 Vercel

```bash
vercel link
vercel env add DATABASE_URL
vercel env add DASHSCOPE_API_KEY
vercel env add QWEN_MODEL
vercel --prod
```

（也可以直接在 Vercel 网页控制台的 Settings → Environment Variables 里填）
