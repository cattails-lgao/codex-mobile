import { describe, expect, it } from 'vitest'
import {
  buildWarmBlockLayout,
  computeWarmSpacers,
  computeWarmVisibleWindow,
  estimateWarmBlockHeightPx,
  EXPANDED_TURN_ESTIMATED_HEIGHT_PX,
  MODEL_SWITCH_DIVIDER_HEIGHT_PX,
  planWarmWindow,
  TIME_DIVIDER_HEIGHT_PX,
  WARM_CARD_HEIGHT_HEAD_ONLY_PX,
  WARM_CARD_HEIGHT_WITH_PREVIEW_PX,
  type WarmBlockSpec,
} from './warmTurnWindow'

const GAP = 12

function card(overrides: Partial<WarmBlockSpec> = {}): WarmBlockSpec {
  return {
    turn: 0,
    collapsed: true,
    hasTimeDivider: false,
    leadingModelSwitchCount: 0,
    trailingModelSwitchCount: 0,
    hasAssistantPreview: true,
    ...overrides,
  }
}

describe('estimateWarmBlockHeightPx', () => {
  it('折叠卡（带预览行）= 实测常量 69', () => {
    expect(estimateWarmBlockHeightPx(card(), GAP)).toBe(WARM_CARD_HEIGHT_WITH_PREVIEW_PX)
  })

  it('折叠卡（纯 head）= 实测常量 42，与文本长度无关', () => {
    expect(
      estimateWarmBlockHeightPx(card({ hasAssistantPreview: false }), GAP),
    ).toBe(WARM_CARD_HEIGHT_HEAD_ONLY_PX)
  })

  it('时间分隔栏计入块首（高度 + gap）', () => {
    expect(estimateWarmBlockHeightPx(card({ hasTimeDivider: true }), GAP)).toBe(
      WARM_CARD_HEIGHT_WITH_PREVIEW_PX + TIME_DIVIDER_HEIGHT_PX + GAP,
    )
  })

  it('模型切换分割栏计入块尾', () => {
    expect(
      estimateWarmBlockHeightPx(card({ trailingModelSwitchCount: 2 }), GAP),
    ).toBe(WARM_CARD_HEIGHT_WITH_PREVIEW_PX + 2 * (MODEL_SWITCH_DIVIDER_HEIGHT_PX + GAP))
  })

  it('展开块用兜底估算（只影响窗口边界，不影响 spacer 精度）', () => {
    expect(estimateWarmBlockHeightPx(card({ collapsed: false }), GAP)).toBe(
      EXPANDED_TURN_ESTIMATED_HEIGHT_PX,
    )
  })
})

describe('buildWarmBlockLayout', () => {
  it('距底坐标：末块顶边距底 = 自身高度，首块底边距底 = 总高', () => {
    const specs = [card(), card({ hasAssistantPreview: false })]
    const layout = buildWarmBlockLayout(specs, GAP)
    expect(layout.totalHeightPx).toBeCloseTo(68.5 + 12 + 42, 6)
    expect(layout.topDistancesFromBottomPx[1]).toBeCloseTo(42, 6)
    expect(layout.bottomDistancesFromBottomPx[1]).toBe(0)
    expect(layout.topDistancesFromBottomPx[0]).toBeCloseTo(68.5 + 12 + 42, 6)
    expect(layout.bottomDistancesFromBottomPx[0]).toBeCloseTo(12 + 42, 6)
  })

  it('空块列表：总高 0', () => {
    expect(buildWarmBlockLayout([], GAP).totalHeightPx).toBe(0)
  })
})

describe('computeWarmVisibleWindow', () => {
  const specs = Array.from({ length: 10 }, (_, i) => card({ turn: i }))
  // 布局：块 i 高 69 + gap 12；总高 = 10×69 + 9×12 = 798

  it('视口在 warm 区底部（贴底进 hot 区，距离为负）⇒ 只留 overscan 内的末段', () => {
    const w = computeWarmVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: -500,
      viewportHeightPx: 720,
      overscanPx: 200,
    })
    // 视口顶边距底 220，上界 220+200=420 ⇒ 块 4（bottom 405 ≤ 420）起全部相交
    expect(w).toEqual({ first: 4, last: 9 })
  })

  it('视口对准中部 ⇒ 相交块闭区间（完全落在 overscan 外的末块被排除）', () => {
    // 视口 [300, 1020] + overscan 200 ⇒ 相交带 [100, 1240]；
    // 块 9 的 top=69 < 100（整块在带下方）⇒ 排除；块 0..8 相交
    const w = computeWarmVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: 300,
      viewportHeightPx: 720,
      overscanPx: 200,
    })
    expect(w).toEqual({ first: 0, last: 8 })
  })

  it('窄视口 ⇒ 只取相交块', () => {
    // 视口 [1200, 1260] + overscan 100 ⇒ [1100, 1360]；块 9: [0,69]、块 8: [81,150] 不相交；
    // 块 7: [162,231] 不相交 ⇒ ... 重算：距离 >1100 的只有块 9（top 69 < 1100? 69 < 1100 ⇒ 不相交）
    // 总高 798 < 1100 ⇒ 无相交 ⇒ 最近块 = 首块（warm 区在视口下方）
    const w = computeWarmVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: 1100,
      viewportHeightPx: 60,
      overscanPx: 100,
    })
    expect(w).toEqual({ first: 0, last: 0 })
  })

  it('精确的窄窗：视口对准块 3~5', () => {
    // 块 i 的 [bottom, top]：块 i bottom = (9-i)×81, top = bottom+69
    // 视口底边距底 = 300，高 100，overscan 0 ⇒ [300, 400]
    // 块 6: [243,312] 相交；块 5: [324,393] 相交；块 4: [405,474] 不相交(405>400)
    // 块 7: [162,231] 不相交 ⇒ first=5, last=6
    const w = computeWarmVisibleWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: 300,
      viewportHeightPx: 100,
      overscanPx: 0,
    })
    expect(w).toEqual({ first: 5, last: 6 })
  })

  it('展开块强制入窗（即使远离视口）', () => {
    const withExpanded = specs.map((s, i) => (i === 0 ? card({ ...s, collapsed: false }) : s))
    const w = computeWarmVisibleWindow({
      specs: withExpanded,
      gapPx: GAP,
      viewportBottomDistancePx: -500,
      viewportHeightPx: 720,
      overscanPx: 200,
    })
    expect(w.first).toBe(0)
    expect(w.last).toBe(9)
  })

  it('空块列表 ⇒ 空窗口', () => {
    expect(
      computeWarmVisibleWindow({
        specs: [],
        gapPx: GAP,
        viewportBottomDistancePx: 0,
        viewportHeightPx: 720,
        overscanPx: 200,
      }),
    ).toEqual({ first: 0, last: -1 })
  })
})

