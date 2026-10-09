# round-136：上翻游标链的补登记 / 缓存失效面收窄 / 跨重启持久化 + PTY 端到端在 0.161.0 复跑 + 仓库清理

**日期**：2026-10-09
**环境**：Windows 本机、托管 node 22.22.2-6、**codex-cli 0.161.0**（开工前重测，见 §八 1）、隔离 home `D:\codex-home-r136pty`、dev 端口 4381
**状态**：已实施并验证；**未发布**（npm `latest` 仍 `0.1.127`）
**承接**：用户「**1. 轮换 GitHub OAuth 凭据不是我的，可以清空** / **2. 把 B 和 D 的内容全部实施**」；其中 B = round-135 §七 第 1/2/3/5 条，D = 删两个已合并的本地分支

---

## 一、结论先行

| # | 项 | 结果 |
| --- | --- | --- |
| **B1** | 回落路径成功后**补登记锚点**（round-135 §七 1） | **已实施**。链未命中时不再直接回落全量读，先做**一次** id-only 列举重建种子；重建成功即登记，同锚点第二次不再付全量代价 |
| **B2** | **收窄全量读缓存的失效面**（round-135 §七 2） | **已实施**。「任意带 threadId 的通知都清」改为按 `threadReadInvalidatesCache` **门控**；`storeThreadReadSnapshot` 不再清；结构性 RPC 兜底清 |
| **B3** | **上翻游标链跨重启持久化**（round-135 §七 3） | **已实施**。新增 sidecar `$CODEX_HOME/codex-mobile-turn-page-cursors.json`，惰性 hydrate 一次 + 2s 去抖落盘 + dispose flush |
| **B4** | **PTY 端到端在 0.161.0 重跑**（round-131 §十 1） | **13/13 断言全过**（真实 vite dev + SSE + 终端路由，见 §五） |
| **D** | 删两个已合并的本地分支 | **已完成**（`codex/extract-desktop-catalogs`、`codex/extract-desktop-queue-state`；远端本来就没有，无副作用） |
| 附 | 「清空泄露的 GitHub OAuth 凭据」 | **完成，但复核发现上一轮的『彻底』不彻底**——远端 Release tag `v0.1.128` 仍指向重写前提交，凭据**继续可读**。本轮已修 tag（§六），**残留需 GitHub 侧动作** |

三条件改动（B1/B2/B3）都属 round-132 §3.3 记的「**上翻链未命中的代价是 7202ms vs 969ms**」这一条根因下的三个具体缺口；B4 是 round-131 留下的**唯一**未复验项。**代码零外观改动、零协议形状变化**（唯一的版本信号是 `SHARED_BRIDGE_VERSION` v6 → v7）。

---

## 二、B1：链未命中时先重建种子，而不是直接回落全量读

**现象/需求（round-132 §3.3 实测）**：游标链的种子只在 `thread/read`（round-133 补）与 `thread/resume` 的有界页边界处播种。**桥一重启**（打包启动、dev HMR）、**线程在种子机制存在之前就被打开过**、或**条目被 LRU 淘汰**，链就是空的 —— 此时**同一锚点**的上翻每次都要付全量 `thread/read`（**7202ms**，命中链只要 **969ms**），而且**回落不登记任何东西**，所以下一次还是慢的。

**根因（代码确认）**：`readBoundedThreadTurnPage` 原先写死 `const cursor = deps.chain.lookup(threadId, beforeTurnId)`，`null` 即 `return null`（＝让外层的全量回落接手）。模块头注释把这件事当成设计前提（「没有锚在锚点轮上的游标就没有办法问『它之前的那几轮』」）。

**修复（`src/server/bridge/threadTurnPage.ts`）**：把这条 `lookup` 换成 `resolveChainCursor(deps, threadId, ids, beforeIndex)`。

关键在于**一次列举就能重建种子**，而且**只可能落在页边界上**：

- 取「最新 N 条 id」（`N = ids.length - beforeIndex`，即锚点到最新的跨度），**降序**；
- 这一页的**最老一条**如果正好是锚点轮，那它的 `nextCursor` **按定义**就是「锚点轮之前那些轮」的游标 —— 与代码里其他所有 `record` 点的语义完全一致；
- 列举是 **id-only**（`itemsView: 'notLoaded'`，round-110/131 实测 ~100ms 量级），不是全量水合。

