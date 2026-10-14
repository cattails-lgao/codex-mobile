# Round-156：当前快照表改回「真快照」（2026-10-14）

> **背景：** 会话开场「先拉取代码，再读取交接文档」时发现主文档**自相矛盾**：顶部 `当前快照` 表写「round-140（本轮）」，页脚写「round-142 + round-143」，而 `按轮次记录` 索引已到「第一百五十五轮」。用户随即追问「为什么要回填交接文档」，并裁决口径为**「改回真快照」**（不逐轮回填）。本轮据此执行。

**本轮性质**：**文档轮 · 零源码改动 · 零闸门改动 · 未 bump 版本 / 未 tag / 未发版**。

---

## 一、结论先行

1. 主文档开头的「当前快照」表已**长期退化**：自 **round-116** 起，「Git 分支」「Dev 状态」两栏各自变成**一行一轮的追加式日志**，另有一组「最近发布 / 上一轮发布」行也在持续追加 —— 归档前共 **62 行**。
2. 该表还**自 round-140 后再未更新**（同期轮次索引已到 round-155）⇒ 同一份文件里三处「最新」互相矛盾，读者无法判断「当前」是哪一轮。这**违反本仓自己的规范**（[handover-writing-guide.md](../handover-writing-guide.md) §2.1 与 §6 检查清单第 1 条）。
3. 处置：这 62 行**原文一条不删**，整体归档到新建的 [sections/snapshot-table-archive.md](../sections/snapshot-table-archive.md)（按 4 个分区）；主文档只留 **7 行真快照**（规范 6 项 + `npm latest`），其值**全部按 2026-10-14 实测重写**（其中 `codex-cli` 一栏在当日 19:52 复验后由 0.160.1 更正为 **0.162.1**；另发现仓库内 schema 快照落后真机一版，见 §八）。
4. 顺带修正两处陈旧：`npm latest` 行由 `0.1.127` → **`0.1.132`**；`§未完成事项` 结尾「这 8 条」→「这 10 条」（紧随其后的表里本就是 10 条）。

---

## 二、现象（实测）

### 2.1 同一份文件三处「最新」不一致

| 位置 | 说「最新」是 |
| --- | --- |
| 顶部 `当前快照`（`Git 分支` / `Dev 状态` 两栏） | **round-140** |
| 页脚落款 | **round-142 + round-143** |
| `### 按轮次记录` 索引 | **第一百五十五轮** |

三条读数取自同一份 `codex-mobile-handover.md`（改前 **335 行 / 178,373 B**）。

### 2.2 快照表已退化成追加式日志（62 行）

| 栏 | 行数 | 形态 |
| --- | --- | --- |
| `Git 分支` | 24 | round-140 → round-116。**每行装的其实是当轮交付摘要**，与「按轮次记录」索引功能重叠 |
| `Dev 状态` | 24 | round-140 → round-116。当轮改动文件清单与验证口径 |
| `最近发布 / 上一轮发布 / 同批发布 / 前一轮发布` | 10 | v0.1.121 ~ v0.1.129 发布台账 |
| 单值行（`Dev 端口` / `App-server` / `工具链` / `npm latest`） | 4 | 本就符合「真快照」形态，但**内容已过期** |
| **合计** | **62** | 归档前主文档快照表的全部表体行 |

### 2.3 内容过期（两处）

- `npm latest`：表内写 `codex-mobile-re@0.1.127`（发布时刻 `2026-10-07T17:33:05.712Z`）；实际已是 **`0.1.132`**（发布时刻 `2026-10-14T06:39:37.911Z`、shasum `a6fd1bdb797cf441789f5e024b5cb32a5884c26b`、54 文件 / unpacked 5,155,655 B，见 [commit-history.md](../sections/commit-history.md) round-143 段）。
- `§未完成事项`：正文写「这 8 条**都不是必须在某一轮做完**」，而紧随其后的表格是 **10 条**。

---

## 三、根因（规范比对，非猜测）

**根因（对照 `handover-writing-guide.md` 原文确认）：** 这张表**不是**设计成逐轮日志，而是规范里的**固定字段快照**：

