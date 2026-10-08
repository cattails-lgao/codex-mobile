# round-130：codex-cli 0.160.1 协议复测——有界分页首次真正生效 + schema 快照同步暴露的契约漂移

> 日期：2026-10-08 · 环境：Windows / 托管 node 22.22.2-6 / **codex-cli 0.160.1**（用户升级前为 0.158.0 档）
> 承接：用户「我把 codex-cli 更新到了 0.160.1，还有哪些需要处理？」；并结清 [round-129](round-129-freeze-budget-load-normalisation.md) §四⑤ 明确记的「未在 0.160.1 上复测」

本轮**没有为「适配新版本」而改任何运行时行为**。改动分三类：①把源码里过时的版本口径注释补齐（**纯注释**）；②把 `documentation/app-server-schemas` 快照从 0.153.4 同步到 0.160.1（**文档 + 类型**，并由此暴露 3 处契约漂移，其中 1 处修在**类型层、运行时行为逐字不变**）；③闸门脚本的**环境不足退码**（纯脚本）。真正的产品行为变化不是本轮引入的，而是**升级本身带来的**——见 §三。

---

## 一、结论先行

| # | 发现了什么 | 严重度 | 本轮处置 |
| --- | --- | --- | --- |
| 1 | **round-86 的有界分页在本机历史上从未真正生效过**；0.160.1 让它第一次跑通 | 行为变化（改善） | 真机取证（§三） |
| 2 | `thread/turns/list` 在 0.160.1 **已实现**，`olderTurnsUnavailable` 降级分支对它不可达 | 口径过时 | 注释更正（§五） |
| 3 | `UserInput` 的 image 变体变成 `{url} \| {fileId}` | 契约漂移 | 类型收窄，**行为不变**（§四） |
| 4 | `Thread` / `ThreadItem.mcpToolCall` 新增必填字段 | 契约漂移 | 测试 fixture 跟进（§四） |
| 5 | `features.instant_interrupt` **首次真实生效**（≈3× 抢占差距） | 行为变化（改善） | 取证（§二） |
| 6 | 此前多轮闸门实际驱动的 app-server 是 **0.154.0-alpha.6.2**，而文档标 0.158.0 | 记录失真 | 如实记录（§六） |
| 7 | `check-thread-switch-feedback` 把「环境不足」报成退 1（＝回归） | 闸门缺陷 | 改退 2 + 三条证据（§七） |

**一句话**：升级 0.160.1 给用户带来两项**正向**的行为变化（历史可真正分页上翻、中断抢占快约 3 倍），代价是本仓与上游的 schema 出现了 3 处类型层漂移（已处置，无运行时影响）。**本轮没有发现任何回归。**

---

## 二、0.160.1 上的契约变化（真机实测）

### 2.1 `thread/turns/list` 已实现

0.158.0 档的行为是「注册了方法但每次回 `-32601: list_turns is not supported yet`」（round-102 的实测记载）。0.160.1 上它**真的可用**，返回形状已完成实测：

```
{ data: [ { id, items, itemsView, status, error, startedAt, completedAt, durationMs } ],
  nextCursor, backwardsCursor }
```

三点细节：

- turn 对象**新增 `itemsView` 字段**（回显本次请求的视图，0.153.4 快照里没有）。
- `itemsView: 'notLoaded'` → `items: []`（只给 id，代价为零）；`itemsView: 'full'` → `items` 带正文（实测 4 项，`item[0].keys = type,id,clientId,content`）；**省略该参数 = full**。
- 本仓两处用法（`bridge/threadTurnPage.ts`）因此**都能拿到它们各自需要的东西**：`readThreadTurnIds` 只要 id，`readBoundedThreadTurnPage` 要带正文的整页。

### 2.2 `features.instant_interrupt` 首次真实生效

同一 prompt、同一隔离 `CODEX_HOME`、同一 0.160.1 二进制，**唯一变量是 flag**：

| flag | steer 发出 | 首个回合收尾 | **抢占间隔** |
| --- | --- | --- | --- |
| `features.instant_interrupt=true` | +3759ms | +9558ms | **5799ms** |
| `features.instant_interrupt=false` | +3747ms | +21223ms | **17476ms** |