三条**拒绝条件**（任一不成立就 `return null`，回落路径与改动前逐字相同）：

1. **跨度 > `TURN_LIST_SERVER_PAGE_CLAMP`（= 100）**。round-104 实测 app-server 把一页**钳到 100 条**（无视 `limit`），所以一次列举最多回溯 100 轮；更远需要走链，而本模块**有意不做**这种步进。
2. **页的最老一条 ≠ 锚点轮**（回滚/revert 正在与我们赛跑）⇒ 拿到的会是**别的窗口**的游标，宁可不要。
3. **列举本身失败**（且不是「app-server 不实现该方法」，那种情况仍按原语义抛 `ThreadTurnPageUnsupportedError`）。

**先登记再用**（`deps.chain.record` 在 `return` 之前）⇒ 同一锚点的第二次上翻就是普通链命中，**列举不会被重复**。

**精度边界**：`TURN_LIST_SERVER_PAGE_CLAMP` 是**实测常量**而非协议保证，注释里写明它的出处（round-104 的 100 条钳位）与后果（跨度 > 100 时本函数放弃、回落）。

---

## 三、B2：上翻全量读缓存的失效面收窄到「轮次结构真的变了」

**现象/需求**：`threadTurnPageReadCacheByThreadId` 缓存的是**「更早轮次」这一窗口**组装好的页。但只要有任何一条带 `threadId` 的通知到达，它就被删 —— 而一次流式回合里**最高频的正是 `item/*`**（agentMessage / reasoning 的增量与 item 生命周期），它们改的是**最新一轮**，根本不动更早窗口。后果就是 round-132 §3.3 记的「同一锚点重复上翻重复付 6–7s」。

**第二个自污染源**：`storeThreadReadSnapshot` 也在删这个缓存 —— 但 `thread/read` **自己**也走这条管道，于是「探针/UI 每次上翻前先发一条 `thread/read`」就把缓存清空了。这正是 round-132 §四 里那个「每次都冷」现象的来源。

**修复（`src/server/codexAppServerBridge.ts`）**：

| 位置 | 改动 | 理由 |
| --- | --- | --- |
| `emitNotification` | `threadTurnPageReadCacheByThreadId.delete(nThreadId)` 加 `if (threadReadInvalidatesCache(notification.method))` 门控 | 复用 round-76 已有的保守谓词 `/^(?:turn\/\|thread\/(?:start\|fork\|rollback\|revert\|resume\|archive\|unarchive\|delete\|compact\|name\/))/` |
| `storeThreadReadSnapshot` | **删掉**那次删除（只保留 `invalidateBoundedThreadTurnPageCache`） | 存快照不改变轮次结构；`thread/read` 是纯读 |
| `rpc()` | 新增 `invalidateThreadTurnPageReadCache(threadId \|\| undefined)`，只在 `threadReadInvalidatesCache(method)` 时执行 | **兜底**：`thread/revert` / `thread/rollback` / `turn/start` 是客户端自己发起的 RPC，**未必**伴随一条可判定的通知，而它们会截断/重排轮次 |

**为什么谓词够用（两个方向都钉住）**：`item/*` 与 `thread/status/changed`、`thread/tokenUsage/updated` **不清**；`turn/*`、`thread/rollback`、`thread/revert`、`thread/compact/start`、`thread/archived`、`thread/resumed` **清**。谓词刻意保守（`thread/name/` 也在模式里 ⇒ 改名会多清一次，浪费但安全）。**陈旧游标本身不是新风险**：游标拿到后仍要与一份**新鲜的 id 列表**逐位复核（模块既有不变式「只可能更便宜、不可能更不正确」），错配一律回落。

---

## 四、B3：游标链跨重启持久化

**现象/需求（round-135 §七 3）**：链只在**进程内存**里，进程一换就没了 ⇒ 「**每个会话的第一次上翻**」都是慢的那一次 —— 而重启在现实中**很常见**：打包 App 每次启动、dev server 每次 HMR。

**修复**：

