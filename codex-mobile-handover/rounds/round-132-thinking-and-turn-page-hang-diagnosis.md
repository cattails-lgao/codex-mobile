# round-132：线上两个回归症状定位——「Thinking 不展示」与「上翻 RPC 6–7 秒」

> 日期：2026-10-08 · 环境：Windows / 托管 node 22.22.2-6 / **codex-cli 0.160.1** / 桥 `dist-cli` **0.1.127** / `CODEX_HOME` = 真实 home 的**等长路径副本** `D:\codex-home-isolate123`（24 字符改写，见 round-131 §六）
> 承接：用户报告「自从更新 codex-mobile-re 版本后，线上环境就出现了 Thinking 状态消息列表没有展示，而且 rpc 接口还会长时间挂起」

**结论先行：两个症状不是一个原因，且都不在「渲染」层。**

① **Thinking 不展示 = 服务端结构上就给不出思考文本。** app-server 落盘并回读的 reasoning 项**只有 `encrypted_content`（密文）+ 空 `summary`**（rollout 原文实证），`thread/read` / `thread/turns/list` 三处实测都是「有项无文」（5390/5390、468/468、492/492）。所以思考文本**唯一来源是前端在轮次进行中抓到的 live 快照**，只落在本地存档（localStorage，**按 origin 隔离**）与桥层镜像 `$CODEX_HOME/.codex-global-state.json → thread-reasoning`——而该镜像**实测为空**。⇒ 更新版本换 origin（或换浏览器 / 清缓存）后，新 origin 的 localStorage 为空、兜底镜像也为空 ⇒ 消息列表里连一个思考块都没有。**渲染管线本身正常**：注入 31 条合法存档，立刻从 0 个思考块变成 10 个。

② **「RPC 长时间挂起」= 上翻回落到了全量水合。** `/codex-api/thread-turn-page` 在**游标链未命中**时回落 `readThreadForTurnPage()` = 全量 `thread/read {includeTurns:true}` 后内存切片。同窗口同锚点 A/B：**回落 7202ms vs 有界 969ms（7.4×）**，而**两者载荷逐轮完全相同**（不丢内容）。真实 App 的连续上翻**不触发**（实测 6 次全 852–1013ms）；触发条件是「锚点不是链上登记过的页边界」或「链因进程重启 / 游标作废而失效」。

---

## 一、结论先行

### 1.1 症状①：Thinking 不展示

| # | 命题 | 读数 | 判定 |
| --- | --- | --- | --- |
| 1 | rollout 里思考是**密文** | `{"type":"reasoning","summary":[],"encrypted_content":"gAAAAA…"}`——**无明文、无 `content`** | 成立（原文） |
| 2 | 直连 app-server `thread/read {includeTurns:true}` 的 reasoning 全空 | **5390/5390** 空（26.16MB / 6698ms） | 成立 |
| 3 | 桥层有界页 `turns/list {10,desc,full}` 的 reasoning 全空 | **468 项，有文本 0** | 成立 |
| 4 | 桥层 `thread/read {includeTurns:true}` 的 reasoning 全空 | **492 项，有文本 0** | 成立 |
| 5 | 真实浏览器上翻 6 次的所有页，reasoning 全空 | 397 / 468 项，**有文本 0**；DOM `.reasoning-block` **恒 0** | 成立 |
| 6 | 规范化层对空 reasoning 直接丢弃 | `normalizers/v2.ts` L499–516：`text = contentText \|\| summaryText; if (!text) return []` | 成立 |
| 7 | 桥层思考镜像为空 | `GET /codex-api/thread-reasoning` → `{"data":{}}`（**11 字节，0 条目**） | 成立 |
| 8 | 全局状态文件里没有该键 | `$CODEX_HOME/.codex-global-state.json` 有 `thread-turn-durations`、**无 `thread-reasoning`**（真实 home 那份 mtime 2026-09-29） | 成立 |
| 9 | **渲染管线正常** | 注入 31 条存档：`.reasoning-block` **0 → 10**，`conversation-item` 178 → 191 | 成立（决定性） |

> **#2–#5 的推广口径已在 §九 更正**：那几条读数对「大线程」成立，但同一 home 里**新建**的线程 `reasoning.content` 会以**明文数组**返回（§9.1）。「服务端结构上给不出思考文本」不是全局事实。

### 1.2 症状②：上翻 6–7 秒

