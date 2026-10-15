import { describe, expect, it } from 'vitest'
import {
  buildHotBlockLayout,
  computeHotSpacers,
  computeHotVisibleWindow,
  DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX,
  planHotWindow,
  type HotBlockSpec,
} from './hotTurnWindow'

const GAP = 12

function block(key: string, measuredHeightPx?: number): HotBlockSpec {
  return { key, measuredHeightPx }
}

describe('buildHotBlockLayout', () => {
  it('空表：totalHeight 0', () => {
    const layout = buildHotBlockLayout([], GAP)
    expect(layout.totalHeightPx).toBe(0)
    expect(layout.topDistancesFromBottomPx).toEqual([])
  })

  it('单块：顶边距底 = 自身高度', () => {
    const layout = buildHotBlockLayout([block('a', 500)], GAP)
    expect(layout.heightsPx).toEqual([500])
    expect(layout.topDistancesFromBottomPx).toEqual([500])
    expect(layout.bottomDistancesFromBottomPx).toEqual([0])
    expect(layout.totalHeightPx).toBe(500)
  })

  it('多块：距底坐标整体递减（面对二分的方向约定）', () => {
    const layout = buildHotBlockLayout(
      [block('a', 300), block('b', 200), block('c', 100)],
      GAP,
    )
    // 自底向上：c(100) → gap → b(200) → gap → a(300)
    expect(layout.topDistancesFromBottomPx).toEqual([624, 312, 100])
    expect(layout.bottomDistancesFromBottomPx).toEqual([324, 112, 0])
    expect(layout.totalHeightPx).toBe(300 + 200 + 100 + 2 * GAP)
  })

  it('未测块用兜底估算（只影响窗口边界，不进 spacer 求和）', () => {
    const layout = buildHotBlockLayout([block('a'), block('b', 100)], GAP)
    expect(layout.heightsPx[0]).toBe(DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX)
    expect(layout.heightsPx[1]).toBe(100)
  })
})

