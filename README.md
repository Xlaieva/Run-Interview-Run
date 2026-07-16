# Run Interview Run

个人面试练习平台，包含两个模块：**代码刷题**（支持 TypeScript / Python）和**语音问答背诵**。两个模块共用同一套流程：添加题目 → AI（千问）自动分类、生成参考内容 → 仿面试环境练习 → AI 提示 / 反馈 → 背题巩固 → 智能复习安排。区别只在载体：刷题模块练的是在无提示代码环境里写代码，问答模块练的是对着录音口述回答。

页面顶部提供可拖动的浮动导航，用于在模块间切换：靠近左、右、上、下边缘会自动吸附，移出后收起，悬停展开，点击图钉可固定。两个模块的做题页和背题页都会自动隐藏这个导航，避免和页面内容抢位置。

## 添加题目 & AI 分析

两个模块的入口都是各自仪表盘上的"添加题目"：粘贴标题和完整描述，也可以先写下自己的解题思路或回答——原文会被保留，AI 仅在发现问题时给出改进建议，不会改写你的内容。随后 AI 一次性生成参考内容，两个模块各有侧重：

**刷题题目**（添加时需选语言 TypeScript / Python，**添加后不能再改**）：

- **分类**：判断算法/数据结构类别（如"动态规划""双指针"）
- **函数签名**：设计一个函数名 + 参数签名（TS 用 camelCase，Python 用 snake_case + 类型标注），作为判题和刷题起始代码的统一约定
- **测试用例**：从题目描述里的示例中提取输入输出，构造成结构化测试用例（不是让你自己写 `console.log`/`print` 猜）。参数个数/顺序和函数签名对不上是免费小模型常见的出错点，加了一层校验：生成后自动核对参数个数，对不上会重试一次，还是不对就把测试用例留空，不会让一套错位的用例悄悄进去、把本来正确的解法判成失败
- **多种解法**：给出 1-4 种解法（比如"暴力法→哈希表优化"），按时间复杂度从优到劣排序，每种解法都包含：解法名、精简思路、**口述版讲解**（口语化、连贯的一段话，供背题时用）、参考代码、时间/空间复杂度

**面试问答题目**（比如"讲讲你对 REST 和 GraphQL 的理解"）：

- **分类**：固定四选一——`实习` / `AI八股` / `前端八股` / `项目`。题目描述里如果已经点明所属分类（比如开头写"实习："），AI 优先按描述里的说法分类；没写明的话由 AI 自行判断
- **标准答案**：单一、口语化，供背题时对照记忆，可手动编辑
- 如填写了自己的回答，还会给出即时的对比建议和术语解释
- 以上内容会依次写进这道题的问答记录（`interview_chat_messages`）：先是你提交的题目本身，然后是 AI 标准答案，如果填写了个人回答，接着是这条回答和 AI 给出的建议——练习页/背题页的问答时间线从创建那一刻起就是这个顺序，不是空白的

**AI 不可用时的统一容错**：AI 调用失败（没连网/没配 key/额度用完）不会丢数据——题目照常保存，分类、解法、标准答案等 AI 字段留空，可以在表格里点铅笔图标 / 编辑按钮手动补，或者用「用 AI 重新生成」按钮重试。两个模块的容错逻辑完全一致。

## 练习

### 刷题页（`/problem/[id]`）

三栏布局：左边题目描述 + 分类 + 最优解复杂度；中间 Monaco 编辑器（**关闭了自动补全/悬浮提示/IntelliSense**，模拟真实面试的无提示环境）+ 运行按钮 + 输出面板；右边 AI 问答。

**判题是真的跑代码**，两个语言各有一套沙箱，判题逻辑相同（都是"函数调用模式"：起始代码带上 AI 设计的函数签名，判题时调用这个函数、传入每组测试用例的参数，把返回值和期望输出做深度比较，全部通过才算过）：

