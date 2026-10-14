// 聊天列表几何层（纯函数）：移植自 Codex 桌面端 `webview/assets/thread-virtualizer-*.js`
// （2131 B，零 React / 零 DOM / 零状态）。
//
// round-148：批 0 —— **只落地、不接线**。见
// `codex-mobile-handover/sections/desktop-parity-decision.md`。
//
// 核心坐标是「距底距离」（distanceFromBottomPx），不是 scrollTop：
// 该坐标系下，一行在列表中的位置只由「它下面有多少内容」决定，与上方无关。
// 因此「上方插入/折叠」能用**按行锚定**精确补偿，而我们现在用的
// `scrollTop += (scrollHeight - prevScrollHeight)` 是整页高度差 —— 底部同时在增长时
// （流式输出）会连底部的增量一起补掉，表现为视口跳一下。这正是本模块存在的理由。
//
// 语义严格对齐桌面端原实现（含两个二分查找的方向与边界）；唯一有意的偏离见
// `buildLayout` 里 `Number.isFinite` 那处注释。

/** 兜底估算高度：实测与声明都拿不到时使用（对齐桌面端常量 280）。 */
export const DEFAULT_ESTIMATED_HEIGHT_PX = 280

/** 几何层的一行：我方为「一轮」（turn），key 取 `turn.key`。 */
export interface VirtualizerEntry {
  /** 稳定标识；同一份 layout 内必须唯一。 */
  turnKey: string
  /** 标记为 `'gap'` 的行会被登记进 `TurnLayout.gapKeys`（纯占位行）。 */
  type?: string
  /** 尚未实测时的声明估算高度。 */
  estimatedHeightPx?: number
  /** 高度下限：流式中内容仍在长，不允许比已知高度更矮。 */
  minHeightPx?: number
  /** 覆盖全局 `gapPx` 的行前间距（显式 0 生效）。 */
  gapBeforePx?: number
}

export interface TurnLayout {
  /** 距底坐标系：每行**底边**距列表底部的距离（整体递减，末行最小）。 */
  bottomOffsetsPx: number[]
  /** 沿用输入的折叠策略，供 `computeVisibleRange` 走特例分支。 */
  collapseEmptyRows: boolean
  /** `type === 'gap'` 的行 key。 */
  gapKeys: Set<string>
  /** 每行的实际生效前置间距。 */
  gapsBeforePx: number[]
  /** 每行的实际生效高度（已做 DPR 对齐）。 */
  heightsPx: number[]
  /** 距顶坐标系：每行**顶边**偏移，已含该行自身的前置间距。 */
  topOffsetsPx: number[]
  /** 列表总高 = 各行高度 + 各行前置间距（首行间距按规则为 0）。 */
  totalHeightPx: number
  /** turnKey → 行下标。 */
  turnIndexByKey: Map<string, number>
  /** 行顺序（与 entries 同序）。 */
  turnKeys: string[]
}

export interface BuildLayoutOptions {
  entries: readonly VirtualizerEntry[]
  /** 行前统一间距；首行按规则不产生间距。 */
  gapPx: number
  /** 实测高度表（key 为 turnKey）。优先级：实测 > 声明估算 > 兜底 280。 */
  measuredHeightsByKey?: Readonly<Record<string, number | undefined>>
  /** 设备像素比（`window.devicePixelRatio`）；非空时高度与间距对齐到物理像素，避免半像素抖动。 */
  pixelScale?: number | null
  /** true 时空行（高度 0）不产生间距，也不产生前导间距。 */
  collapseEmptyRows?: boolean
}

/**
 * 构建整份列表布局。
 *
 * 高度取值：`max(minHeightPx ?? 0, 实测 ?? 估算 ?? 280)`，再做 DPR 对齐。
 * 间距规则：`collapseEmptyRows` 为假时，除首行外一律取 `gapBeforePx ?? gapPx`；
 * 为真时仅在「其上方已有非零高度内容」且「本行高度 > 0」时才产生间距。
 */
