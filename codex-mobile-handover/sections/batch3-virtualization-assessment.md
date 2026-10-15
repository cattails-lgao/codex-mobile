# 批 3 前置评估：距底 API → 窗口化

> 状态：**评估完成（round-151）；批 3a 已落地（round-153）；批 3b 已落地（round-163）**。3c 未开工。所有行号对 `src/components/content/ThreadConversation.vue`
> 与 round-148 已落地的 `src/utils/turnVirtualizer.ts`。评估材料来自逐行读码，不含推测。

---

## 一、结论先行（三条）

**1. 批 3 不是「修 bug」，是「换地基」。**
我方当前**没有**「流式追加把列表顶走」的缺陷路径：贴底时走 `scrollToBottom()` 硬跳
（`scrollTop = scrollHeight`），非贴底时**完全不滚动**（新内容加在下方，视觉上本就不动）。
整页高度差补偿只出现在 `loadMoreAbove()`（`:1982-1992`），而那是**前置插入**——
ΔH 全部来自视口上方，整页差恰好等于插入高度，补偿是精确的。

⇒ round-148 那个对照证明（「按行锚定 vs 整页差」）说明的是**几何层更通用**，
不能读成「我方现有实现有错」。批 3 的价值在别处，见下条。

**2. 真正的收益是「长线程首屏成本」和「目标不在渲染集时的跳转」。**
现在 hot 区恒为 30 轮全量渲染、warm 区展开轮也全量渲染，DOM 规模随线程长度线性上升。

**3. 风险集中在**渲染集与 DOM 的耦合**，而这几处耦合是我方**有意建立**的不变式**
（见 §三），不是随手写的，所以不能「批量替换」了事。

---

## 二、我方现状（取证）

| 机制 | 位置 | 现状 |
|---|---|---|
| 贴底判定 | `isAtBottom()` `:1914` | ✅ **round-153 起**：`isScrollAtBottomPx(readScrollMetricsPx(container))`（阈值仍是 16，定义搬到 `utils/conversationScrollDistance.ts`） |
| 滚到底 | `scrollToBottom()` `:1901` | ✅ **round-153 起**：先判贴底并**提前返回**（省一次强制布局），再 `setScrollDistanceFromBottom(container, 0)`（距底坐标写入；**已不再调用 `scrollIntoView`**） |
| 贴底维持 | `scheduleBottomLock(frames=6)` `:1955` | 连打最多 6 帧 `enforceBottomState()`；图片 `load/error` 后补 3 帧 |
| 脱离阈值 | `autoFollowOutput` `:997` | 单一布尔；上滚即 `false`，`jumpToLatest()` 置回 `true` |
| 上翻补偿 | `loadMoreAbove()` `:1975` | `scrollTop = prevScrollTop + (scrollHeight - prevScrollHeight)` |
| 跳转到某轮 | `jumpToQuestion()` `:1262-1286` | **先展开目标轮 + 加 cold 页**（保证 DOM 存在），再 `getElementById` + `getBoundingClientRect` + `scrollTo({behavior:'smooth'})` |
| 消息高度测量 | —— | **不存在**（全树无 `ResizeObserver`、无高度缓存） |
| 分层 | `HOT_TURNS=30` `:1007` / `WARM_PAGE_SIZE=20` `:1008` | hot 全量 / warm 折叠卡 `WarmTurnCard.vue` / cold 未加载 |
| 几何层 | `src/utils/turnVirtualizer.ts` | 已落地 5 个纯函数，**零调用点**（round-148） |

---

## 三、三个必解（缺一个就不能上窗口化）

### 必解 1 — `scrollIntoView` 依赖锚点在 DOM 里

`scrollToBottom()` `:1911` 的 `anchor.scrollIntoView({block:'end'})` 要求
`bottomAnchorRef` 已渲染。窗口化后，若锚点在渲染窗口外，这次调用**静默无效**，
而 `scrollTop = scrollHeight` 那行仍会生效 ⇒ 「跳到一半」的中间态。

⇒ **改为距底坐标驱动**：`container.scrollTop = container.scrollHeight - distance`，
`distance` 由布局表算出（贴底态 = 0）。这也顺带甩掉 `scrollIntoView` 会**滚动祖先容器**
这个副作用（`:1905-1908` 的注释记着：右侧 Git 面板曾把文档撑到 3.2 万布局对象）。

### 必解 2 — `jumpToQuestion` 用 `getElementById` 找目标轮

`:1279` 的 `document.getElementById(questionAnchorId(turn))` 返回 null 时**静默 return**
（`:1280`）。现在没问题，因为 `:1273` 的 `warmLayerWithExpandedTurn` 保证目标轮进了渲染集；
窗口化后「渲染集 = 视口 ± overscan」，目标轮大概率在视口外 ⇒ DOM 不存在 ⇒ 跳转失效。