| # | 命题 | 读数 | 判定 |
| --- | --- | --- | --- |
| 1 | 冷进程（游标链空）+ 同锚点：回落 **7202ms / 1.46MB** | 每轮 items `7,6,191,196,232,1,90,22,445,8`（1198 items） | 成立 |
| 2 | 同一锚点在 `thread/resume` 种链后：有界 **969ms / 1.46MB** | 同上，**逐轮完全相同** | 成立 |
| 3 | ⇒ 倍数 **7.4×**，且**回落不丢内容** | 冷/热载荷 byte 级同形 | 成立 |
| 4 | 「体积 0.19MB」是**窗口差异**不是裁剪 | 另一锚点（很旧的轮）回落 = 6095ms / 0.19MB / 200 items，该窗口本身就只有 3–60 items/轮 | 成立 |
| 5 | 真实 App 连续上翻**不触发** | 6 次全 **852–1013ms**、785KB–2106KB（有界页），锚点依次 = resume 边界 → 上一页新边界 | 成立 |
| 6 | 全量读缓存 TTL = 30s，且会被 resume/read/fork/start 与**任意通知**清掉 | `THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000`；`rpcPipeline` L180–185 → `storeThreadReadSnapshot` L621–625；`emitNotification` L563–569 | 成立 |
| 7 | 游标链**只在 `thread/resume` 登记** | L1939–1941 传 `onTurnPageBoundary`；`thread/read` 的 L1943–1947 **不传** | 成立 |

---

## 二、症状①：思考文本的来源链，以及为什么它必然丢

### 2.1 服务端落盘的就是密文

线程 `01a0cdce-f68c-7ff0-8670-4801b2a1cfa9`（rollout **123.89MB / 173 轮 / 14199 items**，其中 `reasoning` 5390、`commandExecution` 4481、`collabAgentToolCall` 2035、`agentMessage` 1284、`fileChange` 601、`mcpToolCall` 201、`contextCompaction` 37、`userMessage` 170）里，reasoning 记录原样为：

```json
{"timestamp":"…","ordinal":9,"type":"response_item",
 "payload":{"type":"reasoning","id":"rs_06c133…","summary":[],"encrypted_content":"gAAAAA…"}}
```

**没有明文、没有 `content`。** 这不是「桥层裁掉了」，是 app-server 自己的记录形态。所以 `thread/read` / `thread/turns/list` **在任何 itemsView 下都回不出思考文本**——实测三处全空（§1.1 #2/#3/#4）。

### 2.2 于是只剩两条本地存档

| 存档 | 位置 | 上限 | 隔离性 |
| --- | --- | --- | --- |
| ① localStorage | `codex-web-local.thread-reasoning.v1` | 每线程 `slice(-20)` | **按 origin 隔离**：换端口/换域名/换浏览器/清缓存 ⇒ 全空 |
| ② 桥层镜像 | `$CODEX_HOME/.codex-global-state.json` 的 `thread-reasoning` | 每线程 20 条 | 与 home 绑定，跨 origin 但**同机** |

写入路径：`useDesktopStatePersistence.ts` L69–80（先写 localStorage，再对**非空的线程**逐个 `PUT /codex-api/thread-reasoning`）。
恢复路径：`useDesktopState.ts` L3614–3644（启动时 `GET`，**镜像为空时 early-return**，保留 localStorage 兜底）。

**实测 ② 为空**（§1.1 #7/#8）：同一台机器上 `thread-turn-durations` 镜像有值、`thread-reasoning` 连键都不存在。⇒ 换 origin 后**没有任何兜底**。

### 2.3 判定实验（把「没数据」和「渲染坏了」分开）

`tmp/r132-e2e-inject-archive.cjs` 用 `addInitScript` 在页面脚本执行前注入形状合法的存档（`messageType:'reasoning'` + `turnIndex` 150..180，共 31 条）：

```
对照组（不注入）        .reasoning-block = 0    conversation-item = 178
实验组（注入 31 条）    .reasoning-block = 10   conversation-item = 191
```

⇒ **渲染管线、存档合并、时序插入全部正常**。症状①不是渲染回归，是**数据不存在**。

### 2.4 与「更新版本」的因果关系

更新后思考消失，需要同时满足：**(a) 服务端给不出文本**（长期成立，0.160.1 上是密文）+ **(b) 本地存档丢失**。使 (b) 成立的最短路径就是**换 origin**（版本更新通常伴随端口/域名变化）——localStorage 按 origin 隔离，新 origin 从零开始；而本应兜底的桥层镜像又是空的。**若线上是「新发的轮也看不到思考」**，则另有 live 抓取路径的问题（见 §六）。

---

## 三、症状②：6–7.4 秒花在哪

### 3.1 同窗口同锚点 A/B（决定性）

进程刚重启 = `ThreadTurnPageCursorChain` 为空 = 线上「刚更新/刚重启」的状态。锚点固定为 `01a0eab9-f90c-7eb1-90c0-832f27ac3535`（= resume 页最老那一轮）：

| 路径 | 耗时 | 载荷 | 每轮 items |
| --- | --- | --- | --- |
| **[冷] 链空 → 回落全量水合后切片** | **7202ms** / 1.46MB | 1198 items，reasoning 468（有文本 0） | `7,6,191,196,232,1,90,22,445,8` |
| **[热] 链已种 → 有界 `turns/list` 单页** | **969ms** / 1.46MB | **1198 items**，reasoning 468（有文本 0） | **完全相同** |