⇒ 约 **3×** 差距。启动横幅显示 `Instant interrupt: on`、参数含 `-c features.instant_interrupt=true`、**stderr 零警告**——即 `INSTANT_INTERRUPT_MIN_VERSION = '0.159.0'` 的门控在 0.160.1 上按设计生效（round-106 的收益**第一次真实落地**）。

### 2.3 请求方法表 170 个；`thread/rollback` 确已移除（本仓早已适配）

`thread/*` 共 48 个。**未发现任何本仓调用的请求方法被移除**——`thread/rollback` 不在表内，但本仓在 round-106 起就已改走 `thread/revert`（上游 0.156 移除，#44915），`round-106` 的注释原文即「thread/rollback 已被上游移除」。源码里仅存的两处 `'thread/rollback'` 字样分别是历史方法名集合（`inlineImages.ts` 的兼容白名单）与文档性注释，**不是活跃调用**。

---

## 三、最重要的发现：有界分页第一次真正生效

### 3.1 为什么说「第一次」

round-86 设计了「上翻更早轮次走 `thread/turns/list` 游标链、不水合全量」的有界路径，round-110 又把「打开线程」也改成有界。**但这两条路径都依赖 `thread/turns/list`**，而它在 0.158.0 档上每次都回 `-32601`：

- 打开线程：`resumeThreadWithTurnPage` 走 `isThreadResumeTurnPageSupported` 守卫 → 回落到全量 `thread/resume`；
- 上翻：`ThreadTurnPageUnsupportedError` → round-102 加的 `olderTurnsUnavailable` 边界 → 前端把「还有更早消息」收敛为 false 并提示「当前 codex-cli 版本暂不支持加载更早的消息」。

**也就是说：round-86 / round-110 写的有界代码，在本机历史上从未被真正驱动过**，一直走的是降级分支。0.160.1 实现了该方法，这条路径第一次可能跑通。

### 3.2 真机取证（12 轮线程）

在隔离 `CODEX_HOME`（只拷 `auth.json`）上、经**真实服务**（0.160.1 钉在 `CODEXUI_CODEX_COMMAND`）造一条 12 轮线程：

**中间证据**：连续开 12 轮的过程中，`thread/read` 返回的 `thread.turns` 从 1 递增到 **10 就停住**（第 11、12 轮仍返回 10 条）——这正是「只水合最近一页」的表征（旧行为应返回全部 12 轮）。

**打开线程**（`thread/resume`）：

| 读量 | 结果 | 期望 |
| --- | --- | --- |
| 返回 `turns` | **10** | 10（一页 = `THREAD_RESPONSE_TURN_LIMIT`） |
| `threadTurnStartIndex` | **2** | 2 = 12 - 10 |
| `initialTurnsPage` 是否残留 | **false** | false（不得让轮次发两遍） |
| 与全量最末 10 条同序 | **true** | true |
| 页内首轮 `items` 数 | **2** | > 0（页必须带正文） |

**上翻**（`/codex-api/thread-turn-page?beforeTurnId=<第3条>&limit=3`）：

| 读量 | 结果 | 期望 |
| --- | --- | --- |
| `olderTurnsUnavailable` | **undefined**（未触发） | 未触发 |
| `startTurnIndex` / `hasMoreOlder` | **0 / false** | 0 / false |
| 返回 ids | **恰好 t1、t2** | t1、t2 |

**再上翻一页**（游标链第二步，`beforeTurnId=t1`）：返回 **空**（已到线程起点），与期望一致。

⇒ 三条都逐字正确。**有界分页在 0.160.1 上真正生效，且窗口精确**。

### 3.3 用户可见的行为变化

- 「**当前 codex-cli 版本暂不支持加载更早的消息**」这条提示在 0.160.1 上**不再出现**；
- 长线程上翻**不再回落全量水合**（这正是 round-102 P0 想避免的「大线程全量 `thread/read` 挂死 UI」）；
- `olderTurnsUnavailable` / `isThreadTurnPageUnsupported()` 的闩锁在 0.160.1 上**恒为 false**——它对**旧二进制仍然有效**（round-102 的保护没有失效，只是不再是每台机器的必经之路）。

