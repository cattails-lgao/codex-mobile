# Round-158：`APP_SERVER_DOCUMENTATION.md` 失效链接收口 ＋ 交接文档脱敏补完 ＋ 0.162.1 新增协议面的真机验证（2026-10-14）

> **背景：** 本轮收掉 **round-157 §七 三条自己留下的待决项**（用户口径「把这 3 项处理了」）：① `documentation/APP_SERVER_DOCUMENTATION.md` 的 **227 条失效相对链接**（要先决定「那三张历史表还有没有保留价值」）；② 脱敏缺口（`rounds/round-135-*.md` / `rounds/round-156-*.md` 等仍留字面机器路径，违反规范 §5.4）；③ **0.162.1 新增协议面从未对真机 app-server 跑过一次**（round-157 §七 第 7 条：「类型对齐 ≠ 运行时验证」）。

**本轮性质**：**零产品代码改动** —— 改的是「生成物文档 + 文档生成器 + 交接文档文本 + 两个新闸门/生成器脚本」，外加一次**只读的真机 RPC 取证**（探针写在 `tmp/`，不入库；隔离 home 用完即删）。**未 bump 版本 / 未 tag / 未发版。**

---

## 一、结论先行

| # | 事项 | 结论 |
| --- | --- | --- |
| ① | 失效相对链接 | **275 次失效引用 / 227 个失效目标 → 0**；派生区改由新增的 `scripts/regen-app-server-doc.cjs` **生成**（786 → **1813** 行），`--check` **drift = 0**；历史表**保留**但改标为「historical snapshot, incomplete」＋一条手写口径注记 |
| ② | 脱敏缺口 | 实际范围**远大于** round-157 记的 2 个文件 —— 按类扫出**四类漏网**；分三批改完 **29 个交接文档 / 97 行等量替换**；新增可复跑闸门 `scripts/check-handover-desensitization.cjs`（**按类判定，8 类**，退 0/1/2） |
| ③ | 0.162.1 新增协议面 | **2 个可用、1 个「已发布但未实现」**：`account/bedrock/checkGovCloudRequirements` ✔、`thread/attachmentOwner/list` ✔、`thread/prediction/request` **`-32601 is not implemented yet`**；对应的 `thread/prediction/updated` 因此**一次都没发射**。**本仓需要新增接线 = 0 处** |

---

## 二、① `APP_SERVER_DOCUMENTATION.md` 的失效链接（227 → 0）

**现象/需求：** round-157 §七 第 9 条实测该文件有 **227 条失效相对链接**，并判断「修它等于重写那些表格，且要先决定『表格是否还有保留价值』」⇒ 留给用户裁决。用户裁决：处理。

**根因（实测确认）：** 不是「链接写错了」，而是**该文件有两大块谁也说不清归属的派生内容**：

| 量 | 改前实测 | 说明 |
| --- | --- | --- |
| 文档行数 | **786** | — |
| 相对链接引用 | **793** 次（去重 **622** 个目标） | — |
| **失效引用** | **275** 次 → 去重 **227** 个失效目标 | 其中**索引区 227 次**、**表格区 48 次** |
| 文件索引登记项 | **618** | 而快照目录实有 **1335** 个文件 ⇒ 索引**自己就缺了 717 项** |
| 三张历史表 | 共提到 **107** 个方法名 | 当前联合共 **265** 个 ⇒ 覆盖 **78/265（≈29%）**，且其中 **29** 个名字**已不在任何当前联合里** |

三类失效成因：① 指向 `typescript/<X>.ts` 而该类型实际住在 `typescript/v2/` 下（**24 个可改路径**）；② 指向 `json/v1/*`，而 v1 现在只剩 `InitializeParams/Response` 两个文件；③ 指向更早世代的旧事件类型（`EventMsg.json`、`AgentMessageEvent.ts` …），生成集里已完全没有（**203 个目标彻底消失**）。

