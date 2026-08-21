# Round-52：多 agent 对话进行中重复 agentMessage 块 + message-toolbar 闪现（纯诊断，待修复）

> **背景：** 真机多 agent（主子孙）对话过程中，消息流出现两个现象：① 同一轮过程中出现重复的 `data-message-type="agentMessage"` 块；② 进行中这些块上出现 `class="message-toolbar"`。当会话结束或刷新后，重复块与 toolbar 消失。本轮按两份最新 rollout 完成根因定位，暂未改动代码（见「待办」）。

## 现象与时机

- 仅在**进行中**（live）出现：重复的 agentMessage 块 + 每块上的 message-toolbar。
- **会话结束（turn/completed 清 live）或刷新后即消失**。

「结束/刷新即消失」是定位的关键——它说明持久化/刷新路径有去重兜底，缺口只在 live 合并。

## 根因（依据 rollout 的逐字证据）

对比最新多 agent 会话的两份 rollout：

- 父线程 `~/.codex/sessions/2026/08/21/rollout-2026-08-21T17-00-27-01a0238c-….jsonl`
- 子代理 Laplace 线程 `~/.codex/sessions/2026/08/21/rollout-2026-08-21T17-01-02-01a0238d-….jsonl`

两文件第 21 行的 `agent_message` 是**逐字完全相同**的全文（规范化后长度 58）：

> `好的！我来演示一下主-子-孙三代代理，看看每层能用什么工具…`

同一段助手文本在父线程与子代理线程各出现一次，但各自持有**不同的 item 消息 id**（`msg_…c…` vs `msg_…d…`）。

据此推断的机制：

1. **重复块**：同一段文本以两个不同 id 进入渲染流。live 合并只按 id 去重——[useDesktopState.ts](src/composables/useDesktopState.ts) 的 `mergeLiveMessages`（仅 `unique` 按 `message.id`），对「同文本不同 id」的两条无法合并 → 一条副本被渲染。
2. **toolbar 闪现**：round-51/round-40 把 `readAgentMessageCompleted` 的已完成条目从 `agentMessage.live` 改成**非 live** 的 `agentMessage`（见 [useDesktopState.ts](src/composables/useDesktopState.ts) `readAgentMessageCompleted`），使进行中每条完成的助手块按普通消息分支渲染（[ThreadConversation.vue](src/components/content/ThreadConversation.vue) 的 `MessageToolbar`）→ 进行中挂出 toolbar。
3. **结束/刷新消失**：`removeRedundantLiveAgentMessages`（[useDesktopState.ts](src/composables/useDesktopState.ts)）正是按**规范化文本**把 live 中与持久化相同文本的副本剪掉；而进行中无此文本级去重，故只在 live 暴露。

一句话：**live agent 消息缺「规范化文本去重」，持久化路径有它在做兜底。**

## 涉及代码（仅定位，未改动）

- `src/composables/useDesktopState.ts`
  - `mergeLiveMessages`（live 组间只按 id 去重）
  - `removeRedundantLiveAgentMessages`（轮末/刷新按文本去重 —— 现成的去重基准，含 `normalizeMessageText`）
  - `readAgentMessageCompleted`（round-51 改为非 live；是 toolbar 闪现的触发点）
- `src/components/content/ThreadConversation.vue`（`MessageToolbar` 渲染于普通消息分支）

## 建议修复方向（最小改动，未实施）

给 `mergeLiveMessages`（或 live agent 组内）复用 `removeRedundantLiveAgentMessages` 同款 `normalizeMessageText`，对同一线程/turn 内规范化后相等且非空的助手文本只保留一条——与现有轮末/刷新去重语义一致，不影响真正连续的多段助手回复（文本不同）。

## 待办

- [ ] 实施上述 live 文本去重
- [ ] 补单测（对齐 round-40 风格：delta 与 completed 同文本不同 id → live 中只保留一条）
- [ ] `vue-tsc --noEmit` + 单测通过
- [ ] 4173 起服真机核对：进行中重复块与 toolbar 消失，结束/刷新行为不变

## 涉及文件（本轮仅文档）

- `codex-mobile-handover/rounds/round-52-duplicate-agent-live.md`（本文件）
- `codex-mobile-handover/codex-mobile-handover.md`（索引快照）

## 本轮提交

- 文档记录（本提交为新 round-52 条目，未触碰代码，无版本号/发布）