- **新增 `src/server/bridge/threadTurnPageCursorStore.ts`**（sidecar 存储层）。落到 `join(getCodexHomeDir(), 'codex-mobile-turn-page-cursors.json')`。
  - **为什么不写进 `.codex-global-state.json`**：那个文件与 queue / workspace / thread-preference 切片共享、整体 read-modify-write，app-server 自己也可能在写它；而这份载荷是**高翻台率的纯缓存**（每上一页登记一次，可以上千条不透明游标），sidecar 让所有其他写者的文件保持小且不与之竞争。
  - 容量上限 `THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS = 8` × `THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS = 64` —— 落盘只保留「有人真的在滚的线程」，且**最近登记的胜出**（插入序＝链自己的 LRU 序，重启前后同一条规则）。
  - 规范化在**写入与读出两侧**都做（`normalizeThreadTurnPageCursors`），垃圾永远到不了盘、也出不来；文件**缺失/不可读/损坏一律＝空链**。
  - 写入**串行化**（`writeChain`）：桥已经去抖，但「重启 flush」与「去抖到期」仍可能重叠，而这个文件是整体重写的。
- **`ThreadTurnPageCursorChain` 加 `hydrate()` / `snapshot()`**：`hydrate` 逐条走 `record`，所以**上限与 LRU 淘汰次序对恢复的条目同样生效**；调用方按「最老优先」喂，于是超出上限的快照退化为「最近的留下」而不是「整个文件被拒」。
- **桥层（`codexAppServerBridge.ts`）**：`ensureThreadTurnPageCursorChainHydrated()`（**只做一次**、惰性、best-effort，`readBoundedThreadTurnPage` 进入时 `await`）、`scheduleThreadTurnPageCursorPersist()`（`THREAD_TURN_PAGE_CURSOR_SAVE_DEBOUNCE_MS = 2_000`，`unref()` 以免拖着测试进程不放）、`persistThreadTurnPageCursorChain()`、`flushThreadTurnPageCursorChain()`（`dispose()` 里调用）；`recordThreadTurnPageBoundary` 末尾调 `schedule...`。
- **`SHARED_BRIDGE_VERSION` v6 → v7**：给 `AppServerProcess` 加了成员、给 `ThreadTurnPageCursorChain` 加了公共方法 ⇒ dev 长驻进程必须重建共享桥实例（否则 HMR 复用旧实例、新方法不存在）。版本注释同步补上「所以 v6 → v7」的理由。

**诚实边界**：持久化**不引入新的正确性依赖** —— 恢复出来的游标仍会被「新鲜 id 列表」复核，错配回落；它只是把「慢的第一次」从**每次重启**降到**每个锚点一次**。

---

## 五、B4：PTY 端到端在 0.161.0 上重跑（13/13）

**为什么单独做这一条**：round-131 §九② 明确记「PTY 复验只覆盖**协议层**（`command/exec*` 的行为），**没有**端到端走 UI 终端（真实 vite dev + SSE + `/codex-api/thread-terminal/*`）。round-116 §六 的端到端是 **0.158.0** 档的读数」。这是那条待办的全部内容。

**口径**：新增 `tmp/r136-pty-e2e.cjs`（round-116 `tmp/probe-terminal-e2e.cjs` 的**严格版**：每条观察都变成 pass/fail 断言，任一失败即退非零）。真实 `scripts/dev.cjs` 起 vite dev（端口 4381、`--strictPort`），全程只走 **HTTP + SSE**（不需要浏览器）。隔离 home `D:\codex-home-r136pty`。

**结果：13/13 全部 PASS。**

```
PASS  availability true — 200 {"available":true,"reason":null}
PASS  SSE /codex-api/events connects
PASS  attach returns a session id — 200 {"session":{"id":"0bc5f62e-…","cwd":"D:\\code\\codex-mobile","shell":"cmd.exe",…}}
PASS  terminal-attached + banner data via SSE — bytes=303
PASS  input accepted — 200 {"ok":true}
PASS  ASCII marker round-trips through PTY — marker=probe-e2e-r136-marker
PASS  resize accepted — 200 {"ok":true}
PASS  snapshot reports session for thread — cwd="D:\\code\\codex-mobile" shell="cmd.exe" buffer=1216
PASS  snapshot buffer captured output — truncated=false
PASS  marker present in server-side snapshot buffer — bufferBytes=1216
PASS  close accepted — 200 {"ok":true}
PASS  terminal-exit delivered after close
PASS  raw command/exec/outputDelta does not leak to UI — leaked=0
notification methods seen: {"terminal-attached":1,"terminal-data":12,"terminal-exit":2}
```