**为什么没有「重写表格」：** 表格里每个方法都配一个「响应类型」链接，而**响应 schema 在本仓是不可推导的** —— `XxxResponse` 的命名约定只对 170 个客户端方法里的 ~142 个成立（`app/list` → `AppsListResponse`），快照里**没有任何权威的方法→响应映射**。硬重写等于**往文档里塞 28 处错链接**。⇒ 选择的方案是：**不重写历史表，而是把「派生部分」交给生成器，并明确历史表只是沿革参考。**

**修复（生成器 + 生成物 + 下游文档）：**

- **新增 `scripts/regen-app-server-doc.cjs`（301 行，可复跑、离线）**：`--check`（退 0 同步 / 1 漂移 / 2 快照缺失）/ `--dry-run` / `--apply`。**不依赖 codex 二进制** —— 它只读 `documentation/app-server-schemas/` 与文档自身。（与 round-157 的 `regen-app-server-schemas.cjs` 分工：那个管「快照是否等于真机」，这个管「文档是否等于快照」。）
- **文档重建为「前缀 + 生成区」三段**：
  - **前缀**（逐字取自当前文档，含头部说明与三张历史表）—— 生成器**不改**它，所以手写注记能存活；
  - **生成区**（marker `<!-- regen:protocol-surface:start -->` … `:end`）：`## Current protocol surface`（**Client→Server 170 / Server→Client Requests 11 / Server Notifications 84**，每个方法配从快照推导的参数 schema 链接）＋ `### Methods present only in the historical tables above`（**29 个**，逐个列出）；
  - **索引 + 计数**：`## Полный индекс` 由目录**实扫**重建（**618 → 1335 项**，与目录逐项相等）；`## Проверка полноты` 改为实测计数（JSON root 45 / v1 2 / v2 400；TypeScript root 100 / serde_json 1 / v2 787）。
- **死链处理两类，都保留行结构**：可重新定位的（`typescript/X.ts` → `typescript/v2/X.ts`）**改路径**；目标确实消失的（203 个）**从 `[Label](path)` 降级为 `` `Label` ``**，共 **48 处**（表格区），行数与列数一字未动。
- **三张表的小节标题改标**：`полный список` → **`historical snapshot, incomplete — see "Current protocol surface"`**（三处），把「看起来是权威清单」这个错误承诺去掉。
- **加一条手写口径注记**（放在生成区之外，共 6 行）：写清「历史表 107 名 / 78 仍在联合 / 29 不在」「**不在联合里 ≠ 服务端一定不认**（其中 `getConversationSummary`、`gitDiffToRemote`、`getAuthStatus` 三个 v1 旧名仍在服务器自报的合法方法清单里）」「冲突时以生成小节为准」。
- **下游修正 `PROJECT_SPEC.md`（5 行）**：协议参考节里三处已失效的断言 —— `thread/rollback`（0.156 起上游移除）、`skills/remote/read` / `skills/remote/write`（已不存在）、`gitDiffToRemote`（协议里已没有）—— 加删除线并注明替代/消失，其余计数（170 / 11 / 84）与目录构成（`root, v2, serde_json`）改为实测值。

**验证（独立复核 `tmp/r158-verify-doc.cjs`，**刻意不复用生成器的任何函数**，15 项断言全绿）：**

| 组 | 断言 | 结果 |
| --- | --- | --- |
| A 链接 | 相对链接去重目标 **1335**、未去重引用 **1711**、**失效 0** | ✓ |
| B 索引 | 索引登记 **1335** == 目录实有 **1335**；未登记 **0**；悬空 **0** | ✓ |
| C 计数 | `Client methods 170` / `Server requests 11` / `Server notifications 84` / `JSON root 45` / `JSON v1 2` / `JSON v2 400` / `TS root 100` / `TS serde_json 1` / `TS v2 787` —— **9 项逐项与 `ls` + 解析 `oneOf` 的实测值相等** | ✓ |
| D 排版 | 裸 LF **0** | ✓ |
| E 生成器 | `--check` **drift = 0**；再跑一次 `--apply` 报「链接改路径 0 / 降级 0」、行数 `1813 -> 1813` | ✓ |

