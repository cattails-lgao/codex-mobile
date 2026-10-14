# Round-143：回退后刷新又回来——`thread/resume` 的 rollout 页没跟权威索引对账（2026-10-14）

> **背景：** round-141 修掉「列表里有、点回退说没有」；round-142 修掉「思考存档没跟着回退清」。用户随后报
> **「回退成功了，那一轮消息也从消息列表移除了，但是刷新后那个回退的消息还在消息列表」**（线程 `01a13083-68df-7650-b4a5-5e5c8f436d06`），
> 并按提示做了一次决定性实验——**在浏览器里清空存储后刷新**：
> **「我刚刚在浏览器清空了存储，刷新后也还在」**。
> **清存储不生效 ⇒ 残留源不在浏览器里。** 本轮先把「服务端到底还有没有那一轮」实测清楚，再动手。
>
> 基线：`1a903dca`（round-141 末次提交，`package.json` = `0.1.131`）。本轮**已随 `0.1.132` 发布**（tag `v0.1.132` → 回填提交 `a60c15be`，见 §十）。

---

## 一、结论先行

| 项 | 本轮结论 | 一句话依据 |
| --- | --- | --- |
| 残留源 | **服务端的 rollout**，不是 localStorage、也不是思考存档镜像 | 用户清空浏览器存储后仍在；线上存档里该线程 **0 行**（§二①②） |
| 机制 | `thread/revert` **只清理状态索引**，被回退的轮次**仍留在 rollout**；而 `thread/resume` 的有界页取的正是 **rollout 页**（`initialTurnsPage`，游标里就是 `rolloutOrdinal`），`thread/read` 走**索引** | 同一线程两条读路径给出**不同的最新一轮**（§二④⑤） |
| 为什么「当场消失、刷新回来」 | 回退后前端已 `resumedThreadById=true` ⇒ 重读走 `thread/read`（索引，看不到）；**刷新后第一次打开**走 `thread/resume`（rollout 页，看得到） | `useDesktopMessageHistoryLoading.ts` 的 `needsResume` 分支（§三） |
| 是否普遍现象 | **不是**。8 条线上线程里 7 条两条读路径**逐位一致**；唯一不一致的就是**被回退过的那条** | 跨线程普查（§二⑤） |
| 修法 | resume 页与权威索引**对账**：索引里没有、且**已是终态**的轮次剔掉；对不上一律照旧 | `src/server/bridge/threadResumeTurnPage.ts`（§五） |

证据：`vue-tsc` **EXIT=0**；全量 **830/830（81 文件）**（基线 820/81，**+10 例**）；静态契约 **53/53**；
**端到端**（用**真实桥层代码**打线上真数据）修复开 ⇒ 9 轮 / `threadTurnStartIndex=45` / 回退轮不在；修复关 ⇒ 10 轮 / 44 / 回退轮在；
**浏览器闸门** `check-message-media-surfaces` **44/44**（用含本轮改动的 `dist-cli` 起桥）；
**反跑**后按 md5 还原（§七④）。

---

## 二、线上只读取证（本轮事实基础）

对问题线程发**只读**探测（`curl --noproxy '*'`；解析脚本见 `tmp/r142b-probe*.cjs`）。用户先前报告的 `beforeTurnId = 01a13435-…` 早已不在，
本轮多出的一轮是 **`01a138aa-1ca2-7381-a4fa-347d8ccfd6d5`**（`status: interrupted`，12:27:14 起、12:27:32 止，17.7s，
首条 user 文本以「1.Starter Pack、10 Steps to Start on BRAIN…」开头）——**正是「在 Thinking 时点停止、然后回退」的那一轮**。