**回显实证**（从 SSE 的 `terminal-data` 帧拼出、已剥 ANSI）：

```
D:\code\codex-mobile>echo probe-e2e-r136-marker
probe-e2e-r136-marker
```

⇒ 0.161.0 上整条链（路由 → `ThreadTerminalManager` → `execPtyChannel` → app-server `command/exec {tty:true}` → `outputDelta` → SSE `terminal-data`）**端到端成立**；banner 是**真实 cmd.exe 启动**（`Microsoft Windows [版本 10.0.26200.9457]` + `(c) Microsoft Corporation。保留所有权利。`），且 `command/exec/outputDelta` **不泄漏**到 UI 通知流。

### 5.1 这一轮踩到的两个「探针陷阱」（值得记进规程）

**① `fetch` 的连接池会伪造成 `ECONNRESET`（不是产品缺陷）**。第一版探针用 `fetch` 打本地路由，`input` 那一步间歇性报 `fetch failed cause=ECONNRESET` —— 而**紧随其后**的 `resize` 却是 `200`。机制：undici 会**池化** POST 的连接，而 vite 的 `node:http` 服务端会关闭空闲 keep-alive 连接（默认 `keepAliveTimeout` 5s）；下一次 POST 复用到那条已被对端关掉的 socket 就 `ECONNRESET`，**且 undici 不会重试 POST**。两次运行分别落在「socket 还活着」与「已被关掉」两侧，于是同一步一步一红一绿。**修法**：探针改用 `node:http` 且 `agent: false`（绝不复用 socket），另留一次重试兜残余竞态。**这不是产品行为**，是探针与 HTTP 客户端的行为。

**② PTY 回显必须按「剥 ANSI」后匹配**。第一版按裸子串找 marker 失败了（第一轮 `banner bytes=303`、结束时 buffer 涨到 **809**，说明字节确实到了，但子串没命中）。原因：PTY **带转义序列回显**，转义可以落在 marker **字符之间**。修法：匹配前先剥 ANSI/OSC（`stripAnsi`），并**加一条独立于 SSE 的断言**——「服务端 snapshot 的 buffer 里也有 marker」（`bufferBytes=1216` 那条），把「回显是否真到达服务端」与「SSE 是否送到」分开证。

**顺带记录两条环境事实**：①这台机器的 `cmd.exe` 有 AutoRun（fnm），所以 banner 里多一行 `Using Node v24.16.0`；②`terminal-exit` 计到 **2** 条是**正常**（一条是 `close()` 主动关，一条来自会话销毁路径），与 round-116 的读数一致。

---

## 六、附：「清空泄露的 GitHub OAuth 凭据」——包括复核出的一处**残留**

### 6.1 用户授权与做法

用户明确「**轮换 GitHub OAuth 凭据不是我的，可以清空**」，并在选项里选了「**重写历史并强推（彻底）**」。

**范围先证后改**：泄露串只出现在 `3cecaa60:.env` 与 `52e51367:.env`；`codexAppServerBridge.ts` 命中的只是**环境变量名**（`process.env.GITHUB_OAUTH_*`），必须保留。

**做法**：`git filter-branch` 在本机**慢到不可用**（12 分钟只推进 62/2127 个提交，外推约 7 小时）⇒ 换成 `git filter-repo`（单文件 Python，全仓 **21 秒**）。替换表只有两条字面量规则（把两个值换成 `REDACTED`）。改前先做全量备份 bundle（`tmp/r136-backup.bundle`，13.4MB）并 clone 出来逐树/逐对象比对：**1934 棵树逐字节相同、17819 个对象两侧同数、差异只落在 `.env` 这一个路径**。随后强推 `main` + 全部 tag；核对远端 `main` = `1e4f0429`（重写前 `3f8c363c`），本地对象库里 `3f8c363c` / `ae5db727` **已不存在**。

### 6.2 复核发现的残留（**本轮最重要的一条**）

收尾复核 `git ls-remote` 时发现：远端有一个**只在远端存在的 tag** `v0.1.128`，它指向**重写前**的提交 `8dddd213`（重写映射表里 `8dddd213 → a0a122bf`）。而 GitHub **Release「v0.1.128」**正是绑在这个 tag 上。

因为 `3cecaa60` 是 `8dddd213` 的**祖先**，泄露凭据**继续可读**。实测（只读）：

