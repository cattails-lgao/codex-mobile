# round-107 — 遗留清理：页大小常量改名（`*_PAGE_LIMIT` → `*_PAGE_SIZE`）+ 基线抖动校准

日期：2026-09-30。用户指令「先拉取代码，再读取交接文档」——拉取并入另一台机器的 round-103~106（HEAD `c38b5836`）。本轮清掉 round-104 记录、round-106 §四 再次点名的遗留项：`TURN_ID_PAGE_LIMIT = 10_000` 的误导命名。**零行为变更**——纯改名 + 注释校正。

## 一、遗留项：页大小常量名与实测语义不符

**现象/需求：** round-104 实测 app-server 把 `turns/list` 的页**钳到 100 条**（173 轮线程传 `limit: 10_000` 只回 100 条），此后 `TURN_ID_PAGE_LIMIT = 10_000` / `TURN_COUNT_PAGE_LIMIT = 10_000` 这两个名字会被读成「一次请求拿 10 000 条」，与真实语义（**每页请求大小**，真正把列表收全的是 `nextCursor` 续链）不符。round-106 §四「遗留」明确标注「仍未清理」。

**根因（代码 + 实测确认）：** `readThreadTurnIds`（`threadTurnPage.ts`）与 `readThreadTurnCount`（`threadResumeTurnPage.ts`）都是 `for (page = 0; page < *_MAX_PAGES; page += 1)` 的**游标链循环**，`limit` 只决定单页请求大小，服务端页上限由 round-104 实测钳到 100。两个常量上的旧注释「`itemsView: "notLoaded"` … so a single shot covers any realistic thread (measured 14ms / 0.00MB for 16 turns). Larger threads fall back to cursor paging.」写于 round-86（当时页上限未知），round-104 之后「single shot 拿全」的说法已不成立——真实线程必然走续链。

**修复（2 文件，零行为变更）：**

- `src/server/bridge/threadTurnPage.ts`：`TURN_ID_PAGE_LIMIT` → `TURN_ID_PAGE_SIZE`，注释重写为「**请求页大小**；服务端无视 `limit` 把一页钳到 **100 条**（round-104：173 轮线程 `limit: 10_000` → 100 条），收全列表靠 `readThreadTurnIds` 里的 `nextCursor` 链；`itemsView: "notLoaded"` 只回 id 不回 items，故一页几乎免费（实测 14ms / 0.00MB）」。`TURN_ID_MAX_PAGES` 注释改为「游标链上限（50 页），**不是轮数上限**」。
- `src/server/bridge/threadResumeTurnPage.ts`：`TURN_COUNT_PAGE_LIMIT` → `TURN_COUNT_PAGE_SIZE`，注释同步（明确「计数是被 `nextCursor` 链收集出来的，不是单发」）。
- **刻意保留** `TURN_ID_MAX_PAGES` / `TURN_COUNT_MAX_PAGES` 两个名字——它们描述的就是「页数上限」，本身准确，且 `threadTurnPage.test.ts` 直接导入 `TURN_ID_MAX_PAGES` 做断言，改名会无谓地扩散到测试。

## 二、顺带校准：全量测试的失败数不可当作单次回归信号

改名后跑全量，失败数比记忆里的基线（2）明显偏高，遂查清其构成：

- 全量第 1 次：**671 / 677（6 失败）**；全量第 2 次：**673 / 677（4 失败）**——两次构成还不一样。
- 把 3 个含失败的文件单独复跑（`codexAppServerBridge.archive.test.ts` + `authRefresh.test.ts` + `inlinePayload.test.ts`）：**仅 2 例失败**，全在 archive 里。
- 结论：**恒定失败 = `codexAppServerBridge.archive.test.ts` 的 2 例**（Windows 平台差异，与 round-104/105/106 基线逐字同构、本轮无关）。**抖动项** = archive 的第 3 例（`hasUsableCodexAuth`）+ `authRefresh`（ChatGPT token refresh）+ `inlinePayload`（`revertTurnFileChanges` 两例），只在全量并发下偶发——即 memory 早已记录的「并发抖动」模式，只是抖动面比原先记的（仅 inlinePayload）更宽。

**口径修正**：全量跑只应看「**677 例总数**」与「**archive 那 2 例恒定失败**」；多出来的失败先隔离复跑再判断，不要拿单次全量的失败数当回归信号。

## 三、验证

- `vue-tsc --noEmit`：通过（零错误）。
- 全量 Vitest：677 例，两次 **671/677** 与 **673/677**；恒定失败 2（archive 平台差异）；隔离复跑无额外失败。
- 定向复跑 `threadTurnPage` / `threadResumeTurnPage` / `threadRoutes.turnPage`：全绿（原 52 例）。
- `vite build`：本轮无 UI/产物变更，未重跑。
- 无功能变更 → 不新增/更新手测文档。

## 四、遗留

- `getThreadDetailV2` / `getThreadMessagesV2` 仍发全量 `thread/read`：0.159.0 实测大线程 **6.0–6.2s / 26.16MB**（round-106 §二），仍是有界化（改走 `initialTurnsPage` 分页）的候选，未排期。
- `thread/items/list` 已在 round-106 phase-2 留 gateway 能力（`listThreadItemsPage`），**未接消息流水线**，等「超大单轮懒加载」的真实需求。
- round-102 的 `olderTurnsUnavailable` 能力位分流：0.159.0 上 `thread/turns/list` 已实现（round-103 探针复跑全绿），该分流退居守势防御；上游若再次变动须复跑 `probe-turn-page.cjs` 重新定性。

## 五、涉及文件

- 改：`src/server/bridge/threadTurnPage.ts`、`src/server/bridge/threadResumeTurnPage.ts`
- 新增：本文档
