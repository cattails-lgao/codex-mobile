# Round-84：打开会话去掉全量历史水合（有界轮次页）（2026-09-16）

> **背景：** 用户报告「消息列表加载慢」，并明确口径——**慢的不是 DOM，等待时间全部花在请求 RPC 上**。round-83 之后的剖面已把成本定位到 `thread/resume`：桥打开线程时让 app-server 全量水合历史（实测 30.9MB rollout / 16 轮 → **1928ms / 12.12MB**），随后桥自己 `slice` 到 10 轮把绝大部分扔掉。本轮把这条路径换成协议推荐的有界请求。

## 1. 现象与口径

用户原话：「不是 dom 慢，是 rpc 慢」。即先前的渲染层调研（DOM windowing / 虚拟列表）不是本轮的靶子；要动的是**打开会话那一次 RPC**。

## 2. 根因（实测确认）

`src/server/bridge/rpcPipeline.ts` 的 `trimThreadTurnsInRpcResult` 把 `thread.turns` 裁到 `THREAD_RESPONSE_TURN_LIMIT`（10），但**裁剪发生在 app-server 已经把全部轮次构造好之后**——桥拿到 12.12MB 再扔掉 2/3。因此裁剪、瘦身、内联图片外化全都在成本之后，**永不减少 app-server 侧成本**。这也解释了 `ThreadReadResultCache` 为什么不覆盖 resume（每次都是新的全量代价，缓存无意义）。

绕开桥、直连 app-server 逐形态实测（同 `CODEX_HOME`、同 `-c` 覆盖；每个形态一个全新进程，避免进程内状态累积）：

| 请求形态 | 耗时 | 载荷 |
|---|---|---|
| `thread/read {includeTurns:false}` | 2–3ms | 0MB |
| `thread/resume {threadId}`（**桥当时发的**） | **2118ms** | **12.12MB** |
| `thread/resume {excludeTurns:true}` | 115–135ms | 0MB |
| `thread/turns/list {10000, notLoaded, desc}`（数轮次） | 2–14ms | 0.00MB |
| `thread/turns/list {10, full, desc}`（UI 真正要的那页） | 159–634ms | 4.29MB |

协议自己就写着这条路是废弃的：`ThreadReadParams.includeTurns` 的描述原文是「Full-history hydration is **deprecated** for paginated threads; prefer a metadata-only read and page with `thread/turns/list` and `thread/items/list`.」；`ThreadResumeParams` 则提供 `excludeTurns` 与 `initialTurnsPage{limit, sortDirection, itemsView}`，后者描述为「include a `thread/turns/list` page in the resume response so clients can bootstrap recent turns **without a second request**」。

## 3. 兼容性闸门（改前已验证，非推断）

换路径的前提是「新路径返回的东西和旧路径裁剪后的东西逐字相同」。实测三点，全部成立：

1. `initialTurnsPage{sortDirection:"desc"}` 返回的页**是 newest-first**，即恰好等于 `全量水合.slice(-10)` 的**逆序**（id 序逐位相同）；
2. 同一页与 `thread/turns/list{limit:10, desc, itemsView:"full"}` **深度逐字相同**（含 item 键集，0 处差异）——`itemsView:"full"` 与全量水合的 item shape 在上一轮已比对过；
3. 该页的 `nextCursor`/`backwardsCursor` 在还有更早轮次时非空、翻到头为 null，且游标翻页**无重叠无跳跃**（limit=5 分 4 页收齐 16 轮、去重后仍是 16）。

## 4. 修复

新增 `src/server/bridge/threadResumeTurnPage.ts`（纯函数 + 注入式 RPC，可单测）：

- `buildThreadResumeParamsWithTurnPage`：把 `{threadId}` 改写成 `{threadId, excludeTurns:true, initialTurnsPage:{limit:THREAD_RESPONSE_TURN_LIMIT, sortDirection:"desc", itemsView:"full"}}`。**不适用时返回原对象引用**（同一个 `identity`），调用方据此判断「我发的是旧请求」；无 `threadId`（按 path/history resume）、调用方已显式给 `excludeTurns` 或 `initialTurnsPage` 的情况一律不动。
- `promoteResumeTurnPage`：把页**反转成升序**（`thread.turns` 在桥内处处是 oldest-first）后挂到 `thread.turns`，并**删掉 `initialTurnsPage`**（不删等于同一批轮次发两遍，4.29MB → 8.6MB），同时写入 `threadTurnStartIndex`。
- `readThreadTurnCount`：协议**没有轮次总数接口**，而游标 `rolloutOrdinal` 是 rollout 字节序位不是轮次下标，所以总数只能从 `turns/list{itemsView:"notLoaded"}` 读——单发 `limit:10000` 覆盖任何现实线程（16 轮实测 1–14ms / 0.00MB），更大则用游标续读（上限 50 页），拿不到就返回 null，**不猜**。
- `resumeThreadWithTurnPage`：串起「改写 → 发送 → 支持性判定 → 提升」；只有整页（`nextCursor` 非空）才额外花那一次计数 RPC，**短线程/新线程零额外请求**。

接入点在 `src/server/codexAppServerBridge.ts` 的 `/codex-api/rpc` 分发处（resume 的唯一入口），单点覆盖前端所有调用方。

