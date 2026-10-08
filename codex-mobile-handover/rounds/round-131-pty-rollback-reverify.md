# round-131：`execPtyChannel.ts` / `rollbackTurnContext.ts` 的「0.158.0 实测」在 0.160.1 上复验

> 日期：2026-10-08 · 环境：Windows / 托管 node 22.22.2-6 / **codex-cli 0.160.1**（钉在 `CODEXUI_CODEX_COMMAND`）
> 承接：用户「execPtyChannel.ts / rollbackTurnContext.ts 的旧结论进行复验」；结清 [round-130](round-130-codex-0.160.1-protocol-recheck.md) §十⑥ 与 §十一①

**结论先行：** 两个模块头部那批「0.158.0 实测」的结论，在 0.160.1 上**逐条成立**——PTY 通道 9 项行为全过（14/14 断言），回滚读取的**正确性**结论全过（id 序列逐位一致、`thread` 仍 32 字段且字段集全空差、`path` 相同、scope 语义相等、桥端到端仍回 `No turns to revert`）。**代码零改动**，只在两个文件的注释里追加了复验结论（纯注释）。

只有一处**没复现出来**：round-113 §三 那张「12.12MB 线程 → 2634ms / 6ms / 11ms」的**绝对值**。原因不是结论错了，而是本机已无大线程、且我发现**从 rollout 侧做合成膨胀根本进不了响应**——app-server 的 turns/items 走的是自有状态库（§四）。本轮顺手把 0.160.1 上这条路线**已被上游写成官方建议**的证据补齐了（§五）。

取证期间我把 4191 服务 home 的一个 rollout 污染了（`thread/inject_items` 写进了真实 home），**已按行剔除并逐字节还原**（§六）。

---

## 一、结论先行

| # | 复验对象 | 旧结论（0.158.0 档） | 0.160.1 实测 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `command/exec {tty:true}` 开真 PTY | ANSI + banner + 提示符 | ANSI ✔ + `Microsoft Windows [版本 10.0.19045.6466]` | **成立** |
| 2 | `outputDelta` 增量到达 | 多帧、非一次性 | 4 帧、4 个不同到达时刻 | **成立** |
| 3 | `command/exec/write` 双向 stdin | 命令回显成功 | `echo R130PTY-MARKER` 回显命中 | **成立** |
| 4 | resize / terminate 被接受 | 均被接受 | 两者都回 `{}` 无错误 | **成立** |
| 5 | 多会话隔离 | 两个 processId 不串 | B 只含自己的 marker、不含 A 的 | **成立** |
| 6 | 大输出未触发 `capReached` | 370 帧 / 22991B 未触发 | 283 帧 / 38248B，`capReached=true` 的帧 **0** | **成立** |
| 7 | UTF-8 往返 | `中文-测试-é` 正确 | 逐字命中 | **成立** |
| 8 | 干净退出 | `exit` → `{exitCode:0}` | `{"exitCode":0,"stdout":"","stderr":""}` | **成立** |
| 9 | `terminate` 后退出码 | `exitCode` 为 **1**（§四「退出码透传」） | `exitCode = 1` | **成立** |
| 10 | `disableTimeout` + `disableOutputCap` 组合 | 同时被接受 | 两会话都无参数错误 | **成立** |
| 11 | chain 的 id 序列 = 全量水合 | 逐位一致 | 7 个线程全部逐位一致 | **成立** |
| 12 | metadata 读的 `thread` 字段集 | 32 字段、onlyFull/onlyMeta/changed 全空 | 32 字段、三类差异**全空** | **成立** |
| 13 | 两次读的 `thread.path` | 相同 | 7 个线程全部相同 | **成立** |
| 14 | `single_turn` / `turn_and_later` scope 语义 | 最老/中间/最新/未找到都相等 | 四种 target 集合**完全相等** | **成立** |
| 15 | 桥端到端 `rollback-files` 前缀 | bogus anchor → `No turns to revert` | `200 {"reverted":0,"errors":[],"message":"No turns to revert"}` | **成立** |
| 16 | §三 的**绝对值**（2634ms / 6ms / 11ms） | — | **未复现**（§四：本机无大线程 + rollout 侧膨胀进不了响应） | 未复现 |

