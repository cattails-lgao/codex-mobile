# round-112 — 队列开跑路径的有界化（复核补漏）

日期：2026-09-30。承接 round-111 收口后用户的验收提问「已经全部清理干净了吧？」。

**结论先行：** round-111 的「非 UI 路径全量读」现场清单**漏收了 3 处**（复核发现）。其中 1 处是**高频真漏项**，本轮修掉；另 2 处属有意保留，本轮补记录。全仓现已没有未归类的全量读发起点。本轮不给 `AppServerProcess` 加方法，**未** bump `SHARED_BRIDGE_VERSION`。

## 一、复核方法

以「谁还在让 app-server 构造全部轮次」为准，逐行扫全仓两类发起点：

- `includeTurns: true` 的 `thread/read`；
- 不带 `excludeTurns` 的 `thread/resume`（它默认全量水合）。

逐个判定「是否经桥的 rpc 分派」（经则被 round-84/110 的有界改写覆盖），不经分派的一律单独定性。结果：**6 处已覆盖、4 处已记录的有意保留、3 处未记录**（本轮的 3 处）。

## 二、修掉的那一处：`startQueuedTurn` 的裸 `thread/resume`

**位置**：`src/server/codexAppServerBridge.ts` 的 `BackendQueueProcessor.startQueuedTurn`。

**问题**：每个排队轮真正开跑前都会发一次 `thread/resume { threadId }` 把线程加载进 app-server（紧接着 `turn/start`），**返回的轮次从来没人读**，但裸 resume 会让 app-server 全量构造轮次并回传。这**直连 `this.appServer.rpc`，绕过桥的 rpc 分派**，所以 round-84/110 的改写都不覆盖它。它是**高频**路径：每个排队轮一次；round-111 刚把「要不要开跑」那次读有界化，收益又被这一发烧回去。

**协议依据**（`ThreadResumeParams.excludeTurns` 原文）：

> When true, return only thread metadata and live-resume state without populating `thread.turns`. This is useful when the client plans to call `thread/turns/list` immediately after resuming. Full-history hydration is deprecated for paginated threads.

即 **resume 的加载语义不依赖轮次**，只要元数据与 live-resume 状态 —— 正好是这条路径需要的。

**真机实测**（`tmp/probe-0158-resume-exclude-turns.cjs`，驱动本机 **0.158.0** 真实线程 `01a0465a-f570-78a0-ae6b-badc1c40b4e8`，3MB / 16 轮，串行 5 步）：

```
1. resume {threadId}                      -> OK [3267ms]  turns=16
2. resume {excludeTurns:true}             -> OK [61ms]   turns=0
3. resume {excludeTurns+initialTurnsPage} -> OK [178ms]  turns=0
4. turns/list after bare excludeTurns     -> OK [52ms]   data=5
5. read {includeTurns:false}              -> OK [4ms]    status={"type":"idle"}

metadata diff (full vs bare excludeTurns, ignoring turns):
   {"onlyA":[],"onlyB":[],"changed":[],"keyCount":32}
```

三个结论：①**裸 `excludeTurns:true`（不带 `initialTurnsPage`）被接受**，不需要 round-84 那套「页」；②返回的 `thread` **32 个字段与全量 resume 逐字相同**（除 `turns`），加载语义等价；③resume 之后 `turns/list` 与元数据读照常可用，线程处在可用的活状态。成本 **3267ms → 61ms（约 54×）**。

**改动**（一行 + 注释）：`thread/resume` 参数加 `excludeTurns: true`。回落行为不变（该调用本来就没有失败分支，异常仍由 `processThreadQueue` 的既有 catch 处理）。

**本轮未做**：真跑一轮排队 turn 的端到端。理由：那会真实消耗模型额度并改写用户线程，而这条路径的全部语义就是「加载 → 立刻 turn/start」，加载部分已由上面的探针逐项证明等价（协议接受、元数据逐字相同、后续 RPC 可用），桥侧的传参由新增单测锁定。

## 三、补记录的两处（其一的判定在 round-113 被推翻）

