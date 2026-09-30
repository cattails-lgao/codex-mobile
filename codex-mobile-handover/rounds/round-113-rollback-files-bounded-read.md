# round-113 — 回退路径的全量读收口（`/codex-api/thread/rollback-files`）

日期：2026-09-30。由头：用户验收时提问「我看现在回退的时候，会请求 rpc？」——追这条路径时发现 round-112 把其中一处判成「有意保留」判错了，本轮修掉。

**结论先行：** 回退确实必然发 RPC（服务端动作），但**点一次回退会额外带上一发全量 `thread/read {includeTurns:true}`**——它就是 round-112 那张「有意保留」表里的 `rollback-files` 行。本轮把这一发换成「元数据读 + `notLoaded` id 链」，真机 3 个线程证明取到的 turn id 序列与全量读逐位一致；端到端（vite dev + 真实路由）从**热态 48.5s / 1.42MB**（同一口径的 `thread/read {includeTurns:true}`）降到 **41ms**。任何一半不可信仍回落全量读（= 改动前行为）。本轮不给 `AppServerProcess` 加方法，**未** bump `SHARED_BRIDGE_VERSION`。

## 一、先把用户的问题答清楚：回退会发哪些 RPC

回退是**服务端动作**（真裁线程、真改文件），浏览器不可能自己完成，所以必然要打 app-server。两条路径：

**A. 消息回退**（`useDesktopState.ts` 的 `rollbackSelectedThread`）

| # | 请求 | 条件 |
|---|---|---|
| 1 | `turn/interrupt` | 该线程正在生成时才发 |
| 2 | `thread/revert {threadId, beforeTurnId}` | 必发，服务端丢弃目标轮及其后所有轮次 |
| 3 | `thread/turns/list {cursor, desc, limit:200, itemsView:'full'}` | 返回带 `turnsBackwardsCursor` 时（paginated 恒带）。**不是多余的**：revert 的返回体 `turns` 恒为空（round-74 契约），不补这页前端会闪一次空白重灌 |
| 4 | `POST /codex-api/thread/rollback-files` → 桥内再读线程 | 线程有 cwd 就必发（退对话的同时退文件）。**本轮改的就是它发的那一发** |
| 5 | `thread/list` + 重新 `loadMessages` | 收尾的 `syncFromNotifications()` 刷新 |

**B. 只撤销文件变更**（消息里文件变更块的 Undo/Redo 按钮）→ 只有第 4 步那一发。

顺带澄清：`thread/revert` 之后的桥内后处理（trim / inline / session-merge / stream-error 合并）**不发额外 RPC**，全是本地文件读与内存 buffer 读，且 revert 的 `turns` 为空时逐级早退。

## 二、修掉的那一处

**位置**：`src/server/codexAppServerBridge.ts` 的 `POST /codex-api/thread/rollback-files` 处理（HTTP 路由在同一文件内，故它直连 `appServer.rpc`、绕过桥的 rpc 分派，round-84/110 的有界改写都不覆盖它）。

**它本来要什么**：两件事——session log 路径（`thread.path`），以及「目标轮及其后」的轮次 id 集合（`scope:'single_turn'` 时只取目标轮）。为此它发 `thread/read {includeTurns:true}` 并遍历水合出来的轮次。

**改成什么**（新增模块 `src/server/bridge/rollbackTurnContext.ts`）：

1. `thread/read {threadId, includeTurns:false}` → 拿 `thread.path`（6ms / 0.00MB）；
2. `thread/turns/list {itemsView:'notLoaded', desc}` 的 `nextCursor` 链 → 拿全部 turn id（复用 round-86 就在用的 `readThreadTurnIds`，11ms / 625B），在数组里定位目标轮、切出「该轮及其后」；
3. **任一半不可信就返回 null**，调用方跑原来的全量读——所以这条路径**只可能变便宜，不可能变得不正确**。`sessionPath` 为空是「No session log available」这个**合法答案**，不当回落理由（`readRollbackTurnContext` 返回 `{sessionPath:'', turnIds:[]}`）。

**语义逐条保留**：`path` 缺失/非绝对 → `No session log available`；找不到目标轮 → `No turns to revert`；`single_turn` / `turn_and_later`；`undo` / `redo` 两分支；`patchIds` / `filePaths` 过滤。**patch 应用与命令文件回退的代码一行未动。**

## 三、真机等价对照（0.158.0，只读探针 `tmp/probe-0158-rollback-turn-ids.cjs`）

探针不写任何文件：不发 `revert`、不发 `turn/start`。

| 线程 | A 全量 `read{includeTurns:true}` | B 元数据读 | C `turns/list {notLoaded}` 链 | id 序列 | path |
|---|---|---|---|---|---|
| 12.12MB / 16 轮 | 2634ms / 12.12MB | 6ms / 0.00MB | 11ms / 625B（1 页） | **逐位一致** | 相同 |
| 918KB / 2 轮 | 74ms | 11ms | 35ms（1 页） | **逐位一致** | 相同 |
| 517KB / 2 轮 | 111ms | 14ms | 67ms（1 页） | **逐位一致** | 相同 |

