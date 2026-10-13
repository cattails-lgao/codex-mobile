# Round-141：线上「回退点了说没有」的死结修复——回退前权威预检 + 失败后强制重同步（2026-10-13）

> **背景：** 用户报线上环境（`codex.arderpanada.top`）「**环境进行回退的时候出现问题，消息列表显示了那条消息，但是点击回退就不行**」，
> 并附上 `POST /codex-api/rpc` 的 **body** 与一份「response」——两者**逐字相同**（`{"method":"thread/revert","params":{…}}`，既无 `result` 也无 `error`）。
> 随后用户用一个反问把矛盾钉在桌上：
> 「**如果不存在那为什么他在消息列表，回退还会失败。如果存在为什么点击回退会提示不存在**」。
> 用户口径：**「直接修复」**。
>
> 基线：`c4874c7f`（round-140 末次提交，`package.json` = `0.1.130`）。本轮**已 bump 到 `0.1.131`**（见 §十）。

---

## 一、结论先行

| 项 | 本轮结论 | 一句话依据 |
| --- | --- | --- |
| 用户贴的「回退响应」 | **不是 `/codex-api/rpc` 的响应**。它的形状是 JSON-RPC **请求/通知**（只有 `method`+`params`），而这个端点只会回 `{result}` 或 `{error}` | 全仓 `/codex-api/rpc` **仅一处处理器**（`src/server/codexAppServerBridge.ts:1986`）；线上实测两条路径的形状都对得上（§二） |
| 「列表里有、回退说没有」 | **不是「两套数据源」**——列表与 `beforeTurnId` **同出**一份本地缓存；矛盾来自 **这份缓存不是服务端镜像** | `rollbackSelectedThread` 用 `persistedMessagesByThreadId` 反查 `message.turnId`（§三①） |
| 为什么本地会残留 | **三道「只增不删」闸门** + **失败后不自愈** | 版本未变复用短路 / `preserveMissing` 合并 / 自动刷新全 `silent`（§三②） |
| 服务端此刻的事实 | 那条轮次**已被一次 revert 删掉**（15:41:52 生成 → 15:42:30 线程历史被重写） | 线上**只读**取证：16 轮、最新 14:32:21、`beforeTurnId` 不在列表、rollout 段 id = 15:42:30（§四） |
| 修法 | **回退前做权威预检**（确证缺失 ⇒ 本地对齐、不再发注定失败的请求）+ **失败后强制非 silent 全量重读** | `§五` |

证据：`vue-tsc` **EXIT=0**；全量 **818/818（81 文件）**（基线 812/80，**+6 例**）；
静态契约 **53/53**；`vite build` / `tsup` **EXIT=0**；
**反跑**（临时禁用预检、保留断言）⇒ 新用例**按预期失败**（`revertThread` 被调用，即修复前那条注定 502 的请求），随后按 md5 校验还原（§七③）。

---

## 二、先排除一个假线索：用户贴的「响应」不是这个端点的响应

这一节是**先取证再动手**（与 round-140 同一做法）——因为用户给的最后一片证据形状反常，若不先排除，整条推理会立在沙上。

| 证据 | 内容 |
| --- | --- |
| **代码** | 全仓 `/codex-api/rpc` 只有 `src/server/codexAppServerBridge.ts:1986` 一个处理器：成功 `setJson(res, 200, { result })`、出错抛 `{ error }`；`setJson` 就是 `JSON.stringify(payload)`（`src/server/bridge/httpHelpers.ts:12`）。**没有任何「把请求回显回去」的代码路径。** |
| **线上实测**（`curl --noproxy '*'`，两条**只读/无害**探测） | 成功路径 ⇒ `{"result":{…}}` + **HTTP 200**（`thread/read`）；失败路径 ⇒ `{"error":"thread not found: …"}` / `{"error":"Invalid request: invalid type…"}` + **HTTP 502** |

⇒ 用户贴的那份「response」**形状是请求体**，不是端点响应。**故本轮不以它为依据**，改用「服务端此刻到底有没有那个轮次」这类**可实测**的事实（§四）。

> 顺带确认：线上前端就是 **0.1.130** —— `/` 的 `assets/index-Bcgrj03j.js`、`index-DthBwStG.css` 与本机 `dist/` 指纹**逐字一致**；
> 线上 app-server = **`@openai/codex@0.162.0`**（`thread/read` 的 `cliVersion`）。⇒ round-140 已上线，在嫌疑范围内。

---

## 三、根因（代码层，已闭环）

### 3.1 回退链路：列表与 `beforeTurnId` 同出一源

