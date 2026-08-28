import type { UiMessage } from '../types/codex'

/** 按 turnId 聚合该轮 worked 消息的耗时（毫秒）。仅 worked 消息携带 durationMs。 */
export function sumTurnDurations(messages: UiMessage[]): Record<string, number> {
  const byTurnId: Record<string, number> = {}
  for (const message of messages) {
    if (message.messageType === 'worked' && message.turnId && typeof message.durationMs === 'number') {
      byTurnId[message.turnId] = (byTurnId[message.turnId] ?? 0) + message.durationMs
    }
  }
  return byTurnId
}