同一窗口、同一锚点、**载荷逐轮一致** ⇒ ①6 秒确实来自回落；②**回落不丢内容**（此前观察到的 0.19MB 是另一个更旧窗口的固有体积，不是裁剪）。

冷进程其余读数：`thread/list` 1722ms、`thread/resume` 1968ms / 2.03MB（`threadTurnStartIndex=163`）、桥层 `thread/read {includeTurns:true}` 1122ms / 2.03MB、`thread/turns/list {notLoaded}` 105ms。原始全量读（直连 app-server）**26.16MB / 6698ms**。

### 3.2 代码链路

```
GET /codex-api/thread-turn-page?threadId&beforeTurnId&limit
  └─ threadRoutes.ts L156  appServer.readBoundedThreadTurnPage(...)
       └─ threadTurnPage.ts L261  readThreadTurnIds()           // 每次重列 id（100/页）
            L279  chain.lookup(threadId, beforeTurnId)          // ★未命中 → return null
       └─ L158  isThreadTurnPageUnsupported()? 答 olderTurnsUnavailable
       └─ L177  否则回落 appServer.readThreadForTurnPage(threadId)
                 = 全量 thread/read {includeTurns:true}         // ★6–7 秒在这里
                 → 内存 slice(startTurnIndex, beforeIndex)
```

游标链的**唯一种子**：`thread/resume` 的 `initialTurnsPage.nextCursor`，经 `onTurnPageBoundary` → `recordThreadTurnPageBoundary`（`codexAppServerBridge.ts` L1939–1941），**只登记该页最老那一轮**。`thread/read` 的有界页也有 `nextCursor`，但**没有接**（L1943–1947 未传 `onTurnPageBoundary`）。

### 3.3 触发条件（何时会真的撞上 6 秒）

| 触发 | 说明 |
| --- | --- |
| 锚点不是链上登记过的页边界 | 跳到任意旧位置、或首开走的是 `thread/read`（不登记锚点）而非 `resume` |
| 桥进程重启 / 多实例 | 链是**进程内内存**，不跨进程共享 |
| app-server 重启 | rollout ordinal 重编号 ⇒ 旧游标全部作废；`threadTurnPage.ts` 头注释自述「stale entries then cost a fallback」 |
| 链 LRU 淘汰 | 64 线程 × 每线程 256 锚点 |
| 有界路径任何异常 | `data.length !== wanted`、窗口校验不匹配、RPC 报错（L694–701、L300、L308–311） |

撞上之后**会重复**：回落路径**不登记锚点**（L323 只在有界路径执行），同一请求 30s 内靠全量读缓存兜住（≈0.9s），但缓存会被 `thread/resume` / `thread/read` / `thread/fork` / `thread/start` 的 pipeline 快照（`rpcPipeline.ts` L180–185）以及**任何带该 threadId 的 app-server 通知**（`emitNotification` L563–569）清掉。

---

## 四、纠正上一轮的一条口径

上一轮把「`/codex-api/thread-turn-page` 稳定 6.0–7.5s（冷热一致）」当作路由固有成本，**这是探针自污染的假象**：`tmp/r132-probe-decompose.cjs` 在每次上翻**之前**先发了一条 `thread/read {includeTurns:true}`，该请求走 pipeline → `storeThreadReadSnapshot` → **每次都把全量读缓存删掉**，于是每次都冷。把那条前导请求去掉后，同一锚点第二次只要 860–928ms。

⇒ 正确口径：**6–7.4 秒是「游标链未命中」的代价，不是路由的固有代价；命中链时是 0.85–1.0s。**

---

## 五、验证 / 复现

```bash
# 0) 隔离 home（等长路径改写）+ 起服务（勿用真实 ~/.codex：被 0.161.0 托管 daemon PID 33400 持有）
#    CODEX_HOME=D:/codex-home-isolate123  dist-cli/index.js -p 4194

# 1) 症状②：冷进程 + 同窗口同锚点 A/B（先回落、再 resume 种链、同锚点再取）
node tmp/r132-probe-coldchain-ab.cjs

# 2) 症状②：锚点是否落在链上（命中 vs 未命中，含重复请求）
node tmp/r132-probe-ab-chain.cjs

# 3) 症状①：三条取数路径的载荷构成（reasoning 有项无文）
node tmp/r132-probe-payload-paths.cjs

# 4) 症状①：桥层思考镜像是否为空（实测 {"data":{}}）
curl -s http://127.0.0.1:4194/codex-api/thread-reasoning

# 5) 症状①：真实浏览器上翻 + 载荷构成（真实 App 不落回落路径）
BASE=http://127.0.0.1:4194 node tmp/r132-e2e-scrollup-big.cjs

# 6) 症状①：注入实验（渲染管线 vs 数据缺失）★决定性
BASE=http://127.0.0.1:4194 node tmp/r132-e2e-inject-archive.cjs
```

