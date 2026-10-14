import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOTTOM_THRESHOLD_PX,
  clampScrollDistanceFromBottomPx,
  getMaxScrollTopPx,
  getScrollDistanceFromBottomPx,
  getScrollTopForDistanceFromBottomPx,
  isScrollAtBottomPx,
  readScrollMetricsPx,
  type ScrollMetricsPx,
} from './conversationScrollDistance'

const metrics = (scrollHeightPx: number, scrollTopPx: number, clientHeightPx: number): ScrollMetricsPx => ({
  scrollHeightPx,
  scrollTopPx,
  clientHeightPx,
})

// 旧式口径（round-153 之前组件内的写法），仅用于对照扫描。刻意不 import，避免把
// 「被测代码」与「对照基准」写成同一个来源 —— 那样对照就恒真、失去意义。
const legacyDistanceFromBottom = (m: ScrollMetricsPx): number =>
  m.scrollHeightPx - (m.scrollTopPx + m.clientHeightPx)
const legacyIsAtBottom = (m: ScrollMetricsPx, thresholdPx: number): boolean =>
  legacyDistanceFromBottom(m) <= thresholdPx
const legacyBottomWrite = (m: ScrollMetricsPx): number =>
  Math.min(m.scrollHeightPx, Math.max(0, m.scrollHeightPx - m.clientHeightPx))

describe('getMaxScrollTopPx', () => {
  it('内容高于视口时给出差值', () => {
    expect(getMaxScrollTopPx(metrics(1000, 0, 100))).toBe(900)
  })

  it('内容矮于视口时为 0（不可滚）', () => {
    expect(getMaxScrollTopPx(metrics(80, 0, 100))).toBe(0)
    expect(getMaxScrollTopPx(metrics(100, 0, 100))).toBe(0)
  })

  it('视口为 0 时等于内容高（退化但可表示）', () => {
    expect(getMaxScrollTopPx(metrics(1000, 0, 0))).toBe(1000)
  })

  it('脏值按 0 处理而不是把 NaN 传出去', () => {
    // scrollHeight 脏 ⇒ 当 0 ⇒ max = max(0, 0 - 100) = 0
    expect(getMaxScrollTopPx(metrics(Number.NaN, 0, 100))).toBe(0)
    // clientHeight 脏 ⇒ 当 0 ⇒ max = 1000（退化视口，仍不是 NaN）
    expect(getMaxScrollTopPx(metrics(1000, 0, Number.POSITIVE_INFINITY))).toBe(1000)
    expect(Number.isFinite(getMaxScrollTopPx(metrics(1000, Number.NaN, 100)))).toBe(true)
  })
})

describe('getScrollDistanceFromBottomPx', () => {
  it('贴底为 0', () => {
    expect(getScrollDistanceFromBottomPx(metrics(1000, 900, 100))).toBe(0)
  })

  it('中途按差值给出', () => {
    expect(getScrollDistanceFromBottomPx(metrics(1000, 400, 100))).toBe(500)
  })

  it('滚到顶等于内容高减视口高', () => {
    expect(getScrollDistanceFromBottomPx(metrics(1000, 0, 100))).toBe(900)
  })

  it('过滚（scrollTop 越界）钳到 0，不给负数', () => {
    expect(getScrollDistanceFromBottomPx(metrics(1000, 950, 100))).toBe(0)
    expect(getScrollDistanceFromBottomPx(metrics(1000, 5000, 100))).toBe(0)
  })

  it('内容矮于视口时恒为 0', () => {
    expect(getScrollDistanceFromBottomPx(metrics(80, 0, 100))).toBe(0)
    expect(getScrollDistanceFromBottomPx(metrics(80, 40, 100))).toBe(0)
  })

  it('脏 scrollTop 按 0 处理', () => {
    expect(getScrollDistanceFromBottomPx(metrics(1000, Number.NaN, 100))).toBe(900)
  })
})