- **TypeScript**：浏览器 Web Worker + TypeScript 编译器做类型剥离后直接跑，5 秒超时防死循环，每次点"运行"都是全新沙箱。没有 AI 时还有个手动兜底的"变量 + 日志匹配模式"——不要求固定函数名，只固定顶部输入变量名（比如 `nums`、`target`），判题时把每组用例的值替换进这些变量、重新跑一遍代码，抓取最后一次 `console.log` 的输出比较（可以在编辑弹窗里手动配置）。如果最后一行是裸表达式也会自动把返回值显示出来（REPL 风格）
- **Python**：浏览器里用 Pyodide（Python 编译成 WASM）跑，同一个 Worker 会在多次"运行"之间复用，避免每次都重新加载几秒的解释器；但每次判题会给一份全新的 Python 全局命名空间，避免上一次提交的函数/变量残留污染下一次判题。超时时间 15 秒（首次加载解释器较慢）。目前只支持函数调用判题模式，没有 AI 时的手动兜底还不支持

**三级递进提示按钮**（运行失败后才能点，橙→红渐进色）：

1. 第一下：把代码和报错/失败用例发给 AI，定位最可能出错的代码行（可以是多行），在编辑器里标红高亮；改对后自动消失
2. 第二下（仍失败才能点）：AI 在右侧聊天窗给出引导性提示，不直接给答案
3. 第三下：展开参考答案代码块（如果有多个解法，用 tab 切换查看）

本次做题用了几次提示会精确对应到"一/二/三次成功"的统计列。

**AI 不可用时的自动降级**：分类、定位错误行、AI 问答任何一个接口失败，都会返回统一的"AI 不可用"信号：

- 提示按钮：自动变成单一的「运行并对比参考答案」——跑代码 + 把你的代码和参考答案做纯文本 diff，完全不依赖 AI
- AI 问答窗：显示不可用提示 + 重试按钮

### 面试练习页（`/interview/[id]`）：录音 → 转写 → AI 反馈

三栏布局：左边题目描述 + 标准答案；中间录音面板；右边时间线（历史练习 + 问答记录）+ 问答输入框。

- **录音**：点"开始录音"用浏览器 `MediaRecorder` 采集音频（iOS Safari 下会退化用 `audio/mp4` 格式），同时用 Web Audio 的音量分析在客户端实时探测静音区间
- **转写**：录音结束后上传到后端，调 Groq 的 Whisper（默认 `whisper-large-v3-turbo`）转成文字；再按 Whisper 返回的分段时间戳，把客户端探测到的静音区间插回转写文本里对应的位置，标成"（沉默N秒）"——只标 ≥3 秒的静音，正常说话间的小停顿不会被打断成一堆碎标记
- **AI 反馈**：转写完成后，AI（千问）对照这道题的标准答案给出具体、可操作的反馈。这一步带**跨会话记忆**：每次生成反馈前，会把这道题目此前所有的练习记录（转写 + 反馈）和问答记录按时间顺序拼成上下文一起发给 AI，所以从第二次练习开始，AI 能感知到"上次哪里说漏了、这次有没有改进"，而不是每次都从零反馈
- **录音存储**：只保留**最近一次**录音（存在 Vercel Blob），每次提交新录音会覆盖并删除上一条文件；但转写文字、AI 反馈、问答记录会永久保留，不会随录音一起清掉

转写接口失败时同样走统一的"AI 不可用"信号，页面提示重试即可，不影响其他功能。

## 背题模式

两个模块的题目表格每行都有独立的"背题"按钮，进入专门用来记忆的页面，右侧都是可以自由提问的 AI 问答。两个背题页顶部、"返回"按钮旁都有一个倒计时控件：默认关闭，展开可选 5/10/15 分钟；计时期间可以点"+1 分钟"临时延长；时间一到会自动跳转回对应的做题页（`/problem/[id]` 或 `/interview/[id]`），不会有额外确认提示，用来强制自己限时背题：