`rollbackSelectedThread(turnId)`（`src/composables/useDesktopState.ts`）：
从**本地持久化缓存** `persistedMessagesByThreadId[threadId]` 里按 `turnId` 反查 `matchedMessage`，
把 `matchedMessage.turnId` 原样当 `beforeTurnId` 发给 `thread/revert`；
上层 `App.vue` 的 `onRollback` 传进来的，也正是**消息列表里那条消息自身的 `message.turnId`**。

⇒ **渲染列表**与**回退参数**取的是**同一份缓存**。所以「看得到却回退不了」**不可能**是两个数据源打架，
只能是**这份缓存里有服务端已经不存在的轮次**。

### 3.2 三道「只增不删」闸门（为什么服务端删了、本地还留着）

| # | 位置 | 机制 |
| --- | --- | --- |
| 1 | `src/composables/useDesktopMessageHistoryLoading.ts`（`loadMessages` 开头） | **复用短路**：`version = 线程 updatedAtIso` 未变就**直接 return，请求都不发** |
| 2 | `src/composables/useDesktopStateUtils.ts`（合并） | **`preserveMissing` 合并**：条件含 `silent === true`；为真时**服务端已消失的本地消息被原样保留** |
| 3 | `useDesktopState.ts`（`syncThreadStatus` / `syncFromNotifications` / 切线程） | **自动刷新全部带 `silent: true`** ⇒ 它们**永远不会删掉**服务端已删消息 |

⇒ 只有一次**非 silent 的全量加载**（硬刷新首载 / 手动刷新）才会用服务端快照**整体覆盖**本地。这就是「删不掉」的全部来源。

### 3.3 失败后不自愈 ⇒ 死结

`rollbackSelectedThread` 给 `turnIndex` 留了「钳制到最新轮」的修正，但 **`beforeTurnId` 没有对应修正**，原样发本地 id；
失败后只写一次 `error.value`（`App.vue` 里表现为一条提示），**不做任何重同步**。

⇒ 于是形成**死结**：那条消息**删不掉**（三道闸门），点了**只报错**（失败不自愈），用户再点还是错 —— 与用户描述完全吻合。

---

## 四、线上只读取证（本轮事实基础）

对问题线程 `01a13083-68df-7650-b4a5-5e5c8f436d06` 发**只读**的 `thread/turns/list` 与 `thread/read`：

| 事实 | 值 |
| --- | --- |
| `historyMode` | `paginated` |
| 当前段轮次数 | **16 轮**，最新一轮 `01a133f6-…` = **今天 14:32:21** |
| 用户请求里的 `beforeTurnId` = `01a13435-…` | 生成于 **15:41:52** ⇒ **不在服务端任何一轮里**（ABSENT） |
| 线程 rollout 段 | `…/rollout-2026-10-13T15-42-30-01a13083…_01a13436-….jsonl`，段 id `01a13436-…` 生成于 **15:42:30** |

时间线读下来只有一种解释：**15:41:52 产生的那一轮，在 38 秒后的 15:42:30 被一次 revert 抹掉**（线程历史被重写、新开 rollout 段），
保留的历史**正好止于 14:32:21**。而删除它的那次 revert，语义上就是 `beforeTurnId = 01a13435` —— **也就是用户点的那次回退，在服务端其实成功了**。

⇒ 服务端**已经**处于「已回退」状态，界面却没跟着消失；用户再点，`beforeTurnId` 指向的轮次已不存在，**第二次必然失败**。
这正是用户那个反问的答案：**「看得到」是本地缓存的旧账，「说没有」是服务端的真账，两者本就不是同一份数据。**

---

## 五、修复（1 个新网关方法 + 3 处组合改动）

### 5.1 网关新增权威轮次探针（`src/api/gateway/threads.ts`）

```ts
export async function listThreadTurnIdPage(
  threadId: string,
): Promise<{ turnIds: string[]; complete: boolean }> {
  const payload = await callRpc<ThreadTurnsListResponse>('thread/turns/list', {
    threadId, limit: 10000, sortDirection: 'desc', itemsView: 'notLoaded',
  })
  const rows = Array.isArray(payload.data) ? payload.data : []
  const turnIds = rows.map((row) => readString(asRecord(row)?.id))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return { turnIds, complete: !readString(payload.nextCursor) }
}
```

- 复刻桥层 `readThreadTurnIds`（`src/server/bridge/threadTurnPage.ts`）的做法：`itemsView: "notLoaded"` **只回 id**，一页约 **625B**。
- **`complete`（本页没有 `nextCursor`）才是「这就是全部轮次」的凭据** —— app-server 把一页钳到 **100** 条，
  线程更大时只看第一页**无法定论**（round-104 实测，`TURN_LIST_SERVER_PAGE_CLAMP`）。

### 5.2 预检：`isTargetTurnMissingOnServer`（**fail-open**）

