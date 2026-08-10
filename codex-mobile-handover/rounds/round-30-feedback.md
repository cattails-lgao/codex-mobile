# Round-30：计划面板 implemented 判定（加载中/单轮）+ 压缩块刷新后归位（2026-08-10）

> **背景：** 用户基于「Markdown 图片本地化下载器」长任务线程（单 turn、plan 不持久化、含 `contextCompaction` item，`rollout-2026-08-10T10-58-54-019fe99b...jsonl`）反馈 3 个刷新后状态问题：①执行计划中刷新，计划面板执行按钮短暂可点击、plan 状态消失，过一会恢复；②单轮长任务对话完成后 plan 已完成但执行按钮仍可点击；③任务中途自动压缩，刷新后 `thread-compaction-inline` 压缩块跑到当前对话轮最后。

## 问题 1：刷新加载期间执行按钮可点击 + plan 状态消失

**根因（代码确认）：** `composerPlanPanel` 的兜底路径（plan 不持久化时走 `lastPlanByThreadId` 本地存档）依赖 `resolveThreadTurnIndex` 解析计划轮序号，而该映射在刷新后要等 `loadMessages` 完成才重建。加载完成前 `localTurnIndex = -1` → `implemented: false` → 按钮短暂可点击；加载完成后映射就绪 → implemented 变 true → 恢复正常。同时兜底路径 `streaming` 恒为 false，执行中刷新丢失「Updating/执行中」状态。

**修复（`App.vue` `composerPlanPanel`）：** 两条路径（消息流内 plan + 本地存档兜底）在 `isLoadingMessages` 期间 implemented 强制 true（禁用按钮，防误触发重复 Implement），加载完成后按真实消息重判；兜底路径 `streaming` 改为跟随存档 `messageType === 'plan.live'`（保留执行中状态）。

## 问题 2：单轮长任务对话完成后执行按钮仍可点击

**根因（真实数据确认）：** 该线程全部工作项与 plan 同轮（`turnIndex` 相同，单 turn 长任务）。兜底路径 `planHasWorkInLaterTurns` 用 `turnIndex > planTurnIndex`（严格大于）判定「后续轮次有工作项」→ 同轮工作项恒不匹配 → implemented 恒 false → 按钮可点击。

**修复（`App.vue` `planHasWorkInLaterTurns`）：** `>` 改为 `>=`（计划轮及之后出现工作项即视为已实施）。无 index 锚点的兜底路径用 `>=` 安全：同一轮内 plan 先于工作项（模型先给计划再执行），round-28 的消息流内路径 `planHasLaterWork` 本就使用 `>=`，两条路径语义对齐。

## 问题 3：刷新后压缩块跑到对话最后

**根因（真实数据确认）：** 服务端把 `contextCompaction` item 固定在 turn items 末尾（实测该线程 index 107/108、无时间戳字段），归一化后按服务端顺序渲染 → 刷新后「Context compacted」出现在整个对话最后，与压缩实际发生时点（会话中途）不符。live 注入路径（`injectCompactionMessage`）位置正确，仅持久化路径错位。

**修复（`v2.ts`）：** `normalizeThreadMessagesV2` 归一化后新增 `repositionCompactionAfterUserMessage`：把保留的 `compaction.done` 移到其所属轮次第一条用户消息之后（压缩是 turn 边界动作，语义上归位轮首）；无同轮用户消息时保持原序。刷新前（live 注入）与刷新后位置一致。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run build:frontend` 通过。
- 全量单测 330 用例：328 通过 + 2 个既有 Windows 环境性失败（`codexAppServerBridge.archive.test.ts` symlink EPERM / chmod 权限位，与本次改动无关）；新增 2 例（压缩块归位 + 无用户消息时保持原位）。
- Playwright（本机 Edge channel）实测：
  - `r30-compaction-check.cjs`：真实长任务线程压缩块位于 user 消息之后第 1 位（`compIndex: 1`，`compAtLast: false`），不再跑到对话最后。
  - `r30-plan-panel-check.cjs`：注入 `turnIndex: 0` 的 plan 存档 + 真实单轮工作线程，执行按钮 `disabled: true`、`data-state: done`、文案「Plan executed」。
  - 截图：`output/playwright/r30-compaction-placement.png`、`r30-plan-panel.png`。
- 涉及文件：`App.vue`、`api/normalizers/v2.ts`、`api/normalizers/v2.test.ts`、`tests.md`、`tests/chat-composer-rendering/index.md`、新增 `tests/chat-composer-rendering/round30-plan-state-refresh-compaction-placement.md`。
