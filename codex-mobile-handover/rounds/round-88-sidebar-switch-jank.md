# Round-88：侧边栏线程切换卡顿（2026-09-23）

> **背景：** 用户口径「在左侧边栏中进行线程切换的时候，页面会卡顿」。按仓库规矩（行为变更必须先做性能审计、根因优先）先测量归因，再改代码。本轮在**生产构建**（`vite build` + `dist-cli/index.js` 起在 `:4190`）上测量，避免 dev 的按需编译污染计时。

## 现象

同一台机器、同一份 `CODEX_HOME`（只有 1 条真实线程，侧栏另有 3 条示例行），headless Edge 驱动真实页面点击侧栏线程行：

| 场景 | 主线程阻塞 | 长任务 |
|---|---|---|
| 稳态切换（同一行反复点，内容已渲染过） | **0–9ms** | 无 |
| 本会话**首次**打开某条线程 | **75–164ms**（多次测量：`[64,131]`、`[145,117]`、`[140,124]`、`[114,90]`、`[66,153]`、`[64,111]`） | 2 例，单例最高 **358ms** |

也就是说：**稳态切换本身并不慢**，卡顿集中在「本会话第一次打开」（按 per-thread 计，多线程工作区里每条线程各付一次），以及首次打开 **~2.5 秒后**的一次追加冻结。

## 测量方法

三个探针，全部在真实页面 + 真实 app-server 上跑（`tmp/` 下，未入库）：

- **长任务 / 帧间隔 / 逐次 CDP CPU 采样 / 逐次 Chrome timeline**：本轮扩展了 `scripts/profile-thread-switch.cjs`（新增 `.thread-row` 遍历、`longtask`/`layout-shift`/`rAF` 帧间隔、逐次 `Profiler` 采样、可选逐次 `Tracing`（含 `layoutPasses`/`biggestEvents`/`topFunctionCalls`）、`PROFILE_HIDE_CSS` 区域隔离、`PROFILE_WARMUP` 预热排除冷启动）。
- **统一时间轴**：把 trace 的 `ts` 对齐到点击时刻的 `performance.mark('CLICK')`，逐条列出 `RunTask`/`FunctionCall`（含压缩后的函数名与源码位置）/`Layout`（含 `dirtyObjects`/`totalObjects`）/`UpdateLayoutTree`。
- **DOM 记账**：`MutationObserver`（挂在 `document.documentElement`、document-start 时机）记录每次插入批次的节点数与时刻；配合按子树统计节点数。

## 根因（实测确认）

### 根因一：Git 面板的分支列表把仓库全部 refs 都渲染成 DOM（4 608 行 / 23 040 节点）

右侧 Git 面板的分支选择器是「一个 224px 高的可滚动 listbox + 一个搜索框」，而 `filteredBranches` **在搜索框为空时返回全部分支**，模板 `v-for` 直接把它们全渲染：

```ts
const filteredBranches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const branches = [...props.branches].sort(...)
  if (!query) return branches          // ← 不设上限
  return branches.filter(...)
})
```

实测（生产构建，点击首行线程后）：

- `ul.rgp-branches`：**4 608 个 `<li>` / 23 040 个后代节点 / 205 818 字符**，而它的可视高度 **224px**（`max-h-56`）。
- 桥的 `git/branches` 响应体 **624 101 字节**，`data.options` 4 608 项（含大量 `origin/bot/*` 机器人分支）——而同一面板的提交列表只有 50 项（301 节点）。**分支列表是这里唯一没有任何上限的列表。**
- DOM 记账：`branches` RPC 返回后的一次 mutation 批次插入了 **+4 614 个节点**（跨度为 0ms 的单批），落在点击后 **+2.5 ~ +2.8s**，对应长任务 **66–128ms**（机器负载高时实测到 **358ms**）。
- 文档节点数从 **538 永久涨到 23 589**。

**危害不止那一次插入**。分支列表挂载后，文档的全文档布局对象从 **669 涨到 32 987**，于是：

```
Layout dirty=32295 total=32987 → 81.1ms   （挂载前同一份文档是 669 个对象）
```

单对象成本 **0.0025ms** —— 完全正常。也就是说这里**没有「某个元素特别慢」**，纯粹是**树被撑大了约 50 倍**。而会话区的底部锁定（`isAtBottom` / `scrollToBottom`）在每次内容变化后都会读 `container.scrollHeight`，那是一次**强制同步布局**：分支列表一旦挂载，**每一次这样的读都要付 ~81ms 主线程阻塞**。这也回收了此前的一处误判——开发态 CPU 采样里长期占据榜首的 `scrollToBottom`（`Ln` = `isAtBottom`，self time 116–130ms）**不是**它自己慢，而是它的 `scrollHeight` 读在为一棵 3.2 万对象的树做布局。

