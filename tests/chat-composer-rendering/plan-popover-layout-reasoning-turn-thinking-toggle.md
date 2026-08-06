# Plan popover layout, reasoning turn placement, thinking font, live interleave

2026-08-06 第十四轮反馈 8 项修复：plan popover 重排版（标题/摘要/步骤）、reasoning-block 按轮次归位（不再串到新轮次）、已实施计划面板隐藏、思考内容字体灰色缩小、live overlay Thinking 可收起/展开、live 消息按到达顺序交错、审核/询问面板与输入框同宽、暗色主题覆盖迁入全局样式表。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`，PATH 需含 fnm node 与 `AppData\Local\pnpm\bin`）
- 带 plan 的历史线程：「重命名小工具」（plan 已实施、含 2 轮次）与「长任务测试」（plan 未实施）
- Playwright（本机 Edge channel）用于 DOM 断言

## 1. Plan popover 重排版（标题 / 摘要 / 步骤）

**背景**：点击输入框上方 🗒 计划条弹出的 popover 之前只有一段 explanation + 步骤列表，无标题、无分区标签、面板 4px 内边距，视觉上「没有样式」。

**操作**：

1. 打开「长任务测试」线程（plan 未实施）
2. 点击 `.thread-composer-plan-panel-header` 展开 popover

**验证**：

- `.thread-composer-plan-panel-popover-head` 含 `🗒 Plan N/M` 标题行，`border-b` 分隔
- `.thread-composer-plan-panel-section-label` 分区标签 `Summary`（摘要）与 `Steps (N)`（步骤）
- `.thread-composer-plan-panel-explanation` 摘要文本、`.thread-composer-plan-panel-step` 步骤列表（状态图标 ○/•/✓）
- `.thread-composer-plan-panel-implement` 底部执行按钮
- popover 面板 `padding: 0`，内容容器 `padding: 10px`，明暗主题齐全（暗色下标题行边框 zinc-700）

## 2. 思考块按轮次归位（reasoning-block 不再串到新轮次）

**背景**：本地存档的 thinking 消息此前统一追加在消息流末尾，上一轮的思考块会显示在下一轮会话之后。

**操作**：

1. 向 localStorage 写入带 `turnIndex` 的 reasoning 存档（`codex-web-local.thread-reasoning.v1`，key 为线程 id，消息含 `turnId`/`turnIndex`）
2. 重新加载线程，观察 `.reasoning-block` 的位置

**验证**：turnIndex=0 的思考块紧跟第 1 轮用户消息之后（第 1 条 message-row 之后），turnIndex=1 的思考块紧跟第 2 轮用户消息之后；两条都不在消息流末尾。无 turnIndex 的旧存档仍追加在末尾（兼容）。

## 3. 已实施计划的面板隐藏

**背景**：计划实施完成后（用户点过 Implement，或后续轮次已有工作消息），输入框上方的计划面板此前仍残留（仅按钮置灰）。

**操作**：

1. 打开「重命名小工具」线程（turn 1 产出 plan，turn 2 执行并失败）
2. 观察输入框上方

**验证**：`.thread-composer-plan-panel` 不存在（已实施 → 隐藏）；「长任务测试」线程（未实施）面板仍显示且按钮可点。

## 4. 思考内容字体灰色 + 缩小

**操作**：展开任一 `.reasoning-block`（点击 header）。

**验证**：`.reasoning-block-content` 内 `.message-text` 计算样式 `font-size: 13px`（普通消息 14px）、颜色 zinc-500（普通消息 slate-800）；暗色下 zinc-400。summary 保持 `text-xs` zinc-500。

## 5. live overlay Thinking 可收起/展开

**背景**：思考阶段 live overlay 的 reasoning 文本流之前不可折叠。

**操作**：

1. 发起一个产生 reasoning 流的 turn
2. 消息流底部 overlay 出现 `.live-overlay-heading`（含活动标签 + `▾` 折叠箭头）
3. 点击 heading 收起，再点击展开

**验证**：`.live-overlay-heading` 存在且 `aria-expanded` 随点击切换；收起后 `.live-overlay-reasoning` 隐藏，展开后恢复。默认展开（保持原有展示）。

## 6. live 消息按到达顺序交错（不再「命令一堆、文本一堆」）

**背景**：messages computed 之前把 livePlan/liveCommands/liveFileChanges/liveAgent 四组按组拼接，流式阶段命令、文本、思考各自扎堆。

**操作**：

1. 发送「依次运行三个命令，每个命令前后用一句话说明你在做什么」这类任务
2. 在 turn 进行中每 2 秒采样 `.message-row` 的 `data-message-type`

**验证**：流式阶段顺序为 `agentMessage.live → commandExecution → agentMessage.live → commandExecution …` 交错出现（不是先全部命令再全部文本）；turn 结束后持久化顺序同样交错（user → reasoning → 命令 → 文本 → 命令 → worked → 文本）。

## 回滚

- 无数据变更；测试写入的 thinking 存档位于 localStorage `codex-web-local.thread-reasoning.v1`，清除即可。