- §2.1：「当前快照（文件开头表格）—— **固定表格，每轮交接时更新**，字段保持稳定以便对比」，字段只有 6 项（Git 分支 / Dev 端口 / Dev 状态 / App-server / 工具链 / 最近提交）；
- §2.4：「落款日期与进展**随更新同步修改**」；
- §6 检查清单**第 1 条**：「总入口快照表已更新（最近提交、Dev 状态）」。

⇒ 两条结论：**(a)** round-141 ~ round-155 收尾时**没有过这张清单**（故快照停在 round-140）；**(b)** round-116 起把该两栏当日志追加，是**用法偏离**。这与 round-139 刚归档掉的「§未完成事项 追加式台账」（77 条、约七成早已闭环或已被覆盖）是**同一种病症**：追加、从不回头删 ⇒ 读者被历史淹没。

---

## 四、修复（本轮涉及文件）

### 4.1 新建 `sections/snapshot-table-archive.md`（112 行）

5 个分区：`一、统计与口径`（分类说明 + 计数表）／`二、Git 分支（逐轮 · 24 行）`／`三、Dev 状态（逐轮 · 24 行）`／`四、发布记录（逐轮 · 10 行）`／`五、单值行旧文（4 行）`。各行**逐字保留**改前原文。

### 4.2 主文档 `codex-mobile-handover.md`（335 → 284 行）

快照表重建为 **7 行**（规范 6 项按 §2.1 顺序 + `npm latest`），值全部按 **2026-10-14 实测**：

| 项 | 新值（要点） |
| --- | --- |
| Git 分支 | `main`（已同步 `origin/main`，落后 0）· 当前进度 **round-155** |
| Dev 端口 | 4173 |
| Dev 状态 | **未运行**（实测本机 `4173` 无监听） |
| App-server | **未验证**（无运行中的 dev server ⇒ 未发 RPC）；提示「测 codex 版本前先确认 `CODEXUI_CODEX_COMMAND` 指向哪一套」 |
| 工具链 | pnpm **11.18.0** · Node 本会话 PATH = 受管 **v22.22.2**（仓库既往记录 fnm 24.18.1，按实际 `node -v` 为准）· codex-cli **0.160.1**（PATH 上的 pnpm 全局） |
| 最近提交 | `b35ee254` · `docs(verify): 滚动落点真机实测（批 3a 待验证项闭环）+ Ctrl+J 边界钉死（round-155）` |
| npm `latest` | `codex-mobile-re@0.1.132`（`2026-10-14T06:39:37.911Z`，shasum `a6fd…c26b`）；**线上仍是 0.1.131 构建，待重新部署** |

其余四处改动：

1. 表下加一行说明，指回归档文件与规范条款（避免下一次又被当成日志追加）。
2. `§未完成事项` 结尾「这 8 条」→「这 10 条」。
3. `### 环境与主题` 登记新 `sections/` 文件；`### 按轮次记录` 登记本轮。
4. 落款改为 round-156，并顺带补齐 round-152 ~ round-155 的一句话（页脚此前停在 round-142 + round-143，未跟上）。

### 4.3 一次性脚本与备份

- `tmp/r156-real-snapshot.cjs`：一次 read-modify-write；**写盘之前**完成全部断言（表头唯一、四类行计数 24/24/10/4、落款行唯一、三个文本锚点唯一、纯 CRLF），任一失败即 `ABORT` 且**不写盘**。
- `tmp/r156-verify.cjs`：**独立**复核脚本（不依赖改造脚本的中间态），直接读盘比对。
- `tmp/r156-main-backup.md`：改前主文档备份（335 行）。

---

## 五、验证

`tmp/r156-verify.cjs` —— **27 项断言全绿，退出码 0**：

- **格式**：主文档与归档文件均纯 CRLF、主文档以 CRLF 结尾；
- **新表**：恰好 7 行；字段序 = 规范 6 项 + `npm latest`；**不含任何「逐轮」行**；`Git 分支` 行标到 round-155；`最近提交` = `b35ee254`；`npm latest` = `0.1.132`；`Dev 状态` = 未运行；
- **归档**：命中 62 行 == 改前表体 62 行；**多重集相等**（丢 0 / 重 0）；改前每一行的原文都能在归档里**逐字节找到**；分区计数 **24 / 24 / 10 / 4**；
- **锚点**：`这 10 条` 已生效且旧文消失；归档文件与轮次文档均已登记；落款已改为 round-156。

