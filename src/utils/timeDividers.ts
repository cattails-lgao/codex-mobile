/**
 * round-149（批 1）：消息列表「时间分隔」的判定与标签格式化。
 *
 * 规则取自 Codex 桌面端 `shouldShowMarker`：
 *   跨天 或 距上一条分隔栏 ≥ 30 分钟 ⇒ 在下一轮之前插一条时间分隔。
 *
 * ⚠️ 基准是**上一条已展示的分隔栏**，不是「上一轮」。两者在高频对话里结果完全不同：
 *   - 按上一条分隔栏：10:00(标) → 10:29(否) → 10:58(标，距 10:00 共 58 分) → 11:27(否)
 *   - 按上一轮：     10:00(标) → 10:29(否) → 10:58(否) → 11:27(否)  ← 整段没有分隔，明显不对
 * 桌面端变量名即 `previousMarkerSentAtMs`，本模块照此实现。
 */

/** 触发新分隔栏的最小间隔：30 分钟。 */
export const TIME_DIVIDER_GAP_MS = 30 * 60 * 1000

export type TimeDividerTurn = {
  /** 轮次唯一键，与 `renderTurns` 的 `turn.key` 对应。 */
  key: string
  /** 该轮起始时间（毫秒）。缺失 / 非法值会被跳过。 */
  timestampMs?: number | null | undefined
}

/** 两个时间戳是否落在同一「本地日历日」。 */
export function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs)
  const b = new Date(bMs)
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

/**
 * 是否应在 `nextMs` 这一轮之前展示分隔栏。
 * `previousMarkerMs` = 上一条**已展示**分隔栏的时间；`null` / `undefined` 表示还没出现过。
 */
export function shouldShowTimeDivider(
  previousMarkerMs: number | null | undefined,
  nextMs: number,
): boolean {
  if (typeof nextMs !== 'number' || !Number.isFinite(nextMs)) return false
  if (previousMarkerMs === null || previousMarkerMs === undefined || !Number.isFinite(previousMarkerMs)) {
    return true
  }
  if (!isSameLocalDay(previousMarkerMs, nextMs)) return true
  return nextMs - previousMarkerMs >= TIME_DIVIDER_GAP_MS
}

/** 从**有序**轮次表里挑出需要「前置时间分隔」的轮次键。 */
export function selectTimeDividerTurnKeys(turns: readonly TimeDividerTurn[]): Set<string> {
  const keys = new Set<string>()
  let previousMarkerMs: number | null = null
  for (const turn of turns) {
    const ms = turn.timestampMs
    if (typeof ms !== 'number' || !Number.isFinite(ms)) continue
    if (shouldShowTimeDivider(previousMarkerMs, ms)) {
      keys.add(turn.key)
      previousMarkerMs = ms
    }
  }
  return keys
}

/** 本地日历日差（`to` 相对 `from` 晚几天）。只比日期，忽略时刻；`Math.round` 吸收夏令时的 23/25 小时。 */
export function countLocalDaysBetween(fromMs: number, toMs: number): number {
  const from = new Date(fromMs)
  const to = new Date(toMs)
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((toDay - fromDay) / 86_400_000)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export type TimeDividerLabelOptions = {
  /** 「今天」的参照时刻，默认 `Date.now()`；测试注入固定值以保证确定性。 */
  now?: number
  /** 文案翻译（用于 Today / Yesterday）。默认恒等函数。 */
  translate?: (key: string) => string
}

/**
 * 生成分隔栏标签，四档：
 *   今天 → `Today 14:05`；昨天 → `Yesterday 09:00`；
 *   同年其它日 → `10-12 08:00`；跨年 → `2025-12-31 23:30`。
 *
 * 日期/时刻一律手工补零（`MM-DD` / `HH:mm`），**不用 `toLocaleDateString`**：
 * 后者在不同 locale 下分隔符不同（`10/12`、`12.10` …），既不可断言也不一致。
 */
export function formatTimeDividerLabel(
  timestampMs: number,
  options: TimeDividerLabelOptions = {},
): string {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) return ''
  const date = new Date(timestampMs)
  if (Number.isNaN(date.getTime())) return ''
  const translate = options.translate ?? ((key: string) => key)
  const nowMs = options.now ?? Date.now()
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  // 方向：`from=timestamp`、`to=now` ⇒ 今天 0、昨天 +1、明天 -1。
  const dayDiff = countLocalDaysBetween(timestampMs, nowMs)
  if (dayDiff === 0) return `${translate('Today')} ${time}`
  if (dayDiff === 1) return `${translate('Yesterday')} ${time}`
  const monthDay = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  if (new Date(nowMs).getFullYear() === date.getFullYear()) return `${monthDay} ${time}`
  return `${date.getFullYear()}-${monthDay} ${time}`
}