| 位置 | 为什么不改 |
|---|---|
| `codexAppServerBridge.ts` HTTP `/codex-api/thread/rollback-files` | ~~直连全量 `thread/read`，绕过桥分派；需要「目标轮及其后全部轮次」，且是点击触发的低频操作~~ **round-113 已推翻此判定并修掉**：它要的是轮次 **id**（不是轮次内容），`turns/list {notLoaded}` 就能免费给；而且**每次消息回退都会付**这一发，不是低频。本行留档以示判读过程，现行结论见 `round-113-rollback-files-bounded-read.md`。 |
| `threadArchiveRecovery.ts` 的 `callRpcWithArchiveRecovery`（`turn/start` 分支） | `turn/start` 报 thread-not-found 时先 `thread/resume {threadId}` 再重发原请求 —— 这是**错误恢复**路径（低频），且此处的 resume 与上面的 `startQueuedTurn` 同属「加载线程」性质，本可同样带 `excludeTurns:true`，但它是异常兜底、失败时会立刻走 `throw`，收益仅限「线程恰好很大且确实未加载」这一交叉情形。**本轮刻意不动兜底路径**（与 round-111 对 `readThreadForTurnPage` 的取舍一致：兜底的意义就是绕开失效的机制）。 |

## 四、对照清单（复核已覆盖 / 已记录，无漏）

**经桥的 rpc 分派、已被有界改写覆盖（6 处）**：`api/gateway/threads.ts` 的 `getThreadMessagesV2` / `getThreadDetailV2` / resume、`api/gateway/develop.ts` 的 `getThreadReviewResult`、`telegramThreadBridge` 的两处（round-111）、`codexAppServerBridge` 的 `canStartQueuedTurn`（round-111）。

**此前已记录的有意保留（4 处）**：`threadSearch.loadAllThreadsForSearch`（全文搜索索引）、`threadRoutes` 的 `thread-file-change-fallback` 与 `thread-live-state`、`AppServerProcess.readThreadForTurnPage`（上翻兜底）。

## 五、验证

1. **类型**：`vue-tsc --noEmit` → `EXIT=0`（干净）。
2. **定向单测**：`codexAppServerBridge.inlinePayload.test.ts` **29/29**（含本轮新增 1 例「resumes with excludeTurns before starting a queued turn」——断言 resume 是第一个调用、且紧接 `turn/start`，参数逐个相等；`buildQueuedTurnParams` 途中额外发的 `config/read` + `model/list` 与本次断言无关，已在测试里注明）。
3. **真机探针**：见 §二 的 5 步矩阵。
4. **全量**：**694 例 / 691 通过 / 3 失败**（694 = round-111 的 693 + 本轮新增 1）。3 失败 = `codexAppServerBridge.archive.test.ts` 的 **2 例恒定 Windows 平台差异**（隔离复跑 **2 failed / 30 passed**，形态是 `expect(info.mode & 0o777).toBe(0o600)` 得到 `0o438`）+ `inlinePayload` 的 **1 例并发抖动**（`reverts only the requested file…` 超时；该文件隔离复跑 **29/29 通过**）。**零回归。**

## 六、涉及文件

- 改：`src/server/codexAppServerBridge.ts`（`startQueuedTurn` 的 resume 加 `excludeTurns: true` + 注释）
- 改：`src/server/codexAppServerBridge.inlinePayload.test.ts`（新增 1 例）
- 探针：`tmp/probe-0158-resume-exclude-turns.cjs`（未入库，供复跑）
- 文档：本文档 + round-111 §二 表补 2 行（rollback-files / archiveRecovery）+ 总入口登记

## 七、遗留

- ~~无新增待办。`rollback-files` 与 `archiveRecovery` 属**有意保留**（已记录），不是待办。~~ **round-113 修正**：`rollback-files` 的有界化已在 round-113 完成（本轮判定被推翻——见 §三 表）；仍属有意保留的只剩 `archiveRecovery`。
- 若日后 `thread/read` 的兜底路径（`readThreadForTurnPage`）或归档恢复需要重新评估，触发点是「兜底被高频走到」或「有明确的 file-change 分页需求」。
