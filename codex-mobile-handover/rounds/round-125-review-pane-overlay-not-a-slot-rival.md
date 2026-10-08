# round-125：审查面板改为独立覆盖层——它不再与会话列争抢槽位

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 验证用 `node scripts/dev.cjs`（vite dev，带 `/codex-api` 桥）+ 项目内隔离 `CODEX_HOME`（`.codex/`，未触碰真实 `~/.codex`），实测浏览器为系统 Edge。

## 一、由来：用户两问，第二问直接给出了修法

1. 「点击审查工作树更改弹窗再关闭，消息列表怎么去上面了？这个弹窗和消息列表有什么关系」
2. 「这个工作树更改弹窗不能独立吗？一定要和消息列表争抢槽位吗？」

第一问是症状。第二问其实已经命中修法——**它本来就不必争**：`ReviewPane` 早就 `<Teleport to="body">`、自带 `fixed inset-0` 的全屏 backdrop，结构上是一件覆盖层，`v-if`/`v-else` 纯属历史遗留。

## 二、根因：不是滚动逻辑出错，是滚动位置所在的组件被销毁了

`src/App.vue`（改前 569-580）：

```html
<div class="content-grid">
  <ReviewPane v-if="isReviewPaneOpen && selectedThreadId && composerCwd" … />
  <template v-else>
    <div class="content-thread"><ThreadConversation … /></div>
    <div class="composer-with-queue">…</div>
  </template>
</div>
```

于是：

1. 点「审查工作树更改」→ `isReviewPaneOpen = true` → **`ThreadConversation` 被卸载**（连带 composer）；
2. 关闭 → 它**全新挂载**；
3. 而 `ThreadConversation.vue` **没有 `onMounted`**（全文件只有 `onBeforeUnmount`），五个滚动相关 watcher（`messages` / `isLoading` / `activeThreadId` / `liveOverlay` / `pendingRequests`）**都没有 `immediate`** —— 重挂时 props 没变化，**一个都不触发**；
4. 于是新 `<ul class="conversation-list">`（模板第 28 行）的 `scrollTop` 停在浏览器默认值 **0** ⇒ 用户看到「消息列表回到最顶部」。

**滚动位置从来没被保存过，所以也没人能恢复它。** 同因一并丢失：已上翻加载的更早消息分页、`autoFollowOutput`（重置为 `true`）、`warmLayerState`、图片预览、文件变更动作态；代价还有整条线程 DOM 重渲一遍（本项目一直在盯布局树规模，所以这不只是观感问题）。

### 2.1 溯源：一次有意的「in place of」

`git log -S` + `git blame` 定位到 **`0e147705`「Show review pane in place of thread content」**（2026-04-02，taobo），改动正是把并列布局改成互斥：

```diff
-  <div class="content-grid" :class="{ 'has-review-pane': isReviewPaneOpen && !isMobile }">
-    <div class="content-thread-column">…会话列 + composer（常驻）…</div>
-    <ReviewPane v-if="…" />          ← 并列的第二列（md 下 34rem）
+    <ReviewPane v-if="…" />           ← 顶掉整个会话列
+    <template v-else> … </template>
```

同时删掉了 `.content-grid.has-review-pane`（`md:grid-cols-[minmax(0,1fr)_34rem]`）与 `.content-thread-column` 两条样式。也就是说**「顶掉」是当时的目的**（让审查面板在窄屏也占满宽度），**丢滚动位置是没被考虑到的副作用**；这次重构也**没有出现在任何轮次文档里**。

容易误判的一点：`ReviewPane` 视觉上完全是弹窗（`Teleport` + `fixed inset-0` + `bg-black/50` backdrop），但 `v-if` 依然会卸载它下面的会话——**「覆盖」与「顶掉」在这里被混在了一起**，这正是用户第二问的由来。

## 三、改动：让它真的变成覆盖层

只做三件事，除缩进外零内容变化：

1. 删掉 `<template v-else>`（App.vue 原 580 行）；
2. 删掉与之配对的 `</template>`（原 674 行）；
3. 中间被包住的 93 行（会话列 + composer）**整体减 2 个空格**缩进。

`<ReviewPane>` **原地不动**——它是 `<Teleport to="body">`，在 `.content-grid` 里不占布局，留着即是「同一槽位里并存」。改后 `.content-grid` 的三个子节点全是**无条件**的：`ReviewPane` + `.content-thread` + `.composer-with-queue`。

diff 规模 **91 增 / 93 删**（净 −2 行 = 删掉的两行 template）。

关闭态 DOM 与改前**逐字相同**（Vue 的 `<template v-else>` 是 fragment、不产生元素），所以布局与 CSS 无任何变化；唯一的差别是打开面板时会话列**不再被销毁**。

## 四、验证

### 4.1 真机 A/B（决定性，同一 harness 交错三跑）

新增 `scripts/verify-review-pane-scroll.cjs`（浏览器侧，可复跑），判据两条：面板打开期间 `.conversation-list` 是否仍挂载、关闭后 `scrollTop` 是否与打开前一致。

