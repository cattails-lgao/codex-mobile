# Round-157：app-server schema 快照升级到 0.162.1 ＋ 提交台账回填 round-144~156（2026-10-14）

> **背景：** 本轮收掉 **round-156 自己留下的两个待决项**（该轮 §七 把「要不要升级 schema 快照」「要不要单开一轮回填 `commit-history.md`」交给用户裁决）。用户回复「**做**」⇒ 两件都做。另有两件是在执行过程中**顺带发现并修掉**的：`MessagePhase` 三态的影响面核查（round-156 §八 只说「要连带决定」，本轮把它查清）、以及 `scripts/probe-codex-installations.cjs` 的一处**真实误报**（它把自己该报的版本报成「不可运行」）。

**本轮性质**：**零产品代码改动** —— 改的是「生成物快照」「生成物对应的文档版本记录」「交接台账」，以及一个**探针脚本**（不入任何产物路径）。**未 bump 版本 / 未 tag / 未发版。**

---

## 一、结论先行

| # | 事项 | 结论 |
| --- | --- | --- |
| ① | app-server schema 快照 | 由 **0.160.1 升级到 0.162.1**（json 440→**447**、ts 875→**888**）；镜像替换后 `--check` **drift = 0**；新增**可复跑的重生成 / 漂移检测脚本** |
| ② | `MessagePhase` 二态→三态（`partial_answer`） | **零运行时影响** —— 该字段在全仓**无消费点**，且无 `switch` 穷举 ⇒ **不需要任何适配** |
| ③ | `sections/commit-history.md` 断档 12 轮 | 已按体例回填 **round-144 ~ round-156**（929→**1053** 行）；收尾再追加**本轮自身条目** ⇒ **1082** 行；独立复核 27 项断言全绿 |
| ④ | 探针 `probe-codex-installations.cjs` 误报 | 已修（Node ≥20.12 不能直接 spawn `.cmd`）；修后正确报出 `codex-cli 0.162.1` |

---

## 二、① app-server schema 快照升级到 0.162.1

**现象/需求：** round-156 §八 实测查出**仓库内已提交的 schema 快照停在 0.160.1，而真机 codex 已是 0.162.1**（json 同名变更 39 / 新增 7，ts 变更 23 / 新增 13）。当时只做了「可完全回滚的编译影响实验」就收手，把「是否升级」留给用户。用户裁决：做。

**根因（代码确认）：** `src/api/appServerDtos.ts` 直接 `export type { … } from '../../documentation/app-server-schemas/typescript/v2/…'` ⇒ **换快照 = 换类型定义**。快照落后不是「文档旧了」，而是**应用被静默钉在旧协议契约上**：新版本新增的字段、新增的通知、枚举新增的取值，在类型层面**根本不存在**，写代码时既看不到也借不上力（这类漂移不会报错，只会让实现逐渐偏离真机）。

**修复（生成物 + 新增脚本 + 文档）：**

- **镜像替换**：`documentation/app-server-schemas/{json,typescript}` 用 0.162.1 的 `app-server generate-json-schema --experimental` / `generate-ts --experimental` 输出**整体覆盖**。**删除 0 个文件**（两侧文件名集合是包含关系：`onlyRepo` 为空）⇒ 升级是**纯增量**。
- **新增 `scripts/regen-app-server-schemas.cjs`（可复跑）**：`--check`（只比对，漂移 exit 1）/ `--dry-run`（打印逐文件差异）/ `--apply`（镜像写入）。退出码沿用本仓闸门约定：**0 全绿 / 1 漂移 / 2 环境不足**。选用的 codex 与 `src/commandResolution.ts#resolveCodexCommand` **同一优先级**（`CODEXUI_CODEX_COMMAND` > PATH shim 解出的真实 exe > PATH 上的 `codex`），并复刻 `src/utils/commandInvocation.ts#getSpawnInvocation` 的 cmd.exe 包装口径 —— 因为 `codex` 在本机是 **pnpm 的 `.cmd` shim**，Node ≥20.12 直接 spawn 会 `EINVAL`/`ENOENT`。生成时 `cwd` **必须离开本仓**（codex 会按进程 cwd 发现 `<cwd>/.codex/config.toml` 并**覆盖**运行参数）。
- **版本留痕**：`documentation/APP_SERVER_DOCUMENTATION.md` 第 5 行原写「generated from local Codex CLI `0.160.1`」⇒ 改为 **`0.162.1`**，并补上重生成命令与「快照被当作类型定义消费」的提醒。
- **契约差异的可读性处理**：真正的差异用一个小工具做**成员级**比对（而不是整行 diff）—— 例如 `CodexErrorInfo` 整行都变但**成员级零变化**（纯格式），`ResponseItem` 只新增 `additional_tools`。