**不适用项（本轮零源码 / 零闸门改动）**：未跑 `vue-tsc --noEmit`、未跑全量单测、未跑 `vite build` / `tsup`、无 Playwright —— 均无改动面，跑了也是空转。

---

## 六、涉及文件

| 文件 | 动作 |
| --- | --- |
| `codex-mobile-handover/codex-mobile-handover.md` | **改**（快照表重建 7 行 + 4 处锚点改动：表下说明 / `这 10 条` / 两条索引登记 / 落款） |
| `codex-mobile-handover/sections/snapshot-table-archive.md` | **新增**（112 行，含 62 行原文） |
| `codex-mobile-handover/rounds/round-156-real-snapshot-table.md` | **新增**（本文件） |
| `scripts/probe-codex-installations.cjs` | **新增**（**入库**；本机 codex 安装枚举 + `resolveCodexCommand()` 口径探针，见 §八 8.1） |
| `tmp/r156-*.cjs` / `tmp/r156-main-backup.md` | 临时（**不入库**） |

---

## 七、诚实边界

1. **本轮不是「回填」**。用户明确不选「把 141~155 补进快照表」——那会继续喂同一张已退化的日志表。本轮只留当前值；round-141 ~ round-155 的逐轮内容仍在各自的 `rounds/` 文档与 `### 按轮次记录` 索引里，**没有丢**。
2. **工具链一栏是「实测 + 并列」而非改写**。本会话 PATH 上的 node 是 **WorkBuddy 注入的受管 v22.22.2**，与仓库既往记录的 fnm **24.18.1** 不同 ⇒ 两者并列并注明「按实际 `node -v` 为准」，不改掉仓库记录。
3. **codex-cli 版本口径已复验闭合**（同日 19:52，见 §八）：PATH 上的 pnpm 全局 = **0.162.1**，即 `resolveCodexCommand()` 会选中的那一套；桌面 App 缓存 = `0.162.0-alpha.17.2`；托管守护进程 releases = `0.159.0 / 0.161.0 / 0.162.0`。**round-131 ~ round-143 标注的「0.161.0」不改** —— 那是**当时那台机器**的实测读数（round-135 §六 1 记的 pnpm 路径 `D:\Application\NodeManage\pnpm\…` 在本机不存在），无法复现也不该翻案。
4. **归档是「按分区重排」，未保持原行序**。改前顺序是「分支块 / 单值 `Dev 端口` / `Dev 状态` 块 / 其余单值 / 发布块」交织；归档按分区归拢（分支 24 → Dev 状态 24 → 发布 10 → 单值 4）。**行的原文逐字未动**，只是位置变了；若要原顺序，可从 `tmp/r156-main-backup.md` 还原。
5. **已 commit 并 push**（用户「可以」授权）：改动集见 §六；推送链路与凭据的真实原因见 §八 8.5。
6. 与本轮修复无关、但属当日环境事实：默认出网链路（`http(s)_proxy` → 本机 **58043**）**对 github.com 返回 `502 CONNECT tunnel failed`**（对 `ghfast.top` 却是 200），直连 github 亦不通 ⇒ 拉取走 **`ghfast.top` 镜像**完成（`git fetch https://ghfast.top/https://github.com/<用户名>/codex-mobile.git main`），本地由 `946a1c85`（round-139）快进到 `b35ee254`（round-155，30 个落后提交全部补齐），tag 亦经同一镜像 `--tags` 补拉（最新 `v0.1.132`）。**同日复验补充**：`socks5://127.0.0.1:10808` 可直连 github（`git ls-remote` 200），本轮提交推送即走它，见 §八 8.5。

---

## 八、追加：codex 版本口径复验（2026-10-14 19:52）

> 用户「可以」授权，收掉 §七 第 3 条登记的遗留（「历史轮次标注的 0.161.0 要不要更正」）。过程中撞到一个**比版本号更重要**的东西：仓库内的 app-server schema 快照已落后真机一整个版本 —— 见 8.4。