### 根因二：`RightGitPanel` 挂载时无条件聚焦搜索框（越权 + 额外强制布局）

`onMounted` 里有一条 `void nextTick(() => searchInputRef.value?.focus())`，聚焦目标是**分支搜索框** `input.rgp-search`。而该面板是 `defineAsyncComponent`，且它的可见性由 `canShowRightPanel && (isMobile || !isRightPanelCollapsed)` 决定——**首次选中线程才第一次挂载**，于是这次聚焦在用户「点侧栏线程」这个动作上被触发：用户的按键会被引到分支搜索框，而不是消息输入框（在「切到 Files 页再切回 Git 页」时还会反复触发）。它同时多付一次强制布局。

实测 `focus()` 本身只要 **4–6.5ms**——**不是**卡顿主因，但它是个确凿的行为缺陷。（补记：早前把一次 116ms 的 CPU 自耗时记在 `focus` 名下是采样归因错误，真正的主人是上面那个 `isAtBottom`。）

### 已被实测否掉的候选（避免后人重走）

| 候选 | 实测 | 结论 |
|---|---|---|
| 文本整形 / 行盒构造是瓶颈 | 合成 240 段 CJK 首次布局 **8.8ms**、同内容第二次 0.9ms；拉丁 0.1ms；真实会话文本重复 15 份 **1.7ms** | 否掉，整形很便宜 |
| `overflow-wrap: anywhere`（会话文本 5 处）参与 min-content 计算 | `break-word` 覆盖：阻塞中位 **162 → 217ms**、布局 **181.9 → 235.4ms** | 否掉（反而更慢） |
| 缺 `contain` / 布局隔离 | `.conversation-turn { contain: layout }`：**162 → 204ms** | 否掉 |
| 滚动锚定（scroll anchoring） | `overflow-anchor: none`：阻塞中位 **104 → 101ms**、布局 **147.4 → 144ms** | 否掉（噪声内） |
| 会话区自身的布局开销 | 隔离注入 `display:none` 逐个区域 A/B | 隐藏右面板 **101ms vs 基线 104ms**（无变化）、隐藏侧栏 **101ms**（无变化）；只有隐藏会话区把总布局 201.7 → 114.7ms | 右面板与侧栏都不是主因 |
| 右面板 CSS 首次注入（19KB）导致整文档样式重算 | 隐藏整个右面板后全文档样式重算仍在，成本不变 | 否掉 |
| `focus()` 是主因 | 打桩实测 4–6.5ms | 否掉（是缺陷但不是主因） |

## 修复（`src/components/content/RightGitPanel.vue`）

**① 分支列表只渲染一个窗口，并在滚动时按页增长**（保留全部数据可达，不做虚拟化、不新增 UI）：

```ts
const BRANCH_PAGE_SIZE = 100
const visibleBranchCount = ref(BRANCH_PAGE_SIZE)

const visibleBranches = computed(() => filteredBranches.value.slice(0, visibleBranchCount.value))

function onBranchListScroll(event: Event): void {
  const list = event.currentTarget as HTMLElement | null
  if (!list) return
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 24) return
  if (visibleBranchCount.value >= filteredBranches.value.length) return
  visibleBranchCount.value += BRANCH_PAGE_SIZE
}

// A new query or a refreshed branch list starts from the top of the window.
watch(filteredBranches, () => { visibleBranchCount.value = BRANCH_PAGE_SIZE })
```

模板改为 `v-for="branch in visibleBranches"` + `@scroll="onBranchListScroll"`；空态判定仍用 `filteredBranches.length`（语义是「真的没有匹配」，与窗口无关）。

**否掉的备选：**
- **`content-visibility: auto` / `contain-intrinsic-size`**（零行为变更、最省事）：实测**无效**——它跳过屏外元素的布局/绘制，但**拦不住 Vue 创建节点**，DOM 仍是 23 040 个（`ul` 子项仍 4 608）。这解释了为什么「CSS 层怎么调都不动」。
- **硬截断 + 提示行**（更少代码）：会**静默丢掉**第 200 条以后的分支，且在 `role="listbox"` 上做窗口化本身已偏离语义；滚动增长版既保住了全量可达，也不需要新增 UI。
- **真虚拟化**：为「4 608 项的 picker」引入虚拟列表是实现成本与收益不匹配（懒加载阶梯第 1 级：这件事不必这么建）。