**新增了什么（协议面，纯增量）：** 客户端方法 **173→ 新增 3**（`thread/prediction/request`、`thread/attachmentOwner/list`、`account/bedrock/checkGovCloudRequirements`）；服务端通知 **86→ 新增 1**（`thread/prediction/updated`）；**无任何导出符号或方法被移除**（`v2/index.ts` 786 导出、仅多 13 个）。类型层面被**本仓真正用到**、且**改动不兼容**的只有两处：

| 类型 | 变更 | 影响 |
| --- | --- | --- |
| `Turn` | 新增**必填** `rootTurnId: string \| null` | 构造 `Turn` 字面量的地方必须补字段 |
| `ThreadItem.subAgentActivity` | 新增**必填** `model` / `reasoningEffort`（均可 null） | 构造该 item 字面量的地方必须补字段 |

**编译面实测：** `vue-tsc --noEmit` 报 **恰好 3 处错误**，**全部在 `src/api/normalizers/v2.test.ts` 的测试夹具**（两处失败轮 + 一处 `threadReadResponseWithContent`），生产代码**零报错**；`subAgentActivity` 那条**没有任何报错** ⇒ 生产与测试都没构造过该 item 字面量。修法：给 3 处夹具补 `rootTurnId: null`（由 `tmp/r157-fix-turn-fixtures.cjs` 一次性 read-modify-write，**每处锚点断言「出现次数恰为 1」**，任一不满足即拒绝写盘；脚本首次跑因**锚点用了 LF 而文件是 CRLF** 而正确拒写 —— 正是该断言救了一次静默失败）。

**验证：**

- `node scripts/regen-app-server-schemas.cjs --check` ⇒ **drift = 0**（json 447/447、ts 888/888，新增/删除/改写全 0）。**这条是本轮的核心断言**：它证明「仓库快照 == 真机 0.162.1 生成结果」，而不是「我们手动改到看起来对」。
- `vue-tsc --noEmit` ⇒ **EXIT=0**；全量单测 ⇒ **998 例 / 87 文件全绿**（与升级前一致，零退化）；契约闸门 ⇒ **59/59**；`vite build` ⇒ **EXIT=0**；`tsup` ⇒ **EXIT=0**（`dist-cli/index.js` 696.31 KB）。

**一处环境坑（记录）**：首次把 `vite build` 与 `tsup` **并发**跑时，`tsup` 在 `removeFiles` 阶段抛错退出（`TSUP_EXIT=1`）；**单独重跑 EXIT=0** ⇒ 是本机文件锁竞争，不是构建坏了。**结论：本机不要并发跑这两个构建。**

---

## 三、② `MessagePhase` 二态→三态的影响面核查

**调研结论：零运行时影响，不需要任何适配。**

round-156 §八 记下「`MessagePhase` 枚举新增 `partial_answer`（二态→三态）」，并写明「要连带决定它对消息渲染 / 代理注记判定的影响，所以我没动」。本轮把它查清，依据是三条**穷尽检索**（而非推断）：