| # | 探测 | 结果 |
| --- | --- | --- |
| ① | `GET /codex-api/thread-reasoning`（思考存档镜像） | 200 / 106KB，**只有 1 条线程**（`01a009af-…`，20 行）；**本线程 0 行** ⇒ 存档不是来源（round-142 的通路在这条线程上是空的） |
| ② | 清空浏览器存储后刷新 | 用户实测：**仍在** ⇒ 来源在服务端 |
| ③ | `thread/turns/list {limit:10000, desc, notLoaded}` | **54 轮**，`nextCursor = null`（**complete**），状态 51 completed / 3 interrupted；**`01a13435` 与 `01a138aa` 都不在里面** |
| ④ | `thread/read {includeTurns:true}` | 最新 10 轮，止于 `01a13856`；**`01a138aa` 不在**（响应里唯一命中该字符串的地方是 rollout **文件名** `…_01a138aa-715e-….jsonl` 的同前缀子串，纯巧合） |
| ⑤ | **未经桥改写**的 `thread/resume {excludeTurns:true, initialTurnsPage:{limit:10, sortDirection:desc, itemsView:notLoaded}}`（作者自带页 ⇒ 桥原样转发、不做提升） | **10 轮，最新一轮就是 `01a138aa`**；页 `nextCursor` 非空，游标内容 `{"rolloutOrdinal":9908,…}` ⇒ **这一路是 rollout 字节偏移** |
| ⑥ | 跨线程普查（`thread/list` 前 8 条） | **7 条**的「索引页 == rollout 页」**逐位一致**；唯一不一致的 = `01a13083`，rollout 页多出的正是 `01a138aa` |

⇒ **`01a138aa` 存在于 rollout、不存在于索引**；这不是 interrupted 轮的普遍行为，而是**回退留下的 rollout 残留**。

---

## 三、根因（代码层，已闭环）

1. **回退**：`thread/revert {beforeTurnId}` 让 app-server 把该轮（及其之后）从**状态索引**里删掉 ⇒ `thread/turns/list`、`thread/read` 都看不见它了。
   本轮还观测到 app-server 在 12:27:36（停止后 4s）**新开了一段 rollout 文件**——但新段里**仍然带着这一轮**。
2. **打开线程有两条路**（`src/composables/useDesktopMessageHistoryLoading.ts` 的 `loadMessages`）：
   ```ts
   const needsResume = deps.resumedThreadById.value[threadId] !== true
   const resumedThread = needsResume ? await resumeThread(threadId) : null
   const detail = resumedThread ?? await getThreadDetail(threadId)
   ```
   `thread/resume` → 桥 `resumeThreadWithTurnPage` → **rollout 页**；`thread/read` → 桥 `readThreadWithTurnPage` → **索引页**。
3. **于是有了一前一后两种表现**：
   - 回退当场：该线程**已经 resume 过**（`resumedThreadById=true`）⇒ 回退成功后的强制重读走 `thread/read`（索引）⇒ **那一轮不见了**；
   - **刷新之后**：`resumedThreadById` 是新的空表 ⇒ 第一次打开走 `thread/resume` ⇒ **rollout 页把那一轮带回来**。
4. **清空浏览器存储为什么无用**：`persistedMessagesByThreadId` 是纯内存 ref、思考存档也已排除（§二①），
   残留来自**服务端响应本身**——存储清掉多少都不影响 `thread/resume` 的返回。

---

## 四、为什么 round-141 / round-142 都没接住

| 轮次 | 它修的是什么 | 为什么没覆盖本轮 |
| --- | --- | --- |
| round-141 | 回退**前**用 `thread/turns/list`（索引）做权威预检，确证缺失就本地对齐、不再发注定失败的请求 | 回退**前**索引里还有这一轮 ⇒ 预检**正确放行**；它管的是「发请求之前」，管不到「回退后 rollout 里还剩什么」 |
| round-142 | 回退成功路径同步清掉**思考存档**（localStorage + 桥层镜像），并让无 `turnIndex` 的孤儿存档不再被追加 | 它修的是**本地/镜像**那条通路；在「清空浏览器存储」这个条件下**必然无效**。两条通路都要修——round-142 对「存档残留」仍然成立，本轮补的是「轮次本身残留」 |

顺带排除一个嫌疑：**桥层读缓存**。`threadReadCache` 的失效正则**已包含** `thread/revert`（`/^(?:turn\/|thread\/(?:start|fork|rollback|revert|resume|archive|unarchive|delete|compact|name\/))/u`），
且 TTL 只有 20s，不是「几分钟后仍在」的来源。

---

## 五、修复：resume 页对齐权威索引（`src/server/bridge/threadResumeTurnPage.ts`）

原来的隐含前提是「`initialTurnsPage` 与 `thread/turns/list` 是同一页数据」——本轮实测**推翻**了它（§二⑤）。修法是**不再假设**，而是对账：