### 8.1 本机 codex 安装全枚举

探针已入库、可复跑：[`scripts/probe-codex-installations.cjs`](../../scripts/probe-codex-installations.cjs)（`node scripts/probe-codex-installations.cjs`，无参数；退出码 0 = 找到可运行的一套，2 = 一套都没有）。

| 来源 | 实测版本 | 与 WebUI 的关系 |
| --- | --- | --- |
| **PATH 上的 pnpm 全局**（`…/pnpm/bin/codex.CMD` → pnpm store link → `@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`） | **0.162.1** | **就是 `resolveCodexCommand()` 会选中的那一套**（本会话 `CODEXUI_CODEX_COMMAND` 未设置）。两条解析分支实测同值：`cmd /c codex --version` 与 realpath 后的 store-link 候选 exe |
| 桌面 App 内容寻址缓存 `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` | `0.162.0-alpha.17.2` | 平时用不到；只有被 `CODEXUI_CODEX_COMMAND` 显式钉住时才会实际运行（同目录还有 `codex-code-mode-host.exe` / `codex-command-runner.exe` / `codex-windows-sandbox-setup.exe` 等辅助二进制，**不是** CLI） |
| 桌面 App 托管守护进程 `~/.codex/packages/app-server-daemon/releases/` | `0.159.0` / `0.161.0` / `0.162.0` | 同上，需显式指定；各目录自带 `bin/codex.exe`，与 `codex-package.json` 版本一致（**没有** 0.158.0） |

### 8.2 为什么「19:36 读到 0.160.1、19:52 读到 0.162.1」两者都是真值

pnpm store 的 `links/@openai/codex/` 与全局 shim 的 mtime 给出完整时间线：

| 时刻（本地） | 事件 |
| --- | --- |
| 2026-10-08 20:52 | `@openai/codex@0.160.1` 入库（此后 PATH 上一直是它） |
| **19:36:03** | 本轮写入主文档快照表 ⇒ 当时 PATH 实测确为 **0.160.1**，**写进去的是那一刻的真值** |
| 19:39:46 | `@openai/codex@0.162.1` 入库 |
| 19:48:54 | 全局 shim（`pnpm/bin/codex` / `.CMD` / `.ps1`）被重建，指向 0.162.1 |
| **19:52** | 本轮复验读数 = **0.162.1** ⇒ 该行已过期约 **12 分钟** |

⇒ 这不是「写错了」，而是**快照的固有属性**：只写值、不写读数时刻，接手人无法判断这是几分钟前还是一周前的数。故本轮给主文档快照补了**读数时间戳**与「快照只对读数时刻负责」的说明。

### 8.3 历史轮次的「0.161.0」—— 不改

- round-135 §六 1 自己留了取证路径：当时 pnpm 全局在 `D:\Application\NodeManage\pnpm\bin\codex`。**该目录在本机不存在**（实测 `D:/Application/NodeManage` 无此目录）⇒ 那是**另一套 / 另一台机器**的 pnpm 布局。
- 同一节还记「`~/.codex/.../releases/` 仍只有 0.158.0」，而本机现在是 **0.159.0 / 0.161.0 / 0.162.0**（已无 0.158.0）⇒ 环境确实在变。
- 结论：round-131 ~ round-143 文档头部与逐轮条目里的「codex-cli 0.161.0」是**当时那台机器上的实测读数**，本机**无法复现、也不该翻案**。**这些文档一个字未动**，只在此处标明其「历史读数」性质。

### 8.4 ⚠️ 顺带发现：仓库内 schema 快照落后真机一整个版本（本轮未采纳）

用 0.162.1 重生成 app-server schema 快照（`codex app-server generate-json-schema|generate-ts --experimental -o <out>`，cwd 取仓外避免读到仓内 `config.toml`），与仓库已提交的 `documentation/app-server-schemas/` 做**逐文件 sha1 比对**：

| 层 | 仓库（0.160.1 生成） | 0.162.1 生成 | 仅生成有（新增） | 同名但内容不同 |
| --- | --- | --- | --- | --- |
| `json/` | 440 | 447 | **7** | **39** |
| `typescript/` | 875 | 888 | **13** | **23** |