⇒ 必须改成**先算距底再滚**：`computeScrollDistanceForTurn(layout, turnKey, viewportHeightPx)`
（round-148 已实现+已测）。注意**语义差异**：现在是把目标轮**顶边对齐容器顶 + 12px**，
而 `computeScrollDistanceForTurn` 是**居中**。迁移时要选一种并固化成断言，不能含混过去。

### 必解 3 — DOM 结构不变式

- `<ul class="conversation-list">` 是**唯一滚动容器**（`:28`），且 `chatWidth` 等布局类挂在它上面。
  窗口化只能在它**内部**做占位，绝不能在内部再造一个滚动层。
- 该 `<ul>` **不能挂 `v-if`/`v-else`**（四不变式之一）。占位若要用条件渲染，
  只能作用在 `<li>` 上，或用 inline style。
- 上方占位建议用**第一个渲染 `<li>` 的 `margin-top`**（桌面端做法），
  而不是往 `<ul>` 里塞 `<div>` —— 后者破坏列表语义，也会被 `.conversation-item` 的选择器体系漏掉。

### 附带坑（不算必解，但会让人返工）

| 坑 | 位置 | 说明 |
|---|---|---|
| 图片补锁底 | `bindPendingImageHandlers()` `:2003` | `querySelectorAll('img.message-image-preview')` **只覆盖已渲染的图片**；窗口化后未渲染图片的 `load` 事件拿不到 ⇒ 高度晚到、贴底漂移 ⇒ 需要测量层兜底 |
| 展开折叠卡 | `expandedWarmTurns` `:1294` | 展开会**大幅改变该轮高度** ⇒ 必须重测并重算距底，否则视口跳 |
| 高度缓存无失效 | —— | 线程切换 / 回退 / 消息编辑都会让缓存失真 ⇒ 需要以 `activeThreadId` 为键整体失效 |
| 单页高度差补偿 | `:1992` | 窗口化后 `scrollHeight` 仍等于总高（外层撑高），这条**可以不动**；但要确认外层占位确实撑满了总高 |

---

## 四、高度估算策略：我们一轮有三种形态

这是批 3 最不确定的一环。三种形态的可预测性差别极大：

| 形态 | 高度 | 可预测性 | 依据 |
|---|---|---|---|
| **warm 折叠卡** | 近似常量 | **高** | `WarmTurnCard.vue`：head `min-h-[38px]` + `warm-turn__preview` 单行 `truncate` + `warm-turn__assistant` 单行 `truncate`。文本一律截断，**行数不随内容变化** |
| warm 已展开 | 不可预知 | 低 | 内部是完整消息渲染（含代码块/图片） |
| hot 全量 | 不可预知 | 低 | 同上 |

⇒ 结论：**只对「折叠态 warm 轮」窗口化**。这类轮在长线程里数量最多（正是要省的那部分），
而高度几乎恒定 ⇒ 估算误差小、锚定补偿稳。展开轮与 hot 轮退化为
「实测优先 → 兜底 `DEFAULT_ESTIMATED_HEIGHT_PX = 280`」（round-148 已实现该优先级）。

**折叠卡高度的精确值须实测确认**（本评估给的是算式，不是数字）：
`38(head min-h) + assistant 行高 + padding`，且 `toolCount > 0` 时 head 不变高（meta 在行内右侧）。

---

## 五、拆分与迁移顺序

批 3 必须拆三步走，每步独立可验证：

| 步骤 | 内容 | 风险 | 可测性 |
|---|---|---|---|
| **3a** ✅ **已落地（round-153）** | 距底读写辅助（`getScrollDistanceFromBottomPx` / `getScrollTopForDistanceFromBottomPx` / `readScrollMetricsPx`），把 `isAtBottom` / `scrollToBottom`（`applyConversationScrollState` 经前者）改走它；并顺带移除 `scrollIntoView`（容器落点等价，甩掉「滚动祖先容器」的副作用） | **低**（行为等价：贴底判据仍是 ≤16px） | 已验：32 例单测（含对照扫描）+ 闸门 58/58（五路反跑）；浏览器实测待做，见 §八 |
| **3b** ✅ **已落地（round-163）** | **折叠态 warm 轮窗口化**（hot 轮与展开轮保持全量） | 中 | 已实测：跳转落点 12px 精确、滑动 scrollHeight 逐位守恒、展开/折叠/贴底全过（见 §九） |
| **3c** | hot 轮窗口化 | **高** | 需实测高度分布，且必解 1/2 必须先落地 |

**3a 不能单独上线**：它是行为等价重构，单独看零收益，价值全在于给 3b 铺路。
但 3a 是**唯一能在无浏览器环境验证**的一步（纯函数 + 现有 929 例不退化）。

---

## 六、明确不搬（沿用判定书 §六）

