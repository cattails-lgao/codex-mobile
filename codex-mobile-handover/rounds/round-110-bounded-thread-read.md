# round-110 — thread/read 有界化：全量水合退场（遗留清理）

日期：2026-09-30。用户口径「处理遗留问题，必须在 159 版本吗？」。

**结论先行：不需要 0.159。** 这个遗留（`getThreadDetailV2`/`getThreadMessagesV2` 发全量 `thread/read`）所需的全部能力，在本机 **0.158.0** 上实测全部可用。本轮据此完成改造。

**背景：** round-102/107/108/109 连续四轮把同一条遗留挂着——「`getThreadDetailV2`/`getThreadMessagesV2` 仍发 `thread/read {includeTurns:true}`（全量水合），大线程上 6.0–6.2s / 26.16MB」。round-84 只把 **`thread/resume`** 那条打开路径有界化了，`thread/read` 这条没动。之前没做的原因记在 round-102 文档里：「涉及 `thread/read` 是否支持 initialTurnsPage，未实测」。

## 一、为什么不需要 0.159（本轮实测）

关键事实：**`thread/read` 不支持分页参数**——这不是版本差异，是协议本身如此。`documentation/app-server-schemas/typescript/v2/ThreadReadParams.ts`：

```ts
export type ThreadReadParams = { threadId: string,
  /** When true, include turns and their items from rollout history.
   *  Full-history hydration is deprecated for paginated threads; prefer a
   *  metadata-only read and page with `thread/turns/list` and
   *  `thread/items/list`. */
  includeTurns?: boolean, };
```

即：**有界读的正确做法是「元数据读 + `thread/turns/list` 分页」**，而不是像 resume 那样传 `initialTurnsPage`（那是 `ThreadResumeParams` 独有的字段）。所以这个遗留能不能做，取决于 `thread/turns/list` / `thread/items/list` 在 0.158.0 是否可用。

自研探针（`tmp/probe-0158-read-paging.cjs`）驱动**真实线程**（3MB / 16 轮，`01a0465a-…-badc1c40b4e8`）实测：

| 调用 | 0.158.0 结果 |
|---|---|
| `thread/read {includeTurns:false}` | OK · 12ms（返回 **35 个元数据字段**，含 `path` / `status` / `model` / `cliVersion`） |
| `thread/turns/list {limit:5, desc, itemsView:'full'}` | **OK · 134–389ms**，`data[]` 元素形状 = `thread.turns[]` |
| `thread/turns/list {limit, desc, itemsView:'notLoaded'}` | OK · 10–18ms（只要元数据，计数用） |
| `thread/items/list {limit:5}` | OK · 8–20ms |

**带 / 不带 `capabilities.experimentalApi` 两种条件下都可用**（两次跑，结果一致）。桥的 `initialize` 本来就发 `experimentalApi`，无额外风险。

### 附带澄清：round-101 的「not supported yet」之谜

round-101 记过 `thread/turns/list` 在 0.158.0 上回 `-32601: list_turns is not supported yet`。本机两次实测（带/不带能力位）**都不复现**。而且 round-84 时期就已经在用它做计数（模块头注释记 `thread/turns/list {10000, notLoaded, desc} → 14ms`）。

结论：round-101 那次探针**很可能跑的不是本机这份 0.158.0 构建**（当时 pnpm store 路径与此后各轮不同）。**round-102 的 `threadTurnPageUnsupported` 能力位是在防御一个未发生的问题**——但它无害（不会触发的防御），保留不动。

## 二、方案

`src/server/bridge/threadReadTurnPage.ts`（新增）：

```
readThreadWithTurnPage(deps, originalParams)
  1. buildThreadReadParamsWithoutTurns 改写：{threadId, includeTurns:true} → {…, includeTurns:false}
     （不适用时返回**同一引用** → 调用方据此判断「发的是旧请求」）
  2. meta = sendRead(metaParams)                 // 元数据（含 path/status/model）
  3. page = rpc('thread/turns/list', {threadId, limit:10, sortDirection:'desc', itemsView:'full'})
  4. turns = page.data.reverse()                 // desc → asc（thread.turns 处处 oldest-first）
  5. 满页（page.length==10 且 nextCursor 非空）才计数 → threadTurnStartIndex = total - turns.length
  6. 组装 {…meta, thread:{…metaThread, turns}, threadTurnStartIndex}
```

**回落契约**（每一步都不能弄脏现状）：
- 元数据读**自身的错误不吞**——冒泡到 shell 的 `thread/read` 错误处理（`isEmptyThreadReadError` 快照回落 / `isThreadMaterializationPendingError`），那比盲目重放更精确；
- 元数据读**形状异常**（无 `thread`）或 **turn 页失败** → `sendRead(originalParams)` 重放原请求，与改动前逐字一致；
- 计数失败 → 不写 `threadTurnStartIndex`（前端默认 0，与 round-84 的 `promoteResumeTurnPage` 同口径）。

