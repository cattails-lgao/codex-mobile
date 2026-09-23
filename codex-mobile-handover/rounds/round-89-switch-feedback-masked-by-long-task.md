# Round-89：切换时点击反馈被长任务吞掉（2026-09-23）

## 现象

**用户口径**：「解决切换的时候消息列表会卡的问题吗？卡了后左侧的线程列表点击切换都没有选中状态了」

比 round-88 多出来的关键症状是后半句：**卡顿发生后，侧栏点击不出现选中态**。这句把方向从「渲染慢」拨到了「绘制被推迟」——浏览器在那一百多毫秒里根本没有绘制机会，所以高亮即使已经写进 DOM 也看不见，点击也没有任何视觉反馈。

## 测量方法

- 新增可复跑探针（入库）：`scripts/check-thread-switch-feedback.cjs`。核心指标是**点击后第一帧何时到来**（`requestAnimationFrame` 帧间隔之和，即「冻结窗口」），另加「高亮画出」「内容画出」两个时刻。
- **环环相扣的一处坑（本轮最重要的一条方法论）**：先用 CDP `Tracing` 主线程嵌套树 + `Profiler` CPU 采样找归因，再做 A/B。跨构建的**顺序** A/B 在这台机器上不足以支撑结论——同一变体重复测得到 59ms 与 127ms（2 倍）。最终采信的是**交错 A/B**：探针自己在两次运行之间切换 `dist` 目录，两个变体轮流执行，让机器负载漂移均摊到两边（`PROBE_REPS=4`，偶数轮反向顺序以抵消顺序偏置）。
- 环境事实（读数时必看）：`(idle)` 占 1565/1976ms；本机常驻约 454 个进程（24×Trae CN、19×msedge、21×node）。同一台机器上单对象布局成本在 0.0025ms 到 1.09ms 之间波动，**所有绝对耗时都被负载放大**。

## 根因（实测确认）

一次点击后的主线程时间轴（生产构建，CDP `Tracing`，已按点击所在线程过滤、事件树按包含关系缩进）：

```
[   53.6 +   94.3] RunTask
  [     57 +   90.3] EventDispatch type=click
    [   57.1 +    1.2] FunctionCall n @ index-*.js:19      ← 点击监听器本身 1.2ms
    [     69 +    0.4] UpdateLayoutTree
    ...（+69 → +105.3，约 36ms 无任何 trace 事件的空隙）
    [  105.3 +    3.3] UpdateLayoutTree
    [  108.6 +   38.5] Layout dirty=67 total=256
[  188.2 +  158.6] RunTask
  [  188.2 +  156.6] FireAnimationFrame
    [  188.3 +  156.5] FunctionCall（无名，rAF 回调）
      [  188.4 +    8.3] UpdateLayoutTree
      [  196.7 +  147.7] Layout dirty=411 total=644
```

结论：**点击监听器只花 1.2ms，但整条切换链被排在同一个任务+微任务排空里**——`router.push` 触发路由换视图、路由 watcher 触发 `selectThread`、会话内容水合与首帧布局全部落在这次排空内。浏览器要等它跑完才有绘制机会，于是：

- 冻结窗口（点击后一帧未画）**中位 112ms**（实测 76–143ms）；
- 高亮进 DOM 的时刻与「点击任务结束」重合，即**中位 102ms**（59–127ms）才看见选中态。

这正是 round-88 记录的「首点残留约 170–200ms」那一段——round-88 判断它需要结构性改动，本轮做的就是这件事。

### 被实测否掉的候选（避免后人重走）

本轮又逐一排除（全部生产构建实测）：

| 候选 | 实测 | 结论 |
|---|---|---|
| 字体 / 文本整形 | sans / mono / 雅黑 × CJK / ASCII，各 40 段首次布局 **1–11ms**（热 0.1ms） | 与 150ms 差两个数量级，否 |
| 会话子树自身的布局成本 | 把已渲染的 `.conversation-list`（244 节点，含 1 个 table、41 个 inline-code、48 个 `pre-wrap`）**拆下来再插回**并强制布局 = **2.4–4.7ms**；克隆新对象插入 = 2.4ms | 185ms 不是会话内容的布局成本，否 |
| `localStorage` 同步 I/O | 把 `Storage.prototype.getItem/setItem/removeItem` 换成内存实现 | 无改善，否 |
| 滚动条 / 视口宽度变化 | 强制 `html { overflow-y: scroll }` | 无改善，否 |
| 右面板挂载 / CSS / git 数据 | 见 round-88 | 否 |
| `focus()`、`overflow-wrap`、`contain`、`content-visibility`、`overflow-anchor`、分支列表 | 见 round-88 | 否 |

