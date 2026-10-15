// 批 3b（round-163）：折叠态 warm 轮窗口化 —— 纯函数层。
//
// 目标：warm 区（折叠摘要卡）不再全量渲染，只渲染视口 ± overscan 内的块；
// 被跳过的块用「margin-top（窗顶）/ 占位 li（窗底）」补回高度，使容器
// scrollHeight 与全量渲染时逐位一致（被跳过的块都是折叠卡 ⇒ 高度是常量）。
//
// 高度常量全部来自 round-163 真机实测（真实 Edge headless、1440×950、dpr 1、
// 合成 60 轮线程经 normalizeThreadMessagesV2 全管线渲染），复测方法：
//   CODEX_HOME=<空目录> node scripts/dev.cjs --port 5173 --strictPort
//   + tmp/r163-harness.js（拦 thread/read 回 60 轮合成线程）→ window.__R163_MEASURE()
// 实测读数：折叠卡（带 assistant 预览行）69 / 纯 head 42（与文本长度无关，truncate
// 生效）；时间分隔栏 34；冷区按钮 54；相邻 li 间隙恒等于列表 gap（`gap-2 sm:gap-3`）。
// ⇒ 估算误差为 0，「近似常量」前提成立（评估 §七 的判决条件）。

// ---------------------------------------------------------------------------
// 实测常量（换字体 / 字号 / 缩放后须复测；偏差会表现为跳转落点与窗口边界的软漂移）
// ---------------------------------------------------------------------------

/** 折叠卡：head + assistant 预览行（`.warm-turn__assistant` 存在时）。
 *  **分数值**：真实布局高度 68.5px（offsetHeight 取整成 69）——spacer/常量按 69 计
 *  会在窗口滑动时每卡累计 +0.5px 的 scrollHeight 漂移（round-163 验证 A 扫描实测 14 卡 7px），
 *  用分数常量后逐位守恒。 */
export const WARM_CARD_HEIGHT_WITH_PREVIEW_PX = 68.5
/** 折叠卡：纯 head（无 assistant 预览行）。实测 42.0 整。 */
export const WARM_CARD_HEIGHT_HEAD_ONLY_PX = 42
/** 时间分隔栏 li（`conversation-item-time-divider`）。 */
export const TIME_DIVIDER_HEIGHT_PX = 34
/** 模型切换分割栏 li。round-166 真机实测 30.0（1440×900 / dpr 1，真实大线程探针
 *  经 localStorage 播种 round-73 marker 量得；round-163 曾登记 44 为未实测估算，
 *  估算偏大 14px/条，表现为窗口滑动时贴底落点 +14px 漂移）。 */
export const MODEL_SWITCH_DIVIDER_HEIGHT_PX = 30
/** 展开轮兜底估算（展开轮恒被强制入窗、以真实 DOM 参与布局，此值只影响窗口边界选取）。 */
export const EXPANDED_TURN_ESTIMATED_HEIGHT_PX = 280

export interface WarmBlockSpec {
  /** warm 轮序号（turnGroups 下标），仅用于调用方对齐，本模块不解释其含义。 */
  turn: number
  /** false = 已展开（强制入窗，真实高度在 DOM 里）。 */
  collapsed: boolean
  /** 本块是否以时间分隔栏 li 开头。 */
  hasTimeDivider: boolean
  /** 本块开头附加的模型切换分割栏 li 数（leadingDividers）。 */
  leadingModelSwitchCount: number
  /** 本块末尾附加的模型切换分割栏 li 数（turn.dividers）。 */
  trailingModelSwitchCount: number
  /** 折叠卡是否带 assistant 预览行。 */
  hasAssistantPreview: boolean
}

/** 单块估算高度（含块内 li 间隙；块与块之间的列表 gap 由调用处统一加）。 */
export function estimateWarmBlockHeightPx(spec: WarmBlockSpec, gapPx: number): number {
  if (!spec.collapsed) return EXPANDED_TURN_ESTIMATED_HEIGHT_PX
  let height = spec.hasAssistantPreview
    ? WARM_CARD_HEIGHT_WITH_PREVIEW_PX
    : WARM_CARD_HEIGHT_HEAD_ONLY_PX
  if (spec.hasTimeDivider) height += TIME_DIVIDER_HEIGHT_PX + gapPx
  height += spec.leadingModelSwitchCount * (MODEL_SWITCH_DIVIDER_HEIGHT_PX + gapPx)
  height += spec.trailingModelSwitchCount * (MODEL_SWITCH_DIVIDER_HEIGHT_PX + gapPx)
  return height
}