describe('isScrollAtBottomPx', () => {
  it('阈值边界：等于 16 算贴底，17 不算', () => {
    // 1000 - (scrollTop + 100) = 16 ⇒ scrollTop = 884
    expect(isScrollAtBottomPx(metrics(1000, 884, 100))).toBe(true)
    // = 17 ⇒ scrollTop = 883
    expect(isScrollAtBottomPx(metrics(1000, 883, 100))).toBe(false)
  })

  it('默认阈值就是 16', () => {
    expect(DEFAULT_BOTTOM_THRESHOLD_PX).toBe(16)
    expect(isScrollAtBottomPx(metrics(1000, 884, 100))).toBe(
      isScrollAtBottomPx(metrics(1000, 884, 100), DEFAULT_BOTTOM_THRESHOLD_PX),
    )
  })

  it('过滚仍算贴底（钳零后 0 ≤ 阈值）', () => {
    expect(isScrollAtBottomPx(metrics(1000, 2000, 100))).toBe(true)
  })

  it('阈值可自定义', () => {
    expect(isScrollAtBottomPx(metrics(1000, 700, 100), 200)).toBe(true)
    expect(isScrollAtBottomPx(metrics(1000, 700, 100), 199)).toBe(false)
    expect(isScrollAtBottomPx(metrics(1000, 700, 100), 0)).toBe(false)
  })

  it('阈值非有限值时退回默认 16', () => {
    expect(isScrollAtBottomPx(metrics(1000, 884, 100), Number.NaN)).toBe(true)
    expect(isScrollAtBottomPx(metrics(1000, 883, 100), Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('不可滚的内容恒为贴底', () => {
    expect(isScrollAtBottomPx(metrics(0, 0, 800))).toBe(true)
  })
})

describe('clampScrollDistanceFromBottomPx', () => {
  it('超过最大滚动量时钳到 max', () => {
    expect(clampScrollDistanceFromBottomPx(metrics(1000, 0, 100), 5000)).toBe(900)
  })

  it('负数钳到 0', () => {
    expect(clampScrollDistanceFromBottomPx(metrics(1000, 0, 100), -10)).toBe(0)
  })

  it('区间内原样返回', () => {
    expect(clampScrollDistanceFromBottomPx(metrics(1000, 0, 100), 300)).toBe(300)
  })

  it('非有限值按 0（贴底）处理', () => {
    expect(clampScrollDistanceFromBottomPx(metrics(1000, 0, 100), Number.NaN)).toBe(0)
    expect(clampScrollDistanceFromBottomPx(metrics(1000, 0, 100), Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('getScrollTopForDistanceFromBottomPx', () => {
  it('distance 0 落到最大 scrollTop（即贴底）', () => {
    expect(getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), 0)).toBe(900)
  })

  it('按距离反推 scrollTop', () => {
    expect(getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), 100)).toBe(800)
    expect(getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), 900)).toBe(0)
  })

  it('超过 max 的距离钳到顶部 0', () => {
    expect(getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), 5000)).toBe(0)
  })

  it('负距离按贴底处理', () => {
    expect(getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), -5)).toBe(900)
  })

  it('不可滚的内容恒为 0', () => {
    expect(getScrollTopForDistanceFromBottomPx(metrics(80, 0, 100), 0)).toBe(0)
    expect(getScrollTopForDistanceFromBottomPx(metrics(80, 0, 100), 500)).toBe(0)
  })

  it('与读侧互为逆运算（区间内）', () => {
    for (const distance of [0, 1, 16, 100, 450, 899, 900]) {
      const top = getScrollTopForDistanceFromBottomPx(metrics(1000, 0, 100), distance)
      expect(getScrollDistanceFromBottomPx(metrics(1000, top, 100))).toBe(distance)
    }
  })
})

describe('readScrollMetricsPx', () => {
  it('把 DOM 字段映射成 ...Px 口径', () => {
    expect(readScrollMetricsPx({ scrollHeight: 1000, scrollTop: 400, clientHeight: 100 })).toEqual(
      metrics(1000, 400, 100),
    )
  })

  it('读到的度量可直接喂给其余函数', () => {
    const m = readScrollMetricsPx({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 })
    expect(isScrollAtBottomPx(m)).toBe(true)
  })
})

describe('与旧式口径的对照扫描（行为等价的证据）', () => {
  const heights = [0, 1, 40, 120, 300, 800, 1000, 2500]
  const viewports = [0, 1, 50, 300, 800, 1200]

  const scrollTopsFor = (scrollHeightPx: number, clientHeightPx: number): number[] => {
    const max = Math.max(0, scrollHeightPx - clientHeightPx)
    const candidates = [
      -60, -1, 0, 1, 15, 16, 17, 24, 100, 450,
      max - 17, max - 16, max - 1, max, max + 1, max + 60,
    ]
    return [...new Set(candidates.map((value) => Math.round(value)))]
  }

  it('贴底布尔与旧式 `距离 <= 阈值` 逐例一致（含负距离与越界写）', () => {
    let checked = 0
    for (const scrollHeightPx of heights) {
      for (const clientHeightPx of viewports) {
        for (const scrollTopPx of scrollTopsFor(scrollHeightPx, clientHeightPx)) {
          const m = metrics(scrollHeightPx, scrollTopPx, clientHeightPx)
          expect(isScrollAtBottomPx(m, 16), `S=${scrollHeightPx} T=${scrollTopPx} C=${clientHeightPx}`).toBe(
            legacyIsAtBottom(m, 16),
          )
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('距底距离恒等于旧式距离的钳零，不会多也不会少', () => {
    let checked = 0
    for (const scrollHeightPx of heights) {
      for (const clientHeightPx of viewports) {
        for (const scrollTopPx of scrollTopsFor(scrollHeightPx, clientHeightPx)) {
          const m = metrics(scrollHeightPx, scrollTopPx, clientHeightPx)
          expect(getScrollDistanceFromBottomPx(m)).toBe(Math.max(0, legacyDistanceFromBottom(m)))
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('贴底写 `distance 0` 的落点等于旧式 `scrollTop = scrollHeight` 的浏览器钳位结果', () => {
    let checked = 0
    for (const scrollHeightPx of heights) {
      for (const clientHeightPx of viewports) {
        for (const scrollTopPx of scrollTopsFor(scrollHeightPx, clientHeightPx)) {
          const m = metrics(scrollHeightPx, scrollTopPx, clientHeightPx)
          // 旧代码写 scrollTop = scrollHeight，浏览器钳到 [0, max]；新代码显式钳。
          expect(getScrollTopForDistanceFromBottomPx(m, 0)).toBe(legacyBottomWrite(m))
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('对照本身非空：存在会让两种口径分歧的输入（否则上面三条断言恒真）', () => {
    // 反证：若把新式的「钳零」去掉，过滚输入立刻与旧式布尔分歧 ⇒ 对照组确实能捕捉差异。
    const overscrolled = metrics(1000, 1200, 100)
    expect(legacyDistanceFromBottom(overscrolled)).toBeLessThan(0)
    expect(getScrollDistanceFromBottomPx(overscrolled)).toBe(0)
    // 且旧式布尔在负距离下仍为 true（钳零不改变布尔）—— 这正是「等价」的边界。
    expect(legacyIsAtBottom(overscrolled, 0)).toBe(true)
    expect(isScrollAtBottomPx(overscrolled, 0)).toBe(true)
  })
})