export function buildLayout({
  collapseEmptyRows = false,
  entries,
  gapPx,
  measuredHeightsByKey,
  pixelScale,
}: BuildLayoutOptions): TurnLayout {
  const gapKeys = new Set<string>()
  const gapsBeforePx: number[] = []
  const heightsPx: number[] = []
  const topOffsetsPx: number[] = []
  const turnIndexByKey = new Map<string, number>()
  const turnKeys: string[] = []
  let offset = 0

  for (const [index, entry] of entries.entries()) {
    const { turnKey } = entry
    const measured = measuredHeightsByKey?.[turnKey]
    // 桌面端此处直接取 `measuredHeightsByKey[turnKey]`。这里多一道有限性判断：
    // 脏值（字符串 / 对象 / NaN）会让 totalHeightPx 变成 NaN，进而整页算不出可见区间、
    // 渲染成空白 —— 退回估算值比整页空白好得多。合法输入下行为与桌面端逐位一致。
    let height = Math.max(
      entry.minHeightPx ?? 0,
      typeof measured === 'number' && Number.isFinite(measured)
        ? measured
        : entry.estimatedHeightPx ?? DEFAULT_ESTIMATED_HEIGHT_PX,
    )
    if (pixelScale != null) height = Math.round(height * pixelScale) / pixelScale

    const shouldApplyGap = collapseEmptyRows ? offset > 0 && height > 0 : index > 0
    let gap = shouldApplyGap ? entry.gapBeforePx ?? gapPx : 0
    if (pixelScale != null) gap = Math.round(gap * pixelScale) / pixelScale

    offset += gap
    gapsBeforePx.push(gap)
    if (entry.type === 'gap') gapKeys.add(turnKey)
    turnIndexByKey.set(turnKey, index)
    turnKeys.push(turnKey)
    topOffsetsPx.push(offset)
    heightsPx.push(height)
    offset += height
  }

  const totalHeightPx = offset
  return {
    // bottomOffset = 总高 − 顶边偏移 − 本行高度，即本行底边距列表底部的距离。
    bottomOffsetsPx: topOffsetsPx.map((top, index) => totalHeightPx - top - (heightsPx[index] ?? 0)),
    collapseEmptyRows,
    gapKeys,
    gapsBeforePx,
    heightsPx,
    topOffsetsPx,
    totalHeightPx,
    turnIndexByKey,
    turnKeys,
  }
}

export interface VisibleRange {
  startIndex: number
  /** 开区间上界。 */
  endIndex: number
}

export interface ComputeVisibleRangeOptions {
  /** 视口**底边**距列表底部的距离。贴底时为 0。 */
  distanceFromBottomPx: number
  layout: TurnLayout
  /** 上下各多渲几行，避免滚动时出现空白。 */
  overscanCount: number
  viewportHeightPx: number
}

/**
 * 由距底距离推出需要渲染的行区间。
 *
 * 两次手写二分（对齐桌面端 `o()` / `s()`）：
 * - `firstIndexBelowBottomOffset`：首个「底边低于视口顶边」的行 ⇒ 起始下标；
 * - `firstIndexWithTopAbove`：首个「顶边不高于视口底边」的行 ⇒ 结束下标（开区间）。
 * 每帧 O(log n)，不做线性遍历。
 */
export function computeVisibleRange({
  distanceFromBottomPx,
  layout,
  overscanCount,
  viewportHeightPx,
}: ComputeVisibleRangeOptions): VisibleRange {
  if (layout.turnKeys.length === 0) return { startIndex: 0, endIndex: 0 }

  const viewportBottomPx = Math.min(Math.max(0, distanceFromBottomPx), layout.totalHeightPx)
  const viewportTopPx = Math.min(viewportBottomPx + Math.max(0, viewportHeightPx), layout.totalHeightPx)

  const startCandidate = layout.collapseEmptyRows && viewportTopPx === layout.totalHeightPx
    ? 0
    : firstIndexBelowBottomOffset(layout.bottomOffsetsPx, viewportTopPx)
  const endCandidate = layout.collapseEmptyRows && viewportBottomPx === 0
    ? layout.turnKeys.length
    : firstIndexWithTopAbove(layout.bottomOffsetsPx, layout.heightsPx, viewportBottomPx)

  return {
    startIndex: Math.max(0, startCandidate - overscanCount),
    endIndex: Math.min(
      layout.turnKeys.length,
      Math.max(endCandidate, startCandidate + 1) + overscanCount,
    ),
  }
}

