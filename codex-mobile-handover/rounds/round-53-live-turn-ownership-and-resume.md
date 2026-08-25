# Round-53：live agent 轮次归属保留 + 后台标签恢复卡顿优化（已修复）

> **范围：** 记录已完成的两项代码修复及其回归验证入口。该轮随 `v0.1.104` 发布：GitHub Release 由维护者创建，npm publish 由用户执行。

## 修复一：保留 live agent 的 turn 所有权（`2f9643b`）

### 问题

延迟到达的 `item/agentMessage/delta` 或 `item/completed` 若属于上一轮，在消息流已有下一轮用户消息或下一轮仍 live 时，缺少稳定轮次归属会导致该内容被追加到最新轮。最终回答抑制逻辑也只按「最后一轮」判断，可能错误压制历史轮已完成回答。

### 改动

- `readAgentMessageDelta` 和 `readAgentMessageCompleted` 从通知参数读取 `turnId`（兼容 `turnId` / `turn_id`）。
- `useDesktopState` 通过 `turnIndexByTurnIdByThreadId` 为 delta 与 completed agent 消息解析并保存 `turnIndex`；已有消息未带新值时保留其既有 `turnId`/`turnIndex`。
- `mergeThreadMessageStreams` 按已知 `turnIndex` 把 live 消息插入对应持久化轮次的下一条用户消息之前；无法关联的消息仍保留原有末尾追加语义。
- `ThreadConversation` 将实际 `liveTurnId` 传给 `buildTurnRenderGroups`。当 live overlay 存在时，仅该精确轮次抑制最终回答提升；旧调用方未给 `liveTurnId` 时仍回退到最后一轮，保持兼容。

### 结果

上一轮迟到的 agent 消息保持在自己的 turn 内，不会混入新轮；新轮进行中不会阻止历史轮已完成回答继续作为独立 final assistant 块渲染。

## 修复二：后台标签恢复不再等待附属元数据（`e74ab73`）

### 问题

浏览器从后台恢复时，刷新路径等待附属元数据，且 `thread/list` 的 RPC 过滤会等待 external-session tracker 做递归会话扫描。前台恢复因此被非关键工作阻塞，表现为切回标签后的列表/会话卡顿。

### 改动

- `syncAfterMobileResume` 不再传入 `awaitAncillaryRefreshes: true`：线程列表和当前会话优先恢复，skills、限额与协作模式等附属数据继续异步刷新。
- `rpcPipeline` 的 `thread/list` 过滤改为直接读取 tracker **最近一次已完成扫描**的缓存；不在 RPC 请求内 `await externalSessionTracker.tick()`。
- 移除 pipeline 对 tracker `tick()` 的依赖注入；已有后台 3 秒轮询负责更新缓存。刚创建的 subagent 最多在下一次扫描完成前短暂出现，随后下一次列表刷新会按权威响应移除。

### 结果与性能审计

前台恢复关键路径不再被递归扫描或附属元数据阻塞；`thread/list` 仍只读取缓存并保持原有过滤语义。代码路径审计显示：本改动移除了 RPC 内一次阻塞性扫描与 resume 等待，不新增请求、轮询、缓存体积或无界扇出；未在本轮重新采集浏览器 profile，性能结论基于 RPC/刷新调用链与已提交的 `rpcPipeline` 单测。

## 验证

- `2f9643b`：`useDesktopState.test.ts` 覆盖历史 live 消息按 turn 插回、`transcriptGrouping.repro.test.ts` 覆盖实际 `liveTurnId` 仅抑制活跃轮；提交内还更新了 completed agent final assistant 的手测说明。
- `e74ab73`：`rpcPipeline.test.ts` 覆盖 `thread/list` 使用 tracker 快照且不等待 `tick()`；既有 `deferred-ancillary-startup-refreshes.md` 已更新恢复路径预期。
- 本轮将两项修复收敛到 [live agent 轮次归属与恢复响应性](../../tests/thread-loading-state/live-agent-turn-ownership-and-resume-responsiveness.md) 手测入口，便于交接复验。

## 涉及提交与文档

- `2f9643b` — `fix: preserve live agent turn ownership`
- `e74ab73` — `perf: avoid blocking resume refreshes`
- `tests/thread-loading-state/live-agent-turn-ownership-and-resume-responsiveness.md` — 本轮新增合并手测项
- `tests/thread-loading-state/index.md` — 手测索引
- `codex-mobile-handover/codex-mobile-handover.md` — 交接总入口与当前快照
- `codex-mobile-handover/sections/commit-history.md` — 提交历史

## 发布

- 版本：`codex-mobile-re@0.1.104`。
- GitHub Release：随版本标签 `v0.1.104` 创建，说明涵盖 live agent 轮次归属与后台标签恢复响应性优化。
- npm publish：由用户从已推送的 `main` 执行；发布前 `prepublishOnly` 会重新运行完整构建。

## 交接注意事项

- tracker 缓存换取恢复关键路径的低延迟：新建 subagent 在下一次后台扫描完成前可能短暂出现在 `thread/list`，这是有界最终一致性，不要恢复 RPC 内同步扫描。
- live 消息优先使用通知携带的 `turnId`；无法解析时保持原来的末尾追加回退，避免猜测归属造成跨轮误插。
