# Round-86：上翻更早轮次改为游标分页（去掉最后一处全量水合）（2026-09-16）

> **背景：** 用户口径「继续推进，你可以使用wsl进行回归验证」。round-84 修掉「打开会话全量水合」、round-85 修掉管道里白跑的会话日志恢复之后，剩下**最后一处全量水合**：`readThreadForTurnPage`（上翻更早轮次用的 `/codex-api/thread-turn-page`）仍发 `thread/read {includeTurns:true}` 再在内存里 `slice`。本轮的起点是 round-84/85 都记过的那条遗留，但**那条遗留的技术措辞是错的**（见 §3），实测把它纠正了。

## 1. 现象的量化

绕开桥、直连 app-server（同一 `CODEX_HOME`、每项独立进程），16 轮 / 30.89MB rollout 的线程：

| 请求 | 耗时 | 载荷 |
|---|---|---|
| `thread/read {includeTurns:true}`（**路由当时发的**） | 1295ms | 12.12MB |
| `thread/read {includeTurns:false}` | **2ms** | 0.00MB |
| `thread/turns/list {10000, notLoaded, desc}` | 2–14ms | 0.00MB |
| `thread/turns/list {cursor, desc, full}`（要的那 6 轮） | 338–354ms | 7.83MB |

`thread/read` 的 `includeTurns` 注释原文就直接指向这条路：「Full-history hydration is deprecated for paginated threads; prefer a metadata-only read and page with `thread/turns/list` and `thread/items/list`.」

## 2. 元数据等价性：可以只换水合、不换形状

路由今天返回的是 `thread/read` 的形状（顶层只有 `thread`），前端 `getOlderThreadMessagesV2` 会用它算 `normalizeThreadMessagesV2` / `readThreadInProgressFromResponse` / `buildTurnIndexByTurnId`。所以先确认把 `includeTurns` 关掉会不会改形状：

- `thread` 对象的 **32 个键完全相同**，且除 `turns` 外**每个字段值逐字相同**；
- `includeTurns:false` 也返回 `turns` 键，只是空数组；
- 顶层 `result` 仍然只有 `thread` 一个键。

也就是说：**只要把 `thread.turns` 换成要的那一页，响应形状与改动前逐字一致**，前端与 `sanitizeThreadSkills` / 命令合并管线都不用动。

## 3. 关键障碍：游标不能瞄向某一轮（并纠正 round-84/85 的错误措辞）

round-84 与 round-85 的遗留项都写着「顶层 `turnsBackwardsCursor` 正是它该用的游标」。**实测这是错的。** 探针（`scripts/probe-turn-page.cjs`）给出四条硬事实：

1. **`turnsBackwardsCursor` 带 `includeAnchor: true`**，用它 `desc` 只会**原样重发它自己那一页**——拿它上翻会原地打转，永远拿不到更老的轮次。
2. 真正往更老走的是 **`initialTurnsPage.nextCursor`**（`includeAnchor: false`），响应描述为「continue after the last turn」。
3. 游标**只能逐页串链**：从 `nextCursor` 一路走，恰好覆盖全部 16 轮、**每轮一次、无重叠**，顺序等于全量水合逆序。
4. 游标是**不透明 JSON**（形如 `{"requestedThreadId":…,"rolloutOrdinal":2186,"includeAnchor":false,"scope":{"kind":"turns"}}`），**把 turn id 当 `cursor` 会被拒**：`{"code":-32600,"message":"invalid cursor: <turn-id>"}`。

推论：**没有「给我某一轮之前那一页」的一次性调用**。要拿到锚点轮之前的一页，只能先用游标链走到它。

## 4. 设计：游标链 + 廉价 id 列 + 页校验

新增 `src/server/bridge/threadTurnPage.ts`，三步：

**（1）先要一份廉价的 id 列。** `readThreadTurnIds` 发 `thread/turns/list {10000, notLoaded, desc}`（2–14ms / 0.00MB，必要时按 `nextCursor` 翻页、上限 50 页），反转成**升序 id 列**。它一次就回答了路由需要的全部索引问题：`beforeTurnId` 的绝对下标、`startTurnIndex`、`hasMoreOlder`、以及锚点是否存在于该线程。**故意不缓存**——每轮都拿最新事实，这样下一步的校验才是对着当前真相做的。

