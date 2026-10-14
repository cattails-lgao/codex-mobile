# Round-159：真机可用性普查（「已发布但未实现」由 1 个更正为 4 个）＋ 脱敏与链接两道文档闸门扩到全仓（2026-10-14）

> **背景：** 本轮收掉 **round-158 §六 的 10 条诚实边界里可闭合的 3 条**（用户口径「继续闭环」）：① §六.10① 一个「逐方法给合法参数」的**真·可用性普查**（round-158 已证明「空参数普查证明不了可用性」）；② §六.9 脱敏闸门**只扫 `codex-mobile-handover/`**，不含 `documentation/`、`tests/`、`PROJECT_SPEC.md`；③ §六.10② 「`documentation/` 下其它文档的失效链接未普查」。

**本轮性质**：**零产品代码改动** —— 改的是「两个闸门脚本 + 一个真机普查脚本 + 文档文本（含 `docs/` 与 `tests/` 的**用户可见**文档）」。真机 RPC 是**只读取证**，隔离 home 用完即删。**未 bump 版本 / 未 tag / 未发版。**

---

## 一、结论先行

| # | 事项 | 结论 |
| --- | --- | --- |
| ① | 真机可用性普查 | 对 **170** 个客户端方法（0.162.1）逐方法发**从 schema 构造的合法参数**：`OK 62 / IMPLEMENTED 86 / UNDETERMINED 13 / SKIPPED 5 / NOT_IMPLEMENTED 4`。「已发布但未实现」**不是 1 个而是 4 个** —— round-158 只抓到 `thread/prediction/request`，另有 `thread/items/list`、`thread/searchOccurrences`、`thread/timeline/list`。新增可复跑闸门 `scripts/probe-app-server-methods.cjs`（**带基线对照**，退 0/1/2） |
| ② | 脱敏闸门扩根 | 扫描范围从 `codex-mobile-handover/` 扩到**全仓 md（545 个，含未跟踪）**；补上 §5.4 明文点名、闸门却一直没拦的一类 **「盘符 + `Users` + 占位符」家目录骨架**（类数 8 → **9**）；新暴露 **10 处 / 8 文件**，改 **9 处 / 7 文件**（等量替换），余 **5 条例外**。顺带修掉**闸门自身两个缺陷**：缺这一类、以及**只扫已跟踪文件**（新文档漏检） |
| ③ | 全仓 md 相对链接 | 新增闸门 `scripts/check-md-links.cjs`；真实失效 **52 条 / 5 文件**（**改写 50 + 降级 2**，等量替换 `+52/−52`）→ **0**。**必须先剥代码再扫**：不剥会多出 19 条误报 |

---

## 二、① 真·可用性普查（round-158 §六.10①）

**现象/需求：** round-158 收官时自陈「顺带做的『空参数普查』168/170『可用』是假象 —— 空参会先撞参数校验（129 次 `-32600` vs 仅 37 次执行到实现分派）⇒ 要判可用性必须逐方法给合法参数」，并把这条列为本轮未做。

**根因：** 「schema 里有名字」「服务端承认这个名字」「服务端真的实现了」是**三件事**，必须分别取证。round-158 只做到第二条（负控文案里列出了方法名）。

**方法（`scripts/probe-app-server-methods.cjs`，新增）：**

1. **从 JSON schema 机械构造合法参数**：读 `ClientRequest.json` 的顶层 `oneOf`，取每个方法的 `params.$ref`，递归**只填 `required` 字段**（优先 `default` > `const` > `enum[0]` > 类型占位；联合体优先挑**简单类型**分支；`*Id` / `format:uuid` → 固定 UUID）。170 个方法里 **152 个是对象形态**（其中 **118 个有 required**），18 个是内联联合 ⇒ 只能发 `{}`。
2. **判定分五档**（关键是把「反序列化失败」与「域错误」分开）：
   - `OK` 有 result；
   - `IMPLEMENTED` **域错误**（`thread not found` / `chatgpt authentication required` / `requires exactly one of …`）⇒ 已进入实现内部，是**已实现**的硬证据；
   - `NOT_IMPLEMENTED` `-32601` 或文案含 `not implemented yet` / `is not supported yet`；
   - `UNDETERMINED` 反序列化失败（`Invalid request: …` / `missing field …`）—— **为什么它不算未实现**：`thread/prediction/request` 用 `{}` 会回 `-32600 missing field threadId`，而它**是未实现**的 ⇒ 参数校验发生在「未实现」闸门**之前**，所以反序列化失败**不携带**实现与否的信息；
   - `SKIPPED` / `TIMEOUT`。
