// 批 4（round-168）：fork 一步截断的纯谓词（判定书批 4 #1）。
// 从 useDesktopState.forkThreadFromTurn 抽出，便于单测覆盖「上游忽略 beforeTurnId」的回退判定。

import type { UiMessage } from '../types/codex'

/**
 * fork 截断点 = turnIndex 之后首个带 turnId 的轮次（与 round-106 revert 的 beforeTurnId 同一取值；
 * 上游语义：剔除该轮及其后所有轮次）。没有更晚的轮次 ⇒ 空串（fork 全量即可）。
 */
export function findForkCutoffTurnId(messages: readonly UiMessage[], turnIndex: number): string {
  const cutoff = messages.find(
    (m) => typeof m.turnIndex === 'number' && m.turnIndex > turnIndex && Boolean(m.turnId?.trim()),
  )
  return cutoff?.turnId?.trim() ?? ''
}

/**
 * fork 结果是否按请求截断。上游若静默忽略未知的 beforeTurnId 参数，fork 结果里
 * 仍会含截断点轮次（按 turnId 命中，或按 turnIndex 落在截断点之后）⇒ 需要走
 * round-106 的「副本 revert」回退路径。cutoffTurnId 为空 ⇒ 无截断诉求，恒真。
 */
export function isForkTruncatedAsRequested(
  messages: readonly UiMessage[],
  cutoffTurnId: string,
  turnIndex: number,
): boolean {
  if (!cutoffTurnId) return true
  return !messages.some(
    (m) => m.turnId?.trim() === cutoffTurnId || (typeof m.turnIndex === 'number' && m.turnIndex > turnIndex),
  )
}