```ts
const indexTurnIds = await readAuthoritativeTurnIds(deps.rpc, threadId)   // 索引 id 链（notLoaded），拿不到 ⇒ null

// round-134 语义不变：空页 ≠ 线程没有轮次
if (pageData.length === 0) {
  if (indexTurnIds === null || indexTurnIds.length > 0) return await deps.sendResume(originalParams)
}

// round-143：索引里没有、且已是终态的轮次 = 回退残留 ⇒ 剔掉
const kept = dropTurnsMissingFromIndex(pageData, indexTurnIds)
if (anchored) { promoted = withResumePageTurns(result, kept); pageTurns = kept }
```

三条设计约束（每条都有对应用例）：

1. **只剔「能被证明已不存在」的**：`dropTurnsMissingFromIndex` 保留 ①索引里有的 ②**没有 id** 的（无法归类）③状态**可能仍在跑**的
   （`inProgress` / `running` / `active` / `in_progress` / 空）。只有「索引没有 **且** 状态属于终态集合 `completed|failed|declined|interrupted|error`」才丢。
   ⇒ **正在跑的轮次永远不会被藏掉**（本仓既有约定：`threadRoutes.ts:319` 的 `isInProgress` 也读 `lastTurn.status === 'inProgress'`，即正在跑的轮必然在索引里）。
2. **剔除后必须接得上索引**：剩下的要是索引里的一段**连续后缀**（回退只会砍掉 rollout 的尾部），用
   `indexTurnIds[indexTurnIds.length - kept.length] === 最老保留轮 id` 校验。对不上（例如页首还有一个索引不认识的运行中轮次）⇒ **整页照旧返回**，
   只是放弃这一次修复，**绝不为了剔一条残留把 resume 打回全量水合**（12MB / 秒级，round-84 正是为去掉它而做的）。
3. **一次索引列表服务三件事**：空页交叉校验（round-134）、残留剔除、`threadTurnStartIndex` 的总轮数。
   拿不到索引时三件事**全部退回改动前的行为**——包括「整页轮次照旧返回」「退回 `readThreadTurnCount` 计数」「空页回放原请求」。
   注：页满时原先就会发一次 `readThreadTurnCount`（同一个 `notLoaded` 走法），所以**常见路径的请求数不变**；只有「页已覆盖整条线程」的小线程多一次 ~14ms 的 id 列表。

`readThreadTurnIds` 在不实现 `thread/turns/list` 的 app-server 上会抛 `ThreadTurnPageUnsupportedError`，这里**必须吞掉**：
它只意味着「无法对账」，不能让有界 resume 回落到全量水合。

---

## 六、用户可见行为（改动前 / 后）

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 回退过一轮，之后**刷新**打开线程 | rollout 页把那一轮带回来 ⇒ 「回退的东西又出现了」 | 索引里没有 ⇒ **不渲染**；`threadTurnStartIndex` 按索引重算 |
| 回退后**继续对话**，再刷新 | 同上（残留排在最新位置） | 同上，且新轮次序号不受影响 |
| 正常线程（索引与 rollout 一致） | 正常 | **完全不变**（7/8 线程属于此类，对账不掉任何一轮） |
| 线程正在跑 / 末轮 `inProgress` | 正常 | **完全不变**（终态才可剔） |
| 老 app-server 不实现 `thread/turns/list` | 有界页照常返回 | **完全不变**（抛出被吞 ⇒ 跳过对账） |
| 索引与页的关系不是「页=索引+尾部残留」 | — | **完全不变**（连续性校验不过 ⇒ 整页照旧） |

---

## 七、验证

### 7.1 基线

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0** |
| 全量 Vitest | **830/830 通过（81 文件）**（基线 **820/81**） |
| `check-ui-contract.cjs` | **53/53** |
| `src/server/bridge/threadResumeTurnPage.test.ts` | **39/39**（改动前 29） |

### 7.2 新增/更新用例（**+10 例**）