export interface GetRangeForAnchorOptions {
  anchorKey: string
  layout: TurnLayout
  /** 变更前的可见区间；用于保持渲染窗口长度不变。 */
  previousRange: VisibleRange
}

/**
 * 按锚点行重新取一个「长度与 previousRange 相同」的区间。
 * 锚点行不存在（例如已被回退掉）时返回 null，由调用方决定回退策略。
 */
export function getRangeForAnchor({
  anchorKey,
  layout,
  previousRange,
}: GetRangeForAnchorOptions): VisibleRange | null {
  const index = layout.turnIndexByKey.get(anchorKey)
  if (index == null) return null
  return {
    startIndex: index,
    endIndex: Math.min(
      layout.turnKeys.length,
      index + previousRange.endIndex - previousRange.startIndex,
    ),
  }
}

export interface ComputeScrollDistanceForAnchorOptions {
  anchorKey: string
  /** 变更前视口底边距底距离。 */
  distanceFromBottomPx: number
  nextLayout: TurnLayout
  previousLayout: TurnLayout
}

/**
 * 锚定补偿（防跳动核心）：**锚点行的顶边距底距离变化了多少，就把视口补偿多少**。
 *
 * `新距底 = 旧距底 + (锚点新位置 − 锚点旧位置)`，位置取「底边距底 + 行高」＝顶边距底。
 * 注意这是「保位」路径（用户已离开底部时用）；贴底态应改走「跟随内容增长」，
 * 否则会在底部追加新轮时把视口往上推。
 * 两次都取不到锚点行时返回 null。
 */
export function computeScrollDistanceForAnchor({
  anchorKey,
  distanceFromBottomPx,
  nextLayout,
  previousLayout,
}: ComputeScrollDistanceForAnchorOptions): number | null {
  const previousIndex = previousLayout.turnIndexByKey.get(anchorKey)
  const nextIndex = nextLayout.turnIndexByKey.get(anchorKey)
  if (previousIndex == null || nextIndex == null) return null

  const before =
    (previousLayout.bottomOffsetsPx[previousIndex] ?? 0) + (previousLayout.heightsPx[previousIndex] ?? 0)
  const after =
    (nextLayout.bottomOffsetsPx[nextIndex] ?? 0) + (nextLayout.heightsPx[nextIndex] ?? 0)
  return Math.max(0, distanceFromBottomPx + after - before)
}

export interface ComputeScrollDistanceForTurnOptions {
  layout: TurnLayout
  turnKey: string
  viewportHeightPx: number
}

/**
 * 把某一行居中到视口时所需的距底距离（「跳转到该轮」用）。
 * 行不存在时返回 null；结果钳在 ≥ 0。
 */
export function computeScrollDistanceForTurn({
  layout,
  turnKey,
  viewportHeightPx,
}: ComputeScrollDistanceForTurnOptions): number | null {
  const index = layout.turnIndexByKey.get(turnKey)
  if (index == null) return null
  return Math.max(
    0,
    (layout.bottomOffsetsPx[index] ?? 0) - viewportHeightPx / 2 + (layout.heightsPx[index] ?? 0) / 2,
  )
}

/**
 * 桌面端 `o()`：在**递减**序列上取首个「值 < target」的下标
 * （等价于「值 ≥ target 的元素个数」）。
 * 语义：视口顶边往下数，第一行「底边已完全落在视口顶边之下」的行。
 */
function firstIndexBelowBottomOffset(bottomOffsetsPx: readonly number[], targetPx: number): number {
  let low = 0
  let high = bottomOffsetsPx.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((bottomOffsetsPx[mid] ?? 0) < targetPx) high = mid
    else low = mid + 1
  }
  return low
}

/**
 * 桌面端 `s()`：取首个「底边距底 + 行高 > target」的下标。
 * `底边距底 + 行高` 即该行顶边的距底距离。
 * 语义：第一行「顶边已不高于视口底边」的行 ⇒ 可见区间的开区间上界。
 */
function firstIndexWithTopAbove(
  bottomOffsetsPx: readonly number[],
  heightsPx: readonly number[],
  targetPx: number,
): number {
  let low = 0
  let high = bottomOffsetsPx.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((bottomOffsetsPx[mid] ?? 0) + (heightsPx[mid] ?? 0) <= targetPx) high = mid
    else low = mid + 1
  }
  return low
}
