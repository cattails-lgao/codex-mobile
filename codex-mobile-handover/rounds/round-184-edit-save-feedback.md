# round-184：编辑保存「点了没反应」收口 —— 失败可见化 + 回退显式状态 + 假「服务端已删除」复核

> 用户报障（2026-10-22）：「点击编辑用户信息后，再点击保存按钮后，没有反应」。
> 本轮**没能在真机复现那一次具体现场**（合成全链路四步全 PASS），但证到三条**必然造成静默**的缺陷并全部收口：
> ①失败原因写进了一个**在 UI 上没有任何渲染位**的 ref；②回退有若干**静默 return** 分支；③`thread/turns/list`
> 在**读不到 rollout** 时也会回「0 轮 + nextCursor 空」，被判据读成「服务端已删除」。

## 一、取证

### 1.1 先确认「链路本身没断」

沿用 round-176 的有状态合成 app-server（`tmp/r176-harness.js`，页面级拦截 `/codex-api/rpc`）+ 真组件链路，
在**真 Edge headless** 里跑编辑保存（`tmp/r184-edit-probe.cjs`）：

```text
PASS A1 thread loads (synthetic 3-turn)
PASS A2 edit button visible on user message
PASS A3 inline editor opens — value="用户问题 0：请处理第 0 号任务。"
=== methods after save (2.5s) === ["thread/turns/list","thread/revert","thread/turns/list","turn/start","thread/read"]
=== thread/revert params === {"threadId":"r176-synthetic-thread","beforeTurnId":"r176-turn-0"}
=== turn/start params === {...,"turnTrigger":"edit_user_message","model":"gpt-5.5"}
PASS A4 thread/revert sent
PASS A5 turn/start sent with turnTrigger=edit_user_message
PASS A6 edited text rendered
```

⇒ **happy path 是通的**。所以用户看到的「没反应」只能来自**失败分支**——而失败分支此前恰好是静默的。

### 1.2 缺陷一：失败原因写进没有渲染位的通道

`desktopError`（= `useDesktopState` 的 `error`）在 `src/App.vue` 的**模板区 grep 为 0 处**：

```text
grep -c desktopError src/App.vue        -> 4（全部在 <script> 内：1238 解构 / 1741 透出 / 4419-4420 本次删除的赋值）
模板区（<template> 段，49518 字符）      -> 0
```

round-176 曾把「回退失败」的提示写进 `desktopError`（注释原文「已在 error 里放了原因」），
**但那个通道在界面上不存在** ⇒ 写进去等于什么都没发生。这正是「点保存没反应」的直接来源。

### 1.3 缺陷二：回退函数有静默 return

`rollbackSelectedThread` 原有 4 处「不抛错、只 return」的出口（并发守卫 `isRollingBack`、
`maxTurnIndex < 0`、无 thread、空 turnId），调用方只能靠「目标轮还在不在列表里」反推成败。

### 1.4 缺陷三：假「服务端已删除」（0.162.1 实测）

`isTargetTurnMissingOnServer()` 的判据是 `page.complete && !turnIds.includes(turnId)`，其中
`listThreadTurnIdPage` 发 `thread/turns/list {limit:10000, sortDirection:'desc', itemsView:'notLoaded'}`。

隔离 home 里放一条 app-server **解析不了**的 rollout（`tmp/r184-revert-real.cjs`，真 0.162.1）：

```text
initialize: OK
thread/list count: 0                      ← 隔离 home 不被索引（见 §四.3）
thread/turns/list: count=0 nextCursor=null  ← 注意：**不是报错**，是「0 轮且自称完整」
  => isTargetTurnMissingOnServer(turn0) would be: true
thread/revert {beforeTurnId: turn0}: ERROR thread not found
```

**这就是那条最危险的组合**：读不到数据 → 判据回 `true` → 走「本地对齐」分支（剔除 + 强制重读）→
重读又把该轮装回来 → 调用方「目标轮仍可见」成立 → **既不重发、也不给提示**。用户看到的就是原样不动。

## 二、修法

### 2.1 回退返回显式状态（`src/composables/useDesktopState.ts`）

新增 `export type ThreadRollbackResult = 'reverted' | 'reconciled' | 'already-busy' | 'no-thread' | 'no-turn' | 'no-persisted' | 'failed'`，
把 4 处静默 return 与 catch 全部映射到状态上；同时把 `setTurnErrorForThread` 从 `useDesktopState`
**对外暴露**（它是会话内唯一有渲染位的失败通道）。

### 2.2 假「已删除」必须复核（同上）

本地对齐后加一道复核：强制重读之后**目标轮若又出现在 persisted 里**（且是 user/assistant 真实消息），
就不再 return，而是 **fall-through 去发真正的 `thread/revert`**：

```ts
const stillPersistedAfterReload = (persistedMessagesByThreadId.value[threadId] ?? []).some(
  (message) => (message.turnId?.trim() ?? '') === beforeTurnId && (message.role === 'user' || message.role === 'assistant'),
)
if (!stillPersistedAfterReload) return 'reconciled'
console.warn('[rollback] … probe reported … gone, but the forced reload restored it; falling back to thread/revert')
```

