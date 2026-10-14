import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  computeScrollDistanceForAnchor,
  computeScrollDistanceForTurn,
  computeVisibleRange,
  DEFAULT_ESTIMATED_HEIGHT_PX,
  getRangeForAnchor,
  type TurnLayout,
  type VirtualizerEntry,
} from './turnVirtualizer'

/** n 轮等高、按传入间距排布（key 为 t0..t{n-1}）。 */
function uniformLayout(count: number, heightPx: number, gapPx = 0): TurnLayout {
  return buildLayout({
    entries: Array.from({ length: count }, (_, index) => ({ turnKey: `t${index}` })),
    gapPx,
    measuredHeightsByKey: measured(
      Array.from({ length: count }, (_, index) => [`t${index}`, heightPx] as [string, number]),
    ),
  })
}

function entry(turnKey: string, extra: Partial<VirtualizerEntry> = {}): VirtualizerEntry {
  return { turnKey, ...extra }
}

function measured(pairs: Array<[string, number]>): Record<string, number> {
  return Object.fromEntries(pairs)
}

describe('buildLayout', () => {
  it('高度优先级：实测 > 声明估算 > 兜底 280', () => {
    const layout = buildLayout({
      entries: [entry('a', { estimatedHeightPx: 120 }), entry('b', { estimatedHeightPx: 90 }), entry('c')],
      gapPx: 0,
      measuredHeightsByKey: { b: 300 },
    })
    expect(layout.heightsPx).toEqual([120, 300, DEFAULT_ESTIMATED_HEIGHT_PX])
    expect(DEFAULT_ESTIMATED_HEIGHT_PX).toBe(280)
  })

  it('minHeightPx 是硬下限，也能抬高原大于实测的高度', () => {
    const layout = buildLayout({
      entries: [
        entry('a', { minHeightPx: 500, estimatedHeightPx: 100 }),
        entry('b', { minHeightPx: 400, estimatedHeightPx: 100 }),
      ],
      gapPx: 0,
      measuredHeightsByKey: { b: 150 },
    })
    expect(layout.heightsPx).toEqual([500, 400])
  })

  it('脏的实测值退回估算，不让整份布局变成 NaN', () => {
    const layout = buildLayout({
      entries: [entry('a', { estimatedHeightPx: 100 }), entry('b', { estimatedHeightPx: 200 })],
      gapPx: 0,
      measuredHeightsByKey: { a: Number.NaN, b: 'oops' as unknown as number },
    })
    expect(layout.heightsPx).toEqual([100, 200])
    expect(Number.isFinite(layout.totalHeightPx)).toBe(true)
    expect(layout.totalHeightPx).toBe(300)
  })

  it('DPR 对齐：高度与间距都对齐到物理像素', () => {
    const layout = buildLayout({
      entries: [entry('a', { estimatedHeightPx: 100.4 }), entry('b', { estimatedHeightPx: 100.4 })],
      gapPx: 12.4,
      pixelScale: 2,
    })
    expect(layout.heightsPx).toEqual([100.5, 100.5])
    expect(layout.gapsBeforePx).toEqual([0, 12.5])
    expect(layout.topOffsetsPx).toEqual([0, 113])
    expect(layout.totalHeightPx).toBe(213.5)
  })

  it('间距规则：首行不产生间距，gapBeforePx 覆盖全局且显式 0 生效', () => {
    const layout = buildLayout({
      entries: [entry('t0'), entry('t1', { gapBeforePx: 4 }), entry('t2', { gapBeforePx: 0 })],
      gapPx: 12,
      measuredHeightsByKey: measured([['t0', 100], ['t1', 100], ['t2', 100]]),
    })
    expect(layout.gapsBeforePx).toEqual([0, 4, 0])
    expect(layout.topOffsetsPx).toEqual([0, 104, 204])
    expect(layout.totalHeightPx).toBe(304)
  })

  it('collapseEmptyRows：空行不吃间距，也不产生前导间距', () => {
    const base = {
      entries: [
        entry('t0', { estimatedHeightPx: 0 }),
        entry('t1', { estimatedHeightPx: 100 }),
        entry('t2', { estimatedHeightPx: 100 }),
      ],
      gapPx: 12,
    }
    const collapsed = buildLayout({ ...base, collapseEmptyRows: true })
    expect(collapsed.heightsPx).toEqual([0, 100, 100])
    expect(collapsed.gapsBeforePx).toEqual([0, 0, 12])
    expect(collapsed.totalHeightPx).toBe(212)

    const plain = buildLayout({ ...base, collapseEmptyRows: false })
    expect(plain.gapsBeforePx).toEqual([0, 12, 12])
    expect(plain.totalHeightPx).toBe(224)
  })

  it('bottomOffsetsPx = 总高 − 顶边偏移 − 行高，末行为 0', () => {
    const layout = uniformLayout(3, 100)
    expect(layout.topOffsetsPx).toEqual([0, 100, 200])
    expect(layout.bottomOffsetsPx).toEqual([200, 100, 0])
    expect(layout.totalHeightPx).toBe(300)
  })

  it('turnIndexByKey 与 turnKeys 与输入同序', () => {
    const layout = uniformLayout(3, 100)
    expect(layout.turnKeys).toEqual(['t0', 't1', 't2'])
    expect(layout.turnIndexByKey.get('t2')).toBe(2)
    expect(layout.turnIndexByKey.get('missing')).toBeUndefined()
  })

  it("type === 'gap' 的行登记进 gapKeys", () => {
    const layout = buildLayout({
      entries: [entry('t0', { type: 'gap' }), entry('t1')],
      gapPx: 0,
      measuredHeightsByKey: measured([['t0', 10], ['t1', 10]]),
    })
    expect(layout.gapKeys.has('t0')).toBe(true)
    expect(layout.gapKeys.has('t1')).toBe(false)
    expect(layout.gapKeys.size).toBe(1)
  })

  it('空 entries 返回全零布局', () => {
    const layout = buildLayout({ entries: [], gapPx: 12 })
    expect(layout.turnKeys).toEqual([])
    expect(layout.heightsPx).toEqual([])
    expect(layout.bottomOffsetsPx).toEqual([])
    expect(layout.totalHeightPx).toBe(0)
    expect(layout.turnIndexByKey.size).toBe(0)
  })
})