**（2）把「更老」的游标记住。** `ThreadTurnPageCursorChain` 按 `threadId → (turnId → 更老游标)` 记录页边界，带上限（64 线程 × 每线程 256 条，LRU 淘汰）。边界只有两个来源：

- **打开会话那一页**：`resumeThreadWithTurnPage` 新增 `onTurnPageBoundary` 回调，把「这一页最老的轮」与它的 `initialTurnsPage.nextCursor` 交出来（注意**不是** `turnsBackwardsCursor`）。这一步是关键——没有它，第一次上翻就无从下手。
- **本路由服务过的每一页**：取响应里的 `nextCursor`，配这一页最老的轮。

**（3）取页并校验。** 命中边界游标就发一次 `thread/turns/list {cursor, sortDirection:'desc', limit:want, itemsView:'full'}`，反转成升序即为要的窗口。取回后**必须校验**：

- 页长等于请求的窗口长度；
- 页首等于 `ids[startTurnIndex]`、页尾等于 `ids[beforeIndex-1]`。

游标会**活得比它指向的轮次更久**（revert / rollback / app-server 重启导致 rollout 重编号），校验让这类陈旧游标只换来一次回落，而不是**一页错误的对话**。基于同一理由，游标链**不挂任何失效钩子**：每轮重列 id + 校验，比到处清缓存更可靠。

**任何意外一律返回 null，由调用方走原来的全量水合**——包括：id 列读不到、锚点不存在（这条返回空页，与旧行为一致）、没有边界游标、页长不符、页内容对不上、`thread/read` 元数据读失败。**回落路径与改动前逐字相同。**

## 5. 接线

| 文件 | 改动 |
|---|---|
| `src/server/bridge/threadTurnPage.ts` | **新增**：`readThreadTurnIds` / `ThreadTurnPageCursorChain` / `readBoundedThreadTurnPage` |
| `src/server/bridge/threadResumeTurnPage.ts` | 新增 `onTurnPageBoundary` 依赖，页边界交给游标链 |
| `src/server/bridge/threadRoutes.ts` | `/codex-api/thread-turn-page` 先试有界路径，再回落；尾部三段合并统一 |
| `src/server/codexAppServerBridge.ts` | `readBoundedThreadTurnPage` / `recordThreadTurnPageBoundary`；按 (线程, 锚点, limit) 缓存已组装的页（TTL 30s、与既有 turn-page 缓存同一批失效点）；`SHARED_BRIDGE_VERSION` **v3 → v4** |

**尾部合并可以统一**这一点是查证过的：`slimThreadTurnsPayload`、`mergeSessionSkillInputsIntoThreadResult`、`mergeSessionCommandsIntoThreadResult` **三者都在 `turns.length === 0` 时原样返回入参**，所以空页走不走合并结果一致，不需要像原来那样为「锚点不存在」单独提前 return。

## 6. 验证

**（1）新增单测 24 例**（`threadTurnPage.test.ts` 21 + `threadResumeTurnPage.test.ts` +3）：游标链的 LRU 与空游标语义、id 列的串链与上限、升序顺序、未知锚点的空页、顺序上翻的链式推进（每步用上一步产出的边界）、陈旧游标被校验拦下、页长不符、失败回落、以及「页尺寸取 0/负数按 1 轮处理而不是 0 轮」。

**（2）协议假设固化为可复跑脚本**：`scripts/probe-turn-page.cjs <threadId> [CODEX_HOME] [codexBinPath] [limit]`，**11 项断言全过**：

```
  fact 1 - the metadata read is the hydrated thread with empty turns        (4 项 PASS)
  fact 2 - the resume page chains, and the chain is complete               (2 项 PASS)
  fact 3 - turnsBackwardsCursor re-serves its own page                     (2 项 PASS)
  fact 4 - a paged window equals the hydrated slice, reversed              (2 项 PASS)
  fact 5 - a turn id is not a cursor                                       (1 项 PASS)
  RESULT: all facts hold
```

**app-server 升级后应跑它**——如果失败，桥会静默回落（症状是变慢，不是出错），脚本是唯一能提前告诉你的东西。

**（3）端到端 A/B（`git stash` 前后，同一 dev server、同一线程、同一脚本，四个锚点）**：

