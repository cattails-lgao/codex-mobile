# round-111 — 非 UI 路径的全量读收口（遗留清理）

日期：2026-09-30。承接 round-110 §六 的三条遗留。

**结论先行：遗留 3 处理掉（telegram 两处有界化，并顺带修掉一条更高频的队列路径）；遗留 1/2 判定「不做」，附量化理由（非敷衍）。** 本轮不给 `AppServerProcess` 加方法，**未** bump `SHARED_BRIDGE_VERSION`。

## 一、改了哪三处

### 1. `BackendQueueProcessor.canStartQueuedTurn`（`codexAppServerBridge.ts:1213`）—— 本轮收益最大

这条**不在** round-110 的遗留清单里，是本轮 grep 全量读现场时发现的：它每次队列 drain 都问一次「能不能开跑下一轮」，原先发的是全量 `thread/read {includeTurns:true}`（大线程 6.0–6.2s / 26MB）。

它要的答案只有两件：线程自身的 `status`、以及「有没有正在跑的轮」。有界读恰好覆盖两者——`status` 在元数据里（`includeTurns:false`，约 12ms），而正在跑的轮**必然是最新的那一轮**，最新一页足够。改为复用 `readThreadWithTurnPage`，失败时它会重放原请求（逐字旧行为）。

### 2. telegram 两处（`telegramThreadBridge.ts:711 / :730`）

- `readLatestAssistantMessage`：`turn/completed` 后把最后一条 assistant 回复转发到 telegram。倒序扫 turns 找最后一个 `agentMessage`。
- `readThreadHistorySummary`：`/history` 命令的最近历史摘要，只取 `historyRows` 的 **tail 12 行**。

两者都只需要最新内容，却都发全量读。新增私有 helper `readRecentThreadTurns`（元数据 + 最新一页），两处改为调它；提取逻辑**逐字未动**，只换了数据来源。失败时同样回落全量。

### 3. 修正 `threadResumeTurnPage.ts` 头部注释（误导源）

原文说 `ThreadReadParams` 指向 `excludeTurns` + `initialTurnsPage`。**这是错的**，而且正是 round-110 一度让我以为「有界 `thread/read` 可以照抄 resume 的做法」的那句话。实测 `ThreadReadParams` 只有 `{threadId, includeTurns}`；`excludeTurns`/`initialTurnsPage` 只存在于 `ThreadResumeParams`。注释改为指向真正的分页对 `thread/turns/list` + `thread/items/list`。

## 二、评估后**不改**的现场（逐条理由）

| 现场 | 为什么不改 |
|---|---|
| `threadSearch.ts:70` `loadAllThreadsForSearch` | 它在**建全文搜索索引**（top-100 线程批读全文喂 `searchableText`）。有界读只给最新 10 轮 → 老消息永远搜不到。**全文读是它的功能本身**，不是浪费。 |
| `threadRoutes.ts:233` `thread-file-change-fallback` | `buildSessionFileChangeFallback(threadReadResult, sessionLogRaw)` 要**全部轮次**的 patch 信息才能列出所有文件变更。 |
| `threadRoutes.ts:279` `thread-live-state` | `rawTurns` 既进 snapshot 又参与 `getCachedLiveState(threadId, rawTurns.length, sessionSize)` 的缓存键。有界化会同时改变 snapshot 内容与缓存语义。 |
| `AppServerProcess.readThreadForTurnPage:633` | 它是上翻的**兜底**——主路径已经是有界的 `readBoundedThreadTurnPage`（round-86），只有游标链失效时才到这里。兜底的意义就是绕开失效的机制，把它也有界化会取消这条保险。 |
| `api/gateway/threads.ts`、`develop.ts` 的 `thread/read` | 它们是 **UI 主路径**，走桥的 rpc 分派 → **round-110 已经全部覆盖**。本轮无需再碰。 |

## 三、遗留 1 / 2 的处置

