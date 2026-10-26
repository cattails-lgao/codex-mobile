# 第一百八十六轮：线上「明明结束了还在 thinking」—— 丢失通知的对账补偿

> 用户口径：**「最近在线上使用期间偶尔出现，明明已经结束了但是还在 thinking」**，随后补充**「刷新后就正常了」**。
>
> 补充的这半句是决定性证据 —— 它把根因从「服务端状态坏了」直接排到「客户端内存态泄漏」（见 §二）。

## 一、起因

线上偶发：一轮已经跑完（消息落地、文件改动也在），但会话区的 live overlay 仍停在 `Thinking`/`Using tool…`，左侧线程行也继续显示运行中。**不刷新页面就一直转**；刷新一次即恢复。

频率是「偶尔」，与「某一轮跑得久」正相关。

## 二、定性：刷新能修，恰好说明服务端是对的

刷新后正常 ⇒ 服务端此刻对这一轮的判定是 **idle**。因此可以排除三类猜测：

| 猜测 | 是否成立 | 依据 |
|---|---|---|
| 服务端 turn 卡在 `in_progress`（僵尸 turn） | **否** | 若服务端仍认为在跑，刷新后读到的仍是 `inProgress: true`，照样转 |
| 状态索引 / rollout 被写坏 | **否** | 同上；且 round-185 刚把 resume 页与索引做过对账 |
| 客户端内存态残留 + 无补偿路径 | **是** | 刷新丢弃内存态 ⇒ 自然恢复 |

刷新之所以能修，机制是明确的：重新加载历史会走

`src/composables/useDesktopMessageHistoryLoading.ts:297`

```ts
deps.setThreadInProgress(threadId, inProgress)   // inProgress 来自 thread/read 的服务端真相
```

即「用服务端值覆盖本地值」。**本轮要做的，就是让这件事在用户不刷新的时候也发生。**

### 2.1 顺带解释「为什么同一次会话里点什么都没用」

同一文件 `160` 行的 `canReuseLoadedMessages`：当线程**刚加载过**（`loadedRecently`）时直接复用结果、**根本不重发 `thread/read`** ⇒ 没有任何一次对账机会。只有「切到别的线程、超过复用窗口再切回」或「刷新页面」才会重拉。

## 三、根因

### 3.1 转圈的唯一开关是纯事件驱动的

`selectedLiveOverlay`（以及列表行的运行态）完全由 `inProgressById` 决定，而这张表只有两条写入口：

1. `turn/completed` 通知 ⇒ `finishTurnForThread` 置 false；
2. `loadMessages` 落地时用服务端 `detail.inProgress` **整体覆盖**。

而 `turn/completed` 是**一次性 WS 通知**，落在断线窗口里就永久丢失。round-183 才给 `/codex-api/ws` 加上 25s 心跳 —— 在此之前每 **120s** 被中间层掐断一次；一轮跑几分钟，完成事件撞进断线窗口的概率就是「偶尔」。

### 3.2 三条本可补偿的通道，当时全被浪费

| 通道 | 数据是否已到客户端 | 当时的处理 |
|---|---|---|
| `thread/status/changed` 通知 | **是** —— `params.status.type` 就是 `idle` | 只拿它 `queueEventDrivenSync()` 刷一次列表，**状态值被丢弃** |
| 线程列表 `UiThread.inProgress` | **是** —— `normalizers/v2.ts readThreadInProgress` 从 `thread.status.type` / 末条 turn / external session 多路归一化 | `applyThreadFlags` 只信本地 `inProgressById`，服务端真相**从未被比对** |
| `ready`（WS 重连）时的 `recoverBridgeState()` | — | 只在「线程列表还没加载过」时才重取；正常使用中**什么也不刷新** |

⇒ 结果：只要丢掉一条 `turn/completed`，界面就永久停在运行态，且**没有任何自愈路径**，只能靠用户刷新。

## 四、修法（三处，不新增常规路径 RPC）

### 4.1 `thread/status/changed`：`idle` / `systemError` 直接收口