```
gh api repos/cattails-lgao/codex-mobile/contents/.env?ref=3cecaa60
  -> GITHUB_OAUTH_CLIENT_ID=Ov23lixZYTDJGWW9iaYS
     GITHUB_OAUTH_CLIENT_SECRET=fdb0e21768bd4148f426aadcfeffc3ce0abcdd2a
```

⇒ **强推 `main` + `--tags` 并没有覆盖这个 tag**（本地当时没有它、或未被强制更新），于是整条**重写前祖先链**被它吊着不放。

**修法**：把 tag 重指到重写后的等价提交并强推 ——

```
d8b3d2fc...a0a122bf  v0.1.128 -> v0.1.128  (forced update)
```

**残留（本地解决不了）**：tag 重指后，重写前的对象在 GitHub 上变成**不可达但尚未回收**。实测 tag 已重指**之后**：

```
gh api repos/.../commits/8dddd213            -> 200  8dddd213b89a
gh api repos/.../contents/.env?ref=3cecaa60  -> 200  仍返回泄露凭据
```

⇒ 按 SHA 直取**仍可达**；GitHub 只在服务端 `git gc` 后才会真正删除不可达对象，且官方亦指出 fork / PR 网络里的缓存副本可能长期保留。**唯一可靠手段是联系 GitHub Support 请求对该仓库清理不可达对象 / 缓存视图**。这条已记进 round-136 §九 待办。取证全文见 `tmp/r136-oauth-residual.txt`。

---

## 七、D：仓库清理

`codex/extract-desktop-catalogs`（`6c77dc39`）、`codex/extract-desktop-queue-state`（`c31265af`）两条本地分支**都已合并进 `main`**（`git branch --merged HEAD` 命中），且**远端没有同名分支**（`git ls-remote --heads origin` 零命中）。用**安全删除**（`git branch -d`，未合并会拒绝）：

```
Deleted branch codex/extract-desktop-catalogs (was 6c77dc39).
Deleted branch codex/extract-desktop-queue-state (was c31265af).
```

之后本地只剩 `main`。

---

## 八、验证

### 8.1 基线

| 项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0 / 0 错误** |
| Vitest 全量 | **772 例 / 772 通过（77 文件）零失败**（＝ round-135 基线 757/76 ＋ 本轮 15 例；新增 1 个测试文件） |
| `check-ui-contract.cjs` | **48/48**（45 → **48**，新增 3 项 round-136 断言） |
| 定向（三个文件） | **50/50**（`threadTurnPage` 29 ＋ `threadTurnPageCursorStore` 8 ＋ `threadReadCache` 13） |
| PTY 端到端 | **13/13**（§五） |

**本轮单测增量**：`threadTurnPage.test.ts` **24 → 29**（+5：重建种子 / 登记种子 / 跨度太远仍回落 / 拒绝错窗口游标 / 不实现仍按原语义分类）、`threadReadCache.test.ts` **11 → 13**（+2：一组可移动轮次结构的方法必须清、一组原地内容流量与状态心跳必须不清）、`threadTurnPageCursorStore.test.ts` **新增 8**（规范化 / 上限 / 往返 / 损坏文件 / hydrate / snapshot / 重启存活）。

**一处「旧测试被有意改写」**：`threadTurnPage.test.ts` 原有的「no cursor ⇒ 回落」用例在 B1 之后**行为已合法改变**（冷链现在会先重建）。它被改写成「**重建列举失败时**才回落」—— 保住了那条**真实残余**的回落通道，而不是把断言删掉。

### 8.2 反跑（决定性，证明测试与契约都非空）

`tmp/r136-flip.cjs off|on`：把 B1/B2/B3 三处分别钝化（B1 → 取消种子重建、B2 → 恢复「一律清」、B3 → 关掉 hydrate），每处替换都做「出现次数必须为 1」断言，任一失配整批不写盘。

| 状态 | 定向单测 | 契约 |
| --- | --- | --- |
| **`off`** | **6 failed**（exit 1） | **45/48** —— 三项全红（`上翻链未命中时先重建种子…` / `上翻全量读缓存按轮次结构门控失效…` / `上翻游标链跨重启持久化…`，诊断行 `桥装载=NO` 等） |
| **`on`** | **50/50 通过** | **48/48** |

`on` 复核：两个文件逐字节还原、仓库内**无 `.r136bak` 残留**。