1. **字段级零消费**：全仓检索 `/phase/i` ⇒ `src/` 下与协议无关的命中只有**本仓自己的状态机**（`worktreeInitStatus.phase` / `projectZipExportStatus.phase`）；`agentMessage` 的 `phase` 只出现在 **11 处测试夹具**（一律 `phase: null`）。
2. **normalizer 实际取了什么**：`src/api/normalizers/v2.ts` 的 `toUiMessages()` 对 `agentMessage` **只取 `id` / `text` / `type`** ⇒ 服务端的相位信息**根本没进 UI 层**。
3. **无穷举 ⇒ 无编译面**：全仓检索 `.phase`（排除本仓自有状态机）⇒ **0 条**；检索 `final_answer` / `commentary` / `partial_answer` ⇒ `src/` 下 **0 条**。本仓区分「中间叙述 / 最终回答」用的是**自己的** `messageType`（`agentMessage` vs `agentMessage.live`），与协议 `phase` 无耦合。

⇒ 联合类型**加成员**对「只读不穷举」的消费方是**向后兼容**的；新取值 `partial_answer` 出现时，本仓的表现就是「和以前一样把它当作一条普通助手消息」—— 与今天的行为完全一致，因此**不留待办、不写适配层**。（若将来想用 `phase` 做「叙述/最终回答」的判定，属**新功能**，需要单独一轮，不在本轮范围。）

---

## 四、③ 提交台账回填 round-144 ~ round-156

**现象：** `sections/commit-history.md`（929 行）最新条目为 **round-143**，`round-144 ~ round-155` **12 轮零命中**。round-156 §七 记下该事实并判断「只补一条 round-156 并不能让台账变正确」，建议**单独开一轮**回填。

**根因（实测确认）：** 不是「写漏了」，而是**收尾流程断了**：round-148 起的每一轮都把改动写进 `rounds/round-*.md` 与主文档索引，但**没有回头更新提交台账**（该文件的更新动作依赖「发版时集中回填」，而这批轮次**全部未发版** ⇒ 一直没人触发）。

**修复（`sections/commit-history.md`）：**

- 按体例（**新段倒序**插在 `## round-143（…）` 之前）新增 **12 个段落**：round-156 → round-148 逐轮段 + 一段「round-144 ~ round-147」说明 + 一段「round-142 / round-143 补记」。**929 → 1053 行**；收尾再追加**本轮自身的 `## round-157` 段**（把「台账只到上一轮」这个缺口当轮就地闭合，不再留给下一轮）⇒ **1082 行**。
- 每段的**提交**清单取自 `git show --stat` / `--name-status` 实测（哈希、文件数、改/新增拆分、`+A/−D`），**不引用轮次文档的自述数字**。
- **两条与直觉不同的边界**写进开头的「回填说明」：① **round-144 ~ round-147 没有任何提交** —— 那四轮是桌面端 `app.asar` 的**只读盘点**（产出在 `tmp/` 与 `sections/desktop-parity-decision.md`，`tmp/` 不入库）⇒ 台账里没有它们**不是漏记**；② round-142 / round-143 在首次回填提交（`a60c15be`）之后**还有 3 个文档提交**（发布闭环 / tag / Release 回填），此前只以「本段所在提交」一句带过 ⇒ 本轮补齐哈希。

**验证（独立脚本 `tmp/r157-verify-ledger.cjs`，27 项断言全绿）：**

| 组 | 断言 | 结果 |
| --- | --- | --- |
| A 可逆性 | 把插入块整体移除后，文件与**改前逐字节一致**（sha1 相同）；插入块恰好出现 1 次 | ✓ |
| B 未破坏既有 | round-143 段唯一且其后内容逐字节一致；其前内容 == 改前 + 插入块 | ✓ |
| C 哈希真实 | 插入块引用的 **17 个哈希**全部经 `git rev-parse --verify <h>^{commit}` 存在 | ✓ |
| D 结构 | 段落数 = 12、编号覆盖 148~156 与两条说明段 | ✓ |
| E 排版 | 纯 CRLF（0 裸 LF）；插入块内无需要解析的相对链接 | ✓ |