**遗留 1（`thread/items/list` + `thread/timeline/list` 接消息流水线）——不做（用户 2026-09-30 明确「先不做」）。** 这是**新功能**（改消息流水的取数方式），不是遗留缺陷；牵动前端渲染与分页语义。**决策已下**：不做，gateway 的 `listThreadItemsPage`（`threads.ts:644`，默认 `limit:25 / sortDirection:'asc' / 返回 {entries, nextCursor}`）维持「已备好、零产品调用」现状。**重开触发条件**（满足其一才重新评估）：①出现「超长单轮（单 turn 内含大量 item）打开卡顿」的真实症状；②要新增「按 item 增量载入 / 边生成边载历史」的体验目标。届时按该目标设计，不由本轮遗留驱动。

**遗留 2（`threadResumeTurnPage` 与 `threadReadTurnPage` 的取页代码合并）——不做，附量化。** 两者的**入口本质不同**：

- resume 路径的页**随 resume 响应一起来**（`initialTurnsPage`，一次 RPC）；
- read 路径的页来自**额外的一次** `thread/turns/list` RPC。

真正逐字重复的只有组装尾部约 4 行（`turns = [...pageData].reverse()` + `index = total - turns.length`）与 `needsCount` 判断。抽取需给共享函数加 `threadId` 参数、并改 `promoteResumeTurnPage(result, totalTurnCount)` 的签名——而后者被 `threadResumeTurnPage.test.ts` **6 处断言**直接调用。为约 4 行去重去动一个已被测试锁定的公开签名，是负收益。**保持两套入口、共享 `readThreadTurnCount` 现状。**

## 四、验证

**1. 类型**：`vue-tsc --noEmit` 干净。

**2. 定向单测** 62/62：`threadReadTurnPage.test.ts`(8) + `threadResumeTurnPage.test.ts`(26) + `codexAppServerBridge.inlinePayload.test.ts`(28，含 `BackendQueueProcessor` 调度测试)。

**3. 新增单测** `telegramThreadBridge.test.ts`（3 例，此前 telegram **零覆盖**）：
- 最新 assistant 回复走**最新一页**、且**从不**发全量 `thread/read {includeTurns:true}`；
- 历史摘要走最新一页、同样不发全量；
- 一页取数失败 → **重放全量** `thread/read {includeTurns:true}`。

**4. 真机集成**（临时单测，跑完即删，驱动本地 0.158.0 app-server，3MB / 16 轮线程 `01a0465a-…-badc1c40b4e8`）：

```
[probe] full turns=16  bounded turns=10  startIndex=6
```

断言全部通过：`bounded.turns[].id === full.turns.slice(-10)[].id`（逐位）、`thread.status` 与 `thread.path` 一致，且**两个新调用点的实际判定结果**（`canStartQueuedTurn` 的 status/inProgress 判定、`readLatestAssistantMessage` 的倒序取材）在**有界数据与全量数据上完全相同**。

**5. 全量**：**693 例 / 690 通过 / 3 失败**（693 = round-110 的 690 + 本轮新增 3）。3 失败 = `codexAppServerBridge.archive.test.ts` 的 **2 例恒定 Windows 平台差异** + `inlinePayload.test.ts` 的 **1 例并发抖动**（隔离复跑 28/28 通过）。**零回归。**

## 五、涉及文件

- 改：`src/server/codexAppServerBridge.ts`（`canStartQueuedTurn` 有界化）
- 改：`src/server/telegramThreadBridge.ts`（import + `readRecentThreadTurns` + 两处调用）
- 改：`src/server/bridge/threadResumeTurnPage.ts`（头部注释纠错，无逻辑变更）
- 新增：`src/server/telegramThreadBridge.test.ts`（3 例）
- 探针：`tmp/probe-0158-read-paging.cjs`（round-110 遗留，可复用）

## 六、遗留

1. `thread/items/list` + `thread/timeline/list` 接消息流水线——**新功能**；**用户 2026-09-30 裁定「先不做」**（重开条件见 §三），`listThreadItemsPage` 保持已备好零调用。
2. 上表「评估后不改」的四处是**有意的设计选择**，不是待办；若未来 `threadSearch` 需要「只搜最近 N 轮」或有界增量索引，才是重新评估的触发点。