变更的正是本仓**直接引用**的那批（`src/api/appServerDtos.ts` export 的就是它们）：`Turn`、`ThreadItem`、`MessagePhase`、`ClientRequest`、`ServerNotification`、`ThreadReadResponse`、`ThreadResumeResponse`、`ThreadRevertResponse`、`ThreadListResponse`、`ThreadItemsListResponse`、`ModelListResponse` …；新增类型含 `ThreadPrediction*`、`ThreadAttachmentOwner*`、`BedrockCheckGovCloudRequirements*`、`EnvironmentSkillsParams`、`ThreadGoalMutationOrigin` 等。

**实质样张（逐行比对）**：

- `v2/Turn.ts`：新增**必填** `rootTurnId: string | null`（注释：本 turn 所属工作链的起始 turn，`review/start` 响应里可能为 null）。
- `v2/MessagePhase.ts`：枚举新增 `partial_answer`，语义由「interim / terminal 二态」变为「**commentary / partial answer / terminal 三态**」，`interim` 的描述也改写了。
- `v2/ThreadItem.ts` 的 `subAgentActivity` 变体：新增 `reasoningEffort`（注释另提到 resolved model）。
- `json/v2/ThreadRevertResponse.json`：出现新的 `partial_answer`、`reviewTarget` 等字段定义。

**编译影响已实测，且已完全回滚**（把 0.162.1 快照临时覆盖到仓库路径 → 跑 `vue-tsc --noEmit`）：

```
基线（仓库现有快照）：exit 0，零错误
换上 0.162.1 快照：  exit 2，3 处错误，同一根因，且全部在测试夹具里：
  src/api/normalizers/v2.test.ts(40,15)  Property 'rootTurnId' is missing … but required in type 'Turn'
  src/api/normalizers/v2.test.ts(277,7)  同上
  src/api/normalizers/v2.test.ts(292,7)  同上
```

⇒ **生产代码零报错**；采纳 0.162.1 快照的直接成本 = 给这 3 处 `Turn` 夹具补 `rootTurnId: null`。

> **回滚核验**：`git checkout -- documentation/app-server-schemas` + `git clean -fdq documentation/app-server-schemas` 之后，`json/` 仍 440、`typescript/` 仍 875，与改前一致；`git status documentation/` 为空；`vue-tsc` 复跑 exit 0。**本轮未提交任何 schema 改动。**

**本轮不采纳这份新快照**：换快照等于换类型定义（`src/api/appServerDtos.ts` 直接 export 它），属产品面改动，且需连带处置 `MessagePhase` 三态对消息渲染 / 代理注记判定的影响 —— 已超出「文档轮」边界。**留待用户裁决**：(a) 随后单开一轮升级快照 + 修 3 处夹具；(b) 先留档不动。

### 8.5 推送链路与凭据（同日复验）

- **出网**：默认 `http(s)_proxy` → 本机 **58043** 对 `github.com` 返回 `502 CONNECT tunnel failed`（对 `ghfast.top` 却返回 200），直连 github 握手失败。**可用链路 = `socks5://127.0.0.1:10808`**（`git ls-remote origin HEAD` 实测 200，返回远端 HEAD `b35ee254`）。
- **凭据**：`~/.gitconfig` 里 github.com 的凭据助手**本来就是 GitHub CLI**（`helper = !'C:\Program Files\GitHub CLI\gh.exe' auth git-credential`）；`gh auth status` = 已登录账号 `cattails-lgao`，token scope 含 `repo`。
- **真正的坑（本轮修掉）**：仓库内**局部**配置留了一条 `credential.helper = manager-core`，而本机 git 是 **PortableGit**（`git --exec-path` → `…/PortableGit/mingw64/libexec/git-core`），它**只有 `manager`、没有 `manager-core`** ⇒ git 报 `'credential-manager-core' is not a git command`，随后回落到交互式询问用户名。已用 `git config --local --unset-all credential.helper` 清掉该条，全局配置即生效。**注意：这不是「没配凭据」，是「局部配置指向了一个本机不存在的助手」。**
- 本机可复用命令：

  ```bash
  git -c http.proxy=socks5://127.0.0.1:10808 push origin main
  ```
