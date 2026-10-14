import { describe, expect, it } from 'vitest'
import {
  TIME_DIVIDER_GAP_MS,
  countLocalDaysBetween,
  formatTimeDividerLabel,
  isSameLocalDay,
  selectTimeDividerTurnKeys,
  shouldShowTimeDivider,
} from './timeDividers'

/** 本地时间构造（与 `formatTimeDividerLabel` 用的 `getHours()` 同一时区，断言才可移植）。 */
function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime()
}

describe('isSameLocalDay', () => {
  it('同一天不同时刻为真', () => {
    expect(isSameLocalDay(at(2026, 10, 14, 0, 1), at(2026, 10, 14, 23, 59))).toBe(true)
  })

  it('跨日为假', () => {
    expect(isSameLocalDay(at(2026, 10, 14, 23, 59), at(2026, 10, 15, 0, 1))).toBe(false)
  })

  it('跨月/跨年为假', () => {
    expect(isSameLocalDay(at(2026, 10, 31, 23, 0), at(2026, 11, 1, 1, 0))).toBe(false)
    expect(isSameLocalDay(at(2025, 12, 31, 23, 0), at(2026, 1, 1, 1, 0))).toBe(false)
  })
})

describe('shouldShowTimeDivider', () => {
  it('没有上一条分隔栏时恒为真（首轮必出）', () => {
    expect(shouldShowTimeDivider(null, at(2026, 10, 14, 10, 0))).toBe(true)
    expect(shouldShowTimeDivider(undefined, at(2026, 10, 14, 10, 0))).toBe(true)
  })

  it('基准非有限值时退化为「无基准」', () => {
    expect(shouldShowTimeDivider(Number.NaN, at(2026, 10, 14, 10, 0))).toBe(true)
  })

  it('目标时间非法时为假', () => {
    expect(shouldShowTimeDivider(at(2026, 10, 14, 10, 0), Number.NaN)).toBe(false)
  })

  it('同日间隔小于 30 分钟为假', () => {
    const base = at(2026, 10, 14, 10, 0)
    expect(shouldShowTimeDivider(base, base + 10 * 60 * 1000)).toBe(false)
    expect(shouldShowTimeDivider(base, base + TIME_DIVIDER_GAP_MS - 1)).toBe(false)
  })

  it('同日间隔恰为 30 分钟为真（闭区间下界）', () => {
    const base = at(2026, 10, 14, 10, 0)
    expect(shouldShowTimeDivider(base, base + TIME_DIVIDER_GAP_MS)).toBe(true)
    expect(shouldShowTimeDivider(base, base + 31 * 60 * 1000)).toBe(true)
  })

  it('跨天即使只隔 1 分钟也为真', () => {
    expect(shouldShowTimeDivider(at(2026, 10, 14, 23, 59), at(2026, 10, 15, 0, 0))).toBe(true)
  })

  it('目标早于基准（乱序）且同日时为假', () => {
    const base = at(2026, 10, 14, 10, 30)
    expect(shouldShowTimeDivider(base, at(2026, 10, 14, 10, 0))).toBe(false)
  })
})