3. **隔离纪律照旧**：全新空 `CODEX_HOME`（只拷 `auth.json`）、进程 `cwd` 在仓外、`%TEMP%` 不作 home；**用完即删**（实测零残留）。
4. **基线对照**：把已知那 4 个未实现写进脚本 `KNOWN_UNIMPLEMENTED`，闸门只在**集合变化**时红 —— 否则会被这 4 个长期项永远染红、失去信号。

**结果（0.162.1；证据 `tmp/probe-app-server-methods.json`，60 KB）：**

| 档 | 数 | 说明 |
| --- | --- | --- |
| `OK` | **62** | 有 result |
| `IMPLEMENTED` | **86** | 域错误，文案归类：目标不存在 **49** / 需要 ChatGPT 登录态 **15** / 参数语义校验 **14** / 其它域错误 **8** |
| `UNDETERMINED` | **13** | 判据不足，见下 |
| `SKIPPED` | **5** | 有意不开火 |
| `NOT_IMPLEMENTED` | **4** | ↓ |

**4 个「已发布但未实现」**（round-158 只知 1 个）：

| 方法 | 服务端文案 |
| --- | --- |
| `thread/prediction/request` | `is not implemented yet`（round-158 已抓到的那个） |
| `thread/items/list` | `is not supported yet` |
| `thread/searchOccurrences` | `is not supported yet` |
| `thread/timeline/list` | `is not supported yet` |

旁证：负控（调不存在的方法）文案里列出的合法方法名与快照联合**完全一致** —— `serverOnly = 0`、`snapshotOnly = 0`（170 个名字服务端全认，服务端也没有多出快照之外的方法）。

**5 个 SKIPPED（不在闸门里开火，属诚实边界）：** `account/login/start`、`account/gatewayOAuth/login`、`account/logout`、`mcpServer/oauth/login`（都会开浏览器 / 走 OAuth）、`feedback/upload`（会向服务端上传数据）。

**13 个 UNDETERMINED（判据不足）：** 其中 **10 个**是 `AbsolutePathBuf deserialized without a base path` —— 该类型要服务端用 `AbsolutePathBufGuard` 设 base path 才能反序列化，闸门构造不出来（`fs/*` 8 个 + `plugin/share/save` + `process/spawn`）；另 **3 个**是 `account/bedrock/setup`（`missing field type`）、`thread/approveGuardianDeniedAction`、`thread/backgroundTerminals/terminate`。

**写脚本时先修掉自己的两个构造缺陷（根因是同一条：必须先解引用、再判分支）：**

1. 第一版在 `deref` **之前**判 `enum` ⇒ `$ref` 指向枚举的字段（`mergeStrategy`、`creditType`）被填成垃圾串、白撞 `-32600`；修好后 `mergeStrategy: "replace"`、`size: {cols,rows}` 才正确。
2. 第一版把 `allOf: [{$ref: AbsolutePathBuf}]` 这种**单分支标量包装**硬按对象合并 ⇒ 给「期望 string 的 `path`」塞了一个 `{}`；改为「有非对象分支就直接按该分支造」。

**接线影响：** 仍是**零接线**（round-158 的结论未变 —— 3 个方法在 `src/` 零引用、类型随快照自动到位、通知透传无穷举、方法目录运行时推导）。本轮只是把「**还有没有别的没实现**」这个问题**答清**了。

---

