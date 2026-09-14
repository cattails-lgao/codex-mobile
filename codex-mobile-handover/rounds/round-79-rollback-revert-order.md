# round-79：回退后消息列表倒序渲染修复（v0.1.123 发布）

## 需求

用户反馈：回退（rollback）后消息列表渲染顺序错误——最老的一条消息显示在最新位置（列表底部）。

## 排查（先测量后改动）

链路（codegraph 复查 + 源码核对）：`rollbackSelectedThread` → `rollbackThreadWithRevertFallback`（paginated 历史直达 `thread/revert`）→ `revertThread`（[threads.ts](../../src/api/gateway/threads.ts#L600)）。

1. **排除其他路径**：向上翻页路径 `/codex-api/thread-turn-page`（[threadRoutes.ts](../../src/server/bridge/threadRoutes.ts#L124)）是全量 `thread/read` 后按升序切片，无此问题；全仓只有 `revertThread` 消费 `thread/turns/list`。
2. **实测服务端顺序**（dev server 4173，直接 RPC `thread/turns/list` + `sortDirection: 'desc'`）：返回页为 **newest-first**（第一个 turn `019feaa1-…` 新于第二个 `019fea87-…`；turn id 为 UUIDv7，时间有序）。schema `ThreadTurnsListParams.json` 亦写明 `sortDirection` 默认 descending。
3. **`normalizeThreadMessagesV2` 完全保序**（[v2.ts](../../src/api/normalizers/v2.ts#L723)）：按输入顺序展开 turns，且 `turnIndex = base + offset` 按输入顺序递增。

**根因**：round-74 引入的 `revertThread` 把 desc 页（newest-first）未经反转直接 normalize，`rollbackSelectedThread` 随即 `setPersistedMessagesForThread` 落库渲染：

- 保留历史**整段倒序**——最老消息沉底、形似最新（与用户反馈一致）；
- `turnIndex` 全部反向（最新轮 = 0），破坏后续回退的 `maxTurnIndex` / `numTurns` 计算。

**为何不自愈**：回退后 `syncFromNotifications` 的 silent 重载走 `mergeMessages(..., { preserveMissing: true })`（[useDesktopStateUtils.ts](../../src/composables/useDesktopStateUtils.ts#L249)），按设计保留既有排布——错误顺序被持续保留。

## 改动（1 文件 + 回归测试）

- [threads.ts `revertThread`](../../src/api/gateway/threads.ts#L600)：`thread/turns/list` 的 desc 页在 normalize 前 `[...page.data].reverse()`，hydrate 结果回到时间序，`turnIndex` 从最老保留轮 = 0 递增。其余不变（游标锚定、limit 200、`itemsView: 'full'` 均沿用 round-74）。
- 新增 [threads.revertOrder.test.ts](../../src/api/gateway/threads.revertOrder.test.ts)（2 例）：①desc 页被反转为时间序且 `turnIndex` 升序（mock `./core` 的 `callRpc`）；②revert 响应无游标时不调 `thread/turns/list`。

## 验证

- 定向 Vitest：`threads.revertOrder.test.ts` 2/2 + `useDesktopState.test.ts` 95/95（含 round-73/74 回退分流用例）。
- 全量 Vitest **580 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` Windows 权限差异，既有环境性失败）。
- `vue-tsc --noEmit` 干净；`pnpm run build`（`vite build` + `tsup` CLI）通过。
- 手测文档：[tests/thread-loading-state/rollback-works-on-legacy-and-paginated-threads.md](../../tests/thread-loading-state/rollback-works-on-legacy-and-paginated-threads.md) 新增 round-79 节（回退后顺序 + 刷新后顺序 + 回退后再回退）。

## 性能审计

改动为回退一次性动作中 ≤200 元素数组的 O(n) `reverse()`，无新增请求、缓存或渲染路径变化；依据代码路径分析，无需 live profiling。

## 边界（如实记录）

- 保留历史 > 200 轮时 desc 页仍只取最新 200 轮（反转后为其中最老 200 轮的升序），超出部分本就不在 round-74 的 hydrate 范围内，本轮未扩大范围。
- 回退后未刷新 `turnIndexByTurnIdByThreadId`（旧映射含已删轮次）；主路径用新消息列表自带的 `turnIndex`，不受影响——保持既有行为。

## 发布状态

**已随 v0.1.123 发布（与 round-80、round-81 同批）**。版本 bump 至 `0.1.123`；代码提交 `f2cd90a`（fix + 回归测试 + 手测文档，已推送 `origin/main`）；提交链、tag 与 GitHub Release 记录见 `sections/commit-history.md` 的 v0.1.123 段。