> **一处自己踩的坑（生成器非幂等）**：`--apply` 之后 `--check` 报漂移 —— 因为替换 marker 区块时**把残余换行留在了原地**，每跑一次就多一个空行。改成**确定性拼装**（`prefix = …replace(/\n+$/,'') + '\n\n'`，再 `prefix + surface + index + counts`）后收敛。**教训：凡是「替换一段」的生成器，落盘内容必须整段重建，不能靠「删掉旧的再插新的」——后者一定会残留。**

---

## 三、② 交接文档脱敏补完（规范 §5.4）

**现象/需求：** round-157 §八 第 9 条记下「`rounds/round-135-*.md` 与 `rounds/round-156-*.md` 里仍留该路径的字面值」⇒ 记为**已知脱敏缺口**，留给后续全仓清理。用户裁决：处理。

**根因（实测确认）：真正的问题不是「漏了两个文件」，而是「按字面清单扫」这个做法本身会漏整类。**

- round-157 的替换表只收了**反斜杠**写法（盘符 + `\code\` 那一种），于是**正斜杠写法**（7 处站）、**msys（git-bash）写法**（`/` + 盘符开头，覆盖项目副本、隔离 home、包管理器安装目录，共 5 处站）**一处都没进表**；
- 本轮**批一**（沿用清单）又漏了**整整四类**：**他人用户名目录**（**11 处**，且与主用户名其实是同一台机器的两种写法）、**用户级包管理器目录布局**（2 处）、**绝对 `file:///` 链接**（6 处，形如「`file:///` + 盘符 + 项目内绝对路径」）、以及**上游作者的家目录字面值**（4 处）；
- **真正把它兜住的是「按类扫」**：批二按**类别**扫出 24 文件 / 55 行；批三由**新写的闸门**又抓出 msys 类 2 文件 / 5 行。

**修复（分母先定清，再分三批等量替换）：**

| 批 | 覆盖方式 | 文件 | 行 |
| --- | --- | --- | --- |
| 一 | 字面清单（反斜杠 + 部分正斜杠） | 15 | 36 |
| 二 | **按类**扫（正则） | 24 | 55 |
| 三 | **闸门按类**补扫（msys 形式） | 2 | 5 |
| **合计（去重）** | — | **29** | **97 行等量替换** |

- **替换纪律**：两阶段（**先全量计算 + 断言，再落盘**）、**每条规则「跨批累计命中」必须 > 0**（防「规则静默空转」——本仓踩过 `/` 与 `\` 不匹配导致整条规则被跳过且不报错的坑）、**逐文件行数必须不变**、**EOL 风格必须不变**、落盘前手工递归备份（`tmp/r158-desense{2,3}-backup/`）。
- **语义占位保持一致**：`<项目目录>`、`<用户主目录>`、`<pnpm 全局 bin 目录>`、`<原作者家目录>`；三个隔离 home **刻意保留可区分**（`<等长副本-home>` / `<空-home>` / `<PTY-home>` / `<镜像-home>`），否则 round-135「上一个 home 已不存在、改用全新 home」这条对比就失去意义。
- **`file:///` 绝对链接改为仓内相对链接**（`file:///` + 盘符 + 项目路径 → `../../src/…`）：改完与全仓既有写法**一致**（`round-79/80/81/82` 本来就用 `../../src/…`），而且**换机器也能点开**。
- **顺带查出并修掉一处笔误**：`rounds/round-134-*.md` 的复跑命令在 `cd` 到项目目录时**多写了一层 `code/`**，照抄必然失败 ⇒ 一并改成语义占位。
- **新增 `scripts/check-handover-desensitization.cjs`（127 行）**：**按类判定**（8 类：项目工作副本、真实用户名、codex 隔离 home、包管理器安装目录、工具或他机路径、`AppData` 布局、msys 形式、绝对 `file:///` 链接），退出码沿用本仓闸门约定 **0 合规 / 1 有违规 / 2 环境不足**。**这条是把一次性的手工清扫变成可复跑判据** —— 否则下一轮又会漏。
- **规范与总入口同步**：`handover-writing-guide.md` §5.4 加了三条（闸门跑法、**有意不拦的四类**、以及「这条规则做过三轮才收干净，按清单必漏」的教训）；`codex-mobile-handover.md` 的脱敏条目也加了闸门跑法。

