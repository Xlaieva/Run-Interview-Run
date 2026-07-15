# 面试问答背诵平台 — 设计文档

日期：2026-07-16

## 背景与目标

现有项目"刷题台"是一个纯算法（LeetCode 风格）的刷题练习平台。本次要在同一个应用里加一个新的、独立的"面试问答背诵平台"：用户自己添加面试问答题（标题 + 问题描述），AI 生成标准答案（可手动编辑），然后通过"练习"（录音回答 + AI 点评）和"背题"（复习标准答案 + 历史记录 + 自由问答）两种模式来准备面试。

需要先做一个"大壳子"把现有刷题台包起来，再挂上新的面试问答入口。

## 1. 导航结构

- 新路由组：面试问答位于 `/interview`（仪表盘）、`/interview/[id]`（练习页）、`/interview/[id]/recite`（背题页），结构上与现有 `/`、`/problem/[id]`、`/problem/[id]/recite` 对称。
- `layout.tsx` 增加一个轻量顶部 header：应用名 + 一个汉堡菜单按钮（桌面端和移动端统一用汉堡菜单，不做单独的移动端导航组件）。菜单展开两项："算法刷题"（→ `/`）、"面试问答"（→ `/interview`）。
- 移动端断点下：隐藏（或禁用并提示"请在电脑上打开"）"算法刷题"入口，因为 Monaco 编辑器 + 代码判题在手机上不可用；"面试问答"在移动端完全可用，是移动端唯一可访问的功能。
- 首页 `/` 保持现有 `DashboardView` 不变，只是被套进新的 header 里。
- iOS Safari 细节：根 layout 的 viewport meta 加 `viewport-fit=cover`，底部锚定的控件（录音按钮、输入框）用 `env(safe-area-inset-bottom)` 留白，避免被 Home Indicator 遮挡。

## 2. 数据模型

新增两张表（`interview_questions` 之外还有 `interview_attempts`、`interview_chat_messages`），风格上与现有 `problems`/`attempt_logs` 一致。

### `interview_questions`

| 字段 | 说明 |
|---|---|
| id | uuid 主键 |
| title / user_description | 题目标题 / 用户输入的问题描述 |
| standard_answer | AI 生成、可手动编辑的单一标准答案文本（口语化，供背题时用，风格同现有 `verbalExplanation`） |
| category | AI 分类标签（可选） |
| total_attempts | 练习（录音）次数 |
| last_recording_url | 最近一次录音的 Vercel Blob URL；每次新录音覆盖旧的，旧文件同时从 Blob 删除。音频本身不永久保留历史，只保留最新一份 |
| last_practiced_at | 首次/最近一次练习时间 |
| last_reviewed_at / review_count | 被复习模式抽查的时间/次数，抽题逻辑独立于现有算法题的复习模式（各自的"活跃天"计算互不影响） |
| created_at | — |

### `interview_attempts`（每一轮"录音 → 转写 → AI 反馈"，永久保留，是 AI 长期记忆的来源）

| 字段 | 说明 |
|---|---|
| id | uuid 主键 |
| question_id | 外键，级联删除 |
| transcript | 转写文本，已在行内插入 `（沉默N秒）` 标记（只标记 ≥3 秒的静音） |
| silence_total_seconds | 静音总时长，用于统计展示 |
| recording_duration_seconds | 本次录音总时长 |
| ai_feedback | AI 参照标准答案给出的建议 |
| created_at | — |

### `interview_chat_messages`（背题模式里用户自由提问的问答，同样永久保留）

| 字段 | 说明 |
|---|---|
| id | uuid 主键 |
| question_id | 外键，级联删除 |
| role | user / assistant |
| content | — |
| created_at | — |

前端把 `interview_attempts` 和 `interview_chat_messages` 按 `created_at` 合并成一条时间线展示，练习模式和背题模式共用这条历史，也是 AI 上下文记忆的数据来源（见第 6 节）。

## 3. 添题 / 仪表盘 (`/interview`)

- **"添加题目"** 对话框：输入标题 + 问题描述。提交后 AI（沿用现有 Qwen 接入）生成 `category` + `standard_answer`。AI 失败不阻塞保存，字段留空，可手动补；同现有的"用 AI 重新生成"按钮模式。
- 表格列：标题、分类、练习次数、上次练习时间、被抽查次数、操作（编辑标准答案 / 删除 / 背题 / 练习）。
- **编辑标准答案**对话框：纯文本框手动编辑（比刷题那边简单，因为只有单一答案字段，不是多解法数组）。
- **删除**级联删除该题的 `interview_attempts`、`interview_chat_messages`，并删除 Blob 里的最近录音文件；同现有的二次确认弹窗模式。
- **开始复习**按钮：独立的抽查数量选择（1/3/5/8/10），复用现有"活跃天"排除算法，但只作用于 `interview_questions`（自己的活跃天日历，跟算法题那边分开算）。

新增 API 路由：
- `POST /api/interview`（新建 + AI 分类生成答案）
- `GET /api/interview`
- `PATCH /api/interview/[id]`（手动编辑标准答案等）
- `DELETE /api/interview/[id]`
- `POST /api/interview/[id]/classify`（重新生成）
- `POST /api/interview/review`（复习抽题）