- `flex-col-reverse` + `[overflow-anchor:none]` 的**滚动方向反转**：回归风险 > 收益
- 桌面端渲染层常量（gap 12 / 视口兜底 800 / overscan 2 / 收敛 8 轮 / 贴底 24px）：
  依赖桌面端的 DOM 结构，搬过来要重新实测
- `virtualized-turn-list` 的 28.7KB 实现：它与桌面端的分组层深度耦合，我方分组层不同构

---

## 七、若只做一件事

**先测「折叠卡实测高度 vs 估算高度」的偏差**，一行代码（临时往 `WarmTurnCard` 挂个
`ResizeObserver` 打日志）就能回答。这一条数据决定 3b 是「低风险」还是「又一个 round-143」：

- 偏差 ≤ 2px ⇒ 3b 可以直接上
- 偏差大 ⇒ 说明「单行截断」这个前提不成立（例如 CJK 换行、字体回退），要重新设计估算

---

## 八、批 3a 已落地（round-153）

- 新增 `src/utils/conversationScrollDistance.ts` + **32 例**单测（含**对照扫描**：8 高度 × 6 视口 ×
  16 个 `scrollTop` 候选，三条断言各 >500 例；对照基准**不 import 被测代码**，否则恒真）。
- 组件读侧 / 写侧改走距底坐标；**移除 `scrollIntoView`**。
- 等价性论证：`.conversation-list` 是 `py-0`、底部锚点是末位 `h-px` ⇒ 容器落点逐位相同；
  去掉的是「滚动祖先容器」这个已知有害副作用（原注释记的 Git 面板曾把文档撑到 3.2 万布局对象）。
- **待人工浏览器验证**（3a 的定位就是「无浏览器可验证的一步」，这是它唯一外溢的行为改动）：
  真机「滚到底 / 上翻加载 / 图片晚到补锁底」三种场景下列表落点与 round-152 之前一致。
- 详见 [round-153](../rounds/round-153-scroll-distance-batch3a.md)。

## 九、批 3b 已落地（round-163）

- **§七 判决执行**：真机实测折叠卡高度是**精确常量**——68.5px（带 assistant 预览行）/ 42px（纯 head），
  与文本长度无关（truncate 成立）；时间分隔栏 34、冷区按钮 54、gap 恒 12 ⇒ 偏差 0，「低风险」成立。
  注意是**分数** 68.5：整值 69 会让窗口滑动时每卡累计 +0.5px 漂移（实测 14 卡 7px）。
- **实现**：`src/utils/warmTurnWindow.ts`（纯函数，21 例单测）+ `ThreadConversation.vue` 接线（+162/−1）。
  必解 1 已由 3a 消解；必解 2 由「**展开块强制入窗**」消解（jumpToQuestion 必展开目标轮 ⇒ 锚点必在 DOM，
  getElementById 语义原样保留，无需布局算距）；DOM 不变式守住了：占位走 `<li>`（含 shrink-0 ——
  空 li 在 flex-col 滚动容器里会被 flex 压成 0 高，实测踩到），窗顶 margin 挂块首 li。
- **真机验证**（隔离 home + 合成 60 轮 + 真实 Edge headless）：贴底 20 卡 → 渲染 1 张（margin 1660.5）、
  dist=0；滑动扫描 22 档 scrollHeight 恒 9210（与全量基线**逐位相等**）；JumpBar 跳 cold 区第 0 轮落点
  12px 精确；展开/折叠往返视口不跳；「跳到最新」dist=0；pageerror 0。
- **§二 附属坑的处置**：图片补锁底（bindPendingImageHandlers）本轮**未动**——hot 区与展开块恒在 DOM，
  折叠卡内无图片，现状覆盖面不变；展开折叠卡重算（expandedWarmTurns 变更 → watch → rAF 重算窗口）已接线；
  高度缓存**无需建**（常量精确 + 展开块恒在 DOM，没有会失真的缓存）。
- 详见 [round-163](../rounds/round-163-warm-collapsed-windowing.md)。

## 十、锁底窗口已确定化（round-164）

- §五 遗留的「⚠️ 无 `ResizeObserver`，补锁底只靠 `scheduleBottomLock(3)` 的 rAF 帧窗口」
  与 round-155 那次「图到达后没回锁」（未复现）——本轮**机制性根治**：ResizeObserver
  （容器 + 全部直接子元素）+ MutationObserver（childList 补观察集），只在 `shouldLockToBottom()`
  时回锁；图片 load/error 快路径与帧锁保留。
- 新闸门 `scripts/check-bottom-lock.cjs`：4 场景（贴底回锁 / 滚开不拽人 / **反跑 stub 复现漏锁** /
  恢复复锁），反跑证明非空。评估文档里「需要测量层兜底」的缺口就此闭合。
- 详见 [round-164](../rounds/round-164-bottom-lock-determinism.md)。
