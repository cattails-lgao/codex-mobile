# round-134：收尾 round-132 §10.6 的 ②③④ —— 把「0 条 + Thinking」的剩余通道逐个关掉

**日期**：2026-10-08 / 2026-10-09（跨零点）
**环境**：Windows 本机、codex-cli 0.160.1、隔离 home `D:\codex-home-isolate123`（31 个 rollout，最大 123.93MB）
**状态**：已实施并验证；**未发布**（npm `latest` 仍 `0.1.127`）
**承接**：round-132（症状 A 定案并只交 §10.6 第 1 条）、round-133（症状② 上翻游标链播种）

---

## 一、结论先行

round-132 §10.6 列了四条修复方向、只实施了第 1 条；round-133 之后残余的三条（②③④）本轮**全部收掉**。

| # | 缺口（round-132 §10.6 / §11.6 原文） | 本轮做法 | 效果 |
| --- | --- | --- | --- |
| ② | 桥层 materialization-pending 兜底**仍在伪造** `status:{type:'inProgress'}` | 兜底载荷不再带 `status`（`buildPendingMaterializationThreadReadResult`） | 「空列表 + Thinking 浮层」**不再由同一个响应制造**；客户端保留自己最后已知的状态 |
| ③ | 有界读**仍把「一页空数组」当作「线程真的没有轮次」** | 空页先做一次便宜的 notLoaded 计数交叉校验，确有轮次／数不出来就**回放原请求** | round-132 §10.4 第 3 条那条「0 条」通道被关掉；真·空线程行为逐字不变 |
| ④ | `FOREGROUND_RESUME_MIN_HIDDEN_MS = 400` 偏激进；前台恢复**不必强制重取**选中线程消息 | 前台恢复改为只刷线程列表（`includeSelectedThreadMessages: false`） | 症状 A 的**最后一个非 silent 入口消失**；消息交给紧随其后的 **silent** 兜底 |

三条都配了单测 + **反跑证明测试非空** + 契约新增条目；并做了一次**真实桥层冒烟**（重建 `dist-cli` + 独立服务 + 真浏览器）。

---

## 二、② 桥层不再伪造 `inProgress`

**位置**：`src/server/codexAppServerBridge.ts` 的 `thread/read` 错误分支（round-132 §10.4 第 1 条点名的那处）。

改动前的兜底载荷是：

```ts
{ thread: { id: threadId, turns: [], status: { type: 'inProgress' } } }
```

`status` 这一项会被客户端归一化读成「正在思考」——`readThreadInProgressFromResponse`（`src/api/normalizers/v2.ts`）判 `thread.status.type === 'inProgress'` 即 `true`，于是**同一个响应既答「没有轮次」、又把一个没在跑的线程标成在跑**：列表空了 + 一个 Thinking 浮层，两件事同源。

改动后抽成 `src/server/bridge/threadErrors.ts` 里的纯函数（这样它能被单测直接钉住）：

```ts
export function buildPendingMaterializationThreadReadResult(threadId: string): unknown {
  return { thread: { id: threadId, turns: [] } }
}
```

**为什么是「省略」而不是「保留已知状态」**：这个端点本来就看不清该线程的状态（它只被告知 rollout 还没有首条用户消息）。省略 `status` 后客户端**保留自己最后从通知里学到的状态**，这是唯一诚实的答案——「没有轮次可展示」，而不是「它正在跑」。

**注意一处同名兄弟**：`src/server/bridge/threadRoutes.ts` L338–347 的 `thread-live-state` 兜底**也**写 `isInProgress: true`。本轮**没动**：该路由经审计（2026-09-15，记在 `tests/thread-loading-state/thread-item-parity-commands-and-file-changes.md`）**零客户端调用方**，UI 不消费它。留着不改是为了不扩大改动面，已在 §六 记为残留。

---

## 三、③ 有界读区分「页空」与「答不出」

round-110 把「一次全量 `thread/read {includeTurns:true}`」改成「元数据读 + `thread/turns/list` 一页」。这个新形态带来一个旧路径没有的判据：**一页空数组被直接采纳为「线程真的没有轮次」**（`thread.turns = []`、`threadTurnStartIndex = 0`）——于是 app-server 的一次偶发空页就能把整个对话区答空（round-132 §10.4 第 3 条）。

两条有界路径都收了同一道闸：

```ts
// src/server/bridge/threadReadTurnPage.ts
if (page.data.length === 0) {
  const turnCount = await readThreadTurnCount(deps.rpc, threadId)
  if (turnCount === null || turnCount > 0) return await deps.sendRead(originalParams)
}
```