## 三、② 脱敏闸门扩到全仓（round-158 §六.9）

**现象/需求：** round-158 §六.9 记「闸门只覆盖 `codex-mobile-handover/`：`documentation/`、`tests/`、`PROJECT_SPEC.md` 等不在扫描范围」。

**根因（两层）：**

1. **扫描根太窄**：§5.4 是**文档**规则，而闸门只扫交接目录。
2. **规范与闸门本身就不一致**：§5.4 正文**明文禁止**「盘符 + `Users` + 占位符」这种家目录骨架（原文措辞是"含脱敏后的…结构"），而闸门**没有对应类**，其注释还写着「占位符形态不拦」⇒ 这条规则**从来没有被真正执行过**。

**范围决策（有意不扫源码，有实测支撑）：** 全仓 git 跟踪的文本类文件共 2280 个，其中命中 23 个 —— **18 处在 `scripts/*.cjs`**（那里是把机器路径**当默认值用**）、**7 处在 `src/**/*.test.ts`**（夹具里的用户名是**编造**的，不是真人目录）。把这些拖进来只会把闸门变成噪音源 ⇒ **扫全仓 md（545 个），不扫源码**；源码里的硬编码本机路径记为**另一个**问题（见 §六.6）。

**修复：**

- 扫描根改为「**全仓 git 跟踪的 `*.md` / `*.markdown`**」（取不到 `git ls-files` 则退 2）；
- **补第 9 类**「盘符家目录骨架」`[A-Za-z]:[\\/]{1,2}Users[\\/]<`；
- 例外表 1 → **5 条**，其中 4 条是**规范条文自身举例**（禁止的就是它本身：`handover-writing-guide.md` / 其通用副本 / 总入口对它的复述 / round-158 对它的解释）；例外字面量改用**前缀匹配** —— 因为各处省略号写法不一（`...` 与 `…`），这是**第一次跑就踩到**的（round-158 文档因此没被例外覆盖）；
- 规范 §5.4 同步补写**扫描范围 / 9 类 / 例外构成**，让「条文 = 闸门」；
- **闸门自身第二个缺陷（本轮自己踩到）**：文件清单原先只取 `git ls-files`（**已跟踪**）⇒ **刚写完、还没 `git add` 的新文档不在扫描范围**。本轮新写的 round-159 文档当时带着 7 处被禁骨架，闸门却报 **0 违规**。改为 `git ls-files -co --exclude-standard`（**已跟踪 + 未跟踪但未被忽略**）；链接闸门里有同一处缺陷，一并改。
- **扫描集还要排除第三方工具目录（本轮收尾发现）**：`-co --exclude-standard` 的语义是「已跟踪 + **未被忽略**」，于是本机既有的编辑器 / AI 工具工作目录（`.trae/`、`.zcode/`，共 **4 个 md**，其中 `.trae/documents/` 下还有一份已跟踪 round-73 文档的**近重复副本**）也被算进「全仓」—— 它们不是项目文档，却会让闸门**替非项目文件报红**。已把这两类目录写入根 `.gitignore`（与既有的 `.omx/` / `.codegraph/` / `.trae-html-share-packages/` 同惯例）⇒ 扫描集回到项目文档，实测 **545 个 md**。

**新暴露的 10 处 / 8 文件：**

| 文件 | 处数 | 内容 | 处理 |
| --- | --- | --- | --- |
| `tests/chat-composer-rendering/`（3 个）＋ `tests/theme-layout-terminal/`（2 个） | 5 | `AppData` 下的 pnpm bin 目录（沙箱 PATH 说明） | → `<pnpm 全局 bin 目录>` |
| `tests/cli-network-platform/windows-codex-app-server-spawn-via-real-binary.md` | 2 | 盘符 + `Users` + 占位符 + `AppData` 下的 pnpm bin + `codex.CMD`（**同时命中两类**） | → `` `<pnpm 全局 bin 目录>\codex.CMD` `` |
| `docs/codex-cli-not-found-troubleshooting.md` | 2 | 盘符 + `Users` + 占位符 + `\.codex`（含一处逐字沙箱报错） | → `<用户主目录>\.codex` |
| `rounds/round-158-…verification.md` | 1 | 复述 §5.4 时引用了被禁形态 | **改登记为例外**（条文自身举例），不改文 |