**顺带定位到的两个「强制布局大户」**（CPU 自耗时榜前两名，本轮一并处理）：

- `isAtBottom()`（`container.scrollHeight - (scrollTop + clientHeight)`）→ 自耗时 **102–119ms**。它是个几行的函数，自耗时几乎全是它读 `scrollHeight` 触发的强制同步布局被算在它头上。
- `updateComposerShellWidth()`（`window.getComputedStyle`）→ 自耗时 **89ms**。

注意 `(program)` 只有 20–24ms——**这不是「原生卡死」，而是「在树还脏的时候做测量」**。这类测量只要树是脏的就强制一次同步样式+布局。

## 修复

### ① 先画高亮，再切路由（`src/App.vue` `onSelectThread`，主修）

做法：点击时**只**把高亮落下来，让出一个渲染机会，再把「切视图」挪到下一个任务。

- 新增 `optimisticSelectedThreadId` 与计算属性 `sidebarSelectedThreadId`（`optimistic || selectedThreadId`），侧栏 `:selected-thread-id` 改绑后者。
- **刻意不写 `selectedThreadId`**：路由落地后 `syncThreadSelectionWithRoute` 的判据（`selectedThreadId.value !== threadId`）仍然成立，`selectThread` 的完整路径不变——包含 `refreshModelPreferences({ includeProviderModels: true })` 与 `refreshSkills()`。这是本方案的关键约束，绕开它就会静默丢掉模型偏好与技能刷新。
- `optimisticSelectedThreadId` 在 `selectedThreadId` 任何变化时清空，所以它只是个「过渡高亮」，不会与真实选中态长期分叉。
- `yieldToNextPaint()` = `rAF` + `setTimeout(0)`：纯 `nextTick` 不够（微任务仍在绘制前跑完），纯 `rAF` 也不够（rAF 回调本身就在绘制前执行）。后台标签页不触发 rAF，故加 80ms 定时器兜底，避免导航被无限推迟。
- 导航令牌 `pendingThreadNavigation`：连点时只有最后一次点击的导航会发出。
- **顺带修掉一个既有缺陷**（由新检查抓到）：点回「当前这条」时的早退会把这次点击整个吃掉，于是「先点 A 再点回 B」会停在 A（在基线构建上同样失败）。现在这个分支会撤销尚未落地的导航并清掉过渡高亮。

### ② 输入区宽度测量改到布局之后（`src/App.vue`）

`watch(composerQueueRef)` 里原来直接调用 `updateComposerShellWidth()`，正好压在路由切换那次 patch 上（新容器刚建、样式还是脏的）→ 一次 `getComputedStyle` 就强制出 89ms 的样式+布局。

改为：有 `ResizeObserver` 时只 `observe` 后 `return`，测量交给 RO 回调（帧内布局完成之后才触发，那里再读 `getComputedStyle` 不会强制布局）；没有 RO 的环境才退化成直接测量。

RO 仍会送达初始观测，所以宽度照旧会被算出来——实测 `contentRect.width = 871px`，与 `clientWidth - padding = 919 - 48` 一致；且 `composerQueueRef` 只绑在线程路由那处容器上（首页同名容器无 ref），首页本来就不测量，无行为变化。

### 明确不做

- 没有动 `isAtBottom` 的那次强制布局。那一次布局**无论如何都要发生**（新插入的会话总要有一次首帧布局），守卫只能避免重复读；要再压得把「是否在底部」的状态改成不读几何（如用 `IntersectionObserver` 维护），属较大改动。
- 没有改上游分支列表数据量（624KB / 4 608 refs）的产品取舍，见 round-88。

## 验证

**可复跑检查（新增，入库）**：`scripts/check-thread-switch-feedback.cjs`（**11 项**）——首点高亮、路由与高亮一致、内容加载、首点冻结预算、二次切换的高亮先于内容、二次切换落地、内容确实换掉、冻结预算、同帧双击落在最后一次、**A→B→C→A 连点落在最后一次**、连点后高亮/路由/内容三者一致（后两项对应既有手测 `tests/thread-loading-state/rapid-thread-switching-during-active-load.md` 的要求）。dev 服务器下自动跳过计时断言（Vite 按需编译会污染计时），只跑正确性断言。