---

## 二、exec/PTY 复验（直连 app-server，14/14）

**口径**：与 round-116 的 `tmp/probe-0158-exec-pty.cjs` 同构——直连 `codex app-server`（stdio JSON-RPC），`CODEX_HOME` 用一个**全新的空 home**（只放 `auth.json` + 极简 `config.toml`），cwd 在仓外。exec 与线程无关，因此不受 §四 的隔离问题影响。

```
userAgent = codex-web-local/0.160.1 (Windows 10.0.19045; x86_64)
```

| 项 | 读数 |
| --- | --- |
| PTY banner | `\u001b[2J\u001b[m\u001b[HMicrosoft Windows [版本 10.0.19045.6466]\u001b]0;C:\Windows\system32\cmd.exe\u0007\u001b[?25h\r\n(c) Microsoft Corporation。保留所有权利` |
| ANSI | 4 帧中 1 帧含转义序列（banner 那帧） |
| 增量 | 帧数 4 / 不同到达时刻 4 ⇒ 真增量，非一次性 |
| `write` | `echo R130PTY-MARKER\r`（base64）→ 回显命中 |
| UTF-8 | `chcp 65001` 后 `echo 中文-测试-é` → 逐字命中 |
| `resize` | `{"id":6,"result":{}}` |
| 大输出 | 283 帧 / 38248B / `capReached=true` 的帧 **0** / 能看到 `L2xx` 行 |
| `exit` | `{"exitCode":0,"stdout":"","stderr":""}`，且**所有 `outputDelta` 先于最终响应** |
| 多会话 | 会话 B 含 `ONLY-B`、**不含** A 的 marker |
| `terminate` | `{"id":11,"result":{}}`，延后响应 `exitCode = 1` |
| stderr | 无 `error` / `warning` 行 |

**顺带补齐一条协议细节**：`command/exec/outputDelta` 的 params 键集合实测为 **`processId, stream, deltaBase64, capReached`**——`capReached` 是**每帧自带**的布尔字段（不是单独的通知），`disableOutputCap: true` 下恒为 `false`。这一点值得记下：**用「有没有收到 cap 通知」判上限是错的**，要看每帧的该字段。

---

## 三、回滚读取的正确性复验（直连 app-server，全过）

**口径**：与 round-113 §三 同构——直连 `codex app-server`，对 7 个真实线程逐一比对三条读取路径：

- **A 全量**：`thread/read {threadId, includeTurns:true}`
- **B 元数据**：`thread/read {threadId, includeTurns:false}`（`sessionPath` 来源）
- **C id 链**：`thread/turns/list {threadId, limit:10000, sortDirection:'desc', itemsView:'notLoaded'}` + `nextCursor` 链（与 `readThreadTurnIds` 同参数）

| 线程 | 轮数 | `thread` 字段数 | A 全量 | B 元数据 | C id 链 | ids 一致 | path 一致 | 字段差异 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `01a11baf…d8b7` | 12 | 32 | 21ms / 0.01MB | 1ms / 1046B | 1ms / 2381B（1 页） | **是** | **是** | 全空 |
| `01a11baf…7d6a` | 1 | 32 | 2ms | 1ms / 1057B | 2ms / 756B（1 页） | **是** | **是** | 全空 |
| `01a11ba1…6039` | 1 | 32 | 3ms | 0ms / 1104B | 2ms / 389B（1 页） | **是** | **是** | 全空 |
| `01a11ba1…3836` | 1 | 32 | 4ms | 0ms / 1104B | 2ms / 388B（1 页） | **是** | **是** | 全空 |
| `01a11b9f…0b60` | 1 | 32 | 2ms | 2ms / 1052B | 2ms / 388B（1 页） | **是** | **是** | 全空 |
| `01a11b9e…f17e` | 1 | 32 | 2ms | 1ms / 1053B | 1ms / 388B（1 页） | **是** | **是** | 全空 |
| `01a11b9d…336c` | 2 | 32 | 4ms | 1ms / 942B | 2ms / 571B（1 页） | **是** | **是** | 全空 |