| 锚点 | round-86 冷启动 | 基线冷启动 | 响应 SHA256 | 字节数 |
|---|---|---|---|---|
| `boundary`（打开会话交出的边界轮） | **483 / 516ms** | **883 / 913ms** | `d6c8b542754c9d43` **两相位相同** | 1071762 两相位相同 |
| `interior`（窗口内、非边界 → 回落） | 943 / 1391ms | 62ms\* | `9dc552f6daa3cd21` **相同** | 1074064 相同 |
| `unknown`（不存在的锚点） | 8ms | 1ms | `eee6b0f32f0d8f28` **相同** | 1277 相同 |
| 无锚点（省略 `beforeTurnId`） | 91ms | 59ms | `4dddad8c12e38963` **相同** | 1636643 相同 |

**四条路径的响应逐字相同**（含字节数），这是本轮最强的正确性证据。

\* **一个必须说清的特性差异**：基线把「整线程水合」按线程缓存 30s，所以**首个**请求贵（883ms）、**之后任何锚点**都免费（62ms）。有界路径是按 (锚点, limit) 缓存的，**每个新页各付自己那一页**（约 350–500ms），成本不随历史长度增长。也就是说：**单步/少步上翻有界路径更快（1.8×），一次会话内连续多步上翻基线靠摊薄可能更省**。两条路都保留（回落即基线），且回落会把基线的按线程缓存重新焐热，所以命中一次回落之后，后续锚点又回到基线的免费档。

**（4）真实 Linux 全量回归（WSL2 + Ubuntu 20.04，新增环节）**：

| 平台 | 结果 |
|---|---|
| **Linux（Node v22.22.2 / WSL2）** | **649 例：649 通过 / 0 失败**（68 文件），`vue-tsc` 干净 |
| Windows（Node v22.22.2） | 649 例：647 通过 / **2 失败**（`codexAppServerBridge.archive.test.ts` 的 symlink realpath、`mode 0o600` vs `0o666`） |

**从 round-73 一路挂到现在的「2 例 Windows 环境性失败」这条注记，本轮在真实 Linux 上关闭**：同一套用例、同一份代码，Linux 全绿——证实那 2 例确为平台差异而非产品缺陷。

Linux 侧还**立刻抓到一个真实问题**：`threadTurnPage.test.ts` 里假 rpc 的类型不兼容（`vue-tsc` 报 TS2345）。Windows 那次 `vue-tsc` 是在**写完测试文件之前**跑的，所以没覆盖到——第二个平台的价值当场兑现。

**Linux 环境怎么搭的（WSL 无出网，一次性准备）**：`wsl.exe` 里 Ubuntu-20.04 没有 Node，也没有网络；用 Windows 侧 `tmp/fetch-linux-runtime.cjs` 取回 `node-v22.22.2-linux-x64.tar.xz`、`@esbuild/linux-x64@{0.25.0,0.27.7}`、`@rollup/rollup-linux-x64-gnu@4.62.4`，在 WSL 里把 Node 解到 `$HOME/linux-node`、把平台包按 **pnpm 虚拟 store 布局**解到各自 `node_modules/.pnpm/<pkg>@<ver>/node_modules/...`（项目用 pnpm，配置加载器用的是嵌套的 esbuild **0.25.0**、vite 用 **0.27.7**，两个都要补，只补根上一个会报 `Host version "0.25.0" does not match binary version "0.27.7"`）。运行入口 `tmp/wsl-vitest.sh [test|types]`。

## 7. 遗留与后续

- **`threadArchiveRecovery` 的辅助 resume** 仍可改成 `excludeTurns:true`（round-84 遗留，未动，只在罕见救济路径上）。
- **非边界锚点会回落全量水合**（by design）。前端的 `loadOlderMessages` 总是拿「当前最老那一轮」当锚点，而每答一页就登记它的边界，所以顺序上翻恒为有界；只有跳着要某一轮（例如从搜索定位到深处）才会回落。要覆盖那种场景需要「从最新逐页走到锚点」的链式遍历，本轮没做。
- **桥侧管道成本**仍是打开会话的主要开销（round-85 遗留，`sanitize` 46–76ms + 各合并），其中时序恢复那条已在 round-85 被闸门挡住。
- 版本号仍停在 **0.1.124**（npm publish 由用户执行）—— **已随 v0.1.125 发布**（2026-09-16）。

## 8. 手测

见 `tests/thread-loading-state/thread-conversation-loads-earlier-turns-on-demand.md` 新增的「Round-86」小节。
