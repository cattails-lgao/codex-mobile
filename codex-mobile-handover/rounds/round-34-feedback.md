# Round-34：processFold 时序恢复 + fileChange 行布局左移（2026-08-11）

> **背景：** 用户提供线上 rollout JSONL（12 轮长会话、87 次工具调用，`exec_command`/`write_stdin`/`apply_patch` 混排且含大量空文本 assistant 消息），反馈两个问题：① 消息列表中工具调用块 `data-message-type="processFold"` 全跑到对话前面；② 文件变更块 `data-message-type="fileChange"` 每行需要重新布局——变更数字和撤销按钮要放在最左边。

## 问题一：processFold 工具调用块全跑到对话前面

**根因（线上 rollout 实测确认）：** `buildSessionItemOrder`（`codexAppServerBridge.ts`）把 rollout 中**每条** assistant 消息都记为 `agentMessage` slot。模型在工具调用间隙会发大量空文本消息（实测 turn 4：13 条 `content: [{type:'output_text', text:''}]` + 4 条有文本），`agentSlotCount` 被虚高到 17；而 app-server 物化后该轮 agentMessages 仅 4 条。`mergeSessionCommandsIntoTurns` 比较 `agentMessages.length(4) < agentSlotCount(17)` 成立，误判「物化合并了轮内回复」，走「命令排前、回复追加轮末」分支——18 条命令 + 3 个 fileChange 全部堆到 4 条回复之前，UI 上即所有工具调用块跑到对话前面。

**修复（`codexAppServerBridge.ts`）：** assistant 消息只有当其 `content` 含非空 `text` 时才记为 `agentMessage` slot；空文本消息不再计入，`agentSlotCount` 与实际物化回复数对齐，恢复走「按 rollout 原始交错顺序」的 else 分支。

**验证：** 用该线上 rollout 本地复现（CODEX_HOME 指向临时目录 + Playwright）。修复前 turn 4 渲染为 `processFold(12 commands) + processFold(6 commands)` 连排在回复前；修复后为 `3 commands → 回复 → 9 commands → 回复 → 6 commands → 最终回复`，与 rollout 真实时序一致。新增单测 `interleaves commands with text-bearing agent replies in rollout order` 覆盖空/有文本 assistant 混排场景，22 个相关用例全过。

## 问题二：fileChange 每行布局——变更数字和撤销按钮放最左边

**根因（代码确认）：** `FileChangeSummaryBlock.vue` 的 `.file-change-delta`（变更数字）和 `.file-change-file-undo-button`（单文件撤销）都带 `ml-auto`，被推到行尾；用户要求放行首。

**修复（`FileChangeSummaryBlock.vue`）：** 每行元素顺序调整为 `变更数字 → 撤销按钮 → 操作 badge → 文件路径`，去掉两处 `ml-auto` 靠左对齐。暗色主题同步生效（Tailwind 无主题分支，仅调整类名）。

**验证：** Playwright DOM 断言：delta 与 undo 均位于 badge/path 左侧、undo 紧贴 delta（亮色与暗色均通过）；`vue-tsc --noEmit` 通过；前端 `vite build` 成功。

## 涉及文件与提交

- `src/server/codexAppServerBridge.ts`（空 assistant 不计 agent slot）
- `src/components/content/FileChangeSummaryBlock.vue`（行布局左移）
- `src/server/codexAppServerBridge.inlinePayload.test.ts`（新增交错顺序用例）
- `tests/chat-composer-rendering/round34-process-fold-order-and-file-change-layout.md`（手动测试文档 + 索引登记）
- 提交：`05eecc7`（已推送）