- **字段差异** = `onlyFull` / `onlyMeta` / `changed`（后者排除 `turns` 自身的值比较）。三类**全空**，即 B 与 A 的 `thread` 对象**字段集与取值逐字相同**——round-113 说的「32 字段」**逐字复现**。
- **scope 语义**：对每个线程取「最老 / 中间 / 最新 / 不存在的 id」四种 target，分别由 A 与由 C 推 `single_turn` 与 `turn_and_later`，**集合完全相等**（含「不存在 → 两条路都空」）。
- **桥端到端**：`POST /codex-api/thread/rollback-files`（bogus anchor、`scope: turn_and_later`）→ `200 {"reverted":0,"errors":[],"message":"No turns to revert"}`。**只读**：bogus anchor 在「找轮」处即停，绝不触碰文件。
- **多页链未覆盖**：7 个线程都装在一页里（`multiPage 线程数 = 0`），分页链的多页能力仍由 `readThreadTurnIds` 的既有实现与 round-104 实测承担——与 round-113 §三 的声明一致。

---

## 四、为什么 §三 的绝对值没复现（三条证据）

round-113 §三 的绝对值需要一个 **12.12MB / 16 轮**的线程，而：

1. **本机已无大线程**。4191 服务 home 里最大的是 **155KB / 12 轮**；那个 12.12MB 线程随 `tmp` 清理掉了。上表 A 列 0.01MB 就是这个量级的必然结果。
2. **从 rollout 侧做合成膨胀进不了响应**。我把最大 rollout 的 `message` 正文（唯一会被水合成轮次 items 的形态）膨胀到 **13.37MB**，A 列响应**仍是 0.01MB**。差分定位：响应里**有** rollout 的原始正文「只回复一个词」、**没有**我的膨胀串 `R131PADDING` ⇒ **items 不是从这份 rollout 现读的**。
3. **真因是：拷 home 不是隔离**（§六）。app-server 的 turns/items 走**自有状态库**，而副本 `state_*.sqlite` 里记的是 rollout 的**绝对路径**。直接证据：

```
CODEX_HOME = D:/code/codex-mobile/tmp/r130-rb-inject
thread.path  = D:\code\codex-mobile\tmp\r130-codex-home\sessions\2026\10\08\rollout-…jsonl
```

即使 `CODEX_HOME` 指向副本，`thread.path` **仍解析回源 home**——所以我在副本里膨胀 rollout，服务端读的还是源 home 的原文件。

**另外两条排除项**（都试过，都不是答案）：

| 尝试 | 结果 | 说明 |
| --- | --- | --- |
| 只拷 `sessions/`（不带任何 sqlite） | `thread/list` 仍返回 7 条，但 **turns = 0** | 轮次索引在状态库里，rollout 只承载正文；没有库就没有轮次 |
| 副本 sqlite 里绝对路径**同长度改写**到新 home（`state_5.sqlite` 7 处、`logs_2.sqlite` 57 处） | 仍是 **0 轮** | `logs_2.sqlite` 带 `-wal`（我未拷 `-wal`/`-shm`），副本的轮次数据不完整 |
| `thread/inject_items` 注入 12 条 × 1MB | `thread/read` 与 `turns/list` **都不含**注入串 | 该方法只追加到「模型可见历史」，不进 `thread/read` / `turns/list` 的条目存储 |

⇒ 结论：**绝对值不可得**，不是结论被推翻。上表 C 列（1–3ms / 0.4–2.4KB）与 B 列（0–1ms / ~1KB）已经足以支撑这个模块的**核心命题**——「拿 `path` + 拿 id 的代价与线程体量无关」。round-113 §三 的读数应继续按「量级/比例」引用，而不是当成本机的可复现基线。

---

## 五、0.160.1 的新契约事实：这条路线已被上游写成官方建议

同步过 0.160.1 快照之后（round-130），这两个 schema 的变化值得单独记一笔：