单元测试与构建**未改动任何产品代码**，本轮无新增/修改测试。仓库内 `git status` 仅 `?? .trae/`、`?? .zcode/`（未跟踪，非本轮产物）。

---

## 六、诚实边界

1. **线上环境的读数无法从本机取得。**「桥层镜像为空」是本机（隔离副本 + 真实 home 的 9/29 快照）的**直接读数**；线上镜像是否同样为空是**机制推断**，需要一条线上证据：`GET /codex-api/thread-reasoning` 的返回体大小。
2. **「新发的轮是否也丢思考」未验。** 本 app-server 的思考文本只随 `item/started` / `item/completed` 的全量 item 到达（`useDesktopState.test.ts` L1517–1559 固化了这个契约，`useDesktopState.ts` L339–342 自述「不推 `item/reasoning/textDelta`」）。同日续查**已补跑真实轮次**（§九 9.2）：真实流式回合中 `.reasoning-block` **恒为 0**；且同 home 新建线程的 `reasoning.content` 是**明文数组**（§九 9.1，§2.1 的推广口径据此更正）。若线上新轮也空白，则问题在 live 抓取（或上游 provider 只回加密 reasoning），与 §2 的存档结论是两条独立路径。
3. **用户具体挂起的是哪条 RPC 未确认。** 本轮给的是「能稳定复现 6–7.4s 的那一条」+ 冷进程其余读数；线上若要定位，最省事的判据是响应体积：回落页 ≈0.19MB（小窗口）/1.46MB（大窗口）、有界页 0.8–2.1MB，且回落**首次必 >6s**。
4. 本机 `~/.codex` 的 `.codex-global-state.json` **mtime 2026-09-29**，即近十天没有被写过——说明用户真实环境（或线上）用的是**另一个 home**，本机这份不能代表线上。

---

## 七、建议修复方向（**未实施，待授权**）

**症状②（低风险、收益明确）**

1. `thread/read` 的有界页把 `page.nextCursor` 也交给 `onTurnPageBoundary`（`threadReadTurnPage.ts` 已在手边拿到了它，只是丢了）——让「非 resume 首开」也能种链，一条改动消除一整类未命中。
2. 回落路径成功后**补登记锚点**（现在 L323 只在有界路径登记），避免同一位置反复付 6 秒。
3. 收窄全量读缓存的失效面：把「任意带 threadId 的通知都清」改为只在**该线程 turns 真的变化**时清；或把缓存 key 从 `threadId` 扩成 `threadId + 版本`，并拉长 TTL。
4. 可选：路由在走回落时返回一个 `fellBackToFullHydration: true` 标记，前端据此给出「正在加载更早消息」的可见反馈，把 6 秒从「像是挂了」变成「有进度」。

**症状①（要决策）**

5. 思考文本既然服务端结构上给不出，就应当把它当**一等公民的本地/服务端双写资产**：在「非空即 PUT」之外，补一条**启动时若镜像为空且本地有存档则回写镜像**，让镜像不会长期空着。
6. 明确告知用户「跨 origin / 跨设备会丢思考」的边界，或改用 `thread/turns/list {itemsView:'full'}` 之外的上游能力（若将来 app-server 提供解密回读）。

---

## 八、未处置 / 待办

1. **未改任何产品代码**（本轮纯定位）。上述 7 条修复均**未实施**，等用户决定做哪几条。
2. **未提交**：本文件与 `tmp/r132-*` 探针都在工作区；总入口 `codex-mobile-handover.md` 与 `sections/commit-history.md` **未同步**（等用户确认后按 round 惯例落 4 处 + 1 提交）。
3. 临时物仍在：桥服务 `4194`（`CODEX_HOME=D:\codex-home-isolate123`，日志 `tmp/r132-svc-big3.log`）、旧服务 `4191`、隔离副本 `D:\codex-home-isolate123`（约 155MB）、`tmp/r132-*` 探针与输出。
4. **未发布**（用户未授权）。

---

## 九、补充取证与更正（同日续查；用户补充「是整个消息列表都不见了，在 Thinking 的时候」之后）

用户把症状①的口径改成**「Thinking 期间整个消息列表不见了」**（不只是思考块缺失）。据此重查，得到 4 条新读数，其中一条**更正 §2.1 的推广口径**。

### 9.1 更正：`reasoning.content` 的线格式是**数组**

实测（同一桥进程、同一 home）：

- 「大线程」`01a0cdce…`（legacy provider 线程）`thread/turns/list {10,desc,full}`：**460 / 460** 项 `content` 与 `summary` **都是空数组**，且响应项**连 `encrypted_content` 字段都没有**（键只有 `type,id,summary,content`）；桥层 `thread/read` 同口径也是 460/460 全空。⇒ §1.1 #2–#4 的**读数成立**。
- 同一 home 里**新建**的线程 `01a11c08…`：`reasoning.content` 是**明文数组**，例如
  `{"type":"reasoning","id":"rs_1791471729903","summary":[],"content":["We need need obey conflicting? User says reply exactly PONG…"]}`（单条数百字）。

