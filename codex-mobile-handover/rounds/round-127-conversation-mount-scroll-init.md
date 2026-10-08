# round-127：会话重挂不再把滚动位置丢回 TOP（挂载期滚动初始化）+「闪一下」的候选排除

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 验证用 `node scripts/dev.cjs --port 4275`（带 `/codex-api` 桥）+ 项目内隔离 `CODEX_HOME`（`.codex/`，**未触碰真实 `~/.codex`**），以及生产构建 `dist-cli` 起在 4190；实测浏览器为系统 Edge。

本轮收口 round-126 的两条遗留：①「新增命令块的时候会闪一下」尚未定案；②没有挂载期滚动恢复。

## 一、决定性一步：先证明「重挂丢位置」是真问题，再动手

round-125 / round-126 都把「加挂载期滚动恢复」写成了「独立议题，本轮不做」。它们的理由是「那会改变**所有**挂载路径（含首次打开线程）的行为」。要判断值不值得改，得先回答一个可测的问题：**除了已经被修掉的两条路径（审查面板、慢开提示），还有哪条路会重挂而 activeThreadId 不变？**

`ThreadConversation` 是 `defineAsyncComponent`（`App.vue:1019`），而会话列位于 `<template v-else>` 分支里（`App.vue:568`）——**切到非线程视图就会卸载它**。于是写 `tmp/probe-r127-remount.cjs` 直接量：

| 路径 | `.conversation-root` | 回到同线程后 scrollTop |
| --- | --- | --- |
| 进入线程、停在底部（基线） | 在 | **438**（可滚 438） |
| `#/` 切走 → 切回同一条线程 | 摘除 1 次 + 挂回 1 次 | **0** ← TOP |
| `#/directory` 同上 | 摘除 1 次 + 挂回 1 次 | **0** |
| `#/settings` 同上 | 摘除 1 次 + 挂回 1 次 | **0** |
| `#/automations` 同上 | 摘除 1 次 + 挂回 1 次 | **0** |

四个入口**全部**稳定复现（`rootsRemoved=4 / rootsAdded=4 / listsAdded=4`）。机制与 round-125 同源、但那条路径已被修掉：**该组件的五个滚动相关 watcher（`messages` / `pendingRequests` / `liveOverlay` / `isLoading` / `activeThreadId`）没有一个会触发**——`activeThreadId` 没变、props 也没变——而它当时**没有 `onMounted`**，所以新挂载的 `<ul class="conversation-list">` 就停在浏览器默认 `scrollTop = 0`。

⇒ 这不是理论隐患，是日常可复现的缺陷（用户在会话里切去目录/设置页再切回来就会遇到）。**改它是修真问题，不是投机。**

## 二、改动：补一次挂载期滚动初始化（11 增 1 删）

`src/components/content/ThreadConversation.vue`：

```diff
-import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
+import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
@@
 watch(() => props.activeThreadId, async () => { … }, { flush: 'post' })
+
+// round-127：挂载期的滚动初始化 …
+onMounted(() => {
+  void scheduleConversationScroll()
+})
```

两点分寸：

1. **只做一件事**：结算一次滚动（`scheduleConversationScroll` → `applyConversationScrollState` → `autoFollowOutput` 为初始值 `true` → `enforceBottomState`）。`autoFollowOutput`、`modalImageUrl`、`isLoadingMore`、`warmLayerState` 在挂载时**本来就处于初值**，所以不必像 `activeThreadId` watcher 那样逐项重置——那一段代码在挂载路径上是空操作。
2. **与「切换线程」同口径 = 落到最新内容（底部）**，不是恢复用户停下的原位置。理由是剩下的重挂路径**全都是真实导航**（切走再切回），此时「打开一条线程就看到最新」才是预期；而 round-125 / round-126 里那两类**非导航**的意外重挂已经被修掉了（审查面板改覆盖层、滚动容器不再挂 `v-if` 链）。要做「恢复原位置」需要跨卸载保存 scrollTop，那是另一个议题（见 §六）。

## 三、验证

### 3.1 真机 A/B（决定性，同一 harness）

新增 `scripts/verify-conversation-mount-scroll.cjs`（浏览器侧、可复跑）：进入一条可滚动线程 → 停在底部记录 `scrollTop` → 依次切到 `#/` / `#/directory` / `#/settings` / `#/automations` 再切回 → 断言位置未丢，并断言「会话确实被重挂过」（否则闸门可能是空过）。

| 变体 | 四个入口的 scrollTop | 结果 |
| --- | --- | --- |
| **改动前**（`git stash`） | 438 → **0**（四个入口全中） | **FAILED 4 / 7**（exit 1） |
| **改动后** | 438 → **438** | **ALL GREEN 7 / 7**（exit 0） |

### 3.2 静态契约同步钉住（并证明不是空断言）