### 8.3 静态契约新增的 3 项（45 → 48）

| 断言 | 钉住的子事实 |
| --- | --- |
| 上翻链未命中时先重建种子而非直接回落全量读（round-136） | 调用点＝`await resolveChainCursor(...)`；先登记再用；校验「页尾即锚点」；尊重单页上限（`TURN_LIST_SERVER_PAGE_CLAMP`） |
| 上翻全量读缓存按轮次结构门控失效，纯读不再自清（round-136） | 通知门控；快照仍入库；**快照不再清**全量读缓存；结构性 RPC 仍清 |
| 上翻游标链跨重启持久化（round-136） | 链有 `hydrate`/`snapshot`；桥装载；桥去抖落盘；`dispose` flush；`SHARED_BRIDGE_VERSION = v7`；sidecar 文件名 |

**诚实说明**：这三项钉的是**形状**（读了源码文本里的调用点与字段名），行为层证据是 §8.1 的定向单测与 §8.2 的反跑，以及 round-132③/133 的端到端读数所锚定的同一条不变式。

---

## 九、诚实边界

1. **版本口径**：本轮「本机读数」＝ **codex-cli 0.161.0**（开工前重测）。这与 round-130~134 文档标注的 `0.160.1`、以及 round-135 记的 `0.161.0` **一致或相邻**；沿用项目纪律——**不要把别轮的版本读数当本轮的读数**，每轮开工重测。
2. **B1 的跨度上限是实测常量**：`TURN_LIST_SERVER_PAGE_CLAMP = 100` 来自 round-104 对 app-server 钳页的实测，不是协议保证。跨度 > 100 的锚点**仍然**回落全量读（本模块有意不做多页步进）。
3. **B1/B2/B3 都没有新的端到端性能读数**。本轮没有重跑 round-132 那套「同窗口同锚点 A/B」（7202ms vs 969ms）的浏览器/CDP 探针。B1 的收益形态是**代码路径 + 单测**（重建后登记 ⇒ 第二次命中），B2 是**谓词两方向的单测**，B3 是**存储层单测**（round-trip / 重启存活）。**这三条的「秒级」收益本轮没量**。
4. **B3 的持久化只在本机 Windows 上验证**，且**只测了存储层与 hydrate/snapshot 的语义**，没有测「桥进程真重启后第一次上翻变快」这条端到端。
5. **B4 只覆盖路由 + SSE + 终端通道**，没有真浏览器（不需要）；**未覆盖**的是 UI 侧 xterm 渲染、`quick-commands` 列表、多会话并存等路径。
6. **`.env` 泄露的凭据仍在 GitHub 的不可达对象里**（§6.2）：本地已做到「主分支与所有 tag 都不再指向重写前历史」，但**服务端回收不由我们控制**。这条需要用户去 GitHub Support 提工单才能闭环。凭据**不是用户的**，所以用户**无法自行轮换** ⇒ 若该 OAuth App 有归属方可识别，通知归属方是另一条缓解路径。
7. **D 只删了两条本地分支**，没有做其他仓库级清理（如 tag 归并、历史压缩）；远端本就没有这两条分支，故远端零变化。
8. **未发布**：未 bump 版本、未 tag（本轮只动了 `v0.1.128` 这个**既有** tag 的指向，没有新建 tag）。
9. **UI / 浏览器闸门本轮未跑**：`check-fonts` / `check-theme` / `check-token-equivalence` 与四个 `verify-*`（review-pane-scroll / conversation-list-persists / conversation-mount-scroll / command-block-handoff）。理由：本轮**产品侧零 UI、零 CSS、零样式改动**（唯一改动全在 `src/server/**`），且这些闸门需要 playwright 与一个跑着**生产构建**、且含足够长（>600px）真实线程的服务，本机按约定在环境不足时 SKIP 退 2。**纯静态的 `check-ui-contract` 已跑并通过 48/48**（它同时是本轮唯一新增 UI 侧断言的地方）。
10. **一次全量单测的间歇性失败已定位为既有 flake，不是本轮的回归**：提交后在**改动已冻结**的树（本地 = 远端 = `bfe364e6`）上复跑全量，出现过一次 `1 failed | 771 passed (772)`，失败用例是 `src/server/bridge/execPtyChannel.test.ts > encodes writes as base64 and keeps keystroke order`（断言三条**链式异步** write 已完成，实测只到 `['a','b']`）。**该文件与 `execPtyChannel.ts` 本轮一行未改**（`git diff HEAD --stat` 为空），且**隔离复跑 4/4 全绿（8/8）** ⇒ 属**负载敏感**的调度竞态（全量并发跑 77 个文件时被挤掉），与 round-125/126 记录的「全量并发下若干例超时/抖动、隔离复跑通过」同类。**未修**：不属本轮范围，且它不是产品缺陷（该测试断言的是自身桩的调度顺序）。