## 4. 练习页 (`/interview/[id]`) — 录音 → 转写 → AI 反馈

**布局**：左栏上下分——上面题目标题+描述（只读），下面是录音控件。右栏：AI 对话时间线（`interview_attempts` + `interview_chat_messages` 合并，按时间顺序）+ 底部自由提问输入框。

**录音流程**：

1. 点击"开始录音" → `MediaRecorder` 开始录制（mimeType 用 `MediaRecorder.isTypeSupported()` 探测：Chrome/Firefox 用 `audio/webm;codecs=opus`，Safari/iOS 回退到 `audio/mp4`）。同时用 Web Audio 的 `AnalyserNode`，在 `requestAnimationFrame` 循环里实时采样音量，记录静音段（低于阈值持续 ≥3 秒）的起止时间戳。
2. 点击"结束录音"（同一个按钮变为"结束"态）→ 停止 `MediaRecorder` 和音量分析循环，拿到音频 Blob。
3. 客户端把 Blob（+ 实际 mimeType + 客户端检测到的静音时间戳列表）上传到新路由 `POST /api/interview/[id]/attempt`，服务端依次：
   - 把音频上传到 Vercel Blob，覆盖 `last_recording_url`（删除旧文件）。
   - 调用 Groq Whisper（`verbose_json`，带 segment 时间戳）转写。
   - 把客户端静音时间戳跟 Whisper 的文字 segment 时间戳做对齐，把 `（沉默N秒）` 标记插入转写文本里最接近的位置。
   - 调用 Qwen，system prompt 里带上题目、标准答案、该题历史所有 `interview_attempts`（时间+转写+AI建议的摘要，见第 6 节），加上这次新转写，让 AI 给出针对性反馈。
   - 落库一条新的 `interview_attempts`，返回给前端。
4. 前端拿到返回结果后，把新的一条（转写文字 + AI 建议）追加到右侧时间线——请求期间时间线显示 loading 态，转写和 AI 建议在同一次响应里一起展示，满足"结果展示的同时发送给 AI"的要求。

## 5. 背题页 (`/interview/[id]/recite`)

- 布局与练习页一致：左栏上（题目描述，只读）下（标准答案文本，单一答案不需要像算法题背题页那样堆叠多解法）；右栏是同一条 AI 时间线 + 自由提问输入框。
- 背题模式**不能录音**，右栏只用于回顾历史 + 自由问答。提交问题调用新端点 `POST /api/interview/[id]/chat`，system prompt 复用同一套骨架（题目 + 标准答案 + 历史时间线）+ 当前问题，返回后落库一条 user 消息和一条 assistant 消息。
- 因为不涉及录音，背题页不需要处理 MediaRecorder 的 iOS 兼容问题，相对轻量。

## 6. AI Prompt / 记忆设计

- 一个共享 helper `buildInterviewContext(questionId)`：拉取该题的 `interview_attempts` + `interview_chat_messages`，按时间顺序拼成"第N次练习(日期)：转写摘要 + AI建议摘要"的历史文本块，练习页和背题页的 system prompt 都复用这块历史，避免两处分别实现。
- 练习页反馈 prompt：题目 + 标准答案 + 历史时间线 + "这是新的一次录音转写" → 要求 AI 对照标准答案给出具体、可操作的改进建议（不是简单打分），并能看到"上次说……这次改进了……"的进步。
- 背题页问答 prompt：同一套骨架，用用户当前输入的问题替换"新转写"部分。

## 7. 移动端 / iOS 适配

- 响应式：练习页/背题页桌面端左右两栏（左栏内部再上下分），移动端断点下改单栏纵向堆叠：题目 → 录音控件（或标准答案）→ AI 时间线 → 输入框。用 `flex-col md:flex-row` 处理，不需要额外抽屉/弹层组件。
- 录音权限：`getUserMedia({ audio: true })` 必须在用户点击"开始录音"的 onClick 回调里直接触发（不能放进 `useEffect`），否则 iOS Safari 会拒绝。
- iOS Safari 录音格式：`MediaRecorder` 只支持 `audio/mp4`，不支持 `webm`；用 `isTypeSupported()` 探测后选择实际 mimeType 并一起传给后端，Groq Whisper 两种格式都能处理。
- 安全区：根 layout viewport meta 加 `viewport-fit=cover`；底部录音按钮/输入框加 `pb-[env(safe-area-inset-bottom)]`。
- 触摸目标：录音按钮等关键交互元素保证 ≥44px 点击区域。
- iOS 锁屏/切后台会打断录音，暂不做后台音频保活，属于合理限制。

## 8. 新增依赖 / 环境变量

- `GROQ_API_KEY`：Groq Whisper 语音转文字。
- Vercel Blob：需要开通并配置 `BLOB_READ_WRITE_TOKEN`（`vercel blob store add` 或 Marketplace），新增 `@vercel/blob` 依赖。

## 范围之外（本次不做）

- 面试问答不支持多版本答案（只有单一标准答案）。
- 不做音频历史归档，只保留最近一次录音。
- 不做后台音频录制保活。