`scripts/check-ui-contract.cjs` **40 → 41 项**：新增「会话挂载期有滚动初始化，重挂不停在 TOP（round-127）」（同时校验 `onMounted` 从 `vue` 导入、且挂载回调里确实调用了 `scheduleConversationScroll`）。

| 被检查的源码 | 契约结果 |
| --- | --- |
| 改动前 | **40/41**，该项 FAIL，诊断行 `未定位到 onMounted()` |
| 改动后 | **41/41** 全部通过（`onMounted@2021`） |

### 3.3 性能审计（行为变更必带测量）

按 `AGENTS.md` 的要求做了量测。关注点只有一个：挂载初始化会不会让**首次打开线程**多付一次滚动结算（重复请求、阻塞工作、无界扇出均不适用——本改动不新增任何请求/监听器）。

`tmp/probe-r127-perf.cjs` 在页面里挂 `Element.prototype.scrollIntoView` 计数 + 给 `.conversation-list` 装 `scrollTop` setter 计数，量「hash 切到线程」这一段：

| 变体 | `codex-api` 请求数 | `scrollIntoView` 调用 | `scrollTop` 写入 | 到首个 `.conversation-item` |
| --- | --- | --- | --- | --- |
| 改动前 | 8 / 8 / 8 | 1 / 1 / 1 | 1 / 1 / 1 | 98 / 90 / 85 ms |
| 改动后 | 8 / 8 / 8 | 1 / 1 / 1 | 1 / 1 / 1 | 462(冷启动) / 88 / 90 ms |

**逐项相同**。原因是 `scheduleConversationScroll` 自带 in-flight 合并（`if (conversationScrollPromise) return conversationScrollPromise`）：首次打开时「挂载初始化」与「`activeThreadId` watcher」落在同一次结算里，不产生第二遍滚动、也不产生第二遍布局读取。第一轮的 462ms 是浏览器冷启动（模块编译）伪影，与改动无关。

（量测口径的一处诚实说明：探针给 `scrollTop` 装了自定义 setter，因此回读的是**写入值**而非浏览器钳制后的值，日志里会出现 `endTop=1008/438` 这种「越界」读数——那是探针自身的副作用，不是产品行为。）

### 3.4 类型、单测与生产构建

- `vue-tsc --noEmit` **EXIT=0**。
- 全量 **742 例 / 742 通过（76 文件）零失败**（默认 15s 超时下即零失败）。
- `vite build` **EXIT=0**（9.47s）重建 `dist/`，`dist-cli` 起在 **4190**（隔离 `CODEX_HOME`），在生产构建上复跑：

| 闸门 | 结果 |
| --- | --- |
| `verify-conversation-mount-scroll`（本轮新增） | **ALL GREEN 7/7**（与 dev 数字逐字相同：438→438、removed=4/added=4） |
| `verify-mobile-375` | **EXIT=0** |
| `check-thread-switch-feedback` | **12 项全过**（`frozen=8ms` / `11ms` ≤ 60ms 预算；高亮/路由/内容三者在快速连点后仍一致） |
| `check-fonts` | **13/13** |
| `check-theme` | **15/15** |
| `check-ui-contract` | **41/41** |

`check-fonts` / `check-theme` 本机顶层没有 `playwright-core`（它在 pnpm store 里，未被软链到 `node_modules/`）——用 `NODE_PATH=<store>/playwright-core@1.62.1/node_modules` 指过去后可正常运行，数字与 round-126 一致。

## 四、「闪一下」的取证进展（仍未定案，但候选已收窄到只剩一条）

round-126 排除掉了两个内部原因（重载重渲、live→持久化换键），并把剩余候选写成「新块插入本身的一帧布局变化 + `scrollToBottom()` 里的 `anchor.scrollIntoView({block:'end'})` 会连带滚动祖先容器」。本轮把这条候选**测掉了**，并顺手排除了另两个：

`tmp/probe-r127-append-flash.cjs`——注入完全走应用自己的链路：① `thread/list` 里把该线程 `updatedAt` 桩 +1h（让重载真的发生）② `thread/read` 的响应里往最后一轮 `items` **追加一个合成的 `commandExecution` 条目**（形状抄自同线程真实条目：`{id,type,command,cwd,status,aggregatedOutput,exitCode,durationMs}`）③ 伪造 `visibilitychange` hidden→visible。本轮把列表**停在底部**触发（= 用户看最新内容时的真实处境，`autoFollowOutput` 保持 true）。