判据必须是「**确证**」，其余一切情形**一律放行**，保持既有回退行为不变：

```ts
if (!threadId || !turnId) return false
if (inProgressById.value[threadId] === true) return false              // 正在生成
if (turnId === (activeTurnIdByThreadId.value[threadId] ?? '')) return false  // 就是当前 active 轮
try { page = await listThreadTurnIdPage(threadId) } catch { return false }   // 探针失败 / 老构建不实现该 RPC
return page.complete && !page.turnIds.includes(turnId)
```

后两条显式排除是**防误伤**：若把**用户眼前正在跑的那一轮**误判成「服务端没有」，会把那条消息从界面上凭空抹掉。

### 5.3 确证缺失 ⇒ 本地对齐，不再发注定失败的请求

命中预检时（回退语义**在服务端已经完成**）：

```ts
if (await isTargetTurnMissingOnServer(threadId, beforeTurnId)) {
  console.warn(`[rollback] ${threadId}: turn ${beforeTurnId} is already gone on the server; reconciling locally instead of sending thread/revert`)
  dropPersistedTurnLocally(threadId, beforeTurnId)   // 剔消息 + 剔该轮 thinking 存档
  pendingThreadsRefresh = true
  try { await loadMessages(threadId, { force: true }); await syncFromNotifications() } catch {}
  return
}
```

- `dropPersistedTurnLocally` 与**真实回退成功后的本地收口**保持一致：除消息本身，还要清掉该轮的**思考存档**
  （`persistedReasoningByThreadId`，对照 `interruptSelectedThreadTurn` 里成对清理 reasoning 的做法），否则会残留一个没有对应轮次的思考块。
- 对齐步骤自身的失败**不升级**成「回退失败」（抛出会误导用户以为回退没成功）。

### 5.4 失败自愈（兜底，覆盖预检之外的一切失败）

```ts
} catch (unknownError) {
  error.value = unknownError instanceof Error ? unknownError.message : 'Failed to rollback thread'
  try { await loadMessages(threadId, { force: true }) } catch {}   // 非 silent ⇒ 整体覆盖本地
}
```

无论失败原因是「本地缓存脱节」还是「桥层缓存与 rollout 不一致」，**都做一次非 silent 的全量重读**把列表拉回服务端真实状态 ——
用户不会再有「点了没反应、消息永远留在那」的处境。

---

## 六、用户可见行为（改动前 / 后）

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 本地残留了服务端已删的轮次，用户点该条回退 | 发出注定失败的 `thread/revert` ⇒ **报「不存在」**，消息**仍在** | **不发请求**：本地剔除该条 + 强制重读 ⇒ 消息**消失**，与「服务端早已回退」一致 |
| 正常的回退（目标轮仍在服务端） | 正常回退 | **完全不变**（预检放行） |
| 线程正在生成 / 目标是当前 active 轮 | 正常回退 | **完全不变**（预检显式放行） |
| 回退因其它原因失败 | 只报一次错，界面**不自愈** | 报错 + **强制重同步**，界面自动纠正 |
| 老构建 / 探针 RPC 不实现 | 正常回退 | **完全不变**（探针异常 ⇒ 放行） |

---

## 七、验证

### 7.1 基线

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0** |
| 全量 Vitest | **818/818 通过（81 文件）**（基线 **812/80**） |
| `check-ui-contract.cjs` | **53/53** |
| `vite build` + `tsup` | 均 **EXIT=0** |

### 7.2 新增用例（**+6 例**）

| 文件 | 例数 | 覆盖 |
| --- | --- | --- |
| `src/composables/useDesktopState.test.ts` | **+3** | ①确证缺失 ⇒ 本地对齐且**不发** `revertThread`；②分页未完（`complete:false`）⇒ **照旧**回退；③探针抛错 ⇒ **照旧**回退 |
| `src/api/gateway/threads.turnIdPage.test.ts`（**新增**） | **3** | 请求参数（`limit:10000` / `desc` / `notLoaded`）+ `complete` 判据 + 丢弃畸形行 |

原有回退用例**零影响**：mock 里新增 `listThreadTurnIdPage`，并在 `beforeEach` 默认 `{ turnIds: [], complete: false }` ⇒「不可定论」⇒ 一律放行。

### 7.3 反跑（证明断言非空）

**做法沿用 round-137/140 的教训：保留断言、只退回生产代码**（把断言一起回退＝空过）。

在 `isTargetTurnMissingOnServer` 首行临时插入 `return false`（禁用预检）后跑新用例：
**按预期失败** —— `expected "vi.fn()" to not be called at all, but actually been called 1 times`，
即「修复前那条注定 502 的 `revertThread`」。随后按 **md5 校验**还原文件。