- `thread` 对象 32 个字段，除 `turns` 外 **onlyFull / onlyMeta / changed 全空**（第 1 个线程）。后两个线程的 `createdAt`/`updatedAt` 两次读不同——本路由不读这两个字段，且差异看起来是「读」的副作用而非「水合」的，记录备查。
- **scope 语义**：对最老、中间、最新三个 target，`single_turn` / `turn_and_later` 由 A 与由 C 推出的 id 集合**完全相等**；不存在的 target 两条路都渲染成 `No turns to revert`。
- 本机沙箱最大线程只有 16 轮（单页即覆盖），多页链的能力由 `readThreadTurnIds` 既有实现与 round-104 实测（页被钳到 100 条、靠 `nextCursor` 收全）承担，本模块直接复用它。

## 四、端到端（vite dev :4377 + 真实 HTTP 路由，探针 `tmp/probe-rollback-http.cjs`）

同一个 app-server、**预热之后**的同一口径（经桥 `/codex-api/rpc`，含桥的 rpc 后处理与 JSON 序列化）：

| 形态 | 耗时 | 响应体 |
|---|---|---|
| `thread/read {includeTurns:true}` | **48479ms** | 1.42MB |
| `thread/read {includeTurns:false}` | 38ms | 1077B |
| `thread/turns/list {notLoaded}` | 33ms | 3128B |
| **路由 `rollback-files`（bogus anchor）×3** | **41 / 38 / 42ms** | `{"reverted":0,"errors":[],"message":"No turns to revert"}` |

- 48.5s 是**桥的口径**（app-server 裸读 2634ms，其余是后处理与 1.42MB 序列化），也正是用户点回退时真正会等的时间。
- 端到端用 bogus anchor 是刻意的：走到「找轮」就停，**绝不触碰文件**；它验证的是新前缀全链路（元数据读 → `isAbsolute(path)` → id 链 → 定位）在真实 HTTP 下通畅。找到轮之后的 patch 应用代码未改动。

## 五、上一轮的判读错在哪（记录以校正口径）

round-112 把这里判成「有意保留」，理由是「需要『目标轮及其后』这一未知长度区间，有界读给不了」+「用户显式点击才触发，低频」。两点都站不住：

1. **区间未知 ≠ 必须水合**。要的是**轮次 id**，而 id 有一份免费的 `notLoaded` 清单（0.00MB）——不知道有多长只说明要顺着 `nextCursor` 走，不说明要构造轮次。
2. **它不是低频**。`rollbackSelectedThread` 只要线程有 cwd 就调 `revertThreadFileChanges`，所以**每次消息回退都付这一发**。round-112 自己把「每个排队轮付一次」判为高频真漏项，却在同一张表里放过了「每次回退付一次」。

教训：判「有意保留」时，先用**同一口径**量一遍成本再定，别按「谁触发」猜频率。

## 六、验证

1. **类型**：`vue-tsc --noEmit` → `EXIT=0`。
2. **定向单测**：`rollbackTurnContext.test.ts`（新增，**8 例**：调用序列只含 `includeTurns:false` + `notLoaded`、多页 `nextCursor` 链的拼接与本位序、path 空时**不发** id 链、元数据读失败 → null、`turns/list` 不支持 → null、id-less turn → null、形状异常 → null、空 threadId 不发请求）+ `threadTurnPage.test.ts` 24 + `threadReadTurnPage.test.ts` 8 → **40/40**。
3. **真机探针**：§三 + §四。
4. **全量**：**702 例 / 699 通过 / 3 失败**（702 = round-112 的 694 + 本轮新增 8）。3 失败 = `codexAppServerBridge.archive.test.ts` 的 **2 例恒定 Windows 平台差异**（隔离复跑 **2 failed / 30 passed**，形态 `expect(info.mode & 0o777).toBe(0o600)` 得 `0o438`）+ `inlinePayload` 的 **1 例并发抖动**（`reverts only the requested file…` 5s 超时；隔离复跑 **29/29 通过**，该例 1890ms）。**零回归。**

## 七、涉及文件

- 新增：`src/server/bridge/rollbackTurnContext.ts`（`readRollbackTurnContext`）
- 新增：`src/server/bridge/rollbackTurnContext.test.ts`（8 例）
- 改：`src/server/codexAppServerBridge.ts`（import + 路由内「取 path + 定位轮次」段落；`thread/read{includeTurns:true}` 降级为兜底）
- 探针（未入库，供复跑）：`tmp/probe-0158-rollback-turn-ids.cjs`、`tmp/probe-rollback-http.cjs`
- 文档：本文档 + round-111 §二 表该行改判 + round-112 §三/§七 修正 + 总入口登记

## 八、遗留

- 无新增待办。`threadArchiveRecovery`（`turn/start` not-found 恢复）仍是**有意保留**：它是异常兜底，且失败即 `throw`，与本次同类的收益要「线程恰好很大且确实未加载」才成立。
- 收敛口径更新：经桥分派被覆盖 6 处、有意保留 **5 处**（`threadSearch` 全文索引、`threadRoutes` 的文件变更兜底与 live-state、`AppServerProcess.readThreadForTurnPage` 上翻兜底、`threadArchiveRecovery`），**已无未归类**。