**「有意不拦」的判定线**（写进规范，避免下次又被当成违规重扫）：**能不能标识本机 / 本用户 / 这份工作副本**。⇒ 不构成违规的有：`%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`（环境变量锚定 + 产品自定义子路径，对任何机器都成立，3 处）、`~/.codex` 这类家目录相对写法、`C:\Windows\system32\cmd.exe`（逐字程序输出，2 处）、`\\?\C:\…`（纯语法示例，1 处）、`C:\Users\<用户名>\…`（**占位符形态**，规范自己在讲「禁止用它当脱敏手段」）、构造出来的示例 URL（`file:///` + 盘符 + 一个不存在的图片名，1 处，作为**闸门唯一登记例外**）。

**验证：**

- `node scripts/check-handover-desensitization.cjs --verbose` ⇒ **违规 0 处 / 例外 1 处，退 0**；`--verbose` 全量命中只剩 **6 个站点**，**全部**落在上面「有意不拦」的三类里。
- `git diff --numstat` ⇒ 交接文档 **29 个文件、100 增 / 97 删**，**唯一 3 行净增是规范新加的说明**；**逐文件增删相等 ⇒ 全部是等量替换，零行数变化**。
- 抽查修补后可读性（`round-130` 的复跑命令、`round-71` 的相对链接、`round-33` 的 PATH 描述）⇒ 语义一字未丢。

---

## 四、③ 0.162.1 新增协议面的真机 RPC 验证

**现象/需求：** round-157 §七 第 7 条自陈「本轮未跑 app-server 的真实 RPC ⇒ 新增的协议方法与通知**没有被真机调用过一次**。类型对齐 ≠ 运行时验证」。用户裁决：处理。目标两条：(a) 这 3 个新客户端方法 + 1 个新通知**到底能不能用**；(b) **本仓要不要为它们做接线**。

**根因（代码确认）：** round-157 只做了「快照 vs 真机 schema 的文本比对」，而**协议面是否真的实现是服务端的事** —— schema 联合里有名字 ≠ 服务端认这个方法。**这两者必须分别取证。**

**方法与隔离纪律（本仓踩过多次，逐条遵守）：** 探针 `tmp/r158-rpc-probe.cjs` 直接起 **0.162.1** 的 app-server（stdio JSON-RPC，`initialize` 带 `capabilities.experimentalApi: true`）：**造全新空 `CODEX_HOME`**（只拷 `auth.json`；**拷已有 home 不是隔离** —— `state_*.sqlite` 记 rollout 绝对路径，写型 RPC 会打到源 home）；**进程 `cwd` 必须在仓外**（codex 按 cwd 发现 `<cwd>/.codex/config.toml` 并**覆盖**模型）；`turn/start` 用**不存在的模型 id** 让 provider 快速失败（不烧额度，但用户消息仍落库）。

**结果（响应体已落盘 `tmp/r158-rpc-probe.json`，9 条）：**

| 目标 | 结果 | 判定 |
| --- | --- | --- |
| `account/bedrock/checkGovCloudRequirements` | `{"isGovCloud":false,"shouldWarn":false}` | **可用** |
| `thread/attachmentOwner/list` | `{"data":[],"nextCursor":null}`（缺省与带 `limit`/`archived`、有无真实线程两次皆同） | **可用** |
| `thread/prediction/request` | `{"error":{"code":-32601,"message":"thread/prediction/request is not implemented yet"}}` | **已发布但未实现** |
| 通知 `thread/prediction/updated` | 观测到 6 条通知（`remoteControl/status/changed`、`thread/started`、`thread/settings/updated`、`warning`、`thread/status/changed`、`turn/started`），**没有它** | 与「request 未实现」自洽 |