### 7.4 构建产物（排除「发了旧 `dist/`」）

`vite build` 后 `dist/index.html` 入口 hash 由 **`index-Bcgrj03j.js`** → **`index-BA8F4GsS.js`**；
产物内 grep **`already gone on the server`** 命中 **1**（本轮新增的 console 标记）⇒ 确认新代码真的进了产物。`tsup` 同步重建 `dist-cli/`。

---

## 八、诚实边界

1. **没有端到端复现。** 本机 codex 是 **0.161.0**、线上是 **0.162.0**（跨一档）；隔离 home `D:/codex-home-fresh` 里只有 **4 条空线程 rollout**
   （只有 `session_meta`、**无 turn**）⇒ 本机**没有可回退的线程**。本轮修复的依据是**代码路径 + 线上实证**（§四：`01a13435` 已不在服务端），
   **不是**真机跑通。**重开条件：拿到一条有 turn 的隔离线程，或在线上验证 0.1.131。**
2. **仍未拿到那次失败的真实响应原文。** 用户贴的「response」实为请求体（§二）；本轮结论不依赖它，但「第二次点击具体收到哪条错误文案」仍未直接观测。
3. **预检是 fail-open 的**：分页未完（线程 >100 轮且该轮落在更老的页里）、探针失败、老构建 —— 这几种情况仍会照旧发出可能注定失败的 revert；
   代价由 §5.4 的自愈兜住（失败后必重同步），但**首击仍会报一次错**。
4. **未 bump `SHARED_BRIDGE_VERSION`**：本轮改动全在客户端侧（`src/api/gateway/**`、`src/composables/**`），**没有**改 `src/server/**`，
   共享对象本身没变 ⇒ 按本仓判据（「共享对象变了才 bump」）不 bump。
5. **线上未部署本构建**：线上仍是 0.1.130；本轮的浏览器/单测验证是**本机生产构建**，**不等于**线上真线程验证。

---

## 九、涉及文件 + 复现方式

**改动（3 改 + 1 新增）**

| 文件 | 内容 |
| --- | --- |
| `src/api/gateway/threads.ts` | 新增 `listThreadTurnIdPage()`（§5.1） |
| `src/composables/useDesktopState.ts` | 引入探针；新增 `isTargetTurnMissingOnServer()`（fail-open 预检）与 `dropPersistedTurnLocally()`；`rollbackSelectedThread` 加**发送前预检**与 **catch 内强制重同步**（§5.2–5.4） |
| `src/composables/useDesktopState.test.ts` | mock 增 `listThreadTurnIdPage` + `beforeEach` 默认不可定论 + 3 个新用例（§7.2） |
| `src/api/gateway/threads.turnIdPage.test.ts`（**新增**） | 网关探针单测 3 例（§7.2） |

**复现命令**

```bash
NODE="<node 安装目录>/node.exe"

# 1) 类型 + 全量 + 契约
"$NODE" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" scripts/check-ui-contract.cjs

# 2) 反跑（保留断言、只退回生产代码）
#    在 isTargetTurnMissingOnServer 首行插入 `return false` ⇒ 新用例按预期失败；随后 md5 还原

# 3) 生产构建（改了 src/** ⇒ dist 与 dist-cli 一起重建）
"$NODE" node_modules/vite/bin/vite.js build
"$NODE" node_modules/tsup/dist/cli-default.js
```

**线上取证（只读，未入库）**：`curl --noproxy '*'` 对 `thread/read`（成功形状）、`thread/revert`（失败形状 / HTTP 502）、
`thread/turns/list`（轮次与 `beforeTurnId` 的存在性）各发一次；解析脚本见 `tmp/r141b-parse.py`、`tmp/r141-uuid7.py`。
本机复现尝试：`tmp/r141-revert-probe.py`、`tmp/r141-revert-probe2.py`、`tmp/r141-revert-probe3.py`（均因隔离 home 无 turn 而止步）；
落改动用 `tmp/r141-patch.cjs`（锚点脚本，逐处断言「恰好命中 1 次」才写盘），反跑用 `tmp/r141-disable.cjs`。

---

## 十、落款说明

- **已 bump 到 `0.1.131`** 并建 **annotated tag `v0.1.131`** + GitHub Release（Latest）；`npm publish` 由维护者执行（本机 `npm` 凭据 401、`pnpm publish` 才是可用通道，见 round-138 段）。
- 本轮 **6 例新单测**已**反跑证明非空**（§7.3）。
- **`SHARED_BRIDGE_VERSION` 未 bump** 是**有意的**（§八④）。
- **只修客户端**：服务端写入行为未动，别的客户端读同一份数据的行为不变。
