# round-126：消息列表的滚动容器不再被加载状态摘掉

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 验证用 `node scripts/dev.cjs --port 4275`（带 `/codex-api` 桥）+ 项目内隔离 `CODEX_HOME`（`.codex/`，**未触碰真实 `~/.codex`**），以及生产构建 `dist-cli` 起在 4190；实测浏览器为系统 Edge。

## 一、由来：用户报了两个症状

1. 「有时消息列表会跑到 TOP 去」
2. 「新增命令块的时候会闪一下」

第一问是滚动位置丢失，第二问是内容插入时的闪动。本轮把第一问查到根上并修掉，第二问做到了「排除掉两个最可能的内部原因」，尚未定案（见 §六）。

## 二、根因：滚动容器被挂在了 `v-if`/`v-else` 链上

`src/components/content/ThreadConversation.vue`（改前 13–28 行）：

```html
<p v-if="isSlowOpen" class="conversation-loading conversation-loading-slow" role="status">…</p>
<p v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay" class="conversation-empty">…</p>
<ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">   ← 唯一的滚动容器
```

这是**一条链**。于是只要前面的分支为真，`<ul class="conversation-list">` 就**整个从 DOM 里消失**：

- `isSlowOpen` 为真时：连空态都被跳过，列表**直接没了**；
- 空态分支为真时（`messages` 瞬时为空且没有 pending/live）：列表同样消失。

而 `isSlowOpen` 由 `useDesktopMessageHistoryLoading.ts` 决定：

```ts
const SLOW_OPEN_HINT_DELAY_MS = 5000
// loadMessages 每次都会 beginSlowOpenHintTimer(threadId)（与 silent 无关）
slowOpenHintTimer = setTimeout(() => { slowOpenThreadId.value = slowOpenPendingThreadId }, SLOW_OPEN_HINT_DELAY_MS)
```

⇒ **任何一次消息加载超过 5 秒，就把 slowOpenThreadId 指向该线程**，`isSlowOpen` 置真 ⇒ 滚动容器被摘掉。加载结束后它作为**全新元素**挂回来，`scrollTop` 从浏览器的默认 **0** 开始；而该组件**没有挂载期的滚动恢复**（全文件只有 `onBeforeUnmount`，五个滚动相关 watcher —— `messages`/`isLoading`/`activeThreadId`/`liveOverlay`/`pendingRequests` —— **都没有 `immediate`**），所以没有任何东西会把它放回去。

**一条关键推理**：`scrollTop` 变成 0 只有两种途径 —— 用户自己滚到顶，或者这个元素被重新创建。`scrollToBottom()` 只会把它设到 `scrollHeight`，`loadMoreAbove()` 只会把它设到一个正数，没有任何代码把它设为 0。**⇒ 元素被重新创建，是「列表自己跑到 TOP」的唯一机制。**

### 2.1 为什么日常使用会踩到：重载是常态，不是例外

`useDesktopState.syncFromNotifications()`：

```ts
const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion
const shouldRefreshActiveThread = hasVersionChange || isActiveDirty || …
if (shouldRefreshActiveThread) {
  // Force the reload after turn-level events: …
  await loadMessages(activeThreadId, { silent: true, force: isActiveDirty })
}
```

`currentThreadVersion(threadId)` 取的是线程列表行的 `updatedAtIso`。**每持久化一个新条目（也就是每一个新命令块）都会改变它** ⇒ 正在看着的线程会被**反复重载**。平时这些重载很快、看不出问题；一旦某次超过 5 秒（大线程 + 慢盘 / 浏览器忙），就是一次「列表整个消失再以 TOP 回来」。

同一处还有两条**用户可直接触发**的强制重载：`App.onFileChangesChanged`（文件变更动作后，`silent:true, force:true`）与压缩（compaction）后的重读。

### 2.2 溯源：这条链是初版设计

`git log -S '<ul v-else ref="conversationListRef"'` 与 `-S 'v-else-if="messages.length === 0'` 都只命中 **`fbc8a668`（2026-02-16, "init"）**。也就是说「滚动容器挂在状态分支上」**从初版起就是这样**，不是某次重构引入的回归——这正是它长期没被发现的原因（状态切换看起来只是「换个提示」，实际是把会话整个卸掉）。

