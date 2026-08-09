# Round-28：4 个问题（3 条代码修复 + 1 条调研结论）（2026-08-09）

> **背景：** 交接后 4 个问题。问题 1/2/4 为代码修复，问题 3 为时序调研结论。全部修复已通过 `vue-tsc --noEmit`、`pnpm run build:frontend` 与全量单测（327/327）。

## 1. 执行计划时刷新后「执行计划」按钮变为可执行（修复）

**现象：** 计划执行中（turn 进行中）刷新页面，输入框上方的计划面板回来了，且 Implement 按钮变为可点击。

**根因（实测确认）：** 两个原因叠加：

1. `implementedPlanRequestId`（App.vue）是页面内存态，用户点击 Implement 时置位 → 面板隐藏（执行中）；刷新后重置为 `null` → 面板恢复显示，且「执行中」语义丢失。
2. 兜底路径（round-27 引入）：部分 provider（OpenCode Zen）plan 只实时推送、服务端不持久化，刷新后消息流里没有 plan 消息，`composerPlanPanel` 走 `lastPlanByThreadId` 本地存档兜底。该路径 `implemented: localIndex >= 0 ? planHasLaterWork(...) : false` —— 消息流中不存在与存档同 id 的消息时 `localIndex` 恒为 -1，**`implemented` 被硬编码 false** → 即使计划后的轮次已有大量工作项，按钮仍显示可执行。

**修复（App.vue + useDesktopState.ts）：**

- `planHasLaterWork`：`candidate.turnIndex > planTurnIndex` 改为 `>=`——同一轮内 plan 项之后紧跟的工作项（「计划并执行」一轮完成）也视为已实施；`candidateIndex > index` 锚点保证同轮 plan 之前的工作项不会误判。
- 兜底路径：新增 `planHasWorkInLaterTurns`（严格晚于计划轮的轮次出现工作项即视为已实施，无 index 锚点所以只用 `>`）。计划轮序号优先用存档自带 `turnIndex`，缺失时按 `turnId` 经新暴露的 `resolveThreadTurnIndex(threadId, turnId)` 从当前线程轮次映射重新解析（刷新后 `loadMessages` 已重建 `turnIndexByTurnIdByThreadId`）。
- 刷新后按钮行为与 round-27 设计一致：计划已执行 → 「Plan executed」禁用；计划尚无任何后续工作（还在 thinking）→ 保持可点（点击即 steer 进入进行中 turn，与刷新前行为一致）。

## 2. 计划完成后计划块保留 + 按钮可点击，是否有意？（修复）

**结论：** 计划块保留是**有意**的（round-27 决定：不再整体隐藏，保留作参考）；按钮仍可点击**不是有意**的（设计上应为「Plan executed」禁用，防重复点击）。

**根因：** 与问题 1 同源——兜底路径 `implemented` 恒为 false。计划已完成后刷新，消息流中仍无 plan 消息（Zen），按钮未被禁用。

**修复：** 同问题 1（按轮次判定「后续轮次已有工作项 → implemented」）。

## 3. 还在修改代码或 Thinking 中触发 codex 自动压缩会怎么样？（调研结论）

**结论：不会中断当前 turn，压缩发生在 turn 边界。**

- **服务端自动压缩**（Codex app-server 行为）：上下文超过 `model_auto_compact_token_limit` 时，在**下一个 turn 开始前**自动压缩并生成摘要（摘要只放回模型上下文）。正在进行的 turn（改代码/Thinking）继续使用自己的完整上下文，不被中断；压缩完成后 UI 只插入一行「Context compacted」（round-27 问题 9 调研确认）。
- **客户端发送前自动压缩**（本仓库新功能）：`maybeStashForAutoCompact` 在 `inProgressById[threadId] === true` 时**直接跳过预检**（上下文已定型，steer 消息直接进当前 turn），不会在 turn 进行中触发压缩。
- **压缩中用户又发送**：消息入暂存（`stashedMessagesByThreadId`），`flushStashedForThread` 在线程空闲（`setThreadInProgress(false)`，即当前 turn 结束时）补发，不丢消息。
- **压缩 RPC 失败**（如服务端拒绝）：捕获后展示错误、清 pending，并补发暂存消息（退化为服务端兜底压缩）。
- **刷新恢复**：暂存持久化在 localStorage，刷新后 `setThreadTokenUsage` 按「检查用量 → 压缩（如需）→ 补发」恢复。

## 4. macOS 中文输入法组合期间按 Enter 消息被提前发送（修复）

**现象：** macOS 中文拼音输入中，候选词列表选字按 Enter 确认，或组合未完成时按 Enter，消息直接被发送。

**根因：** `ThreadComposer.vue` `onInputKeydown` 只判断 `event.key === 'Enter'`，未检查输入法组合状态。组合期间的 Enter 确认键会触发 `keydown`（携带 `isComposing: true` 或 `keyCode: 229`），被误判为发送。

**修复（ThreadComposer.vue）：** `onInputKeydown` 开头加守卫 `if (event.isComposing || event.keyCode === 229) return`，组合期间不触发送出与文件提及/斜杠菜单快捷键；组合结束（`compositionend`）后 Enter 正常发送。全仓库唯一 Enter 发送入口即此处（其余 `@keydown.enter` 均为对话框表单提交）。

## 验证说明

- `vue-tsc --noEmit` 通过；`pnpm run build:frontend` 通过。
- 全量单测 327/327 通过（新增 2 例：`resolveThreadTurnIndex` 已知/未知 turnId 解析）。
- 手动测试文档：`tests/chat-composer-rendering/round28-plan-panel-state-refresh-ime-composition.md`。
- 涉及文件：`App.vue`、`useDesktopState.ts`、`useDesktopState.test.ts`、`ThreadComposer.vue`。