export interface WarmBlockLayout {
  /** 每块估算高度（含块内间隙，不含块间 gap）。 */
  heightsPx: number[]
  /** 每块**顶边**距 warm 区底部的距离（距底坐标系，整体递减）。 */
  topDistancesFromBottomPx: number[]
  /** 每块**底边**距 warm 区底部的距离。 */
  bottomDistancesFromBottomPx: number[]
  /** warm 区总高（含块间 gap）。 */
  totalHeightPx: number
}

/** 把块列表铺成距底坐标布局（warm 区自成一稿，底部与 hot 区交界处无 gap —— gap 属于交界两侧各自 DOM 的一部分，见 spacer 公式）。 */
export function buildWarmBlockLayout(
  specs: readonly WarmBlockSpec[],
  gapPx: number,
): WarmBlockLayout {
  const heightsPx = specs.map((spec) => estimateWarmBlockHeightPx(spec, gapPx))
  // topDistances[i] = Σ_{j>i} (heights[j] + gap)；末块的顶边距底 = 自身高度。
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
    // acc = Σ(h_i + gap)，含末块之后多加的那一个 gap ⇒ 总高 = acc − gap（空表特判 0）。
    totalHeightPx: specs.length === 0 ? 0 : acc - gapPx,
  }
}

export interface WarmVisibleWindowOptions {
  specs: readonly WarmBlockSpec[]
  gapPx: number
  /**
   * 视口**底边**距 warm 区底部的距离（未钳位：可负 —— 视口已滚进 hot 区；
   * 可超过 totalHeightPx —— warm 区整体在视口下方）。
   * 取法：`warmBottomScrollY − (scrollTop + clientHeight)`，warmBottomScrollY
   * 来自热区首块顶边的实时 DOM 锚（live anchor，见组件侧注释）。
   */
  viewportBottomDistancePx: number
  viewportHeightPx: number
  /** 上下各多留多少像素的块。 */
  overscanPx: number
}

export interface WarmVisibleWindow {
  /** 首个渲染块下标（含）。 */
  first: number
  /** 末个渲染块下标（含）。 */
  last: number
}

/**
 * 由视口位置推出要渲染的块区间（双端闭区间）。
 * 与桌面端 `computeVisibleRange` 的两点不同（都是刻意偏离）：
 *  1. 不把 viewport 距离钳进 [0, total] —— warm 区只是整页的一段，视口完全落进
 *     hot 区（贴底时）或完全在其上方都是合法状态，此时窗口取「离视口最近的一块」；
 *  2. 展开块强制入窗（它们是真实 DOM 的一部分，跳过会同时破坏锚点存在性与
 *     scrollHeight 一致性 —— round-163 §设计）。
 * 块数为 0 时返回 { first: 0, last: -1 }（空窗口）。
 */
export function computeWarmVisibleWindow({
  gapPx,
  overscanPx,
  specs,
  viewportBottomDistancePx,
  viewportHeightPx,
}: WarmVisibleWindowOptions): WarmVisibleWindow {
  const count = specs.length
  if (count === 0) return { first: 0, last: -1 }

  const layout = buildWarmBlockLayout(specs, gapPx)
  const viewportTop = viewportBottomDistancePx + viewportHeightPx
  const lower = viewportBottomDistancePx - overscanPx // 视口下边界（再往下 overscan）
  const upper = viewportTop + overscanPx // 视口上边界（再往上 overscan）

  // 块 i 与 [lower, upper] 相交 ⇔ bottomDist[i] <= upper && topDist[i] >= lower
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
    // 视口与 warm 区不相交：取离视口最近的一块（保证至少渲染一块，
    // 使「窗顶 margin 挂在真实 li 上」这条路永远有载体）。
    if (lower > layout.totalHeightPx) {
      // warm 区整体在视口下方 ⇒ 最近的是首块。
      first = 0
      last = 0
    } else {
      // warm 区整体在视口上方（贴底滚动时）⇒ 最近的是末块。
      first = count - 1
      last = count - 1
    }
  }

  // 展开块强制入窗。
  for (let i = 0; i < count; i += 1) {
    if (specs[i]?.collapsed === false) {
      if (i < first) first = i
      if (i > last) last = i
    }
  }

  return { first, last }
}