describe('computeHotVisibleWindow', () => {
  const specs = [
    block('a', 300),
    block('b', 300),
    block('c', 300),
    block('d', 300),
    block('e', 300),
  ]
  const total = 5 * 300 + 4 * GAP // 1548

  it('贴底：视口在 hot 区底部 ⇒ 窗口取末块附近', () => {
    const win = computeHotVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: -(1 + GAP), // 贴底（底锚 1px + gap）
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(win.last).toBe(4)
    expect(win.first).toBeGreaterThan(0)
    expect(win.first).toBeLessThanOrEqual(4)
  })

  it('滚到 warm 区（视口在 hot 区上方）⇒ 窗口取首块附近', () => {
    const win = computeHotVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: total + 1000, // 视口底边在 hot 区顶边之上
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(win.first).toBe(0)
    expect(win.last).toBeLessThan(4)
  })

  it('未测块强制入窗（哪怕在视口外）', () => {
    const win = computeHotVisibleWindow({
      specs: [block('a', 300), block('b'), block('c', 300), block('d', 300), block('e', 300)],
      gapPx: GAP,
      viewportBottomDistancePx: -(1 + GAP),
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(win.first).toBe(1) // b（下标 1）未测 ⇒ 强制入窗；a 已测且在视口外 ⇒ 不入窗
    expect(win.last).toBe(4)
  })

  it('forcedKeys 强制入窗', () => {
    const win = computeHotVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: -(1 + GAP),
      viewportHeightPx: 600,
      overscanPx: 200,
      forcedKeys: new Set(['a']),
    })
    expect(win.first).toBe(0)
  })

  it('视口与 hot 区完全不相交且在其下方 ⇒ 取首块', () => {
    const win = computeHotVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: total + 5000,
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(win).toEqual({ first: 0, last: 0 })
  })

  it('空表：空窗口', () => {
    const win = computeHotVisibleWindow({
      specs: [],
      gapPx: GAP,
      viewportBottomDistancePx: 0,
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(win).toEqual({ first: 0, last: -1 })
  })
})

describe('computeHotSpacers', () => {
  const specs = [
    block('a', 300),
    block('b', 300),
    block('c', 300),
    block('d', 300),
    block('e', 300),
  ]

  it('全渲染：无跳过，spacer 全 0', () => {
    const plan = computeHotSpacers({
      specs,
      gapPx: GAP,
      window: { first: 0, last: 4 },
    })
    expect(plan).toEqual({ topSpacerPx: 0, bottomSpacerPx: 0, skippedAbove: 0, skippedBelow: 0 })
  })

  it('跳过上方 2 块：窗顶占位 = Σh + (k−1)·g', () => {
    const plan = computeHotSpacers({
      specs,
      gapPx: GAP,
      window: { first: 2, last: 4 },
    })
    expect(plan.skippedAbove).toBe(2)
    expect(plan.topSpacerPx).toBe(300 * 2 + 1 * GAP)
    expect(plan.bottomSpacerPx).toBe(0)
  })

  it('跳过下方 2 块：窗底占位 = Σh + (k−1)·g', () => {
    const plan = computeHotSpacers({
      specs,
      gapPx: GAP,
      window: { first: 0, last: 2 },
    })
    expect(plan.skippedBelow).toBe(2)
    expect(plan.bottomSpacerPx).toBe(300 * 2 + 1 * GAP)
    expect(plan.topSpacerPx).toBe(0)
  })

  it('两端都跳：两侧占位独立成立', () => {
    const plan = computeHotSpacers({
      specs,
      gapPx: GAP,
      window: { first: 2, last: 2 },
    })
    expect(plan.skippedAbove).toBe(2)
    expect(plan.skippedBelow).toBe(2)
    expect(plan.topSpacerPx).toBe(300 * 2 + 1 * GAP)
    expect(plan.bottomSpacerPx).toBe(300 * 2 + 1 * GAP)
  })

  it('窗口守恒（对照扫描）：任意窗口下哨兵→底锚距离 = 全渲染', () => {
    // 全渲染：哨兵 S —g— 5 块 —g— 底锚，S→锚 = Σh + 6g。
    // 窗口化：S —g— [顶占位 T] —g— 首渲染块 … 末渲染块 —g— [底占位 B] —g— 底锚。
    //   gap 链 = (k1>0 ? 2 : 1)(S→T→首渲染 或 S→首渲染) + (last-first)(渲染块间)
    //          + (k2>0 ? 2 : 1)(渲染→B→锚 或 渲染→锚)。
    //   T = Σh(上跳) + (k1−1)·g、B = Σh(下跳) + (k2−1)·g 时收敛到 Σh + 6g。
    for (let first = 0; first < 5; first += 1) {
      for (let last = first; last < 5; last += 1) {
        const plan = computeHotSpacers({ specs, gapPx: GAP, window: { first, last } })
        const renderedHeights = specs
          .slice(first, last + 1)
          .reduce((acc, s) => acc + (s.measuredHeightPx ?? 0), 0)
        const renderedGaps = last > first ? (last - first) * GAP : 0
        const topOuter = plan.skippedAbove > 0 ? 2 * GAP : 1 * GAP
        const bottomOuter = plan.skippedBelow > 0 ? 2 * GAP : 1 * GAP
        const windowed =
          plan.topSpacerPx + renderedHeights + renderedGaps + plan.bottomSpacerPx
          + topOuter + bottomOuter
        const full = 5 * 300 + 6 * GAP // Σh + 4 块间 gap + S→首块 + 末块→锚
        expect(windowed).toBe(full)
      }
    }
  })
})

describe('planHotWindow', () => {
  it('一次算全：window / spacers / layout 一致', () => {
    const specs = [block('a', 300), block('b'), block('c', 300)]
    const plan = planHotWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: -(1 + GAP),
      viewportHeightPx: 600,
      overscanPx: 200,
    })
    expect(plan.window.last).toBe(2)
    expect(plan.window.first).toBe(0) // b 未测强制入窗
    expect(plan.spacers).toEqual({
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      skippedAbove: 0,
      skippedBelow: 0,
    })
    expect(plan.layout.heightsPx).toEqual([300, DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX, 300])
  })
})