⇒ 实际修复 **9 处 / 7 文件**，全部**等量替换**（逐文件增删相等）。

**验证：** 闸门 **违规 0 / 例外 5，退 0**（扫描 545 个 md）。

---

## 四、③ 全仓 md 相对链接闸门（round-158 §六.10②）

**现象/需求：** round-158 只体检了 `APP_SERVER_DOCUMENTATION.md`。本轮先确认「`documentation/` 下其实只有 **1 个** md（就是它）」，所以真问题是**全仓其它文档从未做过链接体检**。

**根因（本轮第一个技术要点）：** 朴素扫法会**误报** —— 第一版没剥代码，把 `` `![](video.mp4)` ``、`` `[Label](path)` ``、`text-[0.68rem](10.88px)` 这类**行内代码里的排版说明 / 示例语法**全当成链接，71 条「失效」里 **19 条是误报**。⇒ 闸门**先剥围栏代码与行内代码再扫**。

**不校验的目标（有意）：** 带 scheme 的（`https:` / `mailto:` / `codex://` / `file:`…）、含 `<`/`>`/`...` 的占位符与省略写法、以 `/` 开头的**站点绝对路径**、纯锚点。

**结果：真实失效 52 条 / 5 文件 → 0（改写 50 + 降级 2）**

| 文件 | 处数 | 病因 | 处理 |
| --- | --- | --- | --- |
| `codex-mobile-handover/sections/snapshot-table-archive.md` | 28 | 在 `sections/` 下写 `rounds/…` / `sections/…`，**少一级 `../`** | 改路径（`rounds/…` → `../rounds/…`；`sections/commit-history.md` → `commit-history.md`） |
| `.cursor/plans/implement_acp_bridge_b59b4959.plan.md` | 11 | 在 `.cursor/plans/` 下写 `src/…` / `vite.config.ts`，**少两级 `../../`**；其中 `src/server/acpBridge.ts` **从未创建** | 改路径 9 条 ＋ **降级 2 条** |
| `codex-mobile-handover/rounds/round-52-duplicate-agent-live.md` | 10 | 在 `rounds/` 下写 `src/…`，**少两级** | 改路径 |
| `codex-mobile-handover/rounds/round-64-v0.1.109-recycle-bin-thinking-h5.md` | 2 | 写 `../src/…`，**少一级** | 改路径 |
| `codex-mobile-handover/rounds/round-51-final-assistant-and-zen-namespace.md` | 1 | 同 round-52 | 改路径 |

定位方法是「按**后缀**在仓内 git 跟踪文件里找**唯一**命中 ⇒ 目标存在就改层级、不存在就降级为行内代码」，逐锚点断言命中次数、行数必须不变。

**验证：** 闸门 **失效 0**；5 文件 diff **+52 / −52，逐文件等量**。

---

## 五、收尾验证汇总

| 项 | 结果 |
| --- | --- |
| `node scripts/probe-app-server-methods.cjs` | 170/170 取到结论（13 判据不足 / 5 有意跳过）；**与基线一致，退 0** |
| `node scripts/check-handover-desensitization.cjs` | **违规 0 / 例外 5，退 0**（扫描 545 个 md） |
| `node scripts/check-md-links.cjs` | **失效 0，退 0**（2553 条可校验相对链接） |
| `node scripts/regen-app-server-doc.cjs --check` | **drift 0**（未改动该文档，仅回归确认） |
| 文档数据改动 | **12 文件**（脱敏 7 ＋ 链接 5，**重叠 0**），**逐文件增删相等** |
| 真机隔离 | `tmp/r159-census-home` 与仓外 scratch **用完即删，实测零残留** |

**涉及文件：**

