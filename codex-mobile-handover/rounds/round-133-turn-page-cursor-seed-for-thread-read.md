# round-133：经 `thread/read` 打开的线程也播种游标链——上翻 7.5s → 1.0s

> 承接 [round-132](round-132-thinking-and-turn-page-hang-diagnosis.md)。那一轮把症状②（上翻 RPC 长时间挂起）归因清楚了但**明确只归因、未改**（§3.2 / §3.3 / §10.6 / §11.6），本轮按用户「接着修症状2」实施，并补齐那条被点名的缺口。

## 一、结论先行

**症状②的根因是一条接线漏了，不是路由本身慢。** 上翻路由 `/codex-api/thread-turn-page` 只在 `ThreadTurnPageCursorChain` 里有该锚点的游标时才走有界页；链的**唯一**种子本来是 `thread/resume` 的 `initialTurnsPage.nextCursor`。而 round-110 引入的 **`thread/read` 有界读同样拿到了 `nextCursor`，却没有交给同一个回调** —— 于是**任何经 `thread/read` 打开的线程，链是空的**，首次上翻必然未命中并回落 `readThreadForTurnPage()` ＝ 全量 `thread/read {includeTurns:true}` + 内存切片。

**修复**：把有界页自己的 `nextCursor` 也交给 `recordThreadTurnPageBoundary`（`threadReadTurnPage.ts` 新增 `onTurnPageBoundary`，`codexAppServerBridge.ts` 接线）。

**同窗口同锚点 A/B（决定性）**：

| 相 | 进程/链路状态 | 首次上翻 | 载荷 |
| --- | --- | --- | --- |
| **A** | 进程刚起、链空（＝修复前的等效状态） | **7558ms** | 1631498 B / turns 10 / startTurnIndex 154 |
| **B** | 先 `thread/read` 打开（修复后已播种） | **1018ms** | **1631498 B / turns 10 / startTurnIndex 154** |

**7.4×**，且**载荷逐字节相同**（连 `oldestReturnedTurnId` 都一致）。**修复只换取数路径，不改返回内容。**

## 二、根因：谁在给游标链播种

```
GET /codex-api/thread-turn-page?threadId&beforeTurnId&limit
  └─ threadRoutes.ts L156  appServer.readBoundedThreadTurnPage(threadId, beforeTurnId, limit)
       └─ threadTurnPage.ts L261  readThreadTurnIds()          // 每次重列 id（100/页，notLoaded，只读不记）
            L279  chain.lookup(threadId, beforeTurnId)         // ★未命中 → return null
       └─ L177  否则回落 appServer.readThreadForTurnPage(threadId)
                 = 全量 thread/read {includeTurns:true}        // ★7.5 秒在这里
                 → 内存 slice(startTurnIndex, beforeIndex)
```

链的写入点只有一处入口 —— `recordThreadTurnPageBoundary(_)` → `ThreadTurnPageCursorChain.record(...)`，而它在 round-132 之前只有**一个**调用方：

| 打开线程的路径 | 前端调用 | 是否播种链（修复前） |
| --- | --- | --- |
| `resumeThread` | `thread/resume` | ✅ 经 `initialTurnsPage.nextCursor`（round-84 起） |
| `getThreadDetailV2` / `getThreadMessagesV2` | `thread/read {includeTurns:true}` | ❌ **拿到 `nextCursor` 却丢掉** |

`readThreadWithTurnPage`（`bridge/threadReadTurnPage.ts`）内部早就在用这个游标了 —— `needsCount = page.data.length > 0 && page.nextCursor !== ''`（L123/L145）就是为了判断「还有更老的轮次」。**它手里握着播种所需的全部信息，只是没有出口。**

## 三、改动

### 3.1 `src/server/bridge/threadReadTurnPage.ts`（产品源码）

给依赖契约加一个回调，并在组装有界页之后回报边界：

```ts
export type ThreadReadTurnPageDeps = RpcExecutor & {
  sendRead: (params: unknown) => Promise<unknown>
  /**
   * Reports the cursor that reaches the turns immediately older than
   * `oldestTurnId` -- this page's own `nextCursor` (round-132) ...
   */
  onTurnPageBoundary?: (threadId: string, oldestTurnId: string, olderCursor: string | null) => void
}
```

```ts
  const turns = [...page.data].reverse()

  // round-132: hand this page's own `nextCursor` to the older-turn route ...
  // The page is newest-first, so after the reverse its oldest turn is `turns[0]`.
  const oldestTurnId = readNonEmptyString(asRecord(turns[0])?.id)
  if (oldestTurnId && deps.onTurnPageBoundary) {
    deps.onTurnPageBoundary(threadId, oldestTurnId, page.nextCursor || null)
  }
```