**为什么线上形状能原样保留：** 组装结果就是「全量读被 `trimThreadTurnsInRpcResult` 裁到 10 轮」后的形状（`thread.turns` ≤10 升序 + `threadTurnStartIndex`）。所以整条桥管线（裁剪 / 内联媒体净化 / 会话日志合并 / 快照）与前端归一化 **零改动**。裁剪函数只在 `turns.length > 10` 时动手，组装结果恰好 ≤10 → no-op，我自己的 `threadTurnStartIndex` 原样保留。

桥接入（`codexAppServerBridge.ts` rpc 分派，与 round-84 的 resume 分支并列）：

```ts
: body.method === 'thread/read'
  ? await readThreadWithTurnPage({
      rpc: (method, params) => appServer.rpc(method, params),
      sendRead: (params) => callRpcWithArchiveRecovery(appServer, 'thread/read', params),
    }, body.params ?? null)
  : await callRpcWithArchiveRecovery(appServer, body.method, body.params ?? null)
```

缓存语义不变（缓存键仍是原始 `params`，存的是管线后结果）。**未** bump `SHARED_BRIDGE_VERSION`：没有给 `AppServerProcess` 加方法，rpc 处理是模块函数，不改共享接口。

## 三、验证

**1. 单测**（`src/server/bridge/threadReadTurnPage.test.ts`，8 例）：
- 改写契约（含 6 种「不适用 → 同一引用」：null / `{}` / 空 threadId / 无 includeTurns / `false` / 字符串 `'true'`）；
- 组装（desc→asc、`path`/`model` 保留、短页 → index 0 且**不计数**）；
- 满页 → 恰好一次 `notLoaded` 计数探针 → `threadTurnStartIndex` 正确；
- 计数失败 → 不写 index；
- turn 页失败 → **重放原请求（同一引用）**；
- 元数据形状异常 → 重放，且**从不触碰** turn 页；
- `includeTurns:false` 的读 → 单次原样调用、不走分页。

**2. 真机集成**（临时单测，跑完即删）：驱动真实 0.158.0 app-server，对 16 轮线程同时取全量读与有界读：

```
[probe] full turns=16  bounded turns=10  startIndex=6
```

断言：`bounded.turns[].id` 与 `full.turns.slice(6)[].id` **逐位相同**、`threadTurnStartIndex === 16-10`、`thread.path` 一致。**通过**。

**3. 类型**：`vue-tsc --noEmit` 干净。

**4. 全量**：见 §五 数字。恒定失败仍只有 `codexAppServerBridge.archive.test.ts` 的 2 例 Windows 平台差异（隔离复跑仍失败）；`inlinePayload` 单次全量的失败隔离复跑通过＝并发抖动。

## 四、影响面与收益

调用点（grep）：`useDesktopMessageHistoryLoading.ts:151`（`resumedThread ?? await getThreadDetail(threadId)`，即 **resume 失败时的兜底**）、`useDesktopState.ts:3125`（只取 `activeTurnId`）、`useDesktopState.ts:3368`（compact 后**每 2s 轮询一次**直到 compaction item 落地，最多 14 次）。

最后一条是收益最大的：大线程上原本每次轮询都是 6s/26MB 全量读。现在三次调用（元数据 + 一页 + 可选计数）是小常数，且大线程不再随历史线性变贵。

## 五、验证数字

- 全量：**690 例**（round-109 的 682 + 本轮新增 8），**687 通过 / 3 失败**；其中 2 例是恒定的 `codexAppServerBridge.archive.test.ts` Windows 平台差异（隔离复跑仍失败），第 3 例（`inlinePayload`）隔离复跑通过＝并发抖动。零回归。
- 新增单测 8 例（`threadReadTurnPage.test.ts`）。

## 六、遗留

1. `thread/items/list` 与 `thread/timeline/list` 的 gateway 能力仍未接消息流水线（round-106/107 延续），非本轮范围。
2. `threadReadTurnPage` 与 `threadResumeTurnPage` 现在共享 `readThreadTurnCount`，但「取最新一页」与「取某轮之前一页」仍是两套代码，未合并（形状差异：resume 走 `initialTurnsPage`，read 走 `thread/turns/list`）。
3. 服务端 `telegramThreadBridge.ts` / `threadSearch.ts` 仍有若干 `thread/read {includeTurns:true}`（非 UI 主路径，未动）。

## 七、涉及文件

- 新增：`src/server/bridge/threadReadTurnPage.ts`、`src/server/bridge/threadReadTurnPage.test.ts`、本文档
- 改：`src/server/codexAppServerBridge.ts`（import + rpc 分派加 `thread/read` 有界分支）
- 探针：`tmp/probe-0158-read-paging.cjs`（未入库，供后续复跑）