### 2.3 保存失败必须可见（`src/App.vue` + `ThreadConversation.vue`）

- App：新增 `editSaving` / `editFailure`；`reportEditFailure()` 写 `editFailure` **并**调
  `setTurnErrorForThread`（会话内错误行）。**不再写 `desktopError`**——契约闸门里显式禁止。
- App：按回退状态给出不同措辞（并发中 / 定位不到该消息 / 回退失败 / 回退后原文仍在）。
- 组件：新增 prop `editSaving`（按钮 `disabled` + 文案 `Saving…` + `cursor-progress`）、`editFailure`
  （编辑器内 `role="alert"` 的错误段落）。**保存期间不再关闭编辑器**：旧实现先 `editingMessage = null`
  再等结果，失败时编辑器已消失、已编辑文本也丢了。

## 三、验证

### 3.1 四道闸门（本机实测 2026-10-22）

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | 退 **0** |
| `vitest run` | **1095 / 1095，99 文件**（round-183 基线 1089/99 ⇒ **+6 例**，全部为新增 `rollbackSelectedThread returns an explicit status`） |
| `vite build` | 退 **0**（13.28s） |
| UI 契约 `check-ui-contract.cjs` | **61 / 61**（round-183 为 60/60，本轮新增 1 条） |

### 3.2 失败路径真机探针（`tmp/r184-edit-fail-probe.cjs`）

让 harness 的 `thread/revert` 返回 **500** 并延迟 **1200ms**（模拟真实慢链路）：

```text
=== 保存期间按钮 disabled === true
=== 保存结束后状态 ===
 editorOpen: true, textareaValue: "用户问题 0（已编辑）：失败路径取证。"
 inlineError: "RPC thread/revert failed with HTTP 500: simulated revert failure"
 turnErrorRows: 1（会话内可见错误行）
 saveDisabled: false, saveLabel: "Save"
PASS B1 编辑器保持打开（输入不丢）
PASS B2 行内显示失败原因
PASS B3 会话内出现可见错误行
PASS B4 保存按钮恢复可用
PASS B5 确实发出了 thread/revert
```

### 3.3 单测（6 例，`useDesktopState.test.ts`）

`reverted` / `failed` / `no-thread` / `no-persisted` 四个状态各一例，另两例是本轮的核心回归：

- **假「已删除」被重读推翻 ⇒ 落到真实 `thread/revert`**（断言 `revertThread` 被调用、返回 `reverted`）；
- **真已删除 ⇒ `reconciled` 且不发 `thread/revert`**。

### 3.4 契约闸门新增一条

`编辑保存失败必须可见：会话内错误行 + 进行态 + 回退显式状态 + 假「已删除」复核（round-184）`，
五条子断言（失败走 turn error / 不再写不可见通道 / 进行态 prop 与按钮 / 回退显式状态 / 假「已删除」复核）。

## 四、诚实边界

1. **用户那一次具体现象没有复现**。合成全链路 A1–A6 全 PASS，只能证明「正常路径没坏」；本轮修的是
   **三条可证的静默缺陷**（其中两条是静态可查、一条有 0.162.1 实测读数），**不是**「抓住了那次现场」。
   也不能排除用户当时跑的是线上**旧构建**（round-183 已修 SW 缓存名写死导致的「旧标签页长期跑旧构建」，
   但线上未重部署前该问题仍在）。
2. **「读不到 rollout ⇒ turns/list 回 0 轮 + 空游标」的实测对象是一条 app-server 解析不了的合成 rollout**。
   真实用户线程是否也会走到该分支**未取证**（真线程要产生写入，会污染本机 home，本轮不动）。这条分支的
   修法是「多复核一次再决定」，即便永不触发也不会造成额外 RPC（只在探针回 true 时才复核）。
3. **隔离 home 不被索引**：app-server 0.162.1 的 `thread/list` 只读状态库，**不扫 `sessions/` 磁盘**，
   手工产的 rollout 只能被 `thread/read`（按 id）看到、`thread/revert` 仍回 `thread not found`
   ⇒ 「用合成 rollout 跑真实 revert」这条路**不通**，本轮因此只拿到 `turns/list` 的读数，没拿到真实 revert 的返回形状。
4. **失败提示的措辞未做 i18n 补全**：`t()` 里是英文字面量，与 round-176 的既有做法一致（缺键回落原文）。
   中文界面下这几条提示会显示英文。
5. **`no-persisted` 分支仍不重发**：拿不到任何轮次下标时无法确定回退点，选择「报错而不是乱回退」。

## 五、未做（本轮明确不碰）

- **线上复测**：本轮改动含前端产物，需重新部署后才能在 `codex.arderpanada.top` 上验证真实保存路径。
- **`error` 通道的整体收口**：本轮只让编辑保存这一条路径绕开它；其余「只写 `error`」的失败路径
  （round-176 登记）仍在，是否统一接 turn error 行需单独一轮。
- **编辑器里失败后不自动重试**：保持「用户自己再点一次」，避免与服务端 revert 竞态。