> 也就是说：round-102 的 P0 分支在 0.160.1 上变成**兼容性代码**，而非「每次升级都会走的主路径」。

---

## 四、schema 快照同步暴露的契约漂移

把 `documentation/app-server-schemas` 从 **0.153.4** 同步到 **0.160.1**（命令见 §九）。差异规模：

| 目录 | 旧 | 新 | 相同 | 仅旧有 | 新增 | 内容变化 |
| --- | --- | --- | --- | --- | --- | --- |
| `json` | 416 | **440** | 352 | 2 | **26** | 62 |
| `typescript` | 827 | **875** | 778 | 2 | **50** | 47 |

被删的 2 个是 `v2/ThreadRollbackParams` / `Response`（上游移除 `thread/rollback` 的反映，本仓 round-106 已适配）；新增的代表是 `ThreadAttachment*` / `GatewayOAuth*` / `MemoryStatus*` / `thread/queue/*` 等。

**同步动作的真正价值**：`src/api/appServerDtos.ts` 直接 `export type ... from '../../documentation/app-server-schemas/typescript/v2/...'`——**换快照等于换类型定义**，于是 `vue-tsc` 把本仓与 0.160.1 的不一致直接报了出来。**5 条错误、3 个位置**：

| # | 位置 | 漂移 | 处置 |
| --- | --- | --- | --- |
| ① | `src/api/normalizers/v2.ts:170` | `UserInput` 的 image 变体变成 `{ type:'image', detail? } & ({url} \| {fileId})`，直接读 `.url` 不再合法 | 加 `'url' in block` 收窄联合类型——**运行时行为逐字不变**（原守卫 `typeof block.url === 'string'` 对 `{fileId}` 变体本就是 false） |
| ② | `src/api/normalizers/v2.test.ts` | `Thread` 新增必填 `environments` / `originator` / `daybreakEnabled` | fixture 补三个 `null` |
| ③ | 同上 | `mcpToolCall` 新增必填 `mcpAppUi` | fixture 补 `mcpAppUi: null` |

**为什么要强调 ①「行为不变」**：`{fileId}` 是 0.160.1 新允许的「图片以附件 id 引用」形态，本仓的 `parseUserMessageContent` 只收集 URL 字符串。改动前它**已经**不会把 `{fileId}` 当成图片（守卫为 false），改动后同样不会 ⇒ 差别仅在于**类型能不能编译**。**「fileId 形式的图片在 UI 上不显示」是一条独立的、本轮未处置的缺口**（见 §八）。

---

## 五、注释口径更正（16 处 / 11 文件）

**原则：只追加、不改写历史记载。** 各处原有版本号（多为「codex-cli 0.158.0 实测」）一律保留，只在末尾补一行 round-130 的复测结论，例如：

```
// round-102 P0：app-server 不实现 thread/turns/list（codex-cli 0.158.0）时
// 上翻是终态不可用——收敛 hasMoreOlder 停止重试，仅提示一次边界，其余失败
// 保持原行为（hasMoreOlder 不动，滚动可重试）。
// round-130 复测：0.160.1 已实现该方法，故上面的终态分支只对旧二进制可达。
```

涉及文件：`api/codexErrors.ts`、`api/gateway/threads.ts`、`composables/useDesktopMessageHistoryLoading.ts`、`composables/useDesktopState.ts`、`server/appServerRuntimeConfig.ts`、`server/codexAppServerBridge.ts`（3 处）、`server/bridge/threadReadTurnPage.ts`、`server/bridge/threadRoutes.ts`（2 处）、`server/bridge/threadRoutes.turnPage.test.ts`、`server/bridge/threadTurnPage.ts`（3 处）、`server/bridge/threadTurnPage.test.ts`。

**为什么不顺手把版本号也改成「0.160.1 已实现」**：round-130 同时发现**这批「0.158.0」标注本身存疑**（见 §六）。在没有逐条回溯出当时真实版本之前，篡改历史版本号只会把一次失真换成另一次失真。改动脚本对每个待替换片段断言「出现次数必须为 1」，任一失败则**整批不写盘**（fail-closed）。

---

## 六、环境层新事实：三套 codex，以及被误标的 0.158.0