| 变体 | ① 打开期间 `.conversation-list` | ② 关闭后 `scrollTop` | 结果 |
| --- | --- | --- | --- |
| **改动前**（`git checkout -- src/App.vue`） | **count = 0**（会话列被卸载） | **2018 → 0** | FAILED 3 / 7 |
| **改动后** | **count = 1** | **2018 → 2018** | ALL GREEN 7 / 7 |
| 改动后复跑（交错确认） | count = 1 | 2018 → 2018 | ALL GREEN 7 / 7 |

改动前的两行**逐字复现了用户报告**（「消息列表跳回最顶部」），且 `count = 0` 直接证明「打开面板＝卸载会话列」这个机制判断。线程为隔离 home 里一条真实线程（可滚动 5768px）。

### 4.2 静态契约同步钉住（并证明不是空断言）

结构性不变式写进 `scripts/check-ui-contract.cjs`（**38 → 39 项**）：「审查面板是覆盖层，不得与会话列构成 v-if/v-else 互斥」。

同样做了反跑证明闸门**真的看得见**：

| 被检查的源码 | 契约结果 |
| --- | --- |
| 改动前 | **38/39**，该项 FAIL，诊断行 `← 仍被 v-else 包着` |
| 改动后 | **39/39** 全部通过 |

（这一条遵循本项目已吃过两次亏的纪律：**闸门必须覆盖它断言的范围**——一个在改动前后都通过的断言等于没有断言。）

### 4.3 定向与全量

- `vue-tsc --noEmit` **EXIT=0**（模板改动纳入类型检查）。
- 全量 **742 例**：默认 15s 超时下 5 例 `Test timed out in 15000ms`（全部落在 `mkdtemp → 写文件 → fs 逻辑 → rm -r` 形状）；`--testTimeout=30000` 复跑降到 **1 例**（`codexAppServerBridge.authRefresh.test.ts`）；隔离复跑该例 **2/2 通过（1518ms，远低于 15s 预算）**。⇒ 均为 round-115 记录的负载敏感 fs 超时，与本改动无关（本改动是纯前端模板，连服务端测试都碰不到）。
- 顺带确认 dev server 全程使用项目内隔离 `CODEX_HOME`，**未触碰用户真实 `~/.codex`**（round-123 那次事故的教训）。

### 4.4 生产构建上的复跑（补掉「只在 dev 上验过」的疑点）

`vite build`（46.26s、**EXIT=0**）重建 `dist/`，再用 `dist-cli` 起在 **4190**（隔离 `CODEX_HOME`、`--no-tunnel --no-open --no-login --no-password`），在**生产构建**上复跑两个闸门：

- `scripts/verify-review-pane-scroll.cjs` → **ALL GREEN 7/7**（`count=1`、`scrollTop 2018 → 2018`），与 dev 上逐字相同；
- `scripts/verify-mobile-375.cjs`（375px 下的抽屉/面板流）→ **EXIT=0 全过**。

顺带记一条环境事实：`dist-cli` 绑 `0.0.0.0:4190` 时，本机沙箱内 **node 的 `fetch` 连不上它**（`TypeError: fetch failed`，`127.0.0.1` 与 `localhost` 皆然，`NO_PROXY=*` 也无用），**但系统浏览器（Edge）能正常访问** —— 所以这类闸门必须走浏览器，不能用 node 探针去预热「服务是否就绪」。

## 五、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/App.vue` | 删 `<template v-else>` / `</template>` 两行 + 中间 93 行减缩进（91 增 93 删） |
| `scripts/check-ui-contract.cjs` | 新增 1 项结构性不变式断言（38 → 39 项） |
| `scripts/verify-review-pane-scroll.cjs` | 新增（浏览器侧回归闸门，可复跑） |

## 六、诚实边界

① **生产构建已补跑**（见 §4.4）：`dist/` 重建后在 `dist-cli`（4190）上复跑，两个闸门全过。Dev 与 prod 的 DOM 一致，这一点已由实测确认而不是推断。**仍未在 macOS 实机验证**（本机 Windows）。

② **覆盖层背后仍保有整条线程的 DOM（这是有意的）**。好处是审查面板打开期间 turn 继续流式更新、关闭后一切照旧；代价是重叠期间同时存在两棵子树。**未加 `inert` / `aria-hidden`**——与仓内既有的移动端右侧面板 backdrop 口径一致（那里同样只用 backdrop 挡指针）。若要让屏幕阅读器也忽略背后内容，属独立的 a11y 议题。

③ **没有加 `onMounted` 滚动兜底**。本轮只消掉了「审查面板」这一条重挂路径；其它重挂路径（路由切换等）仍会丢滚动位置。若要把「任何重挂都回到原位置」做成通例，需要在 `ThreadConversation` 挂载后做滚动初始化——但那会改变**所有**挂载路径的行为（包括首次打开线程），本轮不做。

④ **375px 已跑过 `verify-mobile-375.cjs`（EXIT=0）**，但那是无头 Edge 的视口模拟、**不是真机**；macOS 与真实移动设备未验证。

⑤ 原始改动 `0e147705` 的动机（窄屏下让审查面板占满宽度）**依然成立**——因为它本来就是 `fixed inset-0` 的覆盖层，现在既占满宽度、又不销毁会话列。