旁证：`initialize` 回的 `userAgent` 带 `…/0.162.1 (Windows 10.0.19045; x86_64)`、`codexHome` 正是那份隔离 home ⇒ **隔离与版本口径都由服务端自报确认**；负控（调不存在的方法）回的 `-32600` 文案长 **4119** 字符，里面**同时提到**那 3 个新方法名 ⇒ 它们在服务端**是合法方法名**。

**接线评估（结论：0 处）：**

1. **3 个方法在 `src/` 里零引用**（全仓检索只命中 `documentation/` 与 schema 快照）⇒ 没有消费点，也就没有要改的调用点；
2. **`appServerDtos.ts` 已直转 `typescript/v2/*`** ⇒ 类型在 round-157 换快照时**自动到位**，不需要手工补导出；
3. **通知路径是透传、无穷举**：`codexAppServerBridge` 的 `onNotification` 只显式丢掉一种（`command/exec/outputDelta`，round-116 的终端通道），其余**原样转发**给 UI 侧 ⇒ 将来服务端真发 `thread/prediction/updated` 时**不会崩、只需某处开始消费**；
4. **方法目录是运行时推导**：桥的 `listClientMethods()` / `listNotificationMethods()` 每次跑 `codex app-server generate-json-schema` 再解析 `oneOf` ⇒ 新增方法/通知**自动被发现**，没有需要维护的硬编码注册表。

**一条方法论警告（本轮普查副产品）：** 顺带对 170 个客户端方法做过一次「空参数普查」——`{"IMPL":168, "TIMEOUT":2}` 看起来全员可用，但**这是假象**：**空参数会先撞参数校验**，129 次回 `-32600`（缺字段）、只有 37 次真正执行到实现分派。反例就是 `thread/prediction/request` —— 用**真参数**回 `-32601 not implemented yet`，用 `{}` 却回 `-32600`。⇒ **「空参数能调用」不能证明「方法可用」；要判可用性必须逐方法给合法参数。**

---

## 五、收尾验证汇总

| 项 | 结果 |
| --- | --- |
| `node scripts/regen-app-server-doc.cjs --check` | **drift = 0**（1813 行；幂等，二次 `--apply` 报 0 改动） |
| 文档独立复核 `tmp/r158-verify-doc.cjs` | **15 项断言全绿**（链接 0 失效 / 索引 1335==1335 / 9 项计数逐项实测相等 / 0 裸 LF） |
| `node scripts/check-handover-desensitization.cjs` | **违规 0 / 例外 1，退 0** |
| 交接文档 diff | **29 文件 / 100 增 97 删 / 逐文件增删相等**（3 行净增为规范新说明） |
| 真机 RPC 取证 | 3 个方法 **2 可用 + 1 未实现**；通知 0 发射；证据 `tmp/r158-rpc-probe.json`（9 条响应体） |

**涉及文件清单（均不入产物路径）：**

- 新增：`scripts/regen-app-server-doc.cjs`、`scripts/check-handover-desensitization.cjs`
- 生成物：`documentation/APP_SERVER_DOCUMENTATION.md`（**786 → 1813 行**，派生区改为生成）
- 修改：`PROJECT_SPEC.md`（5 行，协议参考节的失效断言）、`codex-mobile-handover/handover-writing-guide.md`（§5.4 加 3 条）、`codex-mobile-handover/codex-mobile-handover.md`（脱敏条目 + 本轮索引/快照/落款）、`sections/commit-history.md`（本轮台账段）
- 脱敏改动：**29 个** 交接文档（`rounds/round-{31,33,71,78,114,116,130,131,132,133,134,135,136,137,138,141,143,148,149,150,152,155,156}-*.md` 与 `sections/{commit-history,open-items-ledger,snapshot-table-archive,desktop-parity-decision}.md`）
- 探针（`tmp/`，未入库）：`r158-rpc-probe.cjs`（真机 RPC）、`r158-rpc-sweep.cjs`（空参数普查）、`r158-rescan-literals.cjs`、`r158-census-paths.cjs`、`r158-desense2.cjs`、`r158-verify-doc.cjs`、`r158-table-coverage.cjs`、`r158-ack-compare.cjs`、`r158-measure-before.cjs`、`r158-insert-note.cjs` 等 ＋ `r158-*.json` / 备份目录

