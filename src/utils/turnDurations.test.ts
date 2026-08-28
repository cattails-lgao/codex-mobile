import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import { sumTurnDurations } from './turnDurations'

function worked(id: string, turnId: string, durationMs: number): UiMessage {
  return { id, turnId, role: 'assistant', messageType: 'worked', durationMs, text: '' } as UiMessage
}

describe('sumTurnDurations', () => {
  it('聚合同一 turnId 内所有 worked 消息的耗时', () => {
    const messages = [
      worked('a', 't1', 50_000),
      worked('b', 't1', 30_000),
      worked('c', 't2', 12_000),
    ]
    expect(sumTurnDurations(messages)).toEqual({ t1: 80_000, t2: 12_000 })
  })

  it('忽略无 turnId、非 worked、或耗时非 number 的消息', () => {
    const messages: UiMessage[] = [
      worked('a', 't1', 1000),
      { id: 'b', role: 'user', text: 'hi' },
      { id: 'c', role: 'assistant', turnId: 't2', messageType: 'worked', text: '' },
      { id: 'd', role: 'assistant', turnId: 't2', messageType: 'worked', durationMs: null as unknown as number, text: '' },
    ]
    expect(sumTurnDurations(messages)).toEqual({ t1: 1000 })
  })

  it('空或无 worked 消息时返回空对象', () => {
    expect(sumTurnDurations([])).toEqual({})
    expect(sumTurnDurations([{ id: 'x', role: 'user', text: 'hi' }])).toEqual({})
  })
})