本机有 **3 套 codex**：

1. **PATH 上的 pnpm 全局 = 0.160.1**（用户升级的这套）；
2. `%LOCALAPPDATA%\OpenAI\Codex\bin\<16hex>\codex.exe` = 桌面 App 的内容寻址缓存 = **0.154.0-alpha.6.2**（Sep 15）；
3. `~/.codex/packages/app-server-daemon/releases/{0.159.0, 0.161.0}/` = 桌面 App 的托管 app-server 守护进程。

**关键**：此前跑在 4191 的服务被显式 `CODEXUI_CODEX_COMMAND` 钉在②上 ⇒ **round-123 ~ round-129 的闸门读数实际驱动的 app-server 是 0.154.0-alpha.6.2，而文档标注的是 0.158.0**。本轮已改钉 0.160.1 并重取全部读数。

**这意味着什么、不意味着什么**：

- 意味着：那几轮文档里的「codex-cli 0.158.0」**标注不可当作版本凭据**；
- 不意味着：那些结论失效。它们测量的是**本仓的行为**（滚动位置、DOM 真空、冻结帧），与 app-server 的补丁号无关；`thread/turns/list` 相关的那几条更是**从来就没走通过**（§三），换哪个版本都一样。

本轮**没有**回溯修正历史文档的版本标注——那需要逐轮重放，成本远大于收益。此事实在此一次性记录，后续引用旧轮次时以本节的披露为准。

---

## 七、闸门退码：环境不足不再伪装成回归

`check-thread-switch-feedback.cjs` 的既有约定是「退 2 = 环境不足（SKIP）」，但它有**两处**在环境不足时走了退 1（＝「有断言失败」）：

| 位置 | 触发条件 | 原行为 | 现行为 |
| --- | --- | --- | --- |
| `main()` 等 `.thread-row`（30s） | 这个 `CODEX_HOME` **一条线程都没有**（侧栏不渲染任何行） | `waitForSelector` 超时 → 冒到 `main().catch` → **退 1** | 捕获后打印 `SKIP: no .thread-row appeared …` → **退 2** |
| `contentIds.length < 2` | 有线程，但**只有 1 条有消息** | 打印 `FAIL need at least 2 …` → **退 1** | 打印 `SKIP: need at least 2 …` → **退 2** |

**三条取证**（同一份脚本、三个不同的 `CODEX_HOME`）：

| 场景 | 服务 | 读数 | 退出码 |
| --- | --- | --- | --- |
| 空 home（`thread/list` = `[]`） | 4192 | `SKIP: no .thread-row appeared within 30s at http://127.0.0.1:4192` | **2** ✅ |
| 只有 1 条有消息线程（`rows=1 with-messages=1`） | 4193 | `SKIP: need at least 2 sidebar threads that have messages to check a switch (found 1 of 1 rows)` | **2** ✅ |
| 正常 home（7 行、≥2 条有消息） | 4191 | `all checks passed`（含 `switch freeze <= 60ms  (frozen=8ms ambient90=8ms budget=60ms)`） | **0** ✅ |

> 空 home 那条是**改这个脚本时才发现的第二处**：原报告只提「1 条有消息的线程退 1」，实测连「0 条线程」也会退 1——而且它连不到那行 `contentIds` 判定，是在更早的 `.thread-row` 等待里超时。

退出码约定同时写进了脚本文档头：`0 全绿 / 1 有断言失败或运行异常 / 2 环境不足（SKIP）`。

---

## 八、验证

### 8.1 0.160.1 上的闸门复跑

| 闸门 | 结果 |
| --- | --- |
| `verify-command-block-handoff` | **ALL GREEN 6/6**（maxCmds=1、无真空、回合 +13596ms 完成） |
| `check-thread-switch-feedback` | **PASS**（7 行 / ≥2 条有消息；frozen 8ms ≤ 60ms 预算） |
| `verify-mobile-375` | **PASS** |
| `check-ui-contract` | **42/42** |
| `check-fonts` | **13/13** |
| `check-theme` | **15/15** |
| `check-thread-switch-feedback --self-test` | **8/8**（本轮改动后复跑） |
| `verify-conversation-mount-scroll` / `verify-conversation-list-persists` / `verify-review-pane-scroll` | **SKIP（退 2）**——隔离 home 的线程只可滚 0px，环境不足 |

