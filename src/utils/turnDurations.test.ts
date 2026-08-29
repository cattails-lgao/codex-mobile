import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import { sumTurnDurations } from './turnDurations'
import { insertPersistedTurnDurations } from '../composables/useDesktopStateUtils'

function worked(id: string, turnId: string, durationMs: number): UiMessage {
  return { id, turnId, role: 'assistant', messageType: 'worked', durationMs, text: '' } as UiMessage
}

function plain(id: string, role: 'user' | 'assistant', turnId: string, text = ''): UiMessage {
  return { id, turnId, role, text, messageType: undefined } as UiMessage
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

describe('insertPersistedTurnDurations', () => {
  it('为每个持久化耗时 turn 补一条 worked 消息，并保持原消息顺序', () => {
    const messages = [plain('u', 'user', 't1'), plain('a', 'assistant', 't1')]
    const next = insertPersistedTurnDurations(messages, { t1: 150_000, t2: 20_000 })
    expect(next.slice(0, 2)).toEqual(messages)
    const added = next.slice(2)
    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({ messageType: 'worked', turnId: 't1', durationMs: 150_000 })
    expect(added[1]).toMatchObject({ messageType: 'worked', turnId: 't2', durationMs: 20_000 })
    expect(sumTurnDurations(next)).toEqual({ t1: 150_000, t2: 20_000 })
  })

  it('跳过已有 worked 消息的 turn（live 摘要已插入时不重复），忽略非法耗时', () => {
    const messages = [plain('u', 'user', 't1'), worked('w', 't1', 60_000)]
    const next = insertPersistedTurnDurations(messages, {
      t1: 99_000,
      t2: 0,
      t3: Number.NaN,
    })
    expect(next).toEqual(messages)
  })

  it('undefined 或无耗时时不改动消息流', () => {
    const messages = [plain('u', 'user', 't1')]
    expect(insertPersistedTurnDurations(messages, undefined)).toBe(messages)
    expect(insertPersistedTurnDurations(messages, {})).toBe(messages)
  })
})