三处细节是有意的：

| 细节 | 理由 |
| --- | --- |
| 锚点取 `turns[0]`（**reverse 之后**） | 页是 newest-first，最老一轮才是前端下次要问「它之前是什么」的那个锚点 |
| 空页（`page.data = []`，新线程）**不回报** | 没有锚点可记；`readNonEmptyString` 自然得到空串 |
| `page.nextCursor || null` | 短页（`nextCursor` 为 `''`）表示已到线程开头，按 `record` 的既有语义记 `null`；`ThreadTurnPageCursorChain.record` 对空游标本来就是**直接 return**（不记） |

### 3.2 `src/server/codexAppServerBridge.ts`（产品源码）

接线，与 resume 那一支逐字对称：

```ts
            : body.method === 'thread/read'
              ? await readThreadWithTurnPage({
                rpc: (method, params) => appServer.rpc(method, params),
                sendRead: (params) => callRpcWithArchiveRecovery(appServer, 'thread/read', params),
                onTurnPageBoundary: (threadId, oldestTurnId, olderCursor) => {
                  appServer.recordThreadTurnPageBoundary(threadId, oldestTurnId, olderCursor)
                },
              }, body.params ?? null)
```

**为什么这个改动只会变快、不会变慢**：`readBoundedThreadTurnPage` 在拿不到游标时**才**回落（`if (!cursor) return null`）。多播一个边界 ⇒ 命中率只增不减；命中时是 ~1.0s 的有界单页，未命中时是 ~7.5s 的全量读，**两条路返回的内容已被 A/B 证明逐字节相同**。

## 四、验证

### 4.1 单测（`threadReadTurnPage.test.ts`：8 → 11 例）

新增 `describe('older-turn cursor boundary (round-132)')` 3 例：

1. **满页 → 回报 `(threadId, 页最老轮, nextCursor)`**：page `t20…t11`、`nextCursor='cursor-back'` ⇒ 断言收到 `('thread-1', 't11', 'cursor-back')`（`t11` 正是 reverse 后的 `turns[0]`）。
2. **短页到线程开头 → `olderCursor` 为 `null`**：page `t3,t2,t1`、`nextCursor=null` ⇒ `('thread-1', 't1', null)`。
3. **空页（新线程）→ 一次都不回报**。

### 4.2 反跑（决定性）

`node tmp/r133-flip-boundary.cjs off|on` 把回报语句改成 `if (false && …)`：

```
off  → 2 failed | 9 passed   （两例边界用例红：expected "vi.fn()" to be called 1 times, but got 0 times）
on   → 11 passed             （与备份一致 = true，7515 字节）
```

脚本对替换片段做「出现次数必须为 1」断言（**实测第一次用跨行锚点失配 —— 文件是 CRLF，`NEEDLE` 出现 0 次、脚本正确拒绝写盘**，改单行锚点后 `NEEDLE=1 次`）。

### 4.3 端到端 A/B（决定性，同锚点同载荷）

`tmp/r133-e2e-first-scrollup.cjs`（`PHASE=A|B`）。线程 `01a0cdce-…-4801b2a1cfa9` ＝ **174 轮**，锚点取 `ids[len-10]` ＝ `01a0eace-18ec-7243-bfdf-94a22035cd82`（index 164，即最新 10 轮里最老那一轮）：

| 相 | `thread/read` 打开 | 首次上翻 | 字节 | turns | startTurnIndex | oldestReturnedTurnId |
| --- | --- | --- | --- | --- | --- | --- |
| **A**（进程刚起，不打开） | — | **7558ms** | 1631498 | 10 | 154 | `01a0e64e-…-6f3d2d9e31fb` |
| **B**（先 `thread/read`） | 1829ms / 返回 10 轮 / **最老轮 = 锚点** | **1018ms** | **1631498** | **10** | **154** | **`01a0e64e-…-6f3d2d9e31fb`** |

B 相里 `thread/read` 返回 10 轮且**最老一轮恰好就是锚点**（`01a0eace-…`，`threadTurnStartIndex = 164`）—— 这正是被播进链的那个键，所以下一句请求必然命中。

### 4.4 排除替代解释：同进程换一个**没播种过**的锚点

B 相之后**同一个进程**里（app-server 早已「热」了）：

| 锚点 | 是否在链上 | 上翻耗时 |
| --- | --- | --- |
| `01a0eace-…`（B 相播种的那个） | 是 | **999ms** |
| `01a0e3ae-b96f-77b3-9897-b49c4951d5cc`（`ids[len-30]`） | 否 | **6566ms** |