| 分组 | 覆盖 |
| --- | --- |
| `dropTurnsMissingFromIndex`（**新**，6 例） | 剔除索引不认识的终态轮；索引里的全保留；剔除时保序；`inProgress`/`running`/`active`/`in_progress`/空状态**一律保留**；无 id 的保留；状态是对象（`{type:'inProgress'}`）也认 |
| `resumeThreadWithTurnPage · round-143`（**新**，3 例） | ①线上真实形状（页比索引多一轮 `interrupted`）⇒ **剔除**且 `threadTurnStartIndex` 由 6 重算为 7、边界交给上翻路由；②页首还有一个索引不认识的运行中轮次 ⇒ **整页照旧**（不剔除、不回放）；③app-server 不实现 `thread/turns/list` ⇒ **有界页照常返回** |
| 既有夹具更新（1 例重写 + 1 例新增） | 原「页已覆盖整条线程 ⇒ 一次 RPC 都不发」在夹具与索引不一致的前提下已不成立，改为「一次索引列表同时完成校验与计数」+「索引恰好只有页内三轮 ⇒ `threadTurnStartIndex=0`」 |

> **夹具必须自洽**：新增 `INDEX_IDS`（页内三轮 + 13 条更老的轮次）与 `indexPage()`，原先把页内 id 写成 `'x'` 的两处夹具已改成与索引一致——
> 那两处夹具本来就是「页与索引无关」的失真形状，本轮把它纠正成真实形状。

### 7.3 端到端（**真实桥层代码 + 线上真数据**）

线上桥跑的是旧代码，所以探针自己带上 `initialTurnsPage`（旧桥遇到作者自带的页状参数会原样转发、不做提升），
于是**本仓这份新代码**拿到的是 app-server 的**原始 rollout 页**，再按新逻辑对账：

```bash
ESBUILD_BINARY_PATH=<store>/@esbuild/win32-x64/esbuild.exe "$NODE" tmp/r143-bundle-run.cjs
```

| 运行 | 结果 |
| --- | --- |
| **修复开** | `turns returned: 9`，`01a138aa` **不在**，`threadTurnStartIndex: 45`（= 索引 54 − 9），边界 = 最老保留轮 `01a1382a` + 游标 |
| **修复关**（临时把对账条件改成 `if (false)`） | `turns returned: 10`，**含 `01a138aa`**，`threadTurnStartIndex: 44` |

⇒ 修复**承重**：同一份真实数据、同一段真实代码，开关之差就是「回退的东西还回不回来」。

### 7.4 反跑

`tmp/r143-refute.cjs`：断言锚点**恰好命中 1 次** ⇒ 改 `if (false)` ⇒ 重建 bundle ⇒ 子进程跑探针 ⇒ **按 md5 还原**（`eeaaa7b04846bf62144735a43f01d77c`，还原后逐位一致），
退出码只在「探针确实又看见那一轮」且「md5 一致」时才为 0。

### 7.5 构建与浏览器闸门

| 项 | 结果 |
| --- | --- |
| `vite build` | **EXIT=0**，入口 `index-DU30mGd-.js`（与 round-142 落地时同一 hash ⇒ 前端产物可复现） |
| `tsup` | **EXIT=0**，`dist-cli/index.js` 696.31 KB |
| 产物一致性 | `dist-cli/index.js` 内 grep `dropTurnsMissingFromIndex` **2**、`readAuthoritativeTurnIds` **2**、`withResumePageTurns` **2**、状态集字面量 `"declined", "interrupted"` **1** ⇒ 新代码确实进了服务端产物。**注**：`dist-cli` 经 tsup 打包**不 minify**，函数名可作标记；**前端产物是 minify 的**，在那里只能拿字面量字符串当标记（round-141 教训） |
| `check-message-media-surfaces.cjs` | **44/44 通过**（`PROFILE_BASE_URL=http://127.0.0.1:4190`，用**含本轮改动**的 `dist-cli` 起桥；light/dark × 宽/窄）⇒ 合成线程经 `thread/resume` 打开仍然正常渲染 |

---

## 八、诚实边界

1. **本机没有可复现的真线程**：隔离 home `D:/codex-home-fresh` 里只有 4 条**空** rollout（仅 `session_meta`、无 turn）。
   本轮的验证是「线上**只读**取证 + 用真实桥层代码打线上真数据」，**不是**本机跑通一次真实回退。
2. **浏览器闸门走的是合成线程**：`check-message-media-surfaces` **44/44 通过**（§7.5），但它拦下 `thread/read`/`thread/resume` 回**合成**数据，
   所以它证明的是「**管线没被改坏**」（合成线程拿不到索引 ⇒ 对账整条跳过），**不是**「线上那条线程的回退残留被剔掉了」
   ——后者由 §7.3 的端到端探针证明。
