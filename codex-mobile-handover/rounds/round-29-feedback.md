# Round-29：思考块堆在模型回答开头（锚点失效回归）（2026-08-10）

> **背景：** 用户在最新线程（dupe-finder，OpenCode Zen / deepseek-v4-flash-free，`rollout-2026-08-10T00-40-55-019fe766...jsonl`）发现：刷新/重开线程后，最后一轮思考过程块又堆在模型回答开头（一堵思考墙）。round-27 修复过「无锚点思考堆在用户消息后」，本次是新场景：**锚点存在但匹配失败**。

## 根因（实测确认）

live 阶段思考存档带时序锚点（`reasoningAnchorMessageId`），锚点 = 通知里 item 的 live id。刷新/重开线程时数据形态变化：

| 消息 | live（jsonl / 通知） | 刷新后（thread/resume 恢复） |
|---|---|---|
| 命令 | `fc_019fe769-...` | `session-cmd-call_01_...`（app-server 恢复时用 call_id 重写） |
| agent 消息 | `msg_019fe769-...` | `item-2`、`item-3`...（恢复时重新编号） |
| reasoning | `rs_1786...`（不恢复，靠本地存档） | 不出现（存档插回） |

`thread/resume`（透传 app-server 的会话恢复）返回的持久化消息 id 与 live id 完全不一致；`findReasoningAnchorIndex` 只兼容旧格式 `call_* → session-cmd-call_*`（round-26），**不兼容 `fc_* → session-cmd-call_*` 与 `msg_* → item-N`**。

`mergePersistedReasoning` 主循环中：锚点失配的思考（`anchorId` 非空）不满足 round-27 的分摊条件 `!anchorId && hasWorkItems`，落入 `lastUserIndex + 1` 分支 → **全部插到用户消息之后 =「模型回答开头」的思考墙**。round-27 只覆盖「完全无锚点」的旧存档，未覆盖「有锚点但恢复后失效」。

用真实数据形态复现（临时 vitest 模拟）：锚点 `fc_*`/`msg_*` 的 3 条思考全部堆在用户消息后、第一条命令前；无锚点思考正常分摊。

## 修复（useDesktopState.ts `mergePersistedReasoning`）

- 收集 `anchorlessByTurn` 时：锚点「存在但匹配失败」（`findReasoningAnchorIndex` 在 persisted 上找不到）的思考与无锚点同等对待，一并进入分摊列表。
- 主循环：分摊条件 `!anchorId && hasWorkItems` → `hasWorkItems`（此时 anchorId 非空必是匹配失败，与无锚点等价处理）。纯问答轮（无工作项）仍保持「提问 → 思考 → 回复」插在用户消息后，行为不变。
- 效果：刷新后思考块按存档顺序分摊到各命令/agent 消息之后，恢复「思考与工具交错」观感，不再堆成墙。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run build:frontend` 通过。
- 全量单测 328/328 通过（新增 1 例：`distributes stale anchored reasoning (bridge-rewritten ids) across work items`，覆盖 `fc_*/msg_*` 锚点失配分摊 + 原有 7 例 merge 语义兼容）。
- 涉及文件：`useDesktopState.ts`、`useDesktopState.test.ts`。