```ts
// src/server/bridge/threadResumeTurnPage.ts
if (pageData.length === 0) {
  const threadId = readNonEmptyString(asRecord(asRecord(result)?.thread)?.id)
  const turnCount = await readThreadTurnCount(deps.rpc, threadId)
  if (turnCount === null || turnCount > 0) return await deps.sendResume(originalParams)
}
```

三点设计：

- **交叉校验用什么**：`readThreadTurnCount` 走 `thread/turns/list {itemsView:'notLoaded'}`，一页 14ms / 0.00MB 量级（round-130 实测），只在**空页**这条路上多花一次。
- **判据方向**：`> 0` 或 `=== null`（数不出来）都回放原请求。这是本模块**既有的降级语义**（"拿不准就回放"），也是旧版本 app-server 上唯一安全的动作。
- **真·空线程不受影响**：计数 `0` ⇒ 照旧采纳空页，线上形状逐字不变。

**为什么不动第三条路（上翻路由）**：`readBoundedThreadTurnPage` 拿到的页只要 `data.length !== wanted` 就 `return null` ⇒ 回落，空页**本来就被拒**，无需改。

---

## 四、④ 前台恢复不再强制重取选中线程消息

**位置**：`src/App.vue` 的 `syncAfterForeground()`。

```diff
-    await refreshAll({ includeSelectedThreadMessages: true })
+    await refreshAll({ includeSelectedThreadMessages: false })
     await syncThreadSelectionWithRoute()
```

两条论据（都在代码里可复核）：

1. **那一次重取只在「线程 inProgress」时才真的发请求**——`loadMessages` 的复用判据是 `alreadyLoaded && (loadedRecently || (version 未变 && !inProgress))` ⇒ 非 inProgress 时直接 `markThreadAsRead` 返回、**连一个 `thread/read` 都不发**（round-132 探针已实测到这个负结果）。也就是说它只在**消息最新鲜、最不需要重取**的时刻发请求，而 round-132 的「0 条清表」与 round-133 的「链未命中回落全量 ~7.5s」**正好都从这条入口进来**（§10.3 / §10.6 第 4 条）。
2. **兜底本来就在下一行**：`syncThreadSelectionWithRoute()` 对选中线程调 `ensureThreadMessagesLoaded(threadId, { silent: true })`，而该函数第一句是 `if (loadedMessagesByThreadId.value[threadId] === true) return` ⇒ **只在从没加载过时才取数**（深链、刚启动），且 `silent` 语义下 `preserveMissing` 恒为真，**不可能清表**。

另外 `sendMessageToNewThread` 会把新线程直接写进 `resumedThreadById`，因此该线程的 `loadMessages` 走元数据读而不是 `thread/resume`；本改动也不涉及那条路。

**关于 `FOREGROUND_RESUME_MIN_HIDDEN_MS = 400`**：§10.6 说它「偏激进」，但**本轮没有改**——没有一个读数能把 400ms 和两个症状联系起来，而 §10.6 第 4 条里真正有因果的是「强制重取消息」那一半（已改）。改一个没有证据支撑的阈值只会引入不可归因的行为变化。这条**有意保留**，见 §六。

---

## 五、验证

### 5.1 单测

| 文件 | 变化 | 新增覆盖 |
| --- | --- | --- |
| `src/server/bridge/threadReadTurnPage.test.ts` | 11 → **14** | 空页 + 计数>0 ⇒ 回放；空页 + 计数数不出来 ⇒ 回放；空页 + 计数 0 ⇒ 采纳（并断言只发一次 `sendRead`、只探一次 notLoaded） |
| `src/server/bridge/threadResumeTurnPage.test.ts` | 26 → **29** | 同上三条（回放的对象是 `sendResume(originalParams)`，断言 `nth(2) === { threadId }`） |
| `src/server/codexAppServerBridge.archive.test.ts` | 32 → **34** | 兜底载荷 `toEqual({thread:{id,turns:[]}})`（`toEqual` 是精确比较 ⇒ 谁把 `status` 加回来就红）+ 断言既无 `status` 也无 `inProgress`/`turnStatus` |

### 5.2 反跑（决定性）

`tmp/r134-flip.cjs off|on [inprogress|readEmpty|resumeEmpty|foreground|all]`，每处替换都做「出现次数必须为 1」断言，`off` 时留 `.r134bak`，`on` 时**逐字节复核**。

| 状态 | 单测 | 契约 |
| --- | --- | --- |
| `off all`（三处全部退回改动前） | **5 failed \| 72 passed (77)** | **43/44**，诊断行 `前台恢复跳过强制取数=NO` |
| `on all`（还原） | **77 passed** | **44/44** |

