# 批 3 前置评估：距底 API → 窗口化

> 状态：**评估完成，未开工**（round-151）。所有行号对 `src/components/content/ThreadConversation.vue`
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
| 贴底判定 | `isAtBottom()` `:1914` | `scrollHeight - (scrollTop + clientHeight) <= 16`（`BOTTOM_THRESHOLD_PX` `:998`） |
| 滚到底 | `scrollToBottom()` `:1901` | 先判贴底并**提前返回**（省一次强制布局），再 `scrollTop = scrollHeight` + `anchor.scrollIntoView({block:'end'})` |
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
| **3a** | 距底读写辅助（`getScrollDistanceFromBottomPx` / `setScrollDistanceFromBottomPx`），把 `isAtBottom` / `scrollToBottom` / `applyConversationScrollState` 改走它 | **低**（行为等价：贴底判据仍是 ≤16px） | 纯函数单测 + 现有 e2e 不变 |
| **3b** | **折叠态 warm 轮窗口化**（hot 轮与展开轮保持全量） | 中 | 需浏览器实测：跳转、回退、上翻加载 |
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
