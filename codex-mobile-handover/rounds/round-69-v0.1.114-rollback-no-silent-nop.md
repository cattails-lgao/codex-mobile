# Round-69：v0.1.114 发布（回退不存在静默 no-op，真实 app-server rollback 语义确认）

> **范围：** 收录一处回退健壮性修复——`rollbackSelectedThread` 中目标轮 turnIndex 无法解析时不再静默 return（曾导致「点了回退没反应、最后一条消息还在」，且不报错），改为钳制到最新一轮再回退并留下 `console.warn`。随 v0.1.114 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，`npm publish` 由用户执行。发布链路已全部闭环。`vue-tsc` 通过、`useDesktopState.test.ts` 93/93 通过。

## 背景与根因（关键）

用户反馈发布版（v0.1.113）回退功能「还是不对」——回退时目标消息及其后消息没被删掉、界面没反应。排查过程：

1. **服务端语义确认正确**：对真实 codex `0.149.1` app-server 做端到端验证（`thread/fork` 副本，避免污染原线程）——一条 28 轮线程 `thread/rollback numTurns=1` 后剩 27 轮，最后那个 `userMessage` 整轮消失。schema（`ThreadRollbackParams.json`）亦写明 `numTurns` = "number of turns to drop from the end, >= 1"。所以「回退最后一轮 → 客户端算 `numTurns=1` → 服务端删除」这条链路成立。
2. **问题在客户端静默返回**：`rollbackSelectedThread` 里当 `persisted` 找不到该 turnId 消息、且 `turnIndexByTurnIdByThreadId` 兜底也拿不到 turnIndex 时，旧代码 `if (turnIndex < 0) return` 直接退出，**rollback 请求根本没发出**——表现为「界面无反应 / 消息还在 / 无报错」。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `63417f3` | 回退健壮性修复：尽早取 `maxTurnIndex` 作回退水印；目标轮 turnIndex 取不到或超出持久化范围时**钳制到最新一轮**再回退（`numTurns` 恒 >= 1），不再静默放弃；并 `console.warn('[rollback] turn ... not resolvable ...')` 留痕。新增单测「turnIndex 未解析时钳制到最新轮回退而非 no-op」+ 更新手测文档 |
| （版本/文档提交） | `package.json` bump 至 `0.1.114` + round-69 交接记录与总入口/提交历史更新 |

## 改动要点

1. **消除静默 no-op**：`rollbackSelectedThread` 中 `let turnIndex = matchedMessage?.turnIndex ?? map[turnId] ?? -1`；`maxTurnIndex` 提前只算一次；当 `turnIndex < 0 || turnIndex > maxTurnIndex` 时钳制到 `maxTurnIndex`（即当作最新一轮），而非 `return`。这样「回退最后一轮」无论 turnIndex 是否解析成功都必定删除该轮。
2. **可观测性**：钳制时输出 `console.warn`，以后同类「点了没反应」可从控制台直接定位，不再无痕失效。
3. **手测文档补「Deck Check」**：记录真实 app-server rollback 语义已验证（28→27），说明 UI 假死时服务端并非元凶。

## 验证

- 定向 Vitest：`useDesktopState.test.ts` 93/93 通过（含新增「目标轮 turnIndex 无法解析时钳制到最新轮调用 `rollbackThread`」用例，断言 `rollbackThread` 以 `numTurns = 1` 调用——此前会静默不调用）。
- `vue-tsc --noEmit`：通过。

## Release / Publish（已闭环）

- 维护者（agent）：git tag `v0.1.114` + GitHub Release `v0.1.114`。
- 用户：`npm publish` 发布 `codex-mobile-re@0.1.114` 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.114`），发布链路闭环。