**所以 §2.1「app-server 在任何 itemsView 下都回不出思考文本」这个推广是错的**：能否回出**取决于线程**（provider / 创建时间），不是全局事实。可回出时，`normalizers/v2.ts` L499–516 **已正确处理数组形态**（`Array.isArray(raw.content) → filter(string) → join('\n')`），只有 `content`/`summary` **都为空**才 `return []` 丢弃——即「空 reasoning 被丢弃」只在**真的空**时发生。

顺带：该 legacy 线程连 `turn/start` 都直接失败，错误原文 `This thread uses a legacy compatibility provider that has no endpoint. Start a new thread, or define [model_providers.custom] in your config.toml`——**同一个 home 里新建线程则模型可用**。这解释了为什么此前所有针对该线程的 live 尝试都进不了 Thinking（turn 秒失败）。

### 9.2 新读数：真实流式回合中 `.reasoning-block` **恒为 0**

`tmp/r132-e2e-newthread-live.cjs`：由 app 自己点「新建线程」→ 输入长任务（要求逐步推理）→ 发送，逐帧采样 DOM：

| 时点 | items | turns | `.reasoning-block` | `commandExecution` | 列表文本长度 |
| --- | --- | --- | --- | --- | --- |
| +3851ms（已发出） | 2 | 1 | **0** | 0 | 200 |
| +29173ms | 3 | 1 | **0** | 0 | 2919 |
| +29589ms | 4 | 1 | **0** | 1 | 3250 |

⇒ **「Thinking 期间看不到思考内容」在本地可复现**：整轮运行中助手正文与命令块都在长，思考块**一个都没有**。这不是「列表消失」，但它就是用户看到的核心现象（思考内容在运行期不出现）。

### 9.3 未能复现「整个消息列表消失」——三个场景均为负

| 场景 | 手段 | 结果 |
| --- | --- | --- |
| 打开一个**真实 inProgress** 线程 | 浏览器全新会话点开 `01a11c08…`（该线程服务端 `status: inProgress`） | `conversation-item` **6**、`turns` **3**、Thinking 浮层在，**8 秒内逐帧稳定，无归零** |
| 在**大线程**（173 轮）里发送 | app 内发送（`turn/start` 14ms） | items **180 → 181** 稳定 20 秒，无归零 |
| 由 app **新建线程**发送长任务 | §9.2 那条 | items **2 → 3 → 4**，全程 ≥1，无归零 |

其间唯一一次「列表区域为空」出现在新建线程发送后 **+3446ms**（`thread=(no-root)`、`listChildren=-1`），**+3851ms** 即有内容——那是 home 路由（新建态，会话区本就不渲染）→ 线程视图的切换，属预期。

指令入口与 RPC 侧也复查为**正常**：`thread/read {includeTurns:true}` 在做进行中回合里返回 `turns=1 … items=5`（reasoning 仍为 0 文本）；`thread/turns/list {desc,full}` 对有历史的线程返回带 items 的轮次（大线程 10 轮 / 小线程完成轮 11 items）。

⇒ **「整表消失」需要用户给出确切触发条件**（哪个界面、何时、是否刷新、线程大小）。本轮已排除的假设：单条 inProgress、大线程发送、真实流式运行、桥层取数归零、渲染管线（§2.3 注入实验仍成立）。

### 9.4 本轮新增探针

`tmp/r132-probe-live-blank.cjs`（进行中回合逐帧轮询 P1/P2/P3）、`tmp/r132-e2e-live-blank.cjs`（浏览器打开 inProgress 线程）、`tmp/r132-e2e-send-live.cjs`（在既有线程发送并采样；含读 Vue 根实例 setupState 的尝试，生产构建下 `_instance` 取不到，未用上）、`tmp/r132-e2e-newthread-live.cjs`（新建线程真实流式回合）＋各自 `.txt` / `.json`。

**副作用（仅隔离副本）**：`D:\codex-home-isolate123` 内新增/改写了几条测试线程（`01a11c08…` 新建线程、大线程被追加两轮 `failed`/`interrupted`）。均为副本，未触真实 home。


## 十、症状 A 定案：一次「0 条」的非 silent 刷新会把整个对话区清空（已确定性复现）

用户追加确认：**A. 对话区整段空白（历史消息 + 本轮消息都不见），发生在「当前线程发出新消息后进入 Thinking」时。**

### 10.1 唯一可能机制（代码链）

`messages`（`useDesktopState.ts` L706–753）= `mergeThreadMessageStreams(persisted, persistedReasoning, [live…], injected)` → `insertTurnSummaryMessage` → `insertPersistedTurnDurations` → `insertModelSwitchMarkers`。链上每个变换**只插入、不删除**（`mergeThreadMessageStreams` L1293–1357、`mergePersistedReasoning` L1190–1269、`mergeMessages` L249–352 皆如此）⇒