### 8.2 静态与全量

| 项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit`（**换 0.160.1 快照后**） | **EXIT=0 / 0 错误**（换快照初跑为 5 错，修完 3 处后归零） |
| Vitest 全量 | **742/742 通过（76 文件）零失败** |
| `vite build` | **EXIT=0**（13.73s） |
| `check-ui-contract` | **42/42** |

> 换快照 → 5 个类型错误 → 修 3 处 → 0 错误，是本轮**最强的一条「快照不是装饰品」的证据**：它证明这批生成类型确实参与编译，因而也确实是契约漂移的探针。

---

## 九、涉及文件 + 复现方式

**改动文件（17 个）**

- 注释口径（11 个，纯注释）：`src/api/codexErrors.ts`、`src/api/gateway/threads.ts`、`src/api/normalizers/v2.ts`※、`src/composables/useDesktopMessageHistoryLoading.ts`、`src/composables/useDesktopState.ts`、`src/server/appServerRuntimeConfig.ts`、`src/server/codexAppServerBridge.ts`、`src/server/bridge/threadReadTurnPage.ts`、`src/server/bridge/threadRoutes.ts`、`src/server/bridge/threadRoutes.turnPage.test.ts`、`src/server/bridge/threadTurnPage.ts`、`src/server/bridge/threadTurnPage.test.ts`
  ※ `v2.ts` 那一处**不是纯注释**（含 `'url' in block` 收窄，运行时行为不变），单列于 §四。
- 契约漂移：`src/api/normalizers/v2.ts`、`src/api/normalizers/v2.test.ts`
- schema 快照：`documentation/app-server-schemas/{json,typescript}/**`（416+827 → 440+875 个文件）、`documentation/APP_SERVER_DOCUMENTATION.md`（版本行 0.153.4 → 0.160.1）
- 闸门：`scripts/check-thread-switch-feedback.cjs`（两处退码 + 文档头）

**复现（需要一个跑着 0.160.1 的服务）**

```bash
# 0) 起服务：cwd 必须在仓外（仓内 .codex/config.toml 会覆盖 provider），
#    CODEX_HOME 必须在 %TEMP% 之外（codex 拒绝在临时目录建 helper 二进制）
cd "$LOCALAPPDATA" && CODEX_HOME="D:/code/codex-mobile/tmp/r130-codex-home" \
  OPENAI_API_KEY="$(cat D:/code/codex-mobile/tmp/r130-apikey.txt)" \
  CODEXUI_CODEX_COMMAND="<0.160.1 的 codex.exe>" \
  node /d/code/codex-mobile/dist-cli/index.js --no-tunnel --no-open --no-login --no-password -p 4191

# 1) 契约细节（notLoaded / full / 省略 itemsView 三种视图）
node tmp/r130-turnslist-contract.cjs

# 2) 有界分页：造 12 轮线程（真实模型，逐轮等 completed）+ 三条验证
node tmp/r130-bounded-page-live.cjs                       # 造线程（会打印 threadId）
node tmp/r130-bounded-page-verify.cjs <threadId>          # resume / 上翻 / 再上翻

# 3) 退码：空 home 与单线程 home（各自起一个服务）
PROFILE_BASE_URL=http://127.0.0.1:4192 node scripts/check-thread-switch-feedback.cjs  # 空 home → 2
PROFILE_BASE_URL=http://127.0.0.1:4193 node scripts/check-thread-switch-feedback.cjs  # 1 条有消息 → 2
PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/check-thread-switch-feedback.cjs  # 正常 → 0

# 4) schema 快照重生成
codex app-server generate-json-schema --experimental -o <out>/json
codex app-server generate-ts         --experimental -o <out>/typescript
```

**取证原始输出**：`tmp/r130-turnlist-contract.txt`、`tmp/r130-bounded-page-live.txt`、`tmp/r130-bounded-page-verify.txt`、`tmp/r130-schema-diff.txt`、`tmp/r130-vue-tsc{,2}.txt`、`tmp/r130-vitest.txt`、`tmp/r130-vite-build.txt`、`tmp/r130-rc-empty-home2.txt`、`tmp/r130-rc-one-home.txt`、`tmp/r130-rc2-switch-4191.txt`、`tmp/r130-verify-summary.md`（§二/§八早期读数）。

---

## 十、诚实边界

① **有界分页的「首次生效」是从代码路径推出的（+ 端到端读数），不是从旧版本二进制直接对照的**。本机只有 0.160.1 与 0.154.0-alpha.6.2 两套可实现「-32601」的可执行体，**没有 0.158.0 可跑**；「旧版必回 -32601」依据的是 round-102 的实测记载与本仓为此写的守卫代码。三条读数（resume 一页 / 上翻精确 / 第二页空）本身是**独立于版本叙事的**——它们只说明 0.160.1 上这条路径正确。

② **测试线程是用真实模型造的 12 轮**，不是大线程（round-86 的对照是 30.89MB / 16 轮）。所以「有界路径更快」这个**性能**结论本轮**没有量测**，只证明了**正确性**与「确实走了有界分支」（12 轮里 `thread/read` 停在 10 条）。

③ **`{fileId}` 形式的图片在 UI 上仍不显示**（§四①）。要修需要先定「fileId → 可访问 URL」的解析语义（可能对应 `thread/attachment/*` 这批新方法），属独立设计题，本轮只做类型层收口。**副作用**：这类图片目前在 UI 上是**静默缺失**（既不出图、也不进 `rawBlocks` 的「未处理」通道，因为 `image` 类型不在那条分支里）——是否要把「有 fileId 但无 url」的 image 也送进未处理通道，需产品口径。

④ **历史文档的「0.158.0」标注未回溯修正**（§六）。只在此一次性披露，不逐轮改写。

⑤ **滚动类闸门在隔离 home 上是 SKIP，不是 PASS**。它们的「环境不足 → 退 2」是**设计**（且本轮证明了退码约定确实生效），但这也意味着 **0.160.1 上的滚动行为本轮没有被验证**——那是 `verify-*-scroll` 三个闸门在真实大线程 `CODEX_HOME` 上的事。

⑥ **`execPtyChannel.ts` / `rollbackTurnContext.ts` 的「0.158.0 实测」结论未在 0.160.1 复验**，仍属待手测（需 UI 终端 / 回滚流程）。本轮只做了与协议表有关的核对：`command/exec`、`thread/revert` 两个方法在 0.160.1 方法表里**都在**，且 `ThreadRevert{Params,Response}` 的 schema 仍在快照内。

⑦ **未在 0.160.1 上复验即时中断的 UI 侧观感**：A/B 用的是端到端时序（steer → 回合收尾），不是「用户按下中断按钮到界面反馈」的路径。

⑧ **schema 快照的生成环境未完全对齐历史**：历史提交（`037c3e5f`，0.153.4）未记录 cwd 与是否让项目级 `.codex/config.toml` 参与；本轮在**项目根**生成（`--experimental`，不加任何 `--enable/--disable`）。若历史那批受到过 feature flag 影响，本轮与它的差异里会掺入这一点。差异量级（+26/-2/62）与该推断不矛盾，但**不能排除**。

⑨ **未发版、已推送**：随下一次发布走（npm `latest` 仍是 `0.1.127`，round-122 ~ round-130 一起）。

---

## 十一、未处置 / 待手测清单

| # | 项 | 谁能做 |
| --- | --- | --- |
| 1 | `execPtyChannel.ts` / `rollbackTurnContext.ts` 的 0.158.0 结论在 0.160.1 上复验 | **需手测**（UI 终端 / 回滚流程） |
| 2 | `{fileId}` 形式图片的 UI 呈现（含「是否进未处理通道」的产品口径） | 需先定口径 |
| 3 | round-120 空状态文案 i18n（`No messages` / `No threads` / `No matching threads`） | **需用户拍板文案** |
| 4 | 历史文档「0.158.0」标注是否回溯修正 | 已披露，建议不动 |
| 5 | round-122 ~ round-130 的发布（npm `latest` 仍 `0.1.127`） | **需用户授权** |