- **刷题背题页（`/problem/[id]/recite`）**：页面始终维持在视口高度内，左、中、右三栏按各自内容独立滚动。左边是题目名、分类、最优复杂度、完整描述，以及创建题目时填写的"我的答案"；中间每种解法卡片将**口述思路**和参考代码组合展示，点击任意卡片会放大该解法，其余解法收进顶部 tab 栏，可随时切换；右边可以就当前解法自由提问
- **问答背题页（`/interview/[id]/recite`）**：和练习页共享同一套时间线组件和问答输入框，区别是不用录音——左边直接展示标准答案供对照记忆，右边就这道题自由提问 AI。问答同样写进 `interview_chat_messages`、永久保留，并会被纳入下次练习生成反馈时的上下文

## 复习模式

两个模块的仪表盘上都有"开始复习"，旁边可以选抽查题目数量（1/3/5/8/10）。抽题规则完全同构，但各自基于自己模块的练习记录独立计算"活跃天"日历，互不影响：

- 系统里有 **3 个或以上**"活跃天"（有练习/被抽查记录的日期）时：排除最近 2 个活跃天做过的题（不管是自己做的还是被抽查的），从更早的记录里抽
- **恰好 2 个**活跃天：只从较早那天做过、且当天没有再做过的题里抽
- **恰好 1 个**活跃天：就从当天做过的题里抽（没有更多历史可排除）
- 如果按规则排除后没题可抽，自动放开限制，保证不会抽不出题

选了多道题后会依次跳转到对应的练习页：顶部显示"复习模式"徽章、"还剩 N 道"和"下一题"按钮，抽完后变成"结束复习"。每做完一题（无论对错）都会更新这道题的被考察/被复习时间和次数。

## 仪表盘

- **刷题仪表盘（`/`）**：题目表格列包括标题、分类、最优解复杂度（多解法会标注"+N 种解法"）、刷题次数、一/二/三次成功次数（色徽章）、开始刷题时间、被考察时间/次数、操作（编辑解法 / 删除 / 背题 / 做题）。删除题目会弹确认对话框，连带删除这道题的所有刷题记录
- **面试题仪表盘（`/interview`）**：表格每行提供编辑标准答案 / 删除 / 练习 / 背题四个操作。删除题目会级联删除这道题下的所有练习记录和问答记录，并顺带清理 Vercel Blob 里它最后一条录音文件

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19 + TypeScript。开发环境用 `--webpack`（Turbopack 的 dev 错误浮层在渲染包含中文的代码帧时有 Rust panic，会崩溃整个 dev server，生产构建不受影响，仍用 Turbopack）
- **数据库**：Neon Postgres + Drizzle ORM（`jsonb` 存解法数组/测试用例等结构化数据）
- **UI**：shadcn/ui（CLI v4，Base UI 而非 Radix 作为底层组件库）+ Tailwind CSS v4，深色主题
- **代码编辑器**：Monaco Editor，按题目语言切换（TypeScript / Python），关闭所有智能提示
- **代码执行沙箱**：
  - TypeScript：浏览器 Web Worker + TypeScript 编译器（`ts.transpileModule` 做类型剥离，不用 esbuild-wasm）
  - Python：浏览器 Web Worker + Pyodide（WASM 版 CPython + 标准库，体积较大，`npm install` 后 `postinstall` 脚本会自动把它从 `node_modules/pyodide` 复制到 `public/pyodide/` 作为静态资源，不提交进 git，每次装包自动重新生成）
- **AI**：千问 DashScope 的 OpenAI 兼容接口，通过 Vercel AI SDK v6 的 `@ai-sdk/openai-compatible` 接入，默认模型 `qwen-turbo`（免费/基础档）
- **语音转文字**：面试问答模块的录音转写走 Groq 的 Whisper（默认 `whisper-large-v3-turbo`），走 REST API 直连（不经过 Vercel AI SDK），拿 `verbose_json` 里的分段时间戳来对齐静音标记
- **录音存储**：Vercel Blob，只存面试问答模块每道题最近一次的录音，`public` 访问级别
- **部署**：Vercel

## 数据模型