**② 去掉挂载时的自动聚焦**：删掉 `onMounted` 里的 `focus()`（连带移除已无用的 `nextTick` 导入）。

**③ 两处顺带的微优化（本轮调查副产物，改变量很小、如实标注证据强度）：**

- `src/components/content/ThreadConversation.vue` `scrollToBottom()` 加早退：已经在底部时不再重复「写 `scrollTop` + `scrollIntoView`」。底部锁定一次连打 6 帧，且写操作会把布局弄脏、让下一帧的读再强制一次布局——内容没增长时这些全是白做的。加守卫后 `scrollToBottom` 从 CPU 自耗时榜上消失。**证据强度**：机制上明确（把「读+写+滚动」降为只读），但**改动前后的累计阻塞对比落在噪声内**——因为当时的强制布局成本主要来自下面那个被撑大的树；它真正的价值是「每次底部锁定少付几次全文档布局」，与根因一的修复互相叠加。
- `src/App.vue` `updateComposerShellWidth()`：同一元素连续两次 `window.getComputedStyle(el)`（一次取 padding、一次取 `--chat-column-max`）合并为一次。纯冗余调用消除，行为不变；该函数挂在 `ResizeObserver` 上，切换线程时会触发。

**工具**：`scripts/profile-thread-switch.cjs` 由「只测顶部 2 条线程」扩展为可复跑的多能力探针（见「测量方法」），本轮的归因数据全部由它产出。

## 验证

**可复跑检查（新增，入库）**：`scripts/check-branch-list-budget.cjs` —— 在真实页面上打开线程、等分支列表填充，断言渲染行数 ≤ 100、文档节点 ≤ 4 000、滚到底部窗口只按页增长、搜索后回到预算内。

```
$ PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-branch-list-budget.cjs
ok    rendered branch rows <= 100  (rows=100)
ok    document nodes <= 4000  (nodes=1049)
ok    scrolling to the end keeps or extends the window  (before=100 after=200)
ok    window grows by one page at a time  (before=100 after=200)
ok    filtered list stays within the budget  (rows=1)
all checks passed
```

**修改前后对照（生产构建，同机同数据）**：

| 指标 | 修改前 | 修改后 |
|---|---|---|
| `ul.rgp-branches` 渲染行数 | 4 608 | **100** |
| 分支列表节点数 | 23 040 | **500** |
| 文档节点数 | 23 589 | **1 049 – 1 349** |
| 分支插入批次 | **+4 614 节点**，长任务 66–128ms（峰值 358ms） | **+106 节点，无长任务** |
| 挂载后全文档布局 | `dirty=32295 total=32987 → 81.1–93ms` | `dirty=739 total=1431 → **4.9ms**` |
| `+2.5s` 处的冻结 | 存在 | **消失**（长任务只剩点击路径上的 3 个） |

**残留（未修，如实记录）**：首次点击线程路径上仍有约 **170–200ms** 阻塞——`EventDispatch ~72ms` + 一次 `FunctionCall/Layout ~91ms`（`dirty=411 total=669`，即文档仍小的时候，单对象 ~0.22ms，比上表的 0.0025ms 高约 88 倍）。区域隔离显示会话区约贡献 47ms、其余（输入区/头部）约 34ms，而上面表格里**已把 CSS、整形、锚定、contain、focus、右面板、侧栏逐一排除**。用户场景探针（连续点侧栏行、2s 间隔、~16s 窗口）在此环境下经常等不到 Git 数据返回，因此它测到的 `109–154ms` 基本全是这一段，与「根因一已修」并不矛盾——**这一段需要结构性改动（把会话渲染与输入区测量挪出点击任务，或分帧），属产品决策，本轮不做**。

## 后续测量：默认折叠右面板能不能加速线程切换？（否证）

**用户口径**：「默认不打开右侧的 git 面板，可以加速线程切换加载消息列表的速度吗？」

**答案：不能。** 同构建 A/B 下差异落在噪声内（10ms 量级）。两轮对照如下，第二轮实验设计更强，也是最终采信的那一轮。

**实验一（跨构建，弱，结论为假象）**：把 `isRightPanelCollapsed` 初值改为 `true`（并加 localStorage 持久化）后重建，在 `:4190` 测首点。

| 组 | 首点阻塞（3 次） | 最大长任务（3 次） | 首点后文档节点 |
|---|---|---|---|
| 默认展开（旧构建） | 425 / 313 / 331ms | 199 / 195 / 229ms | 1 049–1 349 |
| 默认折叠（新构建） | 204 / 146 / 146ms | 105 / 85 / 86ms | 493 |