> **一处断言自身的坑（值得留档）**：C 组第一版用 `execSync('git cat-file -e ' + h + '^{commit}')` ⇒ **17 项全报失败**。真因不是数据，而是 Node 的 `execSync` 在 Windows 上走 **cmd.exe**，而 **`^` 是 cmd 的转义符**，`^{commit}` 被吃成 `{commit}`。改用 `spawnSync('git', [...])`（不经 shell）后全绿。**教训：Windows 上凡是会把 `^` 交给 cmd 的调用，都要用参数数组而不是命令行字符串。**

---

## 五、④ 顺带修掉探针 `probe-codex-installations.cjs` 的一处真实误报

**现象：** round-156 入库的这个探针，本次复跑时把 **PATH 上的 pnpm 全局**报成 `(不可运行)` —— 而它恰恰是本仓 `resolveCodexCommand()` 会选中的那一套，正是探针最该报准的一行。

**根因（实测确认）：** `versionOf()` 直接 `spawnSync(exe, ['--version'])`，而本机 `codex` 是 **pnpm 的 `.cmd` shim**，Node ≥20.12 **拒绝直接 spawn `.cmd`/`.bat`**（实测 `status=null`、`error.code=ENOENT`）。**同一个坑本轮在我新写的重生成脚本里已经踩过一次** —— 这类「探针自己坏了、却把不可用当成事实报出来」的失败是**静默的**：输出的不是错误而是 `(不可运行)`，读者会以为机器上没有可用 codex。

**修复（`scripts/probe-codex-installations.cjs`）：** 补上与 `src/utils/commandInvocation.ts#getSpawnInvocation` **同口径**的包装（`quoteCmdExeArg` 只在含空白时才加引号 + `needsCmdExeWrapper` 判定 `.cmd`/`.bat`/裸名）；另把「包目录」那行从 `(不可运行)` 改为 `(包目录)`，避免把「这是个目录」显示成「它坏了」。

**验证：** `node --check` 语法通过；修后输出 PATH shim = **`codex-cli 0.162.1`**（与「全局包内 exe」一致），退出码 **0**。同时实测确认了这条包装的**已知局限**（与仓库解析器同源、非本探针独有）：**路径含空格时会失败** —— Node 会把内层引号转义成 `\"`，cmd 不认；本机 `%LOCALAPPDATA%` 无空格，故未影响。

---

## 六、收尾验证汇总

| 项 | 结果 |
| --- | --- |
| `node scripts/regen-app-server-schemas.cjs --check` | **drift = 0**（json 447/447、ts 888/888） |
| `vue-tsc --noEmit` | **EXIT=0** |
| 全量 `vitest run` | **998 例 / 87 文件全绿**（与升级前基线一致，零退化） |
| 契约闸门 `check-ui-contract.cjs` | **59/59** |
| `vite build` | **EXIT=0**（21.01s） |
| `tsup` | **EXIT=0**（`dist-cli/index.js` 696.31 KB） |
| 台账独立复核 `tmp/r157-verify-ledger.cjs` | **27 项断言全绿** |
| 探针 `probe-codex-installations.cjs` | 退出码 **0**，PATH shim = `codex-cli 0.162.1` |

**涉及文件清单（不入产物路径）：**

- 新增：`scripts/regen-app-server-schemas.cjs`
- 修改：`scripts/probe-codex-installations.cjs`、`src/api/normalizers/v2.test.ts`（3 处夹具补 `rootTurnId: null`）、`documentation/APP_SERVER_DOCUMENTATION.md`（生成版本 0.160.1 → 0.162.1）
- 生成物：`documentation/app-server-schemas/json/**`（440 → 447 文件）、`documentation/app-server-schemas/typescript/**`（875 → 888 文件）
- 交接文档：`codex-mobile-handover/codex-mobile-handover.md`、`rounds/round-157-*.md`（新增）、`sections/commit-history.md`

---

## 七、诚实边界