3. **只修了 resume 这一路**。`thread/read` 走索引（本就干净）；上翻路由 `readBoundedThreadTurnPage` **早已**把取回的页与 id 列表逐一核对
   （`ascending[0].id === ids[startTurnIndex]`，不符即回落）⇒ 不需要同样处理。**未验证**的是桥内几处「回放未改写的全量读」通道
   （如 `threadSearch`、`thread-live-state` 之外的兜底）会不会也看到 rollout 残留——它们只在索引页答空/失败时触发，概率与影响都很小，列为观察项。
4. **`SHARED_BRIDGE_VERSION` 未 bump**（仍 `v7`）：本轮只改 `createCodexBridgeMiddleware` 的响应管道，
   判据是「共享对象变了才 bump」（`AppServerProcess` / `ThreadTerminalManager` 的成员没变）⇒ 不必 bump。
5. **线上未部署本改动**：线上桥仍是 0.1.131 的构建。修复要生效必须**重新部署**（本轮代码在 `src/server/**`，改它只跑 `vite build` 不生效，**必须 `tsup`**）。
6. **`01a138aa` 为什么会在新 rollout 段里**：本轮只观测到「12:27:32 停止、12:27:36 新开段、新段仍含该轮」，**没有**从 app-server 内部确认
   revert 的重写范围。修复不依赖这个答案（对账只认索引）。

---

## 九、涉及文件 + 复现方式

**改动（1 改 + 1 测）**

| 文件 | 内容 |
| --- | --- |
| `src/server/bridge/threadResumeTurnPage.ts` | 头部记录本轮发现；新增 `dropTurnsMissingFromIndex()` / `readAuthoritativeTurnIds()` / `withResumePageTurns()`；`resumeThreadWithTurnPage` 增加索引对账与连续性校验（§五） |
| `src/server/bridge/threadResumeTurnPage.test.ts` | 新增 2 个 `describe`（9 例）+ 夹具自洽化（+1 例重写，共 **+10 例**） |

**复现命令**

```bash
NODE="<node 安装目录>/node.exe"
ESBUILD_BINARY_PATH="<项目>/node_modules/.pnpm/@esbuild+win32-x64@0.27.7/node_modules/@esbuild/win32-x64/esbuild.exe"

# 1) 类型 + 全量 + 契约
"$NODE" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" scripts/check-ui-contract.cjs

# 2) 端到端（真实代码 + 线上真数据）
ESBUILD_BINARY_PATH="$ESBUILD_BINARY_PATH" "$NODE" tmp/r143-bundle-run.cjs

# 3) 反跑（禁用对账 ⇒ 回退轮必须重新出现；跑完按 md5 还原）
ESBUILD_BINARY_PATH="$ESBUILD_BINARY_PATH" "$NODE" tmp/r143-refute.cjs
```

**取证脚本（未入库，`tmp/`）**：`r142b-probe.cjs` / `r142b-probe2.cjs` / `r142b-probe3.cjs` / `r142b-probe4.cjs`（线上读路径与轮次解析）、
`r142b-survey.sh`（跨线程普查）、`r143-patch.cjs` / `r143-test-patch.cjs`（锚点脚本，逐处断言「恰好命中 1 次」才写盘）、
`r143-live-entry.ts` + `r143-bundle-run.cjs` + `r143-refute.cjs`（端到端与反跑）。

---

## 十、落款说明

- **已 bump 版本（2026-10-14 发布）**：`package.json` `0.1.131` → **`0.1.132`**（提交 `41737a45`）；**annotated tag `v0.1.132`**（tag 对象 `a8b27526…`）指向哈希回填提交 **`a60c15be`**；GitHub Release 已建并标 **Latest**（https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.132 ）；**npm 上架待维护者执行 `pnpm publish`**。
- **本轮与 round-142 是同一条用户症状的两条通路**（本地存档 / 服务端 rollout 页），两条都已修、都已验证。
- 修复只动**读侧**（取页时对账），**没有**改写入行为，也没有改任何客户端状态机 ⇒ 别的客户端读同一份数据行为不变。
- **生效条件**：重新部署（`vite build` **+** `tsup`，改 `src/server/**` 必须跑 `tsup`）。