---

## 十、未处置 / 待办

| # | 项 | 谁能做 |
| --- | --- | --- |
| 1 | **联系 GitHub Support 清理该仓库的不可达对象 / 缓存视图**（§6.2，唯一能真正删除泄露凭据的路径） | **需用户提工单** |
| 2 | 若可识别泄露凭据所属的 OAuth App 归属方，通知其轮换 | 需用户判断 |
| 3 | round-132 §七 第 1 条：`thread/read` 有界页 `nextCursor` 交 `onTurnPageBoundary` | **已在 round-133 完成** |
| 4 | B1/B2/B3 的**端到端收益** | **已量（§10.1）**：B1 无可测收益（本机可索引线程太小）；B3 闭环证实 |
| 5 | B3 的「桥真重启后第一次上翻」端到端 | **已验（§10.1）**：重启后命中同一锚点并再持久化 |
| 6 | round-131 §十 第 2 条：造一条大线程量回滚成本 | 可做，但耗时（**未做**） |
| 7 | round-131 §十 第 3/4 条：`{fileId}` 图片 UI 口径 / round-120 空状态文案 i18n | 需产品口径 / 用户拍板（**未做**） |
| 8 | npm publish（`latest` 仍 `0.1.127`；`0.1.128` 在 registry 上 404） | **受阻**：`~/.npmrc` 里指向 `registry.npmjs.org` 的 token 返回 **401 E401**（`registry=` 另指向 npmmirror 镜像）；包维护者＝`lgao7779`（用户本人）⇒ 用户 `npm login` 后 `npm publish` |
| 9 | GitHub Support 工单（§6.2） | **草稿已就绪**：`tmp/r136-github-support-draft.md`（已查实泄露应用名＝**`codexui`**） |

### 10.1 收尾实测（round-136 追加）

只在 `D:/codex-home-r136ab`（**镜像** home：拷 `state_*.sqlite` + `session_index.jsonl`，rollout 原地只读）上跑，**零模型调用**。探针 `tmp/r136ab-turnpage.cjs`；真实线程 `01a04679`（15 轮 / 2965 行 / 19MB），锚点＝resume 载入的最老一轮。

| 场景 | page#1 | page#2 | sidecar |
| --- | --- | --- | --- |
| ON（B1/B2/B3 生效）+ 清空 sidecar | **341ms** | 142ms | 写入 226B / 1 线程 / 1 锚点 |
| ON + 保留 sidecar（**重启后**） | **204ms** | 69ms | 同一锚点被再持久化 |
| OFF（`tmp/r136-flip.cjs off`）+ 清空 sidecar | **342ms** | 117ms | 亦写入 |

- **B3 闭环成立**：真实上翻后 sidecar 出现真锚点（`rolloutOrdinal:582`）；**`afterResume` 恒为 `{}`** ⇒ 种子来自**页请求**（B1 的 record-before-use），不是 resume；重启后命中同一锚点 ⇒ hydrate → 用 → snapshot 全通。
- **B1 无可测收益**：341 vs 342ms。原因是本机可索引线程仅 15 轮，OFF 的全量读本身 <400ms ⇒ **没有可省的时间**。round-132 的 7202→969ms 属**另一台机器 + 大得多的线程**，**不可外推**。
- 真正的瓶颈不在翻页：thread `01a04679` 每次 `thread/resume` 要 22s（解析整条 19MB rollout）。
- **`logs_2.sqlite`（表 `logs`，列 `feedback_log_body`＝`app-server request: <method>`，带 `ts`）可作 RPC 跟踪**：ON 窗口内只见 `thread/turns/list` ×3 + `thread/read` ×1（=3 次 resume 的元数据读 + 两次翻页），**未出现为翻页额外引入的全量读**；但 OFF 窗口的请求在 `taskkill /F` 前未 flush ⇒ 仅作旁证。
- **副作用（已还原）**：`thread/resume` 会向**真实** rollout 尾部追加 `event_msg`/`thread_settings`（3 个文件分别 +3246/+6480/+8128 B，append-only）。按基线 `truncateSync` + `utimesSync` 还原，20 个 rollout 全部回到基线尺寸。