1. **schema 快照只升级到「生成本机当前那一套 codex」**：生成版本 = **0.162.1**（PATH 上的 pnpm 全局）。本机另有桌面 App 缓存 `0.162.0-alpha.17.2` 与 daemon releases `0.159.0 / 0.161.0 / 0.162.0`⇒ 若真机将来跑的是其中另一套，快照又会落后。**这正是 `regen-app-server-schemas.cjs --check` 存在的意义**：它把「快照是否与当前 codex 一致」变成一条**可复跑、有退出码**的判据，而不是靠人记得。
2. **升级快照 ≠ 新协议已被使用**：本轮只让类型定义与真机对齐，**没有任何运行时行为变化**（998 例单测零退化就是证据）。新增的 3 个客户端方法与 1 个服务端通知**本仓一个都没实现**，也没有消费新的 `rootTurnId`（存入夹具一律 `null`）。
3. **`MessagePhase` 的结论是「本仓不用它」**，不是「它没用」。若将来要用 `phase` 替代现有的 `messageType` 判定（`agentMessage` / `agentMessage.live`），那是一次**行为改动**，需要单独一轮 + 真机取证，不能顺势做。
4. **台账回填依据的是「提交存在 + 轮次文档自述」**：哈希与文件计数是 `git` 实测，但每段的**内容摘要**转写自各轮 `rounds/round-*.md`，**未逐条复核当轮的原始测量日志**（那些探针多已不在或依赖当轮环境）。历史轮次的验证数字（如各轮的「全量 857/82」）**理论上可复跑但本轮没有复跑** —— 它们是当轮的读数。
5. **round-144 ~ round-147 的「零提交」结论基于现存的 `rounds/` 目录与 `git log`**：若曾有未推送/已丢弃的本地提交，台账看不到（本轮只能对**仓库里的历史**负责）。
6. **探针修复只覆盖 `.cmd` 包装这一条**：路径含空格仍会失败（见 §五），本机无空格故未影响；换到 `%LOCALAPPDATA%` 含空格的机器上，该行会回到「读不到版本」。
7. **本轮未跑 `Codex app-server` 的真实 RPC**（无运行中的 dev server ⇒ `4173` / `5173` / `4191` 实测均无监听）⇒ 新增的协议方法与通知**没有被真机调用过一次**。类型对齐 ≠ 运行时验证。
8. **脱敏只覆盖了本轮新写的文本**：本轮台账回填段与主文档改动已按规范 §5.4 处理（**回填区路径扫描 0 命中** —— 其中「round-135 当年 pnpm 全局路径」这条证据我改成了语义描述而非路径骨架，一字信息未丢）。但 **`rounds/round-135-*.md` 与 `rounds/round-156-*.md` 里仍留有该路径的字面值**：前者是**原始取证记录**（当轮留的证据，本轮不回改历史轮次），后者是本轮之前写的。⇒ 记为一个**已知的脱敏缺口**，若将来做一次全仓路径清理，这两处要一并处理。
9. **顺手量到一个更大的既有问题（本轮未修）：`documentation/APP_SERVER_DOCUMENTATION.md` 有 227 条失效相对链接**（该文件共 618 条相对链接；**均按去重口径**，未去重为 793 次引用 / 275 次失效）。**已确证不是本轮引入**：本轮对 schema 目录是**纯新增**（对比 `git ls-tree -r HEAD` ⇒ **1315 → 1335，新增 20 / 删除 0**）⇒ 失效数只可能不变或减少。三类成因：① 指向 `typescript/<X>.ts` 但该类型实际住在 `typescript/v2/` 下（如 `CodexErrorInfo`、`RateLimitSnapshot`、`MessagePhase` 的兄弟类型）；② 指向 `json/v1/*` 的页面，而 v1 现在只剩 `InitializeParams/Response` 两个文件；③ 指向更早世代的旧事件类型（`EventMsg.json`、`AgentMessageEvent.ts` …），生成集里已完全没有。该文件开头本就写着「method tables below are **historical reference material and may lag behind** the generated schemas」⇒ 属**已知的历史快照残留**，但 227 这个量级说明「表格部分」已经与生成集脱节。**本轮未动手**（修它等于重写这些表格，且要先决定「表格是否还有保留价值」），建议单独开一轮处理。