describe('computeVisibleRange', () => {
  it('空列表返回空区间', () => {
    const layout = buildLayout({ entries: [], gapPx: 0 })
    expect(computeVisibleRange({ distanceFromBottomPx: 0, layout, overscanCount: 2, viewportHeightPx: 800 }))
      .toEqual({ startIndex: 0, endIndex: 0 })
  })

  it('贴底时区间正好覆盖末尾可见的两行', () => {
    const layout = uniformLayout(10, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 0, layout, overscanCount: 0, viewportHeightPx: 200 }))
      .toEqual({ startIndex: 8, endIndex: 10 })
  })

  it('overscan 只向两侧扩张，不越界', () => {
    const layout = uniformLayout(10, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 0, layout, overscanCount: 2, viewportHeightPx: 200 }))
      .toEqual({ startIndex: 6, endIndex: 10 })
    const small = uniformLayout(2, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 0, layout: small, overscanCount: 10, viewportHeightPx: 200 }))
      .toEqual({ startIndex: 0, endIndex: 2 })
  })

  it('中部滚动：区间正好覆盖视口内的两行', () => {
    const layout = uniformLayout(10, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 400, layout, overscanCount: 0, viewportHeightPx: 200 }))
      .toEqual({ startIndex: 4, endIndex: 6 })
  })

  it('距底距离越界时钳制（超出总高 ⇒ 落到顶部；负数 ⇒ 视作贴底）', () => {
    const layout = uniformLayout(10, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 5000, layout, overscanCount: 0, viewportHeightPx: 200 }).startIndex)
      .toBe(0)
    expect(computeVisibleRange({ distanceFromBottomPx: -50, layout, overscanCount: 0, viewportHeightPx: 200 }))
      .toEqual({ startIndex: 8, endIndex: 10 })
  })

  it('视口高于总高时覆盖全部行', () => {
    const layout = uniformLayout(10, 100)
    expect(computeVisibleRange({ distanceFromBottomPx: 0, layout, overscanCount: 0, viewportHeightPx: 5000 }))
      .toEqual({ startIndex: 0, endIndex: 10 })
  })

  it('collapseEmptyRows 的两条特例分支会保住零高度的行', () => {
    const entries = [entry('t0'), entry('t1'), entry('t2')]
    const measuredHeightsByKey = measured([['t0', 100], ['t1', 100], ['t2', 0]])
    const collapsed = buildLayout({ entries, gapPx: 12, measuredHeightsByKey, collapseEmptyRows: true })
    const plain = buildLayout({ entries, gapPx: 12, measuredHeightsByKey, collapseEmptyRows: false })

    const atBottom = { distanceFromBottomPx: 0, overscanCount: 0, viewportHeightPx: 200 }
    expect(computeVisibleRange({ ...atBottom, layout: collapsed }).endIndex).toBe(3)
    expect(computeVisibleRange({ ...atBottom, layout: plain }).endIndex).toBe(2)
  })
})

