# Round-67：v0.1.112 发布（线程切换性能优化 + 回退最后一条消息修复）

> **范围：** 收录两处改动，随 v0.1.112 一起发布。GitHub Release 与 git tag 由维护者（agent）创建，npm publish 由用户执行。`vue-tsc` 通过、`useDesktopState.test.ts` 91/91 通过、浏览器实测回退最后一条消息生效。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `9b15b8c` | ①线程切换卡顿优化：`models.ts` 为 `/codex-api/provider-models` 增加 30s TTL 缓存（`fetchProviderModelIds`），切换线程不再重复请求（此前每次切换 340~3600ms）；`App.vue` 用 `lastStableFilteredMessages` 保留上一次稳定消息列表，加载期间显示旧内容避免闪烁；`useDesktopMessageHistoryLoading.ts` 用引用计数管理并发加载的 `isLoadingMessages`，`ThreadConversation.vue` 仅在消息为空时显示全屏加载、有旧消息时显示顶部加载条 |
| `b53ee3f` | ②回退最后一条消息修复：`rollbackSelectedThread` 中目标轮即最后一轮时 `maxTurnIndex - turnIndex` 为 0，此前 `if (numTurns < 1) return` 静默无操作（用户回退最后一条消息「点了确认没反应」）；改为 `numTurns = Math.max(1, maxTurnIndex - turnIndex)`，回退最后一条消息时移除该轮本身。新增单测 + 手测文档 |

## 改动要点

1. **线程切换性能**：`selectThread` 每次切换都会触发 `refreshModelPreferences({ includeProviderModels: true })` 拉取 `/codex-api/provider-models`（耗时 340~3600ms）阻塞主线程；`fetchProviderModelIds` 增加 30s TTL 缓存后重复切换不再发请求。`App.vue` 的 `displayFilteredMessages` 在加载期间回退到上一次稳定消息列表，配合 `ThreadConversation.vue` 顶部加载条，消除「Loading messages...」全屏闪烁。
2. **回退最后一条消息**：`numTurns = Math.max(1, maxTurnIndex - turnIndex)`。回退中间轮仍保留目标轮、只删后续轮次；回退最后一轮（含单消息线程）则移除该轮本身，不再静默无操作。`onRollback` 仍会把目标用户消息文本回填输入框，方便编辑重发。

## 验证

- 定向 Vitest：`useDesktopState.test.ts` 91/91 通过（含新增「回退最后一条消息移除该轮」用例）。
- `pnpm exec vue-tsc --noEmit`：通过。
- 浏览器实测（dev server 4173）：回退最后一条消息后该消息被移除（单消息线程变空）；回退中间轮保留目标轮、删除后续轮次；线程切换不再重复请求 provider-models、无加载闪烁。
- 全量 Vitest 中 3 个失败（`normalizes the archived last plan`、`codexAppServerBridge.archive.test.ts` 2 项）为干净树上同样存在的环境性旧问题，与本轮改动无关。

## 发布状态

- 版本 bump → 提交已推送至 `origin/main`；tag `v0.1.112` 指向该提交。
- GitHub Release `v0.1.112`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.112
- `codex-mobile-re@0.1.112`：待用户 publish 至 npm 官方源。

## 交接注意事项

- 回退语义：回退中间轮保留目标轮、只删后续轮次；回退最后一轮移除该轮本身（`numTurns` 下限为 1）。
- provider-models 缓存 30s TTL：切换线程后短时间内不重新拉取模型列表；若模型目录变更需要立即生效，可等待缓存过期或重启。
- 线程切换加载态：有旧消息时显示顶部加载条而非全屏「Loading messages...」，避免闪烁。