`useDesktopState.ts` 的该分支原本只做列表刷新，现在先读 `params.status.type`：

```ts
const statusType = readString(asRecord(asRecord(notification.params)?.status)?.type)
if (threadId && (statusType === 'idle' || statusType === 'systemError')) {
  if (inProgressById.value[threadId] === true) finishTurnForThread(threadId)
}
```

- 只对**本地认为在跑**的线程动手（`=== true` 守卫），避免对其他线程做无谓写入。
- **`active` 有意不置位**：缺 `activeTurnId` 时中断按钮拿不到轮次，点了也发不出 `turn/interrupt`；而「置位」本来就有列表对账兜着，不需要它。

### 4.2 线程列表落地：按服务端 `inProgress` 对账（只清不置）

新增 `reconcileInProgressFromThreadGroups(groups, snapshotStartedAt)`，在**首屏加载**与**背景分页**两处列表落地后调用：

```ts
for (const thread of group.threads) {
  if (inProgressById.value[thread.id] !== true) continue   // 只处理本地在跑的
  if (thread.inProgress === true) continue                 // 服务端也说在跑 ⇒ 不动
  if (startedAt >= snapshotStartedAt) continue             // 竞态守卫，见下
  endedThreadIds.push(thread.id)
}
```

**只清不置**的理由：列表快照天生滞后，拿它点亮转圈会误报「刚开始跑」；但它说「已空闲」时，只要快照确实晚于本地那一轮的开始时刻，就一定是结束了。

**竞态守卫**：新增 `inProgressStartedAtById`（每个线程「转为进行中」的本地时刻）。列表响应可能是**在本轮开始之前**发出的快照 —— 那份快照里自然还是 idle，据此清理会把**刚起的一轮误杀**。规则：只有「本地开始时刻 **早于** 快照发出时刻」才允许清。`snapshotStartedAt` 取**请求发出**时刻（不是响应到达），是这条守卫的保守侧。

### 4.3 `ready`（WS 重连）：疑似卡住时强制重取一次列表

```ts
const hasSuspectedStuckTurn = Object.values(inProgressById.value).some((v) => v === true)
pendingThreadsRefresh = !hasLoadedThreads.value || hasSuspectedStuckTurn
if (hasSuspectedStuckTurn) pendingThreadsRefreshForce = true
if (selectedThreadId.value && (hasSuspectedStuckTurn || !loaded)) {
  pendingThreadMessageRefresh.add(selectedThreadId.value)
}
```

`pendingThreadsRefreshForce` 是既有开关（绕开 `loadThreads` 的 **2s** 复用窗口 `RECENT_THREAD_LIST_LOAD_REUSE_MS`）—— 重连常常正落在窗口内，不强制就白刷。

没有「像在跑」的线程时，语义与原来完全一致（不额外发请求）。

### 4.4 用户自救路径也固化成用例

补一条用例 `self-heals on a plain re-load once the server reports the thread idle (refresh path)`：本地 `inProgress: true` ⇒ 服务端改口 idle ⇒ 一次 `loadMessages(force)` 后 overlay 归 `null`。

它锁的是「刷新能修」这个**现场事实**，也是本轮所有兜底都失效时的最后一道。精准反跑（只断「用服务端值清 true」这一个分支）失败输出正是：

```
AssertionError: expected { activityLabel: 'Thinking', …(3) } to be null
```

与用户描述同形。

## 五、验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | **0** |
| `vitest run` | **1113 / 1113，101 文件**（round-186 describe 内 6 例，+6） |
| `vite build` | 0 |
| UI 契约 `check-ui-contract` | **61 / 61** |

**三条守卫全部做过反跑**（各自关掉 → 对应用例变红，恢复后变绿）：

| 反跑对象 | 变红的用例 |
|---|---|
| 关掉 `thread/status/changed` 的 idle 收口 | `clears the live overlay when thread/status/changed reports idle` |
| 去掉时间戳竞态守卫 | `trusts a snapshot that was issued before the turn started only when it proves the turn ended` |
| 还原 `ready` 的省流量语义 | `re-fetches the thread list on ready and clears a turn that ended while disconnected` |
| 只断「用服务端值清 true」分支 | `self-heals on a plain re-load ... (refresh path)` |