describe('getRangeForAnchor', () => {
  const layout = uniformLayout(10, 100, 12)

  it('以锚点行为起点，保持原区间长度', () => {
    expect(getRangeForAnchor({ anchorKey: 't7', layout, previousRange: { startIndex: 4, endIndex: 6 } }))
      .toEqual({ startIndex: 7, endIndex: 9 })
  })

  it('靠近末尾时钳在列表长度上', () => {
    expect(getRangeForAnchor({ anchorKey: 't9', layout, previousRange: { startIndex: 4, endIndex: 6 } }))
      .toEqual({ startIndex: 9, endIndex: 10 })
  })

  it('锚点行不存在返回 null', () => {
    expect(getRangeForAnchor({ anchorKey: 'missing', layout, previousRange: { startIndex: 0, endIndex: 2 } }))
      .toBeNull()
  })
})

describe('computeScrollDistanceForAnchor', () => {
  it('锚点上方长了多少就补偿多少，底部同时在增长不会被误算', () => {
    // 用户停在距底 300px 处；此刻**最后一轮**从 100 流式长到 400。
    const previousLayout = uniformLayout(5, 100)
    const nextLayout = buildLayout({
      entries: Array.from({ length: 5 }, (_, index) => ({ turnKey: `t${index}` })),
      gapPx: 0,
      measuredHeightsByKey: measured([['t0', 100], ['t1', 100], ['t2', 100], ['t3', 100], ['t4', 400]]),
    })

    const distance = computeScrollDistanceForAnchor({
      anchorKey: 't3',
      distanceFromBottomPx: 300,
      nextLayout,
      previousLayout,
    })

    // 锚点 t3 的顶边距底：变更前 500−300−100+100 = 200；变更后 800−300−100+100 = 500。
    expect(distance).toBe(600)

    // 对照：现在项目里用的 `scrollTop += (scrollHeight − prevScrollHeight)` 会把
    // 距底距离留在 300（总高与 scrollTop 同步各加 300）⇒ 视口贴着的内容上跳 300px。
    expect(distance! - 300).toBe(300)
  })

  it('底部追加新轮时，锚定旧末轮会整体上推一个新高', () => {
    const previousLayout = uniformLayout(3, 100)
    const nextLayout = uniformLayout(4, 100)
    expect(computeScrollDistanceForAnchor({ anchorKey: 't2', distanceFromBottomPx: 0, nextLayout, previousLayout }))
      .toBe(100)
  })

  it('锚点行不在其中一份布局里则返回 null', () => {
    const previousLayout = uniformLayout(2, 100)
    const nextLayout = uniformLayout(3, 100)
    expect(computeScrollDistanceForAnchor({ anchorKey: 't2', distanceFromBottomPx: 0, nextLayout, previousLayout }))
      .toBeNull()
    expect(computeScrollDistanceForAnchor({ anchorKey: 'missing', distanceFromBottomPx: 0, nextLayout, previousLayout }))
      .toBeNull()
  })

  it('补偿结果钳在 ≥ 0（锚点下移时不产生负滚动）', () => {
    const previousLayout = buildLayout({
      entries: [entry('t0'), entry('t1')],
      gapPx: 0,
      measuredHeightsByKey: measured([['t0', 300], ['t1', 100]]),
    })
    const nextLayout = buildLayout({
      entries: [entry('t0'), entry('t1')],
      gapPx: 0,
      measuredHeightsByKey: measured([['t0', 100], ['t1', 100]]),
    })
    expect(computeScrollDistanceForAnchor({ anchorKey: 't0', distanceFromBottomPx: 0, nextLayout, previousLayout }))
      .toBe(0)
  })
})

describe('computeScrollDistanceForTurn', () => {
  const layout = uniformLayout(10, 100)

  it('把目标轮居中到视口', () => {
    // t5 底边距底 = 1000 − 500 − 100 = 400；居中需再减视口一半、加行高一半。
    expect(computeScrollDistanceForTurn({ layout, turnKey: 't5', viewportHeightPx: 200 }))
      .toBe(400 - 100 + 50)
  })

  it('贴底轮钳制为 0', () => {
    expect(computeScrollDistanceForTurn({ layout, turnKey: 't9', viewportHeightPx: 200 })).toBe(0)
  })

  it('不存在的轮返回 null', () => {
    expect(computeScrollDistanceForTurn({ layout, turnKey: 'missing', viewportHeightPx: 200 })).toBeNull()
  })
})