⇒ 「快」的**唯一**条件是**该锚点在链上**；不是 app-server 变热、也不是缓存副作用。`tmp/r133-probe-unseeded-anchor.cjs`。

### 4.5 基线

`vue-tsc --noEmit` **EXIT=0 / 0 错误**；全量 **747 例 / 747 通过（76 文件）零失败**（＝ round-132 基线 744 ＋ 本轮 3 例）。

## 五、诚实边界

1. **本轮不动的仍是大多数**：症状 A 的 §10.6 第 ②③④ 条（桥层 materialization-pending 兜底仍伪造 `status:{type:'inProgress'}`、有界读仍把「一页空数组」当「线程真的没有轮次」、`FOREGROUND_RESUME_MIN_HIDDEN_MS = 400` 与前台恢复范围）**一行未改**。
2. **链的生命周期问题本轮没解决**：链是**进程内内存**，桥重启 / app-server 重启（ordinal 重编号）/ LRU 淘汰（64 线程 × 每线程 256 锚点）之后仍会回到未命中。本轮只是把「打开线程」这条路也接上，**不等于**链就永远命中 —— 重启后的**首次**上翻若发生在「打开该线程之前」，仍会是 7.5s（A 相读数就是它的量级）。
3. **回落路径仍然不登记锚点**（`threadTurnPage.ts` L323 只在有界路径执行）。所以「一次未命中」之后**同一锚点的第二次**才靠 30s TTL 的全量读缓存兜住（A 相 `secondScrollUp = 891ms`）—— 这个缓存会被 `thread/resume`/`thread/read`/`thread/fork`/`thread/start` 的 pipeline 快照以及任何带该 threadId 的通知清掉，清掉之后又是 7.5s。
4. **`ThreadTurnPageCursorChain.record` 对 `null` 游标是 no-op**：短页（`nextCursor=''`）不会真的写入任何条目。换句话说，**「线程开头」这个边界靠的是「查不到 ⇒ 未命中 ⇒ 回落」**，而不是「查到 null ⇒ 停住」。本轮没有改变这一语义（改它会动到 `readBoundedThreadTurnPage` 的判据）。
5. **只测了 Windows / codex-cli 0.160.1 的本机隔离 home**（`D:\codex-home-isolate123`，174 轮线程，标称 rollout 1.6MB 级载荷）。更大的线程（round-132 记的 30.89MB / 16 轮那种）上，落回的绝对值会更大、收益比例只会更高，但**未实测**。
6. **未发布、未推送**（npm `latest` 仍 `0.1.127`）。

## 六、复现 / 复跑

```bash
# 1) 重建桥（改动在 src/server/** ⇒ dist-cli）
node node_modules/tsup/dist/cli-default.js

# 2) 起隔离服务（新端口，指向隔离 home；不要用真实 ~/.codex）
cd D:/code/codex-mobile
CODEX_HOME=D:/codex-home-isolate123 node dist-cli/index.js \
  --port 4195 --no-tunnel --no-open --no-login --no-password

# 3) A 相（进程刚起，链空 = 修复前等效）
BASE=http://127.0.0.1:4195 PHASE=A node tmp/r133-e2e-first-scrollup.cjs

# 4) 重启服务清空链，再跑 B 相（thread/read 打开后）
BASE=http://127.0.0.1:4195 PHASE=B node tmp/r133-e2e-first-scrollup.cjs

# 5) 对照：同进程里换一个没播种过的锚点
BASE=http://127.0.0.1:4195 OFFSET=30 node tmp/r133-probe-unseeded-anchor.cjs

# 单测与反跑
node node_modules/vitest/vitest.mjs run src/server/bridge/threadReadTurnPage.test.ts
node tmp/r133-flip-boundary.cjs off && node node_modules/vitest/vitest.mjs run src/server/bridge/threadReadTurnPage.test.ts
node tmp/r133-flip-boundary.cjs on
```

**探针（`tmp/`，未入库）**：`r133-e2e-first-scrollup.cjs`（两相 A/B ＋ 各相 `.json`）、`r133-probe-unseeded-anchor.cjs`（同进程未播种锚点对照）、`r133-flip-boundary.cjs`（单测反跑开关 + 备份/复核）。

**本轮新增的一条环境事实**：本机 WorkBuddy 注入的 `HTTP(S)_PROXY=127.0.0.1:64639` 对 `github.com` 的 `CONNECT` 返 **502**（只放行 `api.github.com` / `codeload`），而用户自己的 `127.0.0.1:7890` 可通 —— 推送需显式 `env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy git -c http.proxy=http://127.0.0.1:7890 push`。（注意 git **没有** `https.proxy` 这个配置项，写它等于没写、仍走环境变量。）