describe('computeWarmSpacers', () => {
  const specs = Array.from({ length: 10 }, (_, i) => card({ turn: i }))

  it('全渲染 ⇒ 两个 spacer 都是 0', () => {
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 0, last: 9 },
    })
    expect(s.topMarginPx).toBe(0)
    expect(s.bottomSpacerPx).toBe(0)
    expect(s.skippedAbove).toBe(0)
    expect(s.skippedBelow).toBe(0)
  })

  it('窗顶跳过 k 块、上方有锚 ⇒ margin = Σh + (k−1)·g', () => {
    // 跳过前 3 块（69×3 = 207）
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 3, last: 9 },
    })
    expect(s.skippedAbove).toBe(3)
    expect(s.topMarginPx).toBeCloseTo(68.5 * 3 + 3 * 12, 6)
    expect(s.bottomSpacerPx).toBe(0)
  })

  it('窗顶跳过 k 块、上方无锚 ⇒ margin = Σh + k·g', () => {
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 2, last: 9 },
    })
    expect(s.topMarginPx).toBeCloseTo(68.5 * 2 + 2 * 12, 6)
  })

  it('窗底跳过 k 块 ⇒ 占位 li 高 = Σh + (k−2)·g（k≥1 恒正）', () => {
    // 跳过末 2 块（138）
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 0, last: 7 },
    })
    expect(s.skippedBelow).toBe(2)
    expect(s.bottomSpacerPx).toBeCloseTo(68.5 * 2 + 12, 6)
  })

  it('窗底只跳过 1 块 ⇒ 高 = h − g（正）', () => {
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 0, last: 8 },
    })
    expect(s.bottomSpacerPx).toBeCloseTo(68.5, 6)
  })

  it('两端同时跳过', () => {
    const s = computeWarmSpacers({
      specs,
      gapPx: GAP,
      window: { first: 4, last: 7 },
    })
    expect(s.topMarginPx).toBeCloseTo(68.5 * 4 + 4 * 12, 6)
    expect(s.bottomSpacerPx).toBeCloseTo(68.5 * 2 + 12, 6)
  })

  it('混合块高（时间分隔栏 + 无预览卡）也成立', () => {
    const mixed = [
      card({ hasTimeDivider: true }),
      card({ hasAssistantPreview: false }),
      card(),
    ]
    // h0 = 68.5+34+12 = 114.5；h1 = 42；h2 = 68.5；total = 114.5+12+42+12+68.5 = 249
    const s = computeWarmSpacers({
      specs: mixed,
      gapPx: GAP,
      window: { first: 2, last: 2 },
    })
    // margin = Σh + (k−1)·g = (115+42) + 1·12 = 169
    // 对拍：全渲染时锚→块 2 顶 = 115+12+42+12 = 181；有锚时首块前还剩一个 gap ⇒ 181−12=169
    // 对拍：全渲染时块 0 顶→块 2 顶 = 114.5+12+42+12 = 180.5 = margin（k=2）
    expect(s.topMarginPx).toBeCloseTo(180.5, 6)
    expect(s.bottomSpacerPx).toBe(0)
  })
})

describe('planWarmWindow（组合入口）', () => {
  it('贴底 + 长列表：窗口收成末块 + 巨大窗顶 margin', () => {
    const specs = Array.from({ length: 143 }, (_, i) => card({ turn: i }))
    const plan = planWarmWindow({
      specs,
      gapPx: GAP,
      viewportBottomDistancePx: -1000,
      viewportHeightPx: 720,
      overscanPx: 400,
    })
    expect(plan.window.last).toBe(142)
    // overscan 400：视口顶边距底 −280，上界 120 ⇒ 块 141（bottom 81 ≤ 120）也入窗
    expect(plan.window.first).toBe(141)
    expect(plan.spacers.skippedAbove).toBe(141)
    const sumFirst141 = plan.layout.heightsPx.slice(0, 141).reduce((a, b) => a + b, 0)
    expect(plan.spacers.topMarginPx).toBeCloseTo(sumFirst141 + 141 * 12, 6)
    expect(plan.spacers.topMarginPx).toBeGreaterThan(10000)
  })
})