- 新增：`scripts/probe-app-server-methods.cjs`、`scripts/check-md-links.cjs`
- 修改：`scripts/check-handover-desensitization.cjs`（扩根 ＋ 第 9 类 ＋ 例外表）、`scripts/regen-app-server-schemas.cjs`（导出 `resolveCodex`，避免再写第 4 份解析）、根 `.gitignore`（排除编辑器 / AI 工具目录）
- 文档：`docs/codex-cli-not-found-troubleshooting.md`、`tests/` 6 个、`codex-mobile-handover/` 5 个（含规范 §5.4）、`.cursor/plans/` 1 个
- 探针（`tmp/`，未入库）：`r159-size-scope*.cjs`、`r159-dump-broken-links.cjs`、`r159-desense-repo-wide.cjs`、`r159-fix-desense.cjs`、`r159-fix-links.cjs`、`r159-analyze-census.cjs` 等 ＋ `probe-app-server-methods.json` 与备份目录

---

## 六、诚实边界

1. **零产品代码改动** ⇒ 本轮**未跑** `vue-tsc` / 全量单测 / `vite build`（基线仍以 round-157 的 **998 例 / 87 文件**为准）。新脚本用 `node --check` 与自身退出码跑通。
2. **普查结论有边界：170 个方法里 13 个「判据不足」、5 个「有意跳过」** ⇒ 「**除这 4 个以外都已实现**」的适用范围是 **152/170**。要收掉 13 个里那 10 个 `AbsolutePathBuf`，得让服务端为这类 RPC 设 base path（闸门做不到）；另 3 个需要为 `ReviewTarget` / `GuardianAssessmentEvent` / 数字型 id 写更精确的构造。
3. **那 5 个 SKIPPED 的方法是否实现，本轮没测**：它们会开浏览器 / 走 OAuth / 上传数据，不该由闸门开火。这是**有意的测不到**，不是遗漏。
4. **基线是硬编码在脚本里的 4 个方法名**：换 codex 版本后若上游把它们实现了，闸门会以「已消失」报红 —— 这是**有意的信号**（提醒复核），代价是基线要人工更新。
5. **闸门只在有真机 codex 的机器上跑得出**（要起一次 app-server、要真实 `auth.json`）；**不进 CI** —— 与既有的「13 个闸门脚本不在 CI 里」边界同源。
6. **脱敏闸门仍不扫源码**：`scripts/*.cjs` 18 处、`src/**/*.test.ts` 7 处字面路径**未处理**。理由见 §三（当默认值 / 测试夹具用），但这是**另一个**问题（代码可移植性），本轮只记录。
7. **§5.4 的判定线仍是我划的**：新增的「盘符家目录骨架」类是按 §5.4 正文来的；但 **POSIX 家目录骨架**（`/home/<user>/…`、`/Users/<user>/…`）**仍未建类**，其在仓内 md 的命中数**未量**。若要补，改的是**类定义**而不是文档。
8. **链接闸门只校验存在性，不校验锚点**：`x.md#fragment` 只检查 `x.md` 存在，`#fragment` 是否指向真实标题**未校验**；站点绝对路径与带 scheme 的目标也不校验（上游文档里 `/docs/api/…` 那类本来就不是本仓相对路径）。
9. **`.cursor/plans/implement_acp_bridge_b59b4959.plan.md` 是 IDE 计划产物**（全仓 `.cursor/` 下**唯一**被跟踪的文件）：它引用的 `src/server/acpBridge.ts` **从未创建**，那 2 条已降级为行内代码。若 Cursor 重新生成该文件，闸门会再红。
10. **`docs/` 与 `tests/` 的改动是用户可见文档**（不是交接文档）：改动都是**等量替换、未逐条人工复核**；`docs/codex-cli-not-found-troubleshooting.md` 里那处**逐字沙箱报错**也被改了（原文已被脱敏成 `<用户名>`，本就不是逐字）—— 若认为「报错原文必须保持逐字」，那处应回退并把该行登记为例外。