| 候选 | 读法 | 结论 |
| --- | --- | --- |
| **① 重载重建既有 item** | `itemsAdded=0 / itemsRemoved=0`，items 10 → 11 | **排除**（新增块是纯追加，既有节点一个都不动） |
| **② 顶部 `isLoading` 切换条闪动** | `switching-bar=false / loading=false`（全程） | **排除**。代码依据：`isLoadingMessages` 只在 `options.silent !== true && !alreadyLoaded` 时置真（`useDesktopMessageHistoryLoading.ts:119`），而重载路径全部 `silent:true` |
| **③ `scrollIntoView` 连带滚祖先** | 原语级 A/B：`list.scrollTop = scrollHeight` 单独已到底（两次 `listTop` 都是 438）；随后测 11 个祖先的 `scrollTop` | **排除**：加不加 `scrollIntoView`，**祖先 scrollTop 逐位相同（全 0）**，`document.scrollingElement` 也是 0；耗时 0 → 0.1ms |
| **④ 列表位置被重置回 TOP** | `listTop` 轨迹 `438 → 510`；祖先与 doc 全程 0 | **排除**（跟随到底，不是回 TOP） |

**新事实（本轮唯一新增的形态证据）**：内容变化的重载确实带来**非 item 节点的成规模重建**——新增 `#3`（文本节点）×80、`<li.conversation-turn>`×12、`<section.conversation-turn-process>`×2；移除 `#3`×50、`#8`（v-if 占位注释）×2、`<li.conversation-turn>`×7。它们是 Vue 在同一次 patch 里完成的，**观测不到可见的中间态**（无异常、无布局抖动读数）。

⇒ 「闪一下」现在只剩两种可能：**(a) 真实流式回合里 live 项 → 持久化项的交接**（本条注入只造了持久化项，live 侧没有触发，要测必须驱动一个真回合）；**(b) 内容落地与滚动跟随之间那一帧的差**（滚动写在 `requestAnimationFrame` 里）。两者都需要模型在跑，本轮不做、也不据此下结论。

## 五、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/components/content/ThreadConversation.vue` | `onMounted` → `scheduleConversationScroll()`；`onMounted` 加入 `vue` 导入（11 增 1 删） |
| `scripts/check-ui-contract.cjs` | 新增 1 项结构性不变式断言（40 → 41 项） |
| `scripts/verify-conversation-mount-scroll.cjs` | 新增（浏览器侧回归闸门，可复跑） |

探针（`tmp/`，未入库）：`probe-r127-remount.cjs`（重挂丢位置，决定性）、`probe-r127-append-flash.cjs`（「闪一下」四候选排除）、`probe-r127-shape.cjs`（抄录 `thread/read` 载荷形状）、`probe-r127-perf.cjs`（性能 A/B）、`probe-r127-prod-diag.cjs`（生产侧诊断）。

## 六、诚实边界

① **只保证「不停在 TOP」，不保证「回到用户停下的原位置」**。恢复原位置需要在卸载时保存、挂载时还原 `scrollTop`（按 threadId 记忆），那会引入新的状态与失效规则；而剩余的每一条重挂路径都是用户主动导航，落到最新内容才是预期。要做成「通例」属独立议题。

② **首次打开线程的观察路径被改变了（有意且幂等）**：挂载初始化与 `activeThreadId` watcher 落在同一次结算里（§3.3 已量到 `scrollTop` 写入恒为 1 次），所以没有额外代价；但它确实让「首次挂载」多了一条调用链，未来若有人改 `scheduleConversationScroll` 的合并语义，需要留意这里。

③ **「闪一下」仍未定案**，见 §四：候选已从 2 条收窄到 (a) live→持久化交接 / (b) 滚动跟随的帧差，两者都要真实流式回合才能判。

④ **两个既有滚动闸门本轮 SKIP（退出码 2）**：`verify-conversation-list-persists` 与 `verify-review-pane-scroll` 都要求线程可滚动 **> 600px**，而本机沙箱 `.codex` 里最长的线程只有 **438px**，因此两者都以「环境不足」明确退出（不是失败、也不是通过）。本轮的 `verify-conversation-mount-scroll` 把阈值降到 150px，所以它能跑。要复跑那两个闸门需要一条更长的真实线程（round-118 的做法是往 `.codex/sessions/` 放真实 rollout 副本）。

⑤ **`check-token-equivalence` 未跑**：它需要 `output/playwright/ui-audit/facts.json`（由 `scripts/ui-audit-shots.cjs` 产出），本机没有该快照。本改动是纯 DOM 生命周期、不触碰任何样式/token，外观等值在结构上讲不通会变；但**没有用截图级对比证明**这一点。

⑥ **未发版、已推送前需 bump**：round-122 ~ round-127 的提交随下一次发布走（npm `latest` 仍是 `0.1.127`）。

⑦ **一处环境事实（本轮踩到，值得记）**：`dev server`（4275）与 `dist-cli`（4190）**共用同一个 `CODEX_HOME` 时会互抢 writer lock** —— 先起 dev、再起 dist-cli，后者打开线程会得到 `RPC thread/resume failed with HTTP 502: thread … already has an active writer`，页面上表现为「消息列表只剩 1 项、没有任何 `thread/read`/`resume` 请求」。跑生产构建闸门前必须先停掉 dev（或换一个 `CODEX_HOME`）。这是 round-44 记录的 writer 锁限制在现场的样子。
