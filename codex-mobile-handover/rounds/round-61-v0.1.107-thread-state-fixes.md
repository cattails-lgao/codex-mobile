# Round-61：v0.1.107 线程状态修复（2026-08-27）

> **范围：** 仓库版本已升至 `0.1.107`，两项线程状态修复已提交为 `fdbedb8` 并推送至 `origin/main`；tag `v0.1.107` 与 GitHub Release `v0.1.107` 均已创建。`codex-mobile-re@0.1.107` 已发布至 npm 官方源并成为 `latest`。本次仅更新交接文档，不执行提交操作。

## 修复一：异步列表处理后的子代理线程过滤

### 现象与根因

`thread/list` 的 RPC 流水线原先在异步的内联载荷清理、会话技能和命令合并之前读取一次 external-session tracker 的子代理排除集合。若 tracker 的后台扫描恰好在这些异步步骤期间完成，当前响应仍会使用已过期的集合，导致已识别的子代理线程短暂显示在侧栏。

### 修复

将 `filterSubagentThreadsFromThreadListResult()` 移至所有异步列表后处理完成之后再执行；最终的 external-session overlay 也使用同一份已过滤结果。RPC 路径仍不等待 `externalSessionTracker.tick()` 或递归扫描，只是读取处理完成时 tracker 的最新缓存快照。

新增 `src/server/bridge/rpcPipeline.test.ts` 回归用例：在异步清理暂停期间模拟 tracker 完成扫描，断言响应排除新发现的子代理线程。

## 修复二：liveTurnId 未返回时历史最终总结被误抑制

### 现象与根因

发送新消息后，live overlay 已出现但 `liveTurnId` 尚未从通知返回的短暂窗口内，`buildTurnRenderGroups()` 把最后一个 turn 猜测为活跃 turn。若最后一个 turn 实际是上一轮已完成的回答，其 final assistant block 会被压回过程区，造成最终总结闪动或视觉错误。

### 修复

当调用方显式传入 `liveTurnId` 字段（即使字段值为 `undefined`）时，不再回退猜测最后一轮为活跃轮；只有真实 `liveTurnId` 匹配的 turn 才抑制最终回答提升。未传该字段的旧调用方仍保持原有最后一轮回退语义。

新增 `src/utils/transcriptGrouping.repro.test.ts` 回归用例，锁定 live overlay 已出现、`liveTurnId` 尚未返回时，上一轮已完成最终总结仍为 `final-assistant`。

## 现有验证

- 两项修复均已附最小 Vitest 回归用例：`rpcPipeline.test.ts` 与 `transcriptGrouping.repro.test.ts`。
- 手动验证步骤与预期已更新至 [Live agent turn ownership and resume responsiveness](../../tests/thread-loading-state/live-agent-turn-ownership-and-resume-responsiveness.md) 以及 [Subagent threads are filtered from the sidebar](../../tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md)。
- 生产构建 `pnpm run build` 已通过。
- 合并定向 Vitest 已通过：`rpcPipeline.test.ts` + `externalSessionTracker.test.ts` + `transcriptGrouping.test.ts` + `transcriptGrouping.repro.test.ts`，共 **58/58**。
- 浏览器手测未执行。

## 性能审计

修复一不增加请求、扫描、轮询或 payload；仅将对一个既有 `Set` 的读取推迟至异步后处理结束。修复二仅调整本地消息分组中活跃轮的布尔判定，不增加渲染分组次数、请求、缓存或持久化 I/O。未在本轮采集浏览器 profile。

## 涉及文件

- `package.json`
- `src/server/bridge/rpcPipeline.ts`
- `src/server/bridge/rpcPipeline.test.ts`
- `src/utils/transcriptGrouping.ts`
- `src/utils/transcriptGrouping.repro.test.ts`
- `tests/thread-loading-state/live-agent-turn-ownership-and-resume-responsiveness.md`
- `tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md`
- `tests/thread-loading-state/index.md`
- `codex-mobile-handover/codex-mobile-handover.md`
- `codex-mobile-handover/sections/commit-history.md`
- `codex-mobile-handover/rounds/round-61-v0.1.107-thread-state-fixes.md`

## 发布状态

- `fdbedb8`（`fix: keep subagent threads and final summaries stable`）已推送至 `origin/main`。
- git tag `v0.1.107` 与 GitHub Release `v0.1.107` 已创建。
- `codex-mobile-re@0.1.107` 已发布至 npm 官方源并成为 `latest`。

## 交接注意事项

- 不要把子代理过滤重新提前到异步 RPC 后处理之前；这会恢复 tracker 扫描完成期间读取旧快照的竞态。
- `liveTurnId: undefined` 与未传 `liveTurnId` 的语义不同：前者表示活跃 turn 尚未知，不能猜测最后一轮；后者保留旧调用方的最后一轮回退。
- v0.1.107 的 tag、GitHub Release 与 npm 发布均已完成，无需重复执行发布操作。