**对浏览器保持今天的形状**：响应仍是 `thread.turns`（升序、≤10 轮）+ `threadTurnStartIndex`，所以整条既有管道（10 轮裁剪、内联图片外化、skill/命令合并、snapshot、`overlayExternalSession`）与前端 `normalizeThreadMessagesV2` **一行都不用改**。

### 安全网：旧 app-server 不会白屏

若 app-server 是旧版本，它**忽略未知的 `initialTurnsPage` 却仍认 `excludeTurns`**，那么响应会一个轮次都没有——直接渲染就是空对话。因此加了显式判定 `isThreadResumeTurnPageSupported`（响应里存在 `initialTurnsPage.data` 数组才算支持，**空数组也算支持**，那是新建线程的正常形态），不支持时**按原参数重放一次旧请求**。代价是旧版本下多一次 RPC，换来的是「不会因升级不同步而白屏」。

## 5. 验证

- **协议假设固化为可复跑脚本**：`scripts/probe-resume-turn-page.cjs`（一个全新 app-server 进程内跑完，7 项断言，失败非零退出）。2026-09-16 实测 **7/7 PASS**，并打印成本对照 **1153ms / 12.12MB → 198ms / 4.29MB**，`derived threadTurnStartIndex = 6`（与旧裁剪一致）。**app-server 升级后应先跑这个**。
- **新增单测 23 例**（`src/server/bridge/threadResumeTurnPage.test.ts`）：改写契约（含「不适用时同一引用」）、支持性判定、计数单发/翻页/失败降级、页反转与 `initialTurnsPage` 删除、开始下标（整页/短页/总数未知）、以及「旧 app-server 触发重放」与「调用方自带形状时不动」两条集成分支。
- **全量 Vitest：617 例，615 通过 / 2 失败**。2 例为 `codexAppServerBridge.archive.test.ts` 的既有 Windows 环境性失败（symlink realpath、`mode 0o600` vs Windows 的 `0o666`），与本次改动无关。基线（改动前）为 591 例同 2 例失败。
- **`vue-tsc --noEmit`** 干净。
- **端到端（真实桥，`:4173`，2 个真实 app-server 进程）**：`POST /codex-api/rpc {method:'thread/resume', params:{threadId}}` → HTTP 200、`thread.turns.length = 10`、`threadTurnStartIndex = 6`、响应**不含** `initialTurnsPage`、首尾轮次 id 与旧路径一致、客户端可见载荷仍 **1.56MB**（与改动前逐字同量，说明变的是服务端成本不是客户端体积）。
- **同一桥上的 A/B（最有说服力的一条）**：`excludeTurns:false` 是「调用方显式指定」，桥会照旧走全量水合，因此可以在**同一份代码、同一个进程**里对打。交替三轮：

  | 轮 | 旧路径（全量水合） | 新路径（有界页） | 倍数 |
  |---|---|---|---|
  | 1 | 3167ms | 1203ms | 2.63× |
  | 2 | 2289ms | 734ms | 3.12× |
  | 3 | 2532ms | 1242ms | 2.04× |

  三轮均为 `turns=10 startIndex=6`，**输出逐字一致**。

## 6. 遗留与后续（本轮未做）

- **`readThreadForTurnPage` 仍是全量水合**（`src/server/codexAppServerBridge.ts`，上翻更早轮次用）：发 `thread/read{includeTurns:true}` 再 `slice`，首调约 1s，之后靠 20s 缓存。本轮拿到的 `turnsBackwardsCursor`（顶层，已在响应里原样透出）正是它该用的游标——协议描述为「Pass this as `cursor` to `thread/turns/list` with `sortDirection: "desc"`」。改成真分页可让上翻也走有界路径，属独立的下一步。

  > **更正（round-86 实测）：** 上面「`turnsBackwardsCursor` 正是它该用的游标」**是错的**。该游标带 `includeAnchor: true`，用它 desc 只会**原样重发同一页**（`scripts/probe-turn-page.cjs` 已固化为断言）。真正往更老走的是 `initialTurnsPage.nextCursor`（`includeAnchor: false`）；游标只能逐页串链，且游标是不透明的（把 turn id 当 `cursor` 会被 `invalid cursor` 拒绝）。round-86 据此实现并修掉了这条遗留。
- **桥侧管道的成本现在浮上来了**：app-server 侧新路径只要 198ms，而经桥端到端是 734–1242ms。差值来自 `sanitizeThreadTurnsInlinePayloads`（内联图片外化）+ skill/命令合并（要读 session 日志）等既有步骤——它们在改动前后**同样发生**，不是本轮引入的回归，但已成为打开会话的主要成本，值得单独剖面。
- **`threadArchiveRecovery` 里的辅助 resume**（`turn/start` 失败后补一次 `thread/resume`）调用方丢弃返回值，可顺带改成 `excludeTurns:true`；本轮未动，因为它只在罕见救济路径上。
- 版本号仍停在 **0.1.124**（npm publish 由用户执行），本轮改动随下一次发布一起走 —— **已随 v0.1.125 发布**（2026-09-16）。

## 7. 手测

见 `tests/thread-loading-state/thread-load-capped-to-latest-10-turns.md` 新增的「Round-84」小节。