表面收益 **191ms（约 54%）**——**但这是假象**：两组跑在不同时刻（12:40 与 12:43），落在不同的机器负载上；同一探针在此环境下的重复测量波动本身可达数百毫秒（见「现象」一节的原始读数）。跨构建对照在这台机器上不足以支撑结论。

**实验二（同构建 + localStorage 交替，强）**：不重建，改用持久化入口做 A/B——同一份构建、同一时段，用 `addInitScript` 预设 `codex-web-local.right-panel-collapsed.v1` 为 `0`（展开）/`1`（折叠），并**交替执行**，让机器负载漂移均摊到两组。

| 变体 | 首点阻塞（3 次） | 均值 | 中位数 | 最大长任务均值 | 首点后文档节点 |
|---|---|---|---|---|---|
| 展开 | 256 / 189 / 170ms | 205ms | 189ms | 113ms | 1 049 |
| 折叠 | 197 / 199 / 190ms | **195ms** | **197ms** | 103ms | 493 |

两组的长任务数量（各 2 个）与时长（约 90–110ms）也基本重合。**面板挂载省下的 556 个常驻节点对首点阻塞没有可测贡献。**

**为什么没有收益（机制，已实测确认）**：

1. **面板的数据加载与面板挂载是解耦的**。`git/branches`（624KB）、`git/branch-commits`、`git/repository-status` 都由 `App.vue` 里一个 `watch([route.name, composerCwd, isNewThreadCwdGitRepo])`（`immediate: true`）在选中线程时直接发起，**与 `RightGitPanel` 是否挂载无关**——折叠面板照样会拉这 624KB，也照样在 `+2.5s` 返回。这也修正了「折叠面板能省掉分支数据开销」的直觉。
2. **面板挂载本身很轻**。折叠态下让用户自己点开面板（`.content-header-right-panel-toggle`），实测 **0ms 阻塞、无长任务**，而面板内容完全正常（Git/Files 两个 tab、100 行分支、可滚动、首行 `main`）。所以折叠既没有收益，也**没有把成本转移**到打开面板那一刻。

**处置**：默认值改动与配套新增测试**已还原**（`git checkout`），未入库——既然没有可测收益，就不为一个纯 UX 变更付代价（懒加载阶梯：这件事不必这么建）。默认保持展开。

**顺带记录（未做，供后续决策）**：`threadBranchOptions` 的唯一消费方就是右面板（只经 `:branches` / `:current-branch` 两个 props 传入），但它的加载时机在 `App.vue` 的 watch 里。若要再省，可把 `loadThreadBranches` 也挂在「面板可见」条件上；但按本轮数据，624KB 载荷的解析成本只有约 10–20ms（网络那 2.5s 是异步的、不阻塞主线程），且需要额外处理「用户打开面板时补拉」，**收益与复杂度不匹配**。

## 收尾验证说明

- `vue-tsc --noEmit`：**通过**（干净）。
- `pnpm run build:frontend` 等价命令（`vite build`）：**通过**，18.86s。
- 全量 Vitest：**658 例，656 通过 / 2 失败**——2 例为**既知 Windows 平台差异**（`codexAppServerBridge.archive.test.ts` 的 symlink realpath 与 `mode 0o600` vs `0o666`），与本轮无关，基线与 round-87 相同（658/656/2）。
- Playwright 断言：`scripts/check-branch-list-budget.cjs` **5/5 通过**；修改前后对照数据见上表。
- 性能审计（仓库硬性要求）：审计对象=分支列表渲染路径与线程打开路径；测量手段=生产构建 + 真实页面 + CDP CPU 采样/Chrome timeline + MutationObserver DOM 记账；**未测**：真实浏览器（非 headless）下的合成帧率、真实用户多线程工作区的 per-thread 冷开成本（本机 `CODEX_HOME` 只有 1 条真实线程，故「每条线程各付一次」是按机制推断而非实测）。
- 涉及文件：`src/components/content/RightGitPanel.vue`（改，主修复）、`src/components/content/ThreadConversation.vue`（改，`scrollToBottom` 早退）、`src/App.vue`（改，`getComputedStyle` 复用）、`scripts/profile-thread-switch.cjs`（改，探针扩展）、`scripts/check-branch-list-budget.cjs`（新增）；手测文档 `tests/git-worktrees-rollback/round-88-branch-list-render-window.md`（新增）。
- 复现路径：任意仓库级 `git/branches` 返回超过 100 个 refs 的工作区；`node scripts/check-branch-list-budget.cjs` 即可在改动回退时立刻失败。