round-186 describe 内的 6 例：idle 收口 / `active` 不误清 / 列表快照对账 / 快照早于本轮开始的守卫 / 重连强制重取 / 刷新自愈路径。

### 5.1 附带闭环：round-183 的「心跳能否骗过 nginx 的 120s」

本轮顺手把 [round-183](round-183-network-red-rows-sw-ws-heartbeat.md) §四-2 的那条边界闭掉了 —— **本机其实装了 nginx 1.28.1**，此前记「没有 nginx」是 PATH 未命中。

装置：真 nginx + `proxy_read_timeout 120s`，`8088 → 桥(4197，含 25s 心跳)`、`8089 → 裸 ws(4198，零帧)`（对照组是装置自检）。

| 组 | 结果 |
|---|---|
| 主实验（经 nginx + 心跳） | 存活 **304.8s** 未断，ping 12 次 / 平均间隔 **25.0s** |
| 对照组（经 nginx，零流量） | 精确在 **120.0s** 被断 `code=1006`（无 close 帧，与线上同形） |

⇒ 机制在真件上成立，对 120s 有 **2.5 倍**余量。脚本 `tmp/r186b-nginx-ws-idle.cjs`，细节见 round-183 §3.3b。

⚠️ **第一次跑是 FAIL，且极具迷惑性**：`dist-cli/index.js` 还是 0.1.136 的旧构建（`2026-10-19 17:23`），**不含心跳代码** ⇒ 主实验与对照组同在 `120.3s` 断、ping 帧 **0** 个，看上去就像「心跳修复无效」。`pnpm run build:cli` 重建后才是 PASS。**教训：验桥行为前先确认产物含目标代码**（`grep attachWebSocketHeartbeat dist-cli/index.js`）。

## 六、诚实边界

1. **没有复现用户那一次现场**。修的是**可证的机制缺口**（`turn/completed` 丢失后无任何补偿路径），不是抓住了现场。之所以敢改，是因为「刷新必好」把「服务端状态正确」证死了 —— 缺口只可能在客户端。
2. **socket 活着但两条通知都丢，仍然兜不住**：若 `turn/completed` 与 `thread/status/changed` 一起丢、且线程列表也不再刷新（无任何其他通知触发），客户端收不到任何信号，只能靠刷新（已验证可用）。加轮询能兜住，但按分钟级轮询全部线程的代价不值当，本轮不做。**重开条件：线上出现「刷新才好」的复现且同一窗口内列表请求为 0。**
3. **列表对账只做「清」不做「置」**：因此「另一端（手机/桌面端）刚起一轮，本端左侧列表不会立刻亮起」，要等 `turn/started` 或消息同步。这是有意取舍 —— 用滞后快照点亮转圈会造成大量误报。
4. **`systemError` 与 `idle` 同样处理**：`systemError` 表示这一轮异常终止，界面不应继续转。但它是否在所有上游版本都出现过，未逐一取证。
5. **`inProgressStartedAtById` 是内存 Map**：刷新后清空（刷新本身就会重建全部状态，无影响）；但若将来有「本地时间戳跨页面保留」的需求，这里要跟着改。
6. **线上要重新部署才生效**：现在线上跑的是 round-185 的构建。

## 七、本段所在提交

- 代码 + 单测：`src/composables/useDesktopState.ts`、`src/composables/useDesktopThreadListLoading.ts`、`src/composables/useDesktopState.test.ts`（见 `sections/commit-history.md` 的 round-186 段）
- 文档（本文件 + 总入口 + 台账）：`docs(handover): round-186 …`

## 八、发版：0.1.137（tag / Release 已发，npm 上架由维护者执行）

**起因**是 round-185 §六① 留下的交付缺口：线上包 `package.json` 仍是 `0.1.136`，而目录里的 `dist/` 是 round-185 的构建 ⇒ `--version` 与实际代码不符。0.1.137 把 **round-183~186 四轮**一次发出去（范围 `v0.1.136..e0468d80`，5 个代码提交）。