---

## 十一、涉及文件 + 复现方式

**产品源码（2 文件）**

- `src/server/bridge/threadTurnPage.ts` —— 新增 `TURN_LIST_SERVER_PAGE_CLAMP`、`resolveChainCursor()`，调用点改为 `await resolveChainCursor(...)`，`ThreadTurnPageCursorChain` 新增 `hydrate()` / `snapshot()`
- `src/server/codexAppServerBridge.ts` —— B2 的三处（通知门控、快照不再清、结构性 RPC 兜底清）＋ B3 的持久化五件套 ＋ `SHARED_BRIDGE_VERSION` v6 → v7（含版本注释补理由）

**新增产品源码（1 文件）**

- `src/server/bridge/threadTurnPageCursorStore.ts` —— sidecar 存储层（路径 / 规范化 / 上限 / 串行写入 / best-effort 读）

**测试（3 文件）**

- `src/server/bridge/threadTurnPage.test.ts` 24 → **29**（含 1 例**有意改写**）
- `src/server/bridge/threadReadCache.test.ts` 11 → **13**
- `src/server/bridge/threadTurnPageCursorStore.test.ts` **新增**（8 例）

**闸门（1 文件）**

- `scripts/check-ui-contract.cjs` 45 → **48** 项

**复现 / 复跑**

```bash
NODE="<托管 node 安装目录>/node/versions/22.22.2-6/node.exe"

# 1) 静态与全量
$NODE node_modules/vue-tsc/bin/vue-tsc.js --noEmit     # EXIT=0
$NODE node_modules/vitest/vitest.mjs run               # 772/772（77 文件）
$NODE scripts/check-ui-contract.cjs                    # 48/48

# 2) 反跑（钝化 B1/B2/B3 ⇒ 6 例单测 + 3 项契约转红；再还原）
$NODE tmp/r136-flip.cjs off
$NODE node_modules/vitest/vitest.mjs run src/server/bridge/threadTurnPage.test.ts \
  src/server/bridge/threadTurnPageCursorStore.test.ts src/server/bridge/threadReadCache.test.ts   # 6 failed
$NODE scripts/check-ui-contract.cjs                    # 45/48
$NODE tmp/r136-flip.cjs on                             # 逐字节还原、无 .r136bak 残留

# 3) PTY 端到端（真实 vite dev + SSE；**必须沙箱外**，因为 vite 绑 0.0.0.0）
mkdir -p /d/codex-home-r136pty
cp ~/.codex/auth.json ~/.codex/config.toml ~/.codex/cc-switch-model-catalog.json /d/codex-home-r136pty/
env -u HTTP_PROXY -u HTTPS_PROXY CODEX_HOME=D:/codex-home-r136pty \
  $NODE tmp/r136-pty-e2e.cjs 4381                     # ALL 13 ASSERTIONS PASS
```

**探针（`tmp/`，未入库）**：`r136-pty-e2e.cjs`（PTY 端到端闸门）、`r136-flip.cjs`（B1/B2/B3 反跑）、`r136-b1-apply.cjs` / `r136-b2-apply.cjs` / `r136-b3-apply.cjs`（产品源码锚点脚本）、`r136-b1-tests.cjs` / `r136-b2-tests.cjs` / `r136-contract.cjs`（测试与契约锚点脚本）、`r136-oauth-residual.txt`（凭据残留取证）、`r136-*.txt`（各闸门原始输出）。

**本轮环境**：`4381`（PTY 探针起的 dev server）随探针退出已停；隔离 home `D:\codex-home-r136pty` 保留（几 MB，供下次复跑）。

---

## 十二、落款说明

*本轮的产品代码改动全部集中在 `src/server/**`，外观与协议形状零变化；唯一的对外信号是 `SHARED_BRIDGE_VERSION` v6 → v7（dev 长驻进程必须重建共享桥实例）。B4 与 D 是「补验」与「清理」，不引入新代码。OAuth 那一条的**真正闭环在 GitHub 侧**（§6.2）。*