> **`messages` 为空 ⟺ `persistedMessagesByThreadId[threadId]` 为空。**

而 persisted 的**唯一**清空通道是 `loadMessages`（`useDesktopMessageHistoryLoading.ts` L179–182）：

```ts
const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
  preserveMissing: options.silent === true || hasOptimisticUserMessages(previousPersisted),
})
```

`mergeMessages(previous, incoming, {preserveMissing:false})` 直接 `return mergedIncoming`（L265–267）⇒ **服务端答 0 条时，整个本地历史被空数组替换**。此时 `isLoadingMessages` 为 false（非 silent 且 `alreadyLoaded`）⇒ `App.vue` L1793–1798 的 `lastStableFilteredMessages` 兜底不生效；而渲染侧空态带 `!liveOverlay` 条件（`ThreadConversation.vue` L22）⇒ **列表空、只剩 Thinking 浮层**。

### 10.2 三个必要条件（逐条实验证据）

| 条件 | 证据 |
|---|---|
| ① 线程处于 **Thinking**（`inProgressById=true`） | `canReuseLoadedMessages`（L132–147）只在非 inProgress 时命中复用缓存。**反证**：第一版探针在大线程（非 inProgress）做前台恢复，`refreshAll` 发出了 `thread/list`/`config/read`/`rateLimits`/`collaborationMode`/`skills`，**一次 `thread/read` 都没发**，items 167 不动 |
| ② persisted 里**没有乐观用户消息** | 第二版探针：inProgress 中发送后立刻给空响应 → items **169 不动**（`hasOptimisticUserMessages` 把 preserveMissing 抬成 true） |
| ③ 该次 `thread/read` 响应含 **0 条消息** | 第三版两步法：refresh#1 用打补丁的真响应（`status.type=inProgress` + 补一条等值 `userMessage`，让乐观消息被过滤退场）；refresh#2 把 `thread/read` 换 `{thread:{turns:[],status:{type:'inProgress'}}}` |

**第三版决定性读数**（`tmp/r132-e2e-thinking-wipe2.cjs`）：

```
基线       items=167 overlay=0 userRows=10 turns=10 textLen=38317
Thinking   items=169 overlay=1 label="Thinking" userRows=11 turns=11
refresh#1  items=169 overlay=1            ← 打补丁响应：乐观消息退场，历史保留
refresh#2  items=169 → 1（相隔 204ms）    ← 只隔 204ms
           overlay=1 label="Thinking"     ← 浮层全程在位
           userRows=11 → 0, turns=11 → 1, textLen=38360 → 8（即 "Thinking" 本身）
结论       成立：剩下的 items=1 就是那一个 Thinking 浮层 <li>，真实消息 0 条
```

⇒ **「在 Thinking 的时候，整个消息列表都不见了」在本地确定性复现。**

### 10.3 会真发请求的非 silent 入口

- **前台恢复**（最可能的线上入口）：`visibilitychange`/`focus`/`pageshow` → `maybeSyncAfterForeground`（`App.vue` L3254–3266）→ `syncAfterForeground` → `refreshAll({includeSelectedThreadMessages:true})`（L3268–3280）→ **非 silent** `loadMessages`。门槛极低：`FOREGROUND_RESUME_MIN_HIDDEN_MS = 400`（`src/utils/foregroundResume.ts`）——**后台满 0.4 秒回前台即触发**；移动端切应用/锁屏/来电都命中。
- **账号相关**：刷新账号 / 切换账号 / 完成登录 / 移除账号（`App.vue` L2684、2713、2767、2800）同样走 `refreshAll({includeSelectedThreadMessages:true})`。
- **`selectThread`**（L2531–2548）亦为非 silent：fork 后选中（L3149）、路由同步（L4733、4743）。

事件驱动的 `syncFromNotifications`（L3527）是 silent，**不会**触发此缺陷——这正解释了「**只在 Thinking 时**」：只有 Thinking 才既会真的发这次请求、又可能拿到空答案。

### 10.4 桥层能给出「0 条」的三条现成通道

1. **materialization-pending 兜底**（`codexAppServerBridge.ts` L1963–1977）：`isThreadMaterializationPendingError` 命中（错误原文含 `not materialized yet` + `includeturns is unavailable before first user message`）时**直接答** `{thread:{id, turns:[], status:{type:'inProgress'}}}` —— 注意它**顺手把 inProgress 伪造成 true**，于是「空列表」与「Thinking 浮层」由同一个响应同时制造出来。
2. **`isEmptyThreadReadError` 兜底**（L1954–1962）：返回 `getLastThreadReadSnapshot(threadId)`；无快照或快照 turns 为空时同样是空。
3. **round-110 有界读**（`bridge/threadReadTurnPage.ts` L113–134）：`thread/read {includeTurns:true}` 被改写成「元数据读 + `thread/turns/list` 一页」。`readLatestTurnPage` 只在 `data` **不是数组**时返回 null 触发重放（L83–85）——**一页空数组是"合法返回值"**，会被当作「线程真的没有轮次」直接采纳（`needsCount = page.data.length > 0 && …` ⇒ total=0 ⇒ `thread.turns = []`、`threadTurnStartIndex = 0`）。