`on` 复核：`threadErrors.ts` 2237 B、`threadReadTurnPage.ts` 8036 B、`threadResumeTurnPage.ts` 10596 B、`App.vue` 222404 B，四项均 `与备份一致=true`；仓库内无 `.r134bak` 残留。

### 5.3 静态契约（`check-ui-contract.cjs` 43 → **44** 项）

新增「前台恢复不再强制重取选中线程消息（round-134）」，钉三个子事实：前台恢复体里出现 `includeSelectedThreadMessages: false` 且**不**出现 `true` / 仍接 `syncThreadSelectionWithRoute()` / 该函数体里存在 `ensureThreadMessagesLoaded(..., { silent: true })`。**诚实说明**：钉的是**形状**，行为层证据是 §5.1 的单测与 §四 的调用点分析。

### 5.4 基线

`vue-tsc --noEmit` **EXIT=0 / 0 错误**；全量 **755 例 / 755 通过（76 文件）零失败**（＝ round-133 基线 747 ＋ 本轮 8 例）；`node --check scripts/check-ui-contract.cjs` OK；`tsup` 重建 `dist-cli` EXIT=0。

### 5.5 真实桥层冒烟（`tmp/r134-e2e-smoke.cjs`，服务 4196 + 隔离 home）

**改动在 `src/server/**` ⇒ 必须先 `tsup` 重建 `dist-cli`**，只跑 `vite build` 不生效。

| 步骤 | 读数 |
| --- | --- |
| A) `thread/read {includeTurns:true}` 打开 123.93MB 大线程 | **3038ms**、`turns=10`、`threadTurnStartIndex=164`、`status=notLoaded` |
| B) 紧接着上翻一页（`/codex-api/thread-turn-page`） | **1041ms**、`turns=10`、`startTurnIndex=154`、`hasMoreOlder=true`、`olderTurnsUnavailable` 未出现 |
| C) `thread/start` 新建零轮次线程 | 542ms |

⇒ **③ 的闸门没有拖慢正常路径**（上翻仍是 1.0s 级的有界单页，round-133 播种的链在用），有界页形状与 round-130 实测一致。

**另一条真浏览器探针**（`tmp/r134-probe-newthread-ui.cjs`，420×900 视口）：新建线程 → 输入 → 发送，全程抓 `/codex-api` 响应 ——

```
thread/start 200 → turn/start 200 → thread/read(includeTurns:true) × 5 全部 200
62 条响应里非 2xx 仅 1 条：404 /codex-api/project-root-suggestion?basePath=D:\home\lighthouse\...（与本轮无关）
DOM：items 2 → 4，无 error 元素，无 Thinking 卡死
```

---

## 六、诚实边界

1. **③ 的闸门在本机 app-server 上「没被真正触发过」**：本 build 对一个还没 materialize 的线程，`thread/turns/list` 直接答错误（见 §七），于是 `readLatestTurnPage` 先返回 null、**在到达新的空页闸门之前就回放**了。所以 ③ 的端到端证据只到「不回归」（§5.5 A/B），其**行为**证据是 §5.1 的单测 + §5.2 的反跑（在模块边界上，空页 → 回放 是被直接断言并可反跑的）。要真正端到端复现「空页」需要故障注入（把一页伪造为空），本轮没做。
2. **轮询缺口未被本轮改变**：全量搜索确认 `useDesktopState.ts` 里**没有任何 `setInterval` 轮询**。所以 ④ 之后，消息的兜底是：SSE 通知（事件驱动）＋ `ready` → `recoverBridgeState()`（重连后才补，且**只在该线程从没加载过时**才补一次消息）＋ 路由/选中变化时的 `ensureThreadMessagesLoaded`。**如果 SSE 连接「活着但不再送事件」**（例如中间代理静默缓冲），本轮之后没有任何东西会自动纠正它——这个风险**在 ④ 之前也被同一个洞覆盖**（那次前台重取只在 inProgress 时发请求，恰是最不容易被静默的时刻），但方向上它**是**由 ④ 略微放大的，记在这里而不是当作没发生。
3. **`FOREGROUND_RESUME_MIN_HIDDEN_MS = 400` 有意保留**（§四 末）：无读数支撑，不改。
4. **`thread-live-state` 的同名兜底仍在伪造 `isInProgress: true`**（§二 末）：零客户端调用方，本轮不动。
5. **②③ 都只收窄了桥层**：`setThreadInProgress` / `status` 的前端语义一行未动。② 之后，「一个不该有的浮层还能不能被造出来」只剩以下来源：真实通知（`turn/start` 真的在跑）与 `thread-live-state`（无调用方）。**这不等于浮层逻辑被重构过。**
6. **只在本机 Windows / codex-cli 0.160.1 / 上述隔离 home 上实测**，且 §5.5 的 UI 探针只跑了「新建线程 + 发送」这一条路径。
7. **未发布**：未 bump 版本、未 tag。

