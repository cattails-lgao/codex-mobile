# Round-50：侧边栏重新出现子 agent 会话——竞态与合并残留修复（2026-08-20）

> **背景：** round-43 已实现基于 `session_meta.thread_source` 的 subagent 过滤（`externalSessionTracker` + 桥接层 `filterThreadListByIds`），但实测侧边栏仍会重新出现子 agent 会话。本轮定位到两个叠加原因并修复。

## 根因

1. **服务端竞态（3s 轮询窗口）**：`ExternalSessionTracker` 依赖 3 秒轮询扫描 `$CODEX_HOME/sessions` 下的 rollout 文件。子 agent 会话刚被创建时，`thread/list` 已返回该线程，但 tracker 还没扫描到它，二次过滤自然拿不到子 agent 的 id——竞态窗口内过滤失效。
2. **前端并集合并残留**：`useDesktopState.loadThreads` 用 `mergeThreadGroupPages` 把新一页 `thread/list` 与 `loadedThreadListGroups` 做并集合并。即使服务端已从响应中过滤掉子 agent 线程，前端并集仍保留旧的子 agent 行，导致侧边栏残留。

## 修复

`b86c220 fix: prevent subagent threads reappearing in the sidebar`

- `externalSessionTracker.tick()` 改为并发安全：若已有扫描在进行，调用方等待（`await this.tickingPromise`）而非直接跳过，保证读取到的最新索引。
- 桥接层 `filterSubagentThreadsFromThreadListResult` 在过滤前 `await externalSessionTracker.tick()`，强制先同步一次最新扫描，消除 3s 轮询窗口。
- 前端 `loadThreads` 改为「服务端响应为权威基线」：每次加载直接替换 `loadedThreadListGroups`，不再并集合并；并同步重置分页游标。
- 新增并发 tick 回归单测；更新手测文档。

## 验证

- `externalSessionTracker.test.ts`：16 个测试通过（含新增并发 tick 去重用例）。
- `codexAppServerBridge.inlinePayload.test.ts`：28 个测试通过。
- `vue-tsc --noEmit`：通过（EXIT 0）。
- 手测文档增强：`tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md` 新增「过滤即时生效且刷新后不残留」用例。

## 涉及文件

- `src/server/externalSessionTracker.ts` / `.test.ts`
- `src/server/codexAppServerBridge.ts`
- `src/composables/useDesktopState.ts`
- `tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md`

## 发布

- 随 `codex-mobile-re@0.1.101` 发布（npm publish 由用户执行）；tag / GitHub release `v0.1.101`。