**检查的鉴别力（关键）**：在**基线构建**上跑同一脚本 → 3 项失败：

```
FAIL  first-open freeze <= 60ms  (frozen=152ms)
FAIL  switch freeze <= 60ms  (frozen=62ms)
FAIL  rapid double click lands on the last clicked thread
```

修复构建 → 11/11 通过。

**交错 A/B（4 轮，dist 原地切换，两变体轮流执行）**：

| 指标 | 基线 | 修复后 |
|---|---|---|
| 点击 → 高亮画出 | 59 / 102 / 127 / 86ms，中位 **102ms** | 5.4 / 6.2 / 2.9 / 9.3ms，中位 **6ms** |
| 点击后冻结窗口 | 76 / 112 / 143 / 94ms，中位 **112ms** | 21 / 17 / 22 / 16ms，中位 **21ms** |
| 点击 → 内容画出 | 86 / 159 / 188 / 127ms，中位 159ms | 201 / 112 / 148 / 186ms，中位 186ms |

- 高亮与冻结两组**区间完全不相交**；内容两组**区间大幅重叠**（86–188 vs 112–201）→ **没有可测的内容延迟代价**。
- 21ms ≈ 一个 60Hz 帧间隔，即「点击当帧就把高亮画出来」。
- 一次**顺序** A/B 曾显示内容晚约 130ms，交错测量证明那是负载漂移——这条已写进「测量方法」。

**其他**：

- `vue-tsc --noEmit` 通过；`vite build` 通过。
- 全量 Vitest：**658 例，656 通过 / 2 失败**——2 例为既知 Windows 平台差异（`codexAppServerBridge.archive.test.ts` 的 symlink realpath 与 `mode 0o600` vs `0o666`），与基线逐字一致。
- `scripts/check-branch-list-budget.cjs`（round-88）**5/5 仍通过**。
- 功能复验：截图 `output/playwright/switch-early-fixed.png`（点击后 +29ms——侧栏目标行**已有选中块**、内容区仍是上一条线程的 "Loading messages…"）与 `output/playwright/switch-settled-fixed.png`（切换落地后）；`selectThread` 路径完整（会话内容确实由 `loadMessages` 装载，`1465` 字符）。

## 残留（未修，如实记录）

- **会话内容首帧布局仍在**（`Layout dirty=411 total=644 → 148ms`），只是现在排在「高亮已绘制」之后。切换的**内容**仍要约 110–200ms 才出现；用户看到的是「立刻选中 + Loading messages…」，期间帧不再冻结。要缩短这一段需要让那次布局本身更便宜，机制尚未定位（见下）。
- `isAtBottom` 的强制布局（自耗时 102–119ms）未动，理由见「明确不做」。
- **机制上仍未解释清的一处**：点击任务里有约 36ms「无任何 trace 事件」的空隙，且 `Layout dirty=411 total=644` 在 644 个对象上花 148ms（0.23ms/对象，比合成对照组高一个数量级）。已知它**不是**内容量、字体、整形、子树自身的布局成本；结合 `(idle)` 占比与单对象成本的巨大波动，最可能是本机负载放大了那次布局，但**未定论**。

## 收尾验证说明

- **性能审计（仓库硬性要求）**：审计对象 = 侧栏点击 → 高亮 → 路由 → 会话首帧这条链；测量手段 = 生产构建 + 真实页面 + `requestAnimationFrame` 帧间隔 + `PerformanceObserver(longtask)` + CDP `Profiler` CPU 采样 + CDP `Tracing` 主线程嵌套树 + 交错 A/B。**未测**：真实浏览器（非 headless）下的表现、更重会话（本机 `CODEX_HOME` 只有 1 条真实线程，其余 3 行是示例数据）、合成帧率、非 Windows 平台。
- **涉及文件**：`src/App.vue`（改，两处：`onSelectThread` 及其配套状态、输入区宽度测量的调用时机）、`scripts/check-thread-switch-feedback.cjs`（新增）；手测文档 `tests/thread-loading-state/round-89-optimistic-sidebar-highlight.md`（新增）。
- **复现路径**：`PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-thread-switch-feedback.cjs`；把 `onSelectThread` 改回「直接 `router.push`」即立刻失败（冻结预算与连点两项）。