## 三、改动：把滚动容器从链里摘出来

**修复提交 `64ce0b54`**（3 文件，+298/−2）。产品源码只改 `src/components/content/ThreadConversation.vue` 两行（2 增 2 删）：

```diff
-      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
+      v-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay && !isSlowOpen"
       class="conversation-empty"
-    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
+    <ul ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
```

1. 空态 `<p>` 由 `v-else-if` 改成 **`v-if`** —— 断开链（并补 `&& !isSlowOpen`，保持「慢开提示出现时不显示『本线程还没有消息』」这一原有观感）；
2. `<ul>` **去掉 `v-else`** —— 无条件渲染。

**为什么这样是安全的**：`.conversation-list` 的样式是 `h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto flex flex-col gap-2 sm:gap-3` —— **没有内边距、没有边框、没有背景**，所以「空线程时它没有子节点」= 视觉上不存在，与改前一致。两条「加载更多」行各自由 `hasMoreAbove = props.hasMorePersistedAbove === true` 与 `hasColdTurns = coldTurnCount > 0` 把守，而没有任何轮次分组时 `coldTurnCount` 为 0、`hasMoreOlder` 也为 false ⇒ 空列表不会冒出一条「Load earlier messages」。

改后的语义：**慢开提示与列表并存**（提示一行在列表上方），而不是把列表换成提示。列表下的会话内容在重载期间继续可见（`displayFilteredMessages` 本来就用 `lastStableFilteredMessages` 兜住重载期的内容）。

## 四、验证

### 4.1 真机 A/B（决定性，同一 harness 交错四跑）

新增 `scripts/verify-conversation-list-persists.cjs`（浏览器侧、可复跑）。它用**应用自己的**触发链：① 把 `thread/list` 里该线程的 `updatedAt` 桩大 1 小时（让 `canReuseLoadedMessages` 落空、重载真的发生）② 伪造 `visibilitychange` hidden→visible（等价于**切走再切回标签页**）⇒ `App.maybeSyncAfterForeground → syncAfterForeground → refreshAll({ includeSelectedThreadMessages: true })` ③ `thread/read` 注入 9s 延迟（> 5000ms 阈值）。测试线程为隔离 home 里一条真实线程（108 个条目、可滚动 5768px）。

| 变体 | 慢开提示出现时列表在 DOM 里？ | 该时刻 scrollTop | 全程摘除次数 | 最终 scrollTop |
| --- | --- | --- | --- | --- |
| **改动前**（第 1 跑） | **false**（items=0） | null | 1 | **0**（原 2307） |
| **改动后**（第 1 跑） | **true**（items=108） | 2307 | 0 | **2307** |
| **改动前**（交错第 2 跑） | **false**（items=0） | null | 1 | **0** |
| **改动后**（交错第 2 跑） | **true**（items=108） | 2307 | 0 | **2307** |

两次触发几乎同时命中（提示分别在第 6119 / 6133 ms 出现），**唯一变量是代码**。改动前的两跑逐字复现了用户报告（「列表回到 TOP」）。

### 4.2 静态契约同步钉住（并证明不是空断言）

`scripts/check-ui-contract.cjs` **39 → 40 项**：新增「消息列表是滚动容器，不得挂在 v-if/v-else 分支上（round-126）」。

反跑证明它真的看得见：

| 被检查的源码 | 契约结果 |
| --- | --- |
| 改动前 | **39/40**，该项 FAIL，诊断行 `<ul class="conversation-list">@28 ← 仍带 v-if/v-else 指令；空态仍是 v-else-if（链未断开）` |
| 改动后 | **40/40** 全部通过（`<ul class="conversation-list">@28`） |

### 4.3 生产构建上的全套闸门（补掉「只在 dev 上验过」）

`vite build`（34.95s、**EXIT=0**）重建 `dist/`，`dist-cli` 起在 **4190**（隔离 `CODEX_HOME`），在**生产构建**上复跑：