> 第 3 条是**更新后新引入的形态**：round-110/111 的有界读把「一次全量水合」换成两段复合调用，于是出现了「页空则线程空」这种把偶发空数据当真值的判据；旧路径下 `thread.turns` 由 app-server 一次性给出，不存在这一档。

### 10.5 诚实边界

- **已确证**（全部本地实测）：机制、三个必要条件、触发入口、复现读数。
- **未确证**：线上那一次「0 条」到底出自 10.4 的哪一条（区分需要线上 bridge 日志或响应体）。建议下次复现时抓 `/codex-api/rpc` 中 `thread/read` 的响应体，并查桥日志是否出现 `materialization` / `rollout … is empty`。
- 与症状②（上翻 6–7s）**无因果关系**，是两个独立缺陷。

### 10.6 修复方向（按风险从低到高，均未实施）

1. **前端最小改动（建议首选）**：`loadMessages` 把「服务端答 0 条」从权威快照降级为不可信 ——
   `preserveMissing: options.silent === true || hasOptimisticUserMessages(previousPersisted) || nextMessages.length === 0`，
   并在该分支保留 previous、记一条 warning。**一行即可堵住「整表清空」。**
2. **桥层不伪造 inProgress**：materialization-pending 兜底别写 `status:{type:'inProgress'}`（保留已知状态或省略），避免「空列表 + Thinking」由同一响应制造。
3. **有界读区分「页空」与「答不出」**：拿到空页时用 `thread/read {includeTurns:false}` 的元数据（总轮数 / `status`）交叉校验，拿不准就重放原请求——这本就是该模块既有的降级语义。
4. **前台恢复门槛与范围**：`FOREGROUND_RESUME_MIN_HIDDEN_MS = 400` 偏激进；且前台恢复其实只需刷新**线程列表**，不必强制重取选中线程的消息（消息本由事件驱动）。

### 10.7 本轮新增探针

`tmp/r132-probe-vue-state.cjs`（解剖 Vue 内部状态；结论：生产构建下 `app._instance` 不挂、App 的 `setupState` 为空，**该仪表在本构建不可用**）、`tmp/r132-e2e-empty-wipe.cjs`（第一版：非 inProgress 时前台恢复连 `thread/read` 都不发）、`tmp/r132-e2e-thinking-wipe.cjs`（第二版：inProgress + 空响应 → 被乐观消息保护，不清表）、`tmp/r132-e2e-thinking-wipe2.cjs`（**第三版决定性复现**）＋各自 `.txt` / `.json`。


## 十一、修复实施：可疑空快照不再清空本地历史（round-132 实施部分）

**提交**：`fix(thread-load): 服务端答 0 条不再清空本地消息历史与轮次索引（round-132）`（3 文件：`src/composables/useDesktopMessageHistoryLoading.ts` 30 行改动 / `src/composables/useDesktopState.test.ts` +83 / `scripts/check-ui-contract.cjs` +35）。

**改动**（实施 §10.6 第 1 条，并把「轮次索引」一并纳入保护）——核心是 `loadMessages` 里这三行：

```ts
const previousPersisted = deps.persistedMessagesByThreadId.value[threadId] ?? []
const suspiciousEmptyResponse = nextMessages.length === 0 && previousPersisted.length > 0
if (suspiciousEmptyResponse) { console.warn(`[thread-load] … keeping local history`) }
// …不成立时才让快照覆盖轮次索引…
if (!suspiciousEmptyResponse) deps.replaceTurnIndexLookupForThread(threadId, turnIndexByTurnId)
// …并把判据接进 preserveMissing…
const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
  preserveMissing: options.silent === true || hasOptimisticUserMessages(previousPersisted) || suspiciousEmptyResponse,
})
```

三处与 §10.6 原文的差别，都是有意收紧：

| | §10.6 原始设想 | 本轮实现 | 理由 |
| --- | --- | --- | --- |
| 判据 | `nextMessages.length === 0` | `nextMessages.length === 0 && previousPersisted.length > 0` | 单侧判据会在**真正的空线程**上刷噪音警告；补上「本地有历史」后，本地也空时行为与改前**逐字相同**（`mergeMessages` 对两个空数组本来就返回 `[]`） |
| 轮次索引 | 未涉及 | 成立时**不**调 `replaceTurnIndexLookupForThread` | 空快照同样没有轮次表；整体覆盖会让**保留下来的**消息失去轮次索引（轮次耗时 / 轮次摘要 / 计划归档都按 turnId 查这张表）。既然判定这张快照不可信，就不让它覆盖本地状态 |
| 可观测性 | 「记一条 warning」 | `[thread-load] <threadId>: server returned 0 messages while N are persisted locally; keeping local history` | 线上复现时可直接在控制台检索，且带线程 id 与本地条数 |

