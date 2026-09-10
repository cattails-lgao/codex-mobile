# round-74：回退 paginated 历史迁移补完（v0.1.119）

## 需求 / 背景
round-73 为 paginated 历史引入了 `thread/revert` 降级，但那条迁移只接了一半，线上 `codex-mobile-re@0.1.118` 回退时留下三个缺陷：

1. **控制台每次回退都报 `POST /codex-api/rpc 502`**；
2. **回退成功后整个消息列表被刷新**（先清空再全量重灌的视觉「刷」一下）；
3. **桥接层裁剪集合漏了 `thread/revert`**，长线程响应走不到 trim/inline/session 处理。

三者是同一处「paginated 历史迁移没接完」的不同表现，一并修复。

## 根因与方案

### 缺陷 1：500 是刻意的探路请求（观感问题）
`rollbackThreadWithRevertFallback` 用「先试 `thread/rollback`、撞墙后用错误文案正则降级」的策略，每次回退都会先发一次注定失败的调用（`{"error":"paginated threads do not support thread/rollback"}` → nginx 502 60）。服务端已直接给出 `thread.historyMode`，据此一次分流即可。

- 接线 `historyMode`：`UiThread` 新增可选字段 `historyMode?: 'legacy' | 'paginated'`（缺省视 legacy），`normalizers/v2.ts toUiThread` 从服务端 `thread.historyMode` 填充。
- `rollbackThreadWithRevertFallback` 改为：`mode === 'paginated' && beforeTurnId` → 直达 `thread/revert`；否则 `thread/rollback`。不再发探路请求。

### 缺陷 2：回退后整个消息列表刷新（真正的 bug）
paginated 的 `thread/revert` 返回体 `thread.turns` 恒为空（契约如此，历史经 `thread/turns/list` 分页 hydrate），而 `revertThread` 用 `normalizeThreadMessagesV2` 直接消费空 turns → `nextMessages = []` → `setPersistedMessagesForThread([])` 清空列表 → `syncFromNotifications` 全量重灌。legacy 的 `thread/rollback` turns 有值所以从不刷新。

- `revertThread` 改用返回的 `turnsBackwardsCursor` 去 `thread/turns/list` 增量 hydrate 裁剪后的历史（`sortDirection: 'desc'`、`limit: 200`、`itemsView: 'full'`），游标天然指向裁剪后保留历史的末尾，无需自行计算。
- 补齐 `ThreadRevertResponse`/`ThreadTurnsListResponse` DTO 导出。

### 缺陷 3：桥接层裁剪集合少了 thread/revert
`THREAD_METHODS_WITH_TURNS` 没有 `thread/revert`，其响应不走 `trimThreadTurnsInRpcResult` 等流水线处理。

- 把 `thread/revert` 加入 `THREAD_METHODS_WITH_TURNS`（trim/inline/session-merge 对空 turns 均为无害空转；实际净效应仅额外叠加 `externalSession`）。
- `THREAD_METHODS_WITH_THREAD_SNAPSHOT` 改为**显式枚举**（read/resume/fork/rollback/start），不再随 WITH_TURNS 自动扩张带上 revert——避免把空 turns 的 revert 响应写成 `lastThreadReadSnapshot`，污染 `thread/read` 失败的兜底快照。
- 同步 inlineImages.ts 内对应的 `THREAD_METHODS_WITH_TURNS` 列表。

## 涉及文件
- `src/types/codex.ts`：`UiThread.historyMode`（可选）
- `src/api/normalizers/v2.ts`：`toUiThread` 填充 `historyMode`
- `src/api/appServerDtos.ts`：导出 `ThreadRevertResponse`/`ThreadTurnsListResponse`
- `src/api/gateway/threads.ts`：`revertThread` 用 `turnsBackwardsCursor` 增量 hydrate
- `src/composables/useDesktopState.ts`：`rollbackThreadWithRevertFallback` 读 `historyMode` 直选方法
- `src/server/bridge/core.ts`：`THREAD_METHODS_WITH_TURNS` + 显式 `THREAD_METHODS_WITH_THREAD_SNAPSHOT`
- `src/server/bridge/inlineImages.ts`：同步方法集
- `src/composables/useDesktopState.test.ts`：round-73 降级用例改写为 round-74 直达语义

## 变更范围与约束
- 仅触碰回退分流、`revertThread` 的 hydrate 与桥接方法分类；不触碰高推理/子代理过滤/final 摘要/realtime 时序等硬约束路径。
- `historyMode` 为可选缺省 legacy，`insertOptimisticThread` 等优化占位线程在服务端回填前按 legacy 处理可接受（真实线程回退前必已从服务端读到 `historyMode`）。

## 验证（已跑通）
- `useDesktopState.test.ts` + `normalizers/v2.test.ts` 110 通过（含新语义的 paginated 直达用例：断言 `revertThread` 被调用且 `rollbackThread` 不被调用，即无探路请求）。
- `vue-tsc --noEmit` 干净；`pnpm run build`（web + CLI）通过。
- 环境性旧失败：`codexAppServerBridge.archive.test.ts` 2 个为 Windows 平台权限差异（symlink EPERM、文件 mode 0o600 vs 0o666），与本次改动无关。

## 性能审计
- 无新增网络请求（探路 502 省掉了一次请求）；`thread/revert` 后仅多一次 `thread/turns/list`（= 原全量重灌的一次分页，且是单向的命中保留集，避免后续全量读）。
- `historyMode` 为线程元数据只读字段，无刷新/缓存/启动风险。
- 桥接快照不写入空 turns revert 响应，读失败兜底保持更完整的上一次有效快照。

## 发布
- 版本 `0.1.118 → 0.1.119`。git tag `v0.1.119` 与 GitHub Release 由维护者创建；`codex-mobile-re@0.1.119` 已由用户 publish 至 npm 官方源并成为 `latest`，发布链路闭环。