### 8.1 发版前闸门与产物核对（本机实测，2026-10-26 12:21–12:24）

| 项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | 0 |
| 全量单测 | **1113 / 1113（101 文件）** |
| `vite build` / `tsup` | 0 / 0 |
| UI 契约 | **61 / 61** |
| `check-session-log-memory` | 61 个服务端源文件，**0 处整读**，4 处显式例外 |

产物代码核对（**不信构建日志，只信产物里的字符串**）：`dist-cli/index.js` 含 `attachWebSocketHeartbeat` ×2（r183）+ `createReadStream` ×9（r185）；前端 `dist/assets/index-*.js` 含 `reconcileInProgressFromThreadGroups`（r186）；`dist/sw.js` 的 `CACHE_NAME = codexweb-shell-9c9a8893c4`（r183 指纹注入生效）。`dist-cli` 的版本号来自运行时读 `package.json`（`src/cli/index.ts:53`），故产物内不含版本串，属正常。

### 8.2 已落地的两步

- **bump** `e0468d80 chore(release): 0.1.137`（仅 `package.json` 一行），已推送
- **annotated tag** `v0.1.137` → 对象 `bd4d18a6`，已推送，`ls-remote` 与本地一致
- **Release** `v0.1.137 — 网络稳定性 + 桥层内存根治 + 结束仍 thinking 修复`，`--latest`，`createdAt` **`2026-10-26T04:24:33Z`**（北京 12:24:33），`/releases/latest` 已回读为 `v0.1.137`
- 包内容（`npm pack --dry-run`）：**1.59MB packed / 4.99MB unpacked**，shasum `6026ad2f9160f7e171c12d6de41dd86f676ae116`（与 0.1.136 的 1.7MB/5.2MB 同量级）

### 8.3 npm 这一步卡在凭据，转由维护者执行（当日 14:46 已上架，见 8.4）

`npm stage publish` 走不通，**两条现存 token 都是 401**（不是 2FA 问题，是凭据本身被拒）：

| 来源 | 直接打 `/-/whoami` |
| --- | --- |
| pnpm `auth.ini`（发 0.1.136 时用的那枚） | **401 Unauthorized** |
| `~/.npmrc` 里的另一枚（sha256 不同，非同枚） | **401 Unauthorized** |

也排除了第三处：`NPM_TOKEN` / `NODE_AUTH_TOKEN` 未设置、`~/.yarnrc` 无 `npmAuthToken`、`%APPDATA%\npm\etc\npmrc` 不存在。npm 现在会提示 *tokens that bypass 2FA are being restricted* —— 0.1.136 用的正是免 2FA token，很可能被这轮策略收掉。

⚠️ **两个坑，下次发版先看这两条**：

1. **`~/.npmrc` 的 `registry` 指向 `https://registry.npmmirror.com/`** ⇒ 直接 `npm publish` 会往**镜像**发。必须显式 `--registry=https://registry.npmjs.org/`；`npm login` 同样要带（否则登录态写到镜像的 key 下，npmjs 侧仍是旧 token）。
2. **token 失效是静默的**：`npm whoami` 只给一行 `E401`，不告诉你哪枚、为什么。先 `curl -H "Authorization: Bearer <token>" https://registry.npmjs.org/-/whoami` 单点验，别在 `publish` 里试错（失败一次就是一次 `E409`/孤儿暂存的风险）。

### 8.4 上架完成与三项核对（2026-10-26 14:46）

维护者在自己终端直接 `npm publish`（未走暂存），**上架时刻 `2026-10-26T06:46:35.080Z` ＝北京 14:46:35**，`dist-tags.latest` ＝ **`0.1.137`**。