| 闸门 | 结果 |
| --- | --- |
| `verify-conversation-list-persists`（本轮新增） | **ALL GREEN 10/10**（与 dev 上数字逐字相同） |
| `verify-review-pane-scroll`（round-125） | **ALL GREEN 7/7**（未回归） |
| `verify-mobile-375` | **EXIT=0** |
| `check-fonts` | **13/13** |
| `check-theme` | **15/15** |
| `check-token-equivalence` | **EXIT=0**「外观与基线一致」→ **无需重置基线** |
| `check-thread-switch-feedback` | **12 项全过**（`chars=24506→24517`，冻结 17/21ms ≤ 60ms 预算） |

`check-thread-switch-feedback.chars` 正是读 `.conversation-list` 的 `textContent.length`（列表缺席时按 0 计）。它仍然通过，说明「空列表现在存在于 DOM」没有改变它的判读口径。

### 4.4 类型与单测

- `vue-tsc --noEmit` **EXIT=0**（模板改动纳入类型检查）。
- 全量 **742 例**：默认 15s 下 **3 例** `Test timed out in 15000ms`（`codexAppServerBridge.archive` / `.authRefresh` / `.inlinePayload`，都是 `mkdtemp → 写文件 → fs 逻辑 → rm -r` 形状的负载敏感用例）；**隔离复跑这 3 个文件 63/63 全过（15.89s）** ⇒ 判「慢」而非「卡死」，与本改动无关（本改动是纯前端模板，连服务端测试都碰不到）。

## 五、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/components/content/ThreadConversation.vue` | 空态 `<p>` 断开链（`v-else-if`→`v-if` + `&& !isSlowOpen`）；`<ul class="conversation-list">` 去掉 `v-else`（2 增 2 删） |
| `scripts/check-ui-contract.cjs` | 新增 1 项结构性不变式断言（39 → 40 项） |
| `scripts/verify-conversation-list-persists.cjs` | 新增（浏览器侧回归闸门，可复跑） |

## 六、诚实边界

① **「闪一下」尚未定案。** 本轮把它从两个最可能的内部原因上排除掉了，但没有修：
   - **排除 A（重载重渲）**：我实测了一次「内容不变的重载」造成的 DOM 重建量 —— `.conversation-item` 新增 **0**、删除 **0**，滚动容器也没有摘除。键稳定（`:key="turn.key"` / `:key="message.id"`），Vue 走的是 patch 而不是重建 ⇒ 频繁重载**不是**重渲来源。
   - **排除 B（实时项与持久化项的交接换键）**：`removeLiveCommandsPersistedIn` 是**按 id 相等**过滤的（`persistedIds.has(m.id)`），同一个 app-server item 的 live 项与持久化项 id 相同 ⇒ 键不换、节点不重建。
   - **剩下的候选**（未证）：新命令块插入本身的一帧布局变化 + `autoFollowOutput` 把视口重新钉到底部（`scrollToBottom()` 里除了写 `scrollTop` 还会 `anchor.scrollIntoView({ block: 'end' })`，而 `scrollIntoView` 会连带滚动祖先容器）。**要定案必须驱动一个真实的流式回合**（需要模型在跑），本轮没有做，也不据此下结论。
   - 可以明确的是：**本轮修掉的「>5s 重载导致列表整体消失再回来」本身就会表现为一次闪烁 + 回到 TOP**，所以用户看到的「闪一下」至少有一部分是它。

② **空列表现在常驻 DOM**（有意）：代价是空线程时多一个空 `<ul>`（无内边距/边框，不可见）；好处是滚动容器不再随状态切换而重建。这是本轮改动的核心取舍。

③ **375px 已跑 `verify-mobile-375.cjs`（EXIT=0）**，但那是无头 Edge 的视口模拟、**不是真机**；macOS 未验证。

④ **没有加挂载期滚动恢复**：本轮只是让元素不被摘掉。若要把「任何重建都能回到原位置」做成通例，需要在 `ThreadConversation` 挂载后做滚动初始化，那会改变**所有**挂载路径（含首次打开线程）的行为，属独立议题。

⑤ **未发版、未推送**：改动随下一次发布走（`0.1.127` 已 publish 且含 round-122 的 `custom` 缺陷）；**round-122 ~ round-126 的全部提交目前只在本地 `main`**。