`previousPersisted` 由原位置（`replaceTurnIndexLookupForThread` **之后**）**提前**到 `detail` 解构之后——判据要用它，且必须在 `setPersistedMessagesForThread` 写回**之前**读，否则读到的是刚写进的新值。

### 11.1 单测（`useDesktopState.test.ts`，新 describe「empty thread-read snapshot protection (round-132)」2 例）

① **「本地有历史 + 非 silent 刷新答 0 条」** ⇒ `state.messages.value` 仍是 `['user-1','agent-1']`、轮次索引 `turn-1 → 0` 仍在、恰好一条 `keeping local history` 警告。用例**忠实还原触发条件**：`Date.now` 前推 5s 越过 2s 复用窗 + 线程 `inProgress` ⇒ 该次 `loadMessages` 真的会发请求、且为**非 silent 且不带 `force`**（与线上「前台恢复」同一条路径）。
② **反向保证**：本地也为空的真新线程仍然是空列表，且不产生噪音警告。

### 11.2 「非空测试」反跑（决定性）

`tmp/r132-flip-fix.cjs off` 把判据临时换成 `false` ⇒ 用例断言 `expected [] to deeply equal [ 'user-1', 'agent-1' ]` **变红**（即线上症状逐字复现）；`on` 还原后转绿。脚本对替换片段做「出现次数必须为 1」断言并留 `.bak` 供逐字节复核（还原后报 `与备份一致 = true`、`16381 → 16381` 字节）。

### 11.3 静态契约（`check-ui-contract.cjs` 42 → 43 项）

新增「空快照不覆盖本地消息历史与轮次索引（round-132）」，钉 5 个子事实：双侧判据 / 进 `preserveMissing` / `previousPersisted` 先读后写 / 跳过轮次索引覆盖 / 留 warning。**反跑证明非空**：改动前 **42/43**、该项 FAIL 且诊断行 `双侧判据=NO`；改动后 **43/43**。**诚实说明**：静态断言钉的是**形状**——把判据换成 `false` 时其余 4 个子事实仍是 `yes`（结构还在），**行为层**的证据是 11.1 的单测与 11.4 的浏览器 A/B。

### 11.4 浏览器端到端复跑（同一条决定性探针，前后对照）

| 步骤 | 修复前 | 修复后 |
| --- | --- | --- |
| 基线（打开 173 轮大线程） | `items=167 / overlay=0 / userRows=10 / textLen=38317` | 同 |
| 发送（`turn/start` 挂住，稳定停在 Thinking） | `items=169 / overlay=1 "Thinking"` | 同 |
| refresh#1（前台恢复；真响应打补丁：`status=inProgress` + 补等值 `userMessage`） | `items 169` 稳定 | `items 169` 稳定 |
| **refresh#2（前台恢复；`thread/read` 改答 0 轮 + `inProgress`）** | **`items 169 → 1`**（`userRows 11→0`、`turns 11→1`、正文 `38360 → 8`，浮层在位） | **`items 169 → 169`**、`items=0` 的样本 **0** |

探针 `tmp/r132-e2e-thinking-wipe2.cjs`（本次输出 `tmp/r132-e2e-thinking-wipe2-after.txt` / `.json`）。**端到端无需重启服务**：桥按请求从磁盘读 `dist/`（实测服务返回的入口 chunk 哈希 `index-DHzc22fN.js` 与磁盘 `dist/index.html` 一致）；前端用 `vite build` 重建（15.83s）。

### 11.5 验证基线

`vue-tsc --noEmit` **EXIT=0 / 0 错误**、全量 **744 例 / 744 通过（76 文件）零失败**（＝ round-131 基线 742 ＋ 本轮 2 例）、`check-ui-contract` **43/43**、`node --check scripts/check-ui-contract.cjs` OK、`vite build` EXIT=0。

### 11.6 未实施（本轮只交 §10.6 第 1 条）

② 桥层 materialization-pending 兜底**仍在伪造** `status:{type:'inProgress'}`；③ 有界读**仍把「一页空数组」当作「线程真的没有轮次」**；④ `FOREGROUND_RESUME_MIN_HIDDEN_MS = 400` 与「前台恢复该不该强制重取选中线程消息」未动。⇒ **残余形态**：消息不会再被清空，但那次可疑响应仍可能让界面出现一个**不该有的 Thinking 浮层**（`setThreadInProgress` 与 `status` 语义未动）——这属于第 ② 条的范围内。

**本轮新增探针**：`tmp/r132-flip-fix.cjs`（修复开关 + 备份/复核）、`tmp/r132-e2e-thinking-wipe2.cjs` 的复跑产物 `r132-e2e-thinking-wipe2-after.txt` / `.json`。
