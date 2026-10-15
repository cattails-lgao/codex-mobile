// 批 3c（round-165）：hot 轮窗口化 —— 纯函数层。
//
// 与批 3b（warmTurnWindow.ts）同构的「块窗口」机制，但高度来源不同：
//  · 3b 折叠卡高度是**实测常量**（69 / 42，真机偏差 0）⇒ spacer 逐位守恒；
//  · 3c hot 轮高度**不可预估**（完整消息渲染：代码块/图片/长文本）⇒ 高度来自
//    **实测缓存**（组件侧 ResizeObserver，round-164 的内容观察器兼任测量层）。
//
// 关键不变式（与 3b 一致）：
//  · 只有「已测块」才允许被跳过 —— 未测块（measuredHeightPx === undefined）
//    强制入窗（真实 DOM 参与布局），**绝不进入 spacer 求和**；
//    因此 spacer 的输入永远是真实测量值，scrollHeight 与全量渲染一致
//    （子像素容差：浏览器 LayoutUnit 1/64px，测量值已是快照后的 double）。
//  · 贴底态无需特殊处理：spacer 守恒 ⇒ 贴底判定（≤16px）与距底写入原样工作。
//  · 强制入窗同时保证 jumpToQuestion 的 getElementById 语义（锚点在目标轮内）。
//
// 坐标约定：hot 区**底边** = 底部锚 li（恒在 DOM）顶边再减一个 gap；
// 组件侧用 bottomAnchorRef 实时量取，不依赖 scrollHeight 算术
// （LiveOverlayItem 位于 hot 区与底锚之间 ⇒ 其高度天然被排除在 hot 区之外）。

export const DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX = 280

export interface HotBlockSpec {
  /** hot 轮 key（`turn-<首条 user 消息 id>`，跨追加稳定）。 */
  key: string
  /** 实测高度；undefined = 未测（强制入窗，不参与 spacer 求和）。 */
  measuredHeightPx?: number
}

export interface HotBlockLayout {
  /** 每块布局高度（未测块用兜底估算，只影响窗口边界选取；含块内间隙）。 */
  heightsPx: number[]
  /** 每块**顶边**距 hot 区底部的距离（距底坐标系，整体递减）。 */
  topDistancesFromBottomPx: number[]
  /** 每块**底边**距 hot 区底部的距离。 */
  bottomDistancesFromBottomPx: number[]
  /** hot 区总高（含块间 gap）。 */
  totalHeightPx: number
}

/** 把块列表铺成距底坐标布局（hot 区自成一稿；块间 gap 由本函数统一计）。 */
export function buildHotBlockLayout(
  specs: readonly HotBlockSpec[],
  gapPx: number,
): HotBlockLayout {
  const heightsPx = specs.map((spec) =>
    spec.measuredHeightPx ?? DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX,
  )
  const topDistancesFromBottomPx: number[] = new Array(specs.length)
  let acc = 0
  for (let i = specs.length - 1; i >= 0; i -= 1) {
    topDistancesFromBottomPx[i] = acc + heightsPx[i]
    acc += heightsPx[i] + gapPx
  }
  return {
    heightsPx,
    topDistancesFromBottomPx,
    bottomDistancesFromBottomPx: topDistancesFromBottomPx.map(
      (top, i) => top - heightsPx[i],
    ),
    totalHeightPx: specs.length === 0 ? 0 : acc - gapPx,
  }
}

export interface HotVisibleWindowOptions {
  specs: readonly HotBlockSpec[]
  gapPx: number
  /**
   * 视口**底边**距 hot 区底部的距离（未钳位：贴底时 ≈ −(1+gap)，
   * 视口滚进 warm 区时为正大值）。
   * 取法：`hotBottomScrollY − (scrollTop + clientHeight)`，
   * hotBottomScrollY 来自 bottomAnchorRef 实时锚（见文件头注释）。
   */
  viewportBottomDistancePx: number
  viewportHeightPx: number
  overscanPx: number
  /** 额外强制入窗的块 key（跳转目标等）。 */
  forcedKeys?: ReadonlySet<string>
}

export interface HotVisibleWindow {
  first: number
  last: number
}

/**
 * 由视口位置推出要渲染的块区间（双端闭区间）。
 * 与 3b 的两点不同：
 *  1. 未测块（measuredHeightPx === undefined）强制入窗 —— 它们没有可信高度，
 *     跳过即破坏 scrollHeight 守恒（3b 里对应「展开块强制入窗」）；
 *  2. forcedKeys（跳转目标）强制入窗。
 * 视口与 hot 区不相交时取离视口最近的一块（保证窗口非空、占位 li 永远有挂点）。
 * 块数为 0 时返回 { first: 0, last: -1 }。
 */