| 检查 | 结果 |
| --- | --- |
| `dist-tags.latest` | `0.1.137` ✅ |
| 版本端点 `/codex-mobile-re/0.1.137` | `HTTP 200` ✅ |
| tarball 复算 sha1 | **`fac7e79ea71294ff30d22ac250ad8ede0d309aba`**，与 registry `dist.shasum` 逐位一致 ✅ |
| tarball 复算 sha512 | 与 `dist.integrity` 一致（`sha512-vrksqnxX…wwHg==`）✅ |
| 包规模 | 54 文件 · unpacked **5,235,296 B** · 发布者 `lgao7779` |

**内容级核对（不只看哈希）**：解包后与本地验过的产物**逐文件比对 54 个文件，53 个 sha1 完全相同**；唯一不同的是 `package.json` —— npm 发布时会重写它（去掉 `packageManager` 与 `prepublishOnly`、重新缩进），2575 → 2281 字节，正好等于 `unpackedSize` 的 **294 字节**差。四轮代码都在包里：`attachWebSocketHeartbeat`×2（r183）、`createReadStream`×9（r185）、`reconcileInProgressFromThreadGroups`（`index-CzKL5USY.js`，**文件 hash 与本地构建产物同名**）、`BUILD_ID = '9c9a8893c4'`（r183 指纹注入）。

⚠️ **两个缓存陷阱（第一次核对时踩了）**：

1. **先查 404、20 秒后再查就有了**：第一次查（14:46:15）`dist-tags.latest` 仍是 `0.1.136`、版本端点与 tarball 都 404；20 秒后（14:46:35 上架）全部出现。包文档带 `Cache-Control: public, max-age=300` ⇒ **别拿一次查询就断言「没发出去」**，至少带 `Cache-Control: no-cache` 复测一次。
2. **tarball 的 CDN 比元数据慢**：元数据已显示 0.1.137、版本端点已 200，但 tarball 直链仍回 21 字节的 `{"error":"Not found"}`；加 `?cb=<随机>` 并带 `Cache-Control: no-cache` 后才拿到真正的 1,678,403 字节。

**注意：上架 shasum 与本地 dry-run 不同**。本地 `npm pack --dry-run`（托管 npm 12.2.0）算出 `6026ad2f…`，实际上架是 `fac7e79e…` —— 差异**全部来自 `package.json` 的发布期重写**，不是内容不一致。**发版记录一律以 registry 上的 shasum 为准。**

### 8.5 诚实边界

1. **npm 侧已闭环**：tag `v0.1.137` → Release Latest `2026-10-26T04:24:33Z` → 上架 `2026-10-26T06:46:35.080Z`（shasum `fac7e79e…`），三项核对全过。
2. **线上仍是 round-185 的构建**，0.1.137 要重新部署才生效；round-183 §四-2 剩下的「线上端点心跳核验」也要等这次部署。
3. `SHARED_BRIDGE_VERSION` 仍是 `experimental-api-v7`（`git log -S` 核实 `v0.1.136..HEAD` 未动过）⇒ 与桌面端内置桥的兼容约定没破。

### 8.6 顺带更正一条旧记录：0.1.135 实际上架过

以前的文档（round-180、总入口 npm 行、台账）都写着「0.1.135 已永久作废 / registry `versions` 无该版本 / 版本槽被孤儿暂存记录占住」。**本次核对发现它存在**：

- `0.1.135` 于 **`2026-10-19T15:19:29.289Z`** 上架，shasum **`adefc3d41b284d544a6f3fb95f513aa3bda23c3d`**；
- 也就是说那次孤儿暂存记录后来被**批准**了（时间点正好解释包文档的 `Last-Modified: 2026-10-19T15:19:31Z`，这个值一直挂在 136 时代之后）；
- 它**没有**对应的 GitHub tag / Release（当时已撤回），而 `dist-tags.latest` 一直是 `0.1.136`（0.1.135 < 0.1.136）⇒ 所以一直没被注意到。

**结论**：0.1.135 不是空号，内容与 0.1.136 同批（136 是它的重发版）。「该版本号不可复用」这一点不变。**教训：判断某版本是否存在，查 `/codex-mobile-re/<ver>` 或 `versions[key]`，别只看 `dist-tags.latest`。**
