# Round-66：v0.1.111 发布（回退功能修复 ×2 + 现有线程乐观 UI）

> **范围：** 收录三处改动，随 v0.1.111 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，npm publish 由用户执行。`vue-tsc` 通过、`pnpm run build` 通过（web + CLI）、`useDesktopState.test.ts` 90/90 通过。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `762ef69` | ①回退不再静默失效 + 保留目标轮次：`rollbackSelectedThread` 的 `turnIndex` 在持久化消息缺失时从 `turnIndexByTurnIdByThreadId` 状态映射兜底获取（此前算成 `-1` 直接无操作）；`numTurns` 计算从 `maxTurnIndex - turnIndex + 1` 改为 `maxTurnIndex - turnIndex`（此前回退 1 轮会连目标轮一并删除、清空线程） |
| `7d50f54` | ②服务端解析 `function_call` 格式的 apply_patch：codex CLI `0.149.1+` 把 `apply_patch` 记录为 `response_item` 的 `function_call`（patch 内容在 `arguments.command`），旧版才是 `custom_tool_call.input`；`session.ts` 的 `collectFileChangesForTurns` 两种格式都收集，回退文件变更不再报「No turns to revert」 |
| `aca350e` | ③现有线程发送消息立即显示：`sendMessageToSelectedThread` 的现有线程两个发送路径（空闲、进行中）补上 `appendOptimisticUserMessage`，发送瞬间把用户消息插入列表，不再先显示 `Thinking` 再等用户消息；乐观行由既有 `mergeMessages` 去重在服务端返回真实消息时无缝替换 |

## 改动要点

1. **回退保留目标轮次**：`useDesktopState.ts` 的 `rollbackSelectedThread` 中，`turnIndex` 取不到时回退到 `turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]`；`numTurns = maxTurnIndex - turnIndex` 只删除目标轮之后的轮次。配套更新 `useDesktopState.test.ts` 回退用例（`numTurns: 2` → `numTurns: 1`）。
2. **服务端 apply_patch 双格式解析**：`session.ts` 的 `collectFileChangesForTurns` 对 `response_item` 同时处理 `custom_tool_call.input`（旧）与 `function_call.arguments.command`（CLI 0.149.1+），新增可移植 fixture 单测 `session.rollback-verify.test.ts` 锁定两种格式。
3. **现有线程乐观 UI**：`sendMessageToSelectedThread` 空闲路径与进行中路径都先 `appendOptimisticUserMessage` 再 `startTurnForThread`；新增单测 `sendMessageToSelectedThread shows the user message immediately` 验证乐观行出现。

## 验证

- 定向 Vitest：`useDesktopState.test.ts` 90/90、`session.rollback-verify.test.ts` 通过。
- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过（web + CLI）。
- 手动验证：dev server 4173 实测——新线程、现有线程空闲、现有线程进行中三种发送路径，用户消息都立即显示在列表、随后才是 `Thinking` 行；回退 1 轮后保留目标轮次、后续轮次被删除；`thread/rollback-files` 接口正常回退文件变更。

## 发布状态

- 版本 bump → 提交已推送至 `origin/main`；tag `v0.1.111` 指向该提交。
- GitHub Release `v0.1.111`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.111
- `codex-mobile-re@0.1.111`：待用户 publish 至 npm 官方源并成为 `latest`。

## 交接注意事项

- 回退语义：`thread/rollback` 的 `numTurns` 是「从末尾删除 N 轮」，回退到第 0 轮会删除全部轮次（符合预期）。
- `apply_patch` 记录格式随 codex CLI 版本变化：`custom_tool_call.input`（旧）与 `function_call.arguments.command`（0.149.1+）都要解析，升级 CLI 后回退功能依赖此双格式。
- 乐观用户消息（`userMessage.optimistic`）由 `mergeMessages` 的 `preserveMissing` 分支去重替换，不要重复追加真实消息，否则会出现重复行。