```ts
// documentation/app-server-schemas/typescript/v2/ThreadReadParams.ts
export type ThreadReadParams = { threadId: string,
/**
 * When true, include turns and their items from rollout history.
 * Full-history hydration is deprecated for paginated threads; prefer a
 * metadata-only read and page with `thread/turns/list` and
 * `thread/items/list`.
 */
includeTurns?: boolean, };
```

```ts
// Turn.ts —— 新增 itemsView
itemsView: TurnItemsView,          // TurnItemsView = "notLoaded" | "summary" | "full"
// ThreadTurnsListParams.itemsView?: TurnItemsView | null
// ThreadResumeInitialTurnsPageParams.itemsView?: TurnItemsView | null
```

也就是说：

- 上游**明确建议**「元数据读 + `thread/turns/list` / `thread/items/list` 分页」——**这正是 `rollbackTurnContext`（round-113）、`threadTurnPage`（round-86/104）、`threadReadTurnPage`（round-110）一直以来的做法**。本模块的取法从「一个更便宜的等价实现」升级为「官方推荐形态」。
- `includeTurns:true`（全量水合）被标注 **deprecated for paginated threads**——它作为回落兜底仍然可用（本模块正靠它保证「只可能更便宜、不可能更不正确」），但语义上已是过渡形态。
- 这与 round-130 观察到的「turn 对象新增 `itemsView`、`items` 默认 `notLoaded`」是同一件事的两面。

---

## 六、本轮踩的坑：拷 home 不是隔离（已还原污染）

**发生了什么**：我用「拷贝 4191 服务的 home」造隔离环境（round-128/130 的惯例：拷 `auth.json` + `sessions/` + sqlite）。随后 `thread/inject_items` 的注入**没有落在副本里，而是写进了 4191 服务真实 home 的 rollout**——`01a11baf…d8b7` 那份从 155.4KB / 123 行涨到 **12.16MB / 136 行**。

**为什么**：副本 `state_*.sqlite` 记录的是 rollout 的**绝对路径**（§四证据 3），所以「已加载」的线程仍指向源 home 的文件；`inject_items` 往那个解析出来的路径追加，于是落在真实 home。

**怎么处置的**：

1. 用探针运行**之前**就拷好的干净副本（`tmp/r130-rb-inject`，创建于注入之前）逐文件还原；
2. 7 份 rollout 里 **6 份本来就与干净副本逐字节相同**，只有最大的那份被污染 → 还原后**逐字节相同**；
3. 复核：服务 home 里**已无任何探针标记**（`R131INJECT` / `R131PADDING` 出现次数 = 0）。

**教训（值得写进以后的隔离规程）**：

- 「拷 home」只对**从未被加载过**的线程等价于隔离（空 home 实测有效：`thread/list` = 0、读真实线程回 `-32600 thread not loaded`）；
- 一旦拷了 `state_*.sqlite`，**必须把里面的 rollout 绝对路径同长度改写**，且必须**连 `-wal`/`-shm` 一起拷**（`logs_*.sqlite` 有 WAL），否则既可能写穿到源 home、又拿不到完整轮次索引；
- 更稳的做法是**不要拷已有 home**，而是造一个**全新的空 home 再由 probe 自己种数据**（round-130 造 12 轮线程就是这么做的）。

---

## 七、验证

| 项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0 / 0 错误** |
| Vitest 全量 | **742/742 通过（76 文件）零失败** |
| `check-ui-contract` | **42/42** |
| exec/PTY 探针 | **14/14**（§二） |
| 回滚复验探针 | **11/12**（唯一 FAIL 是「膨胀后响应回到 MB 级」——即 §四 已定性为不可复现的那条） |

本轮改动**只有注释**，所以静态与全量本来就不该受影响——复跑是为了不把「注释改动」当成免检理由。

---

## 八、涉及文件 + 复现方式

**改动文件（2 个，均纯注释）**

