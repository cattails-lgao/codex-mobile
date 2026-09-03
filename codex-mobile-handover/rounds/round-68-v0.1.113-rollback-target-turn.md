# Round-68：v0.1.113 发布（回退移除目标轮及其后所有轮次）

> **范围：** 收录一处回退语义修复，随 v0.1.113 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，npm publish 由用户执行。`vue-tsc` 通过、`useDesktopState.test.ts` 92/92 通过、浏览器实测回退首/中/末消息均生效。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `e1be9d9` | 回退语义修复：`rollbackSelectedThread` 的 `numTurns` 从 `Math.max(1, maxTurnIndex - turnIndex)` 改为 `maxTurnIndex - turnIndex + 1`，回退目标轮时移除该轮（含其用户消息）及其后的所有轮次，而非只删后续、保留目标轮。新增中间轮回退单测 + 更新手测文档 |
| （版本/文档提交） | `package.json` bump 至 `0.1.113` + round-68 交接记录与总入口/提交历史更新 |

## 改动要点

1. **回退语义修正**：用户回退某条消息期望撤销它本身（文本回填输入框后重发），此前 `numTurns = Math.max(1, maxTurnIndex - turnIndex)` 保留目标轮、只删后续轮次，导致「确认回退后消息列表没有更新，回退那条消息还在列表」。改为 `numTurns = maxTurnIndex - turnIndex + 1` 后：回退中间轮移除目标轮及其后所有轮次；目标轮即最后一轮时 `maxTurnIndex - turnIndex` 为 0，`+1` 后仍为 1，删除该轮而非静默无操作；单消息线程回退后回到空线程态（「此线程还没有消息」）。
2. **回填保留**：`onRollback` 仍把目标用户消息文本回填输入框，方便编辑重发。

## 验证

- 定向 Vitest：`useDesktopState.test.ts` 92/92 通过（含新增「回退中间轮移除目标轮及其后所有轮次」用例，断言 `rollbackThread` 以 `numTurns = 2` 调用）。
- `pnpm exec vue-tsc --noEmit`：通过。
- 浏览器实测（dev server 4173）：回退首条、中间、最后一条消息均生效——目标消息从列表移除、后续轮次一并删除、单消息线程回退后显示空线程态、回退文本回填输入框。

## 发布状态

- 版本 bump → 提交已推送至 `origin/main`；tag `v0.1.113` 指向该提交。
- GitHub Release `v0.1.113`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.113
- `codex-mobile-re@0.1.113`：已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.113`），发布链路全部闭环。

## 交接注意事项

- 回退语义（round-66 保留目标轮 → round-67 末轮移除 → round-68 移除目标轮及其后所有轮次）：当前最终语义为「回退目标轮移除该轮及其后的所有轮次」，与用户期望一致。
- `numTurns = maxTurnIndex - turnIndex + 1` 的 `+1` 是刻意为之：目标轮即最后一轮时保证至少删除 1 轮，避免静默无操作。