export function computeHotVisibleWindow({
  forcedKeys,
  gapPx,
  overscanPx,
  specs,
  viewportBottomDistancePx,
  viewportHeightPx,
}: HotVisibleWindowOptions): HotVisibleWindow {
  const count = specs.length
  if (count === 0) return { first: 0, last: -1 }

  const layout = buildHotBlockLayout(specs, gapPx)
  const viewportTop = viewportBottomDistancePx + viewportHeightPx
  const lower = viewportBottomDistancePx - overscanPx
  const upper = viewportTop + overscanPx

  let first = -1
  let last = -1
  for (let i = 0; i < count; i += 1) {
    const bottom = layout.bottomDistancesFromBottomPx[i]
    const top = layout.topDistancesFromBottomPx[i]
    if (bottom <= upper && top >= lower) {
      if (first < 0) first = i
      last = i
    }
  }

  if (first < 0) {
    if (lower > layout.totalHeightPx) {
      first = 0
      last = 0
    } else {
      first = count - 1
      last = count - 1
    }
  }

  // 强制入窗：未测块 + 调用方指定的 key。
  for (let i = 0; i < count; i += 1) {
    const spec = specs[i]
    if (spec.measuredHeightPx === undefined || forcedKeys?.has(spec.key)) {
      if (i < first) first = i
      if (i > last) last = i
    }
  }

  return { first, last }
}

export interface HotSpacerOptions {
  specs: readonly HotBlockSpec[]
  gapPx: number
  window: HotVisibleWindow
}

export interface HotSpacerPlan {
  /** 窗顶占位 li 高度：插在哨兵 li 与首个渲染块之间。无跳过块时为 0。 */
  topSpacerPx: number
  /** 窗底占位 li 高度：插在末个渲染块之后（底部锚 li 之前）。无跳过块时为 0。 */
  bottomSpacerPx: number
  skippedAbove: number
  skippedBelow: number
}

/**
 * 由窗口两端算补高度。
 *
 * 与 3b 的差异：3b 窗顶用「首渲染块首条 li 的 margin-top」，但 hot 块的首条 li
 * 可能是 ThreadTurn 根元素（组件双根模板，attr 无法透传）⇒ hot 统一用**占位 li**。
 * 推导（块间 flex gap = g，跳过 k 块）：被跳过块夹在「外侧元素」与「首/末渲染块」
 * 之间，全渲染链上有 **k+1 个 gap**。
 * - 窗顶占位（外侧 = 哨兵 li，恒在 DOM）：要求 = Σh + (k+1)g；
 *   实际 = H + 2g（占位两侧各一个 gap）⇒ **H = Σh + (k−1)·g**（k=1 时 H = h）。
 * - 窗底占位（外侧 = 底部锚 li，恒在 DOM）：同构 ⇒ **H = Σh + (k−1)·g**。
 * 被跳过的块必已测（computeHotVisibleWindow 强制入窗保证）⇒ Σh 全是实测值。
 */
export function computeHotSpacers({
  gapPx,
  specs,
  window,
}: HotSpacerOptions): HotSpacerPlan {
  const layout = buildHotBlockLayout(specs, gapPx)
  const count = specs.length
  const { first, last } = window
  const skippedAbove = Math.max(0, first)
  const skippedBelow = Math.max(0, count - 1 - last)

  let topSpacerPx = 0
  if (skippedAbove > 0) {
    let sum = 0
    for (let i = 0; i < skippedAbove; i += 1) sum += layout.heightsPx[i]
    topSpacerPx = Math.max(0, sum + (skippedAbove - 1) * gapPx)
  }

  let bottomSpacerPx = 0
  if (skippedBelow > 0) {
    let sum = 0
    for (let i = last + 1; i < count; i += 1) sum += layout.heightsPx[i]
    // 被跳过的都是已测块；实测高度理论上 ≥ 单行 head（~42px），不会跌破 2·gap。
    // 防御钳位与 3b 同款：宁可少补（贴底附近轻微漂移）也不写负高度。
    bottomSpacerPx = Math.max(0, sum + (skippedBelow - 1) * gapPx)
  }

  return { topSpacerPx, bottomSpacerPx, skippedAbove, skippedBelow }
}

export interface PlanHotWindowOptions extends Omit<HotVisibleWindowOptions, 'specs'> {
  specs: readonly HotBlockSpec[]
}

export interface HotWindowPlan {
  window: HotVisibleWindow
  spacers: HotSpacerPlan
  layout: HotBlockLayout
}

/** 一次算全（组件每个 rAF 只调这一个）。 */
export function planHotWindow({
  forcedKeys,
  gapPx,
  overscanPx,
  specs,
  viewportBottomDistancePx,
  viewportHeightPx,
}: PlanHotWindowOptions): HotWindowPlan {
  const layout = buildHotBlockLayout(specs, gapPx)
  const window = computeHotVisibleWindow({
    forcedKeys,
    gapPx,
    overscanPx,
    specs,
    viewportBottomDistancePx,
    viewportHeightPx,
  })
  const spacers = computeHotSpacers({ gapPx, specs, window })
  return { window, spacers, layout }
}