### `problems`（刷题题目）

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
| user_answer | 创建题目时填写的个人思路或答案，原文保存 |
| answer_feedback | AI 对个人答案的建议；仅在发现问题时保存 |
| total_attempts | 刷题次数（每次点"运行"就是一次提交，无论对错） |
| success_no_hint_count / success_1_hint_count / success_2_hint_count | 一 / 二 / 三次成功次数，按本次做题用了几次提示精确分类 |
| first_practice_at | 开始刷题时间（首次提交写入，之后不变） |
| last_reviewed_at / review_count | 被考察时间 / 次数（复习模式下更新） |

### `attempt_logs`（刷题提交记录）

每次提交的历史记录：`problem_id`、`code`、`passed`、`hints_used`（提交时用了几次提示）、`is_review`（是否复习模式产生）、`created_at`。删除题目会级联删除对应记录。

### `interview_questions`（面试问答题目）

| 字段 | 说明 |
|---|---|
| title / user_description | 题目标题 / 用户输入的问题描述 |
| category | AI 分类标签，固定四选一：`实习` / `AI八股` / `前端八股` / `项目`，描述里点明的优先按描述分类，没点明由 AI 自行判断 |
| standard_answer | AI 生成、可手动编辑的单一标准答案（口语化，供背题时用） |
| user_answer | 创建题目时填写的个人回答，原文保存 |
| total_attempts | 练习（录音）次数 |
| last_recording_url | 最近一次录音的 Vercel Blob 地址，每次新录音覆盖旧的（旧文件同时从 Blob 删除） |
| last_practiced_at | 最近一次练习时间 |
| last_reviewed_at / review_count | 被复习模式抽查的时间 / 次数，抽题逻辑独立于刷题模块，有自己的活跃天日历 |

### `interview_attempts`（面试练习记录）

每一轮"录音 → 转写 → AI 反馈"，永久保留：`question_id`、`transcript`（已插入"（沉默N秒）"标记的转写文本）、`silence_total_seconds`、`recording_duration_seconds`、`ai_feedback`、`is_review`、`created_at`。删除题目会级联删除对应记录。

### `interview_chat_messages`（面试问答记录）

背题页里自由问答产生的问答记录，同样永久保留：`question_id`、`role`（user / assistant）、`content`、`created_at`。和 `interview_attempts` 一起按时间顺序合并展示，也是 AI 生成反馈/回答时的上下文来源。题目创建时会预先写入几条打底：用户提交的题目本身（role=user）、AI 标准答案（role=assistant），如果当时填了个人回答，还有这条回答（role=user）和 AI 建议（role=assistant）。

## 首次运行前需要你手动配置的几件事

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

### 3. Groq（语音转文字，只有面试问答模块的练习页需要）

1. 打开 https://console.groq.com/keys 创建一个 API Key（有免费额度）
2. 打开 `web/.env.local`，把它填进 `GROQ_API_KEY=`
3. `GROQ_STT_MODEL` 默认是 `whisper-large-v3-turbo`，需要换模型时直接改这个值
4. 没配这一项也不影响刷题模块和面试问答的其他功能，只有点"开始录音"提交后的转写会返回"AI 暂时不可用"

### 4. Vercel Blob（录音存储，同样只有练习页需要）

1. 在 Vercel 项目的 Storage 标签页里新建一个 Blob store（或用 `vercel blob store add`），关联到当前项目
2. 拉取环境变量到本地：`vercel env pull .env.local`（会自动写入 `BLOB_READ_WRITE_TOKEN`），或者手动去 Vercel 控制台复制这个 token 填进 `web/.env.local`
3. 同样，没配这一项时练习页录音会在上传环节报错，其余功能不受影响

### 5. 启动

```bash
npm run dev
```

打开 http://localhost:3000。添加题目、生成解法/标准答案、背题页问答走的都是千问，配好第 2 步就能用；面试练习页的录音转写额外需要第 3、4 步配好的 Groq key 和 Blob token 才能跑通完整流程，建议配好后自己录一段测试一下。

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
vercel env add GROQ_API_KEY
vercel env add BLOB_READ_WRITE_TOKEN
vercel --prod
```

（也可以直接在 Vercel 网页控制台的 Settings → Environment Variables 里填）