describe('selectTimeDividerTurnKeys', () => {
  it('基准是「上一条分隔栏」而非「上一轮」（关键差异用例）', () => {
    // 每 29 分钟一条、跨 4 轮：按上一轮算会一个分隔都不出；按上一条分隔栏算第 3 轮出。
    const turns = [
      { key: 't0', timestampMs: at(2026, 10, 14, 10, 0) },
      { key: 't1', timestampMs: at(2026, 10, 14, 10, 29) },
      { key: 't2', timestampMs: at(2026, 10, 14, 10, 58) },
      { key: 't3', timestampMs: at(2026, 10, 14, 11, 27) },
    ]
    expect([...selectTimeDividerTurnKeys(turns)]).toEqual(['t0', 't2'])
  })

  it('跨天在交界轮出分隔栏', () => {
    const turns = [
      { key: 'a', timestampMs: at(2026, 10, 14, 23, 50) },
      { key: 'b', timestampMs: at(2026, 10, 15, 0, 5) },
    ]
    expect([...selectTimeDividerTurnKeys(turns)]).toEqual(['a', 'b'])
  })

  it('缺失时间戳的轮次被跳过且不重置基准', () => {
    const turns = [
      { key: 't0', timestampMs: at(2026, 10, 14, 10, 0) },
      { key: 't1', timestampMs: null },
      { key: 't2', timestampMs: at(2026, 10, 14, 10, 20) },
    ]
    expect([...selectTimeDividerTurnKeys(turns)]).toEqual(['t0'])
  })

  it('非法时间戳被跳过，后续合法值仍按基准判定', () => {
    const turns = [
      { key: 't0', timestampMs: at(2026, 10, 14, 10, 0) },
      { key: 't1', timestampMs: Number.NaN },
      { key: 't2', timestampMs: at(2026, 10, 14, 11, 0) },
    ]
    expect([...selectTimeDividerTurnKeys(turns)]).toEqual(['t0', 't2'])
  })

  it('空表与全缺失都返回空集合', () => {
    expect(selectTimeDividerTurnKeys([]).size).toBe(0)
    expect(selectTimeDividerTurnKeys([{ key: 'a' }, { key: 'b', timestampMs: null }]).size).toBe(0)
  })

  it('基准在出栏后重置，后续按新基准继续判', () => {
    const turns = [
      { key: 't0', timestampMs: at(2026, 10, 14, 10, 0) },
      { key: 't1', timestampMs: at(2026, 10, 14, 10, 40) }, // 距 t0 40 分 → 出栏，基准变 t1
      { key: 't2', timestampMs: at(2026, 10, 14, 11, 5) }, // 距 t1 25 分 → 不出
    ]
    expect([...selectTimeDividerTurnKeys(turns)]).toEqual(['t0', 't1'])
  })
})

describe('countLocalDaysBetween', () => {
  it('同日为 0，次日为 1，前一日为 -1', () => {
    expect(countLocalDaysBetween(at(2026, 10, 14, 0, 5), at(2026, 10, 14, 23, 0))).toBe(0)
    expect(countLocalDaysBetween(at(2026, 10, 14, 23, 0), at(2026, 10, 15, 0, 5))).toBe(1)
    expect(countLocalDaysBetween(at(2026, 10, 15, 0, 5), at(2026, 10, 14, 23, 0))).toBe(-1)
  })

  it('跨月按真实日历天数', () => {
    expect(countLocalDaysBetween(at(2026, 10, 31, 12, 0), at(2026, 11, 1, 1, 0))).toBe(1)
  })
})

describe('formatTimeDividerLabel', () => {
  const now = at(2026, 10, 14, 20, 0)

  it('今天 → Today HH:mm', () => {
    expect(formatTimeDividerLabel(at(2026, 10, 14, 14, 5), { now })).toBe('Today 14:05')
  })

  it('昨天 → Yesterday HH:mm', () => {
    expect(formatTimeDividerLabel(at(2026, 10, 13, 9, 0), { now })).toBe('Yesterday 09:00')
  })

  it('同年其它日 → MM-DD HH:mm', () => {
    expect(formatTimeDividerLabel(at(2026, 10, 12, 8, 0), { now })).toBe('10-12 08:00')
  })

  it('月/日与时刻都补零', () => {
    expect(formatTimeDividerLabel(at(2026, 1, 5, 8, 0), { now })).toBe('01-05 08:00')
  })

  it('跨年 → YYYY-MM-DD HH:mm', () => {
    expect(formatTimeDividerLabel(at(2025, 12, 31, 23, 30), { now })).toBe('2025-12-31 23:30')
  })

  it('translate 注入后 Today/Yesterday 走本地化文案', () => {
    const translate = (key: string): string => (key === 'Today' ? '今天' : key === 'Yesterday' ? '昨天' : key)
    expect(formatTimeDividerLabel(at(2026, 10, 14, 14, 5), { now, translate })).toBe('今天 14:05')
    expect(formatTimeDividerLabel(at(2026, 10, 13, 9, 0), { now, translate })).toBe('昨天 09:00')
  })

  it('非法输入返回空串', () => {
    expect(formatTimeDividerLabel(Number.NaN, { now })).toBe('')
    expect(formatTimeDividerLabel(Number.POSITIVE_INFINITY, { now })).toBe('')
  })
})
