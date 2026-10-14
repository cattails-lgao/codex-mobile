/**
 * 距底距离坐标（round-153 · 批 3a）
 *
 * 把「离列表底部还有多少像素」抽成唯一的坐标口径，供「贴底判定 / 滚到底 / 贴底维持」
 * 共用。批 3 的窗口化（3b/3c）要求滚动位置由**布局表算出的距底距离**驱动，而不是依赖
 * 「某个 DOM 锚点已渲染」——`scrollIntoView` 在锚点不在渲染窗口时静默失效
 * （见 `codex-mobile-handover/sections/batch3-virtualization-assessment.md` 必解 1）。
 * 本模块先把这条口径立起来，行为与旧式 `scrollHeight - (scrollTop + clientHeight)`
 * 逐位一致（有一条跨输入网格的对照扫描用例钉住，见测试文件）。
 *
 * 约定：
 * - 距底距离**钳到 ≥ 0**：过滚（橡皮筋 / 程序化越界写）时旧式公式会给负数；钳零后
 *   「是否贴底」的布尔结果不变（负数与 0 都 ≤ 阈值），但返回值本身有了单一含义。
 * - 写回的 `scrollTop` 钳到 `[0, max]`：旧代码写 `scrollTop = scrollHeight` 靠浏览器钳位，
 *   这里显式钳到 `max = max(0, scrollHeight - clientHeight)`，落点相同。
 * - 字段一律 `...Px` 后缀，与 `turnVirtualizer.ts` 的命名风格一致，便于将来两表对拍。
 */

export interface ScrollMetricsPx {
  /** 内容总高（含不可见部分）。 */
  scrollHeightPx: number
  /** 当前滚动位置。 */
  scrollTopPx: number
  /** 视口高度。 */
  clientHeightPx: number
}

/** 贴底判定的默认阈值（沿用组件内原 `BOTTOM_THRESHOLD_PX = 16`）。 */
export const DEFAULT_BOTTOM_THRESHOLD_PX = 16

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** 可滚动的最大 `scrollTop`（内容比视口矮时为 0）。 */
export function getMaxScrollTopPx(metrics: ScrollMetricsPx): number {
  const scrollHeight = finiteOrZero(metrics.scrollHeightPx)
  const clientHeight = finiteOrZero(metrics.clientHeightPx)
  return Math.max(0, scrollHeight - clientHeight)
}

/** 距底距离（≥ 0）。 */
export function getScrollDistanceFromBottomPx(metrics: ScrollMetricsPx): number {
  const raw =
    finiteOrZero(metrics.scrollHeightPx) -
    finiteOrZero(metrics.scrollTopPx) -
    finiteOrZero(metrics.clientHeightPx)
  return Math.max(0, raw)
}

/** 距底距离是否落在阈值内（旧式为 `距离 <= 阈值`，含负距离）。 */
export function isScrollAtBottomPx(
  metrics: ScrollMetricsPx,
  thresholdPx: number = DEFAULT_BOTTOM_THRESHOLD_PX,
): boolean {
  const threshold = Number.isFinite(thresholdPx) ? thresholdPx : DEFAULT_BOTTOM_THRESHOLD_PX
  return getScrollDistanceFromBottomPx(metrics) <= threshold
}

/** 把距底距离钳到可表示区间：0 表示贴底，`max` 表示滚到顶。 */
export function clampScrollDistanceFromBottomPx(metrics: ScrollMetricsPx, distancePx: number): number {
  if (!Number.isFinite(distancePx)) return 0
  return Math.min(getMaxScrollTopPx(metrics), Math.max(0, distancePx))
}

/** 目标距底距离对应的 `scrollTop`（钳到 `[0, max]`）。贴底态传 0 即得最大 `scrollTop`。 */
export function getScrollTopForDistanceFromBottomPx(metrics: ScrollMetricsPx, distancePx: number): number {
  const max = getMaxScrollTopPx(metrics)
  const distance = clampScrollDistanceFromBottomPx(metrics, distancePx)
  return Math.min(max, Math.max(0, max - distance))
}

/**
 * 从 DOM 元素读取度量。**本模块唯一的 DOM 触点**，其余导出函数都是纯函数 ——
 * 将来窗口化时测量层只需喂这一个函数。
 */
export function readScrollMetricsPx(el: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): ScrollMetricsPx {
  return {
    scrollHeightPx: el.scrollHeight,
    scrollTopPx: el.scrollTop,
    clientHeightPx: el.clientHeight,
  }
}
