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