---

## 七、附带发现（**不属本轮，未实施**）：未 materialize 线程上的 `thread/read` 会 502

§5.5 的 C 步是为了验证「零轮次线程」，结果撞见一条**既有的**桥层行为（`tmp/r134-probe-newthread-raw.cjs`，原始回包）：

```
thread/read {includeTurns:false}   → 200（thread.status = {type:'idle'}）
thread/read {includeTurns:true}    → 502 {"error":"list_turns is not supported yet"}
thread/turns/list  (任意 itemsView) → 502 {"error":"list_turns is not supported yet"}
thread/resume      (plain / bounded) → 502 {"error":"list_turns is not supported yet"}
```

**机制**：app-server 对「还没有首条用户消息、rollout 未写入」的线程，把 `thread/turns/list` 与 `thread/read {includeTurns:true}` 都答成 `list_turns is not supported yet`。该文案**两条兜底谓词都不匹配** —— `isEmptyThreadReadError`（要 `failed to read thread` + `rollout` + `is empty`）与 `isThreadMaterializationPendingError`（要 `not materialized yet` + `includeturns is unavailable before first user message`）都不成立 ⇒ 桥直接 `throw`，HTTP 499/502 到客户端。

**与 round-134 无关（可证）**：`resume:(bounded)` 就已经 502 ⇒ `sendResume` 在 ③ 的闸门**之前**抛出；`turns/list` 502 ⇒ `readLatestTurnPage` 返回 null、在 ③ 的闸门**之前**回放；② 需要的是另一段文案（判定函数只看字符串）⇒ 三处改动在这条路上**都不可达**。④ 是纯前端。

**用户可见性：已确证「真实客户端走不到」**（`tmp/r134-probe-newthread-ui.cjs`）：真实流程是 `thread/start` → `turn/start`（**在首次 `thread/read` 之前就已把 rollout 写出来**）→ 随后 5 次 `thread/read` **全部 200**；整段会话 62 条 `/codex-api` 响应里非 2xx 只有一条与本轮无关的 404。所以这是一条**潜伏边界**（手工探针、或深链到一个从未发过消息的线程才会撞上），不是线上症状。

**若要修**：给 `thread/read` 的兜底谓词补上这条文案（回 `{thread:{id,turns:[]}}`，即 ② 的同一种诚实答案）。本轮**不擅自扩大改动面**，记在此处待授权。

---

## 八、复现 / 复跑

```bash
# 0) 静态检查
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vitest/vitest.mjs run
node scripts/check-ui-contract.cjs          # 应 44/44

# 1) 反跑（三处修复一起退回改动前）
node tmp/r134-flip.cjs off all
node node_modules/vitest/vitest.mjs run src/server/bridge/threadReadTurnPage.test.ts \
  src/server/bridge/threadResumeTurnPage.test.ts src/server/codexAppServerBridge.archive.test.ts
node scripts/check-ui-contract.cjs          # 应 43/44 且诊断行「前台恢复跳过强制取数=NO」
node tmp/r134-flip.cjs on all                # 还原并逐字节复核

# 2) 真实桥层冒烟（改动在 src/server/** ⇒ 必须先重建 dist-cli）
node node_modules/tsup/dist/cli-default.js
cd D:/code/code/codex-mobile
CODEX_HOME=D:/codex-home-isolate123 node dist-cli/index.js \
  --port 4196 --no-tunnel --no-open --no-login --no-password &
BASE=http://127.0.0.1:4196 node tmp/r134-e2e-smoke.cjs

# 3) 真浏览器：新建线程 + 发送，看有无 502
BASE=http://127.0.0.1:4196 node tmp/r134-probe-newthread-ui.cjs

# 4) 未 materialize 线程上的原始回包（§七 的证据）
BASE=http://127.0.0.1:4196 node tmp/r134-probe-newthread-raw.cjs
```

**探针（`tmp/`，未入库）**：`r134-flip.cjs`（反跑开关 + 备份/复核）、`r134-e2e-smoke.cjs`（大线程有界读 + 上翻 + 零轮次线程）、`r134-probe-newthread-raw.cjs`（§七 原始回包）、`r134-probe-newthread-ui.cjs`（浏览器网络/DOM 采样，输出 `.json`）、`r134-stop-services.txt`（4196/4194/4191 停止记录）。

**本轮清理**：`4196`（本轮起）、`4194`（round-132 起）、`4191`（round-130 起）三个临时服务已全部停止（`listeners=0`）。