- `src/server/bridge/execPtyChannel.ts`：头部「Measured on the local 0.158.0 app-server (Windows)」段后追加 `round-131 复测` 段（6 行）
- `src/server/bridge/rollbackTurnContext.ts`：头部实测数据段后追加 `round-131 复测` 段（14 行），含「正确性全过 / 绝对值未复现 / `includeTurns` 已 deprecated」三块

按 round-130 的惯例：**只追加复验结论，不改写历史版本号**。改动用脚本做单次 read-modify-write，对每个待替换片段断言「出现次数必须为 1」，任一失败则整批不写盘（fail-closed），并按文件 EOL 归一化（本仓 CRLF）。

**复现**

```bash
NODE="C:/Users/cattails/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"

# 1) PTY（直连 app-server，全新空 home，与线程无关）
$NODE tmp/r130-verify-exec-pty.cjs            # 14/14

# 2) 回滚读取（直连 app-server，逐线程比对三条路径）
$NODE tmp/r130-verify-rollback-context.cjs    # 11/12（唯一 FAIL 见 §四）

# 3) 隔离性诊断（证明「拷 home」不隔离）
$NODE tmp/r130-iso-check.cjs                  # 空 home → 隔离有效
$NODE tmp/r130-nosql-measure.cjs              # 只拷 sessions → turns = 0
$NODE tmp/r130-rew-measure.cjs                # 改写副本绝对路径 → 仍 0 轮（缺 WAL）

# 4) 污染还原（逐文件比对 + 探针标记零残留）
$NODE tmp/r130-restore-home.cjs
```

**取证原始输出**：`tmp/r130-verify-exec-pty.txt`、`tmp/r130-verify-rollback-context.txt`、`tmp/r130-iso-check.txt`、`tmp/r130-nosql-measure.txt`、`tmp/r130-rew-measure.txt`、`tmp/r131-tsc.txt`、`tmp/r131-vitest.txt`、`tmp/r131-contract.txt`。

---

## 九、诚实边界

① **回滚侧的「性能」结论本轮没有量测**。上表只有「元数据读与 id 链恒定在毫秒/千字节级」这一**相对**事实；round-113 的 12.12MB 绝对值既未复现也不应被当成本机基线（§四）。

② **PTY 复验只覆盖协议层**（`command/exec*` 的行为），**没有**端到端走 UI 终端（真实 vite dev + SSE + `/codex-api/thread-terminal/*`）。round-116 §六 的端到端是 0.158.0 档的读数，本轮未重跑。**没变的**是：`execPtyChannel` 只是把协议行为适配成 `SpawnTerminal`，协议层 14/14 通过意味着这层适配仍然是正确的。

③ **桥端到端只测了 bogus anchor 的前缀**（与 round-113 §四 同口径）。「找到轮之后的 patch 应用 / 命令文件回退」代码本轮**一行未动、也未驱动**。

④ **`multiPage = 0`**：本机 7 个线程都在一页内，id 链的多页能力本轮没有新的实测数据。

⑤ **§六 的污染已还原，但「还原」是文件层的**。4191 服务在污染期间可能已把该线程的状态读进内存；服务是本轮自起的 dev 实例（非用户数据），且 rollout 已逐字节还原，故未做进一步处理。

⑥ **`{fileId}` 形态图片、round-120 空状态文案、发布** 三项仍待处置，与本轮无关（见 round-130 §十一）。

---

## 十、未处置 / 待办

| # | 项 | 谁能做 |
| --- | --- | --- |
| 1 | PTY 的**端到端**（真实 vite dev + SSE + 终端路由）在 0.160.1 上重跑 | 可做（需起 dev server） |
| 2 | 若要量测「大线程上的回滚成本」，需**造一条大线程**（真实回合产生大输出） | 可做，但耗时 |
| 3 | `{fileId}` 形式图片的 UI 呈现 | 需先定产品口径 |
| 4 | round-120 空状态文案 i18n | **需用户拍板文案** |
| 5 | round-122 ~ round-131 的发布（npm `latest` 仍 `0.1.127`） | **需用户授权** |
| 6 | **推送**：本地已积压 round-122 ~ round-131 未推（本会话外网不通） | 网络恢复后 `git push origin main` |