---

## 六、诚实边界

1. **本轮没跑产品侧的任何构建/单测**：改动只落在「生成物文档 + 交接文档文本 + 两个纯离线脚本」，**产品源码一行未动** ⇒ 未跑 `vue-tsc` / 全量单测 / `vite build`（基线见 round-157：998 例全绿）。新脚本用 `node --check` 与自身 `--check` 跑通。
2. **`APP_SERVER_DOCUMENTATION.md` 的派生区现在依赖生成器，历史表仍是手工维护的**：前缀（含三张历史表）**逐字保留**，所以**下一轮如果快照再变，前缀里的表格不会自动更新** —— 它们会继续作为「沿革参考」陈旧下去。这是**有意的取舍**（重写会注入错链接，见 §二），代价是「历史表与生成小节会持续分叉」，所以加了那条手写口径注记来兜底。
3. **响应类型仍未推导**：生成器**故意不做**方法→响应 schema 的链接（`XxxResponse` 命名约定只覆盖 ~142/170）。若将来要补，得先找到权威映射，不能靠猜。
4. **脱敏闸门的判定线是我划的**：8 类 + 1 条例外（那条构造出来的 `file:///` + 盘符示例）是按「能不能标识本机/本用户」定的。若认可的判断线不同（例如认为「环境变量锚定的产品缓存目录」也该拦），要改的是**类定义**，不是文档。
5. **脱敏是文本替换，未逐条人工复核 97 行**：可读性抽查了 6 处关键行；`file:///` 改相对链接后**未在编辑器里逐条点开验证**（但目标文件存在性与全仓既有 `../../src/…` 写法一致）。
6. **`thread/prediction/request` 的结论是「0.162.1 未实现」**，不是「这个能力没用」：它在 schema 里**有完整的 Params 类型**（`ThreadPredictionRequestParams`），只是服务端尚未接线。**将来若它实现，本仓要新开一轮**做消费侧设计（谁触发、结果怎么渲染），不能顺势做。
7. **真机验证只覆盖 3 个方法 + 1 个通知**，且 `thread/attachmentOwner/list`**只测到空页**：没有能命中非空数据的 `identityKey`，所以**只验证了「调用成功 + 形状正确」，没验证「有数据时的分页行为」**。
8. **空参数普查的 168/170「可用」不可引用**（见 §四末）：`thread/start` 与 `model/list` 两项**超时**（各 2.5s 上限，前者实际需要真实初始化）⇒ 那个数字既不代表可用性、也不代表不可用性，**只作方法论反例留档**。
9. **规范 §5.4 现在是「文档 + 闸门」两道**，但闸门只覆盖 `codex-mobile-handover/`：`documentation/`、`tests/`、`PROJECT_SPEC.md` 等**不在扫描范围**。若将来要求全仓脱敏，得扩扫描根目录（本轮的 `PROJECT_SPEC.md` 是手工改的，未过闸门）。
10. **本轮仍未处理的既有项**：① 一个「按方法给合法参数」的**真·可用性普查**（未做，见 §四）；② `documentation/` 目录下其它文档的失效链接未普查（只处理了 `APP_SERVER_DOCUMENTATION.md`）；③ round-157 §七 第 5~6 条（如果有）仍按原状挂着。