export interface WarmSpacerOptions {
  specs: readonly WarmBlockSpec[]
  gapPx: number
  window: WarmVisibleWindow
}

export interface WarmSpacerPlan {
  /** 窗顶 margin-top：挂在首个渲染块的第一条 li 上。无跳过块时为 0。 */
  topMarginPx: number
  /** 窗底占位 li 高度：插在末个渲染块之后。无跳过块时为 0。 */
  bottomSpacerPx: number
  /** 语义下标（组件模板用它决定把 margin 挂到哪条 li / 是否渲染占位 li）。 */
  skippedAbove: number
  skippedBelow: number
}

/**
 * 由窗口两端算补高度。
 *
 * 推导（块间 flex gap = g，块高 h_i，跳过 k 块）。关键数一遍 gap：
 * 被跳过的 k 块夹在「外侧元素」与「首/末渲染块」之间，全渲染时这条链上有
 * **k+1 个 gap**（外→b1, b1→b2, …, bk→渲染块）。
 * - 窗顶（外侧是冷区按钮/加载更多，或列表顶）：margin 直接替换整条链——
 *   有锚时实际距离 = g(锚→首块) + margin；无锚时 = margin。
 *   要求距离分别为 Σh + (k+1)g 与 Σh + k·g ⇒ 两种情况都是 **margin = Σh + k·g**。
 * - 窗底（占位 li 两侧各剩一个 gap）：要求 = Σh + (k+1)g；实际 = H + 2g
 *   ⇒ **H = Σh + (k−1)·g**（k=1 时 H = h，正值）。
 * 两个公式都只依赖「被跳过的块全是折叠卡（高度是常量）」—— 展开块恒在窗内，
 * 不进入被跳过集合（computeWarmVisibleWindow 的强制入窗保证）。
 */
export function computeWarmSpacers({
  gapPx,
  specs,
  window,
}: WarmSpacerOptions): WarmSpacerPlan {
  const layout = buildWarmBlockLayout(specs, gapPx)
  const count = specs.length
  const { first, last } = window
  const skippedAbove = Math.max(0, first)
  const skippedBelow = Math.max(0, count - 1 - last)

  let topMarginPx = 0
  if (skippedAbove > 0) {
    let sum = 0
    for (let i = 0; i < skippedAbove; i += 1) sum += layout.heightsPx[i]
    topMarginPx = sum + skippedAbove * gapPx
  }

  let bottomSpacerPx = 0
  if (skippedBelow > 0) {
    let sum = 0
    for (let i = last + 1; i < count; i += 1) sum += layout.heightsPx[i]
    // 防御钳位：常量保证 h ≥ 42 > 2·gap（gap ∈ {8, 12}），理论上不会出现负值；
    // 万一未来常量被改动后跌破，宁可少补（表现为贴底附近落点轻微漂移）也不写负高度。
    bottomSpacerPx = Math.max(0, sum + (skippedBelow - 1) * gapPx)
  }

  return { topMarginPx, bottomSpacerPx, skippedAbove, skippedBelow }
}

export interface PlanWarmWindowOptions extends Omit<WarmVisibleWindowOptions, 'specs'> {
  specs: readonly WarmBlockSpec[]
}

export interface WarmWindowPlan {
  window: WarmVisibleWindow
  spacers: WarmSpacerPlan
  layout: WarmBlockLayout
}

/** 一次算全（组件每个 rAF 只调这一个）。 */
export function planWarmWindow({
  gapPx,
  overscanPx,
  specs,
  viewportBottomDistancePx,
  viewportHeightPx,
}: PlanWarmWindowOptions): WarmWindowPlan {
  const layout = buildWarmBlockLayout(specs, gapPx)
  const window = computeWarmVisibleWindow({
    gapPx,
    overscanPx,
    specs,
    viewportBottomDistancePx,
    viewportHeightPx,
  })
  const spacers = computeWarmSpacers({ gapPx, specs, window })
  return { window, spacers, layout }
}
