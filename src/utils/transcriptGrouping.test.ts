import { describe, expect, it } from 'vitest'
import {
  buildTurnGroups,
  buildTurnRenderGroups,
  compactQuestionText,
  createWarmLayerState,
  messagesForTurnsFrom,
  scrollVersion,
  warmColdPageForTurn,
  warmLayerForSession,
  warmLayerWithColdPageAtLeast,
  warmLayerWithExpandedTurn,
  warmLayerWithNextColdPage,
  warmPagination,
  warmUserPreview,
} from './transcriptGrouping'
import type { UiMessage } from '../types/codex'

function msg(id: string, role: UiMessage['role'], messageType: string | undefined, extra: Record<string, unknown> = {}): UiMessage {
  return { id, role, text: '', messageType, turnId: undefined, turnIndex: undefined, ...extra } as UiMessage
}

describe('buildTurnGroups', () => {
  it('splits messages into turns at user boundaries', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'first question' }),
      msg('a1', 'assistant', 'agentMessage', { text: 'first answer' }),
      msg('c1', 'system', 'commandExecution'),
      msg('u2', 'user', undefined, { text: 'second question' }),
      msg('a2', 'assistant', 'agentMessage', { text: 'second answer' }),
    ]
    const groups = buildTurnGroups(messages)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.startIdx).toBe(0)
    expect(groups[0]?.endIdx).toBe(3)
    expect(groups[1]?.startIdx).toBe(3)
    expect(groups[1]?.endIdx).toBe(5)
  })

  it('captures the last non-streaming assistant text as the preview', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('a1', 'assistant', 'agentMessage', { text: 'first draft' }),
      msg('a2', 'assistant', 'agentMessage', {
        text: 'final answer padded out to be well beyond the eighty character preview cap for warm cards',
      }),
    ]
    const preview = buildTurnGroups(messages)[0]?.assistantPreview ?? ''
    expect(preview).toHaveLength(80)
    expect(preview.endsWith('...')).toBe(true)
  })

  it('ignores streaming assistant text for the preview', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('a1', 'assistant', 'agentMessage.live', { text: 'still typing' }),
      msg('a2', 'assistant', 'agentMessage', { text: 'settled' }),
    ]
    expect(buildTurnGroups(messages)[0]?.assistantPreview).toBe('settled')
  })

  it('counts toolCall messages per turn', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('t1', 'system', 'toolCall', { toolCall: { server: 's', tool: 'read', status: 'completed' } }),
      msg('t2', 'system', 'toolCall', { toolCall: { server: 's', tool: 'write', status: 'completed' } }),
      msg('a1', 'assistant', 'agentMessage', { text: 'done' }),
    ]
    expect(buildTurnGroups(messages)[0]?.toolCount).toBe(2)
  })

  it('merges leading non-user messages into the first turn', () => {
    const messages = [
      msg('sys', 'system', 'compaction.done', { text: 'compacted' }),
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('a1', 'assistant', 'agentMessage', { text: 'answer' }),
    ]
    const groups = buildTurnGroups(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.startIdx).toBe(0)
    expect(groups[0]?.endIdx).toBe(3)
    expect(groups[0]?.userItem.id).toBe('u1')
  })

  it('returns an empty list when there are no messages', () => {
    expect(buildTurnGroups([])).toHaveLength(0)
  })
})

describe('buildTurnRenderGroups', () => {
  it('keeps interleaved content in original order and marks only the final assistant response', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('a1', 'assistant', 'agentMessage', { text: 'progress update' }),
      msg('r1', 'assistant', 'reasoning', { reasoning: { summary: [], content: [] } }),
      msg('c1', 'system', 'commandExecution', { commandExecution: { status: 'completed' } }),
      msg('a2', 'assistant', 'agentMessage', { text: 'final answer' }),
    ]

    const group = buildTurnRenderGroups(messages)[0]
    expect(group?.items.map((item) => `${item.message.id}:${item.kind}`)).toEqual([
      'u1:user',
      'a1:assistant',
      'r1:reasoning',
      'c1:process',
      'a2:final-assistant',
    ])
  })

  it('retains plan and file change records in their chronological position', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('p1', 'assistant', 'plan', { text: '- [ ] do it' }),
      msg('f1', 'system', 'fileChange', { fileChanges: [{ path: 'a.ts' }] }),
      msg('a1', 'assistant', 'agentMessage', { text: 'done' }),
    ]

    const group = buildTurnRenderGroups(messages)[0]
    expect(group?.items.map((item) => `${item.message.id}:${item.kind}`)).toEqual([
      'u1:user',
      'p1:plan',
      'f1:file-change',
      'a1:final-assistant',
    ])
  })

  it('starts a fresh display group at each user message', () => {
    const groups = buildTurnRenderGroups([
      msg('u1', 'user', undefined, { text: 'first' }),
      msg('a1', 'assistant', 'agentMessage', { text: 'answer' }),
      msg('u2', 'user', undefined, { text: 'second' }),
    ])

    expect(groups.map((group) => group.items.map((item) => item.message.id))).toEqual([
      ['u1', 'a1'],
      ['u2'],
    ])
  })
})

describe('warmPagination', () => {
  it('shows the last pageSize warm turns on the first cold page', () => {
    const result = warmPagination({ turnCount: 100, hotTurns: 30, pageSize: 20, coldPage: 0 })
    expect(result).toEqual({ warmStartTurn: 50, warmEndTurn: 70, coldTurnCount: 50 })
  })

  it('advances the warm window one page per cold page', () => {
    const result = warmPagination({ turnCount: 100, hotTurns: 30, pageSize: 20, coldPage: 1 })
    expect(result).toEqual({ warmStartTurn: 30, warmEndTurn: 70, coldTurnCount: 30 })
  })

  it('returns all-zero when the turn count fits inside the hot zone', () => {
    expect(warmPagination({ turnCount: 25, hotTurns: 30, pageSize: 20, coldPage: 0 })).toEqual({
      warmStartTurn: 0,
      warmEndTurn: 0,
      coldTurnCount: 0,
    })
  })

  it('clamps negative inputs', () => {
    expect(warmPagination({ turnCount: -5, hotTurns: 30, pageSize: 20, coldPage: 0 })).toEqual({
      warmStartTurn: 0,
      warmEndTurn: 0,
      coldTurnCount: 0,
    })
  })
})

describe('warmColdPageForTurn', () => {
  const params = { turnCount: 100, hotTurns: 30, pageSize: 20 }

  it('returns 0 for turns inside the hot zone', () => {
    expect(warmColdPageForTurn({ turn: 99, ...params })).toBe(0)
    expect(warmColdPageForTurn({ turn: 70, ...params })).toBe(0)
  })

  it('computes the cold page needed to reveal a given warm turn', () => {
    expect(warmColdPageForTurn({ turn: 69, ...params })).toBe(0)
    expect(warmColdPageForTurn({ turn: 50, ...params })).toBe(0)
    expect(warmColdPageForTurn({ turn: 49, ...params })).toBe(1)
    expect(warmColdPageForTurn({ turn: 0, ...params })).toBe(3)
  })

  it('returns 0 when there is no warm zone', () => {
    expect(warmColdPageForTurn({ turn: 0, turnCount: 25, hotTurns: 30, pageSize: 20 })).toBe(0)
  })
})

describe('warm layer state', () => {
  const key = 'session-1'

  it('creates a fresh state per session key', () => {
    const state = createWarmLayerState(key)
    expect(state.sessionKey).toBe(key)
    expect(state.coldPage).toBe(0)
    expect(state.expandedWarmTurns.size).toBe(0)
  })

  it('resets when the session key changes', () => {
    const state = { ...createWarmLayerState(key), coldPage: 3 }
    const other = warmLayerForSession(state, 'session-2')
    expect(other.coldPage).toBe(0)
    expect(other.sessionKey).toBe('session-2')
  })

  it('increments coldPage monotonically', () => {
    const next = warmLayerWithNextColdPage(createWarmLayerState(key), key)
    expect(next.coldPage).toBe(1)
  })

  it('keeps coldPage at least the requested value', () => {
    const state = warmLayerWithColdPageAtLeast(createWarmLayerState(key), key, 2)
    expect(state.coldPage).toBe(2)
    expect(warmLayerWithColdPageAtLeast(state, key, 1).coldPage).toBe(2)
  })

  it('adds and removes expanded turns immutably', () => {
    const expanded = warmLayerWithExpandedTurn(createWarmLayerState(key), key, 3, true)
    expect(expanded.expandedWarmTurns.has(3)).toBe(true)
    const collapsed = warmLayerWithExpandedTurn(expanded, key, 3, false)
    expect(collapsed.expandedWarmTurns.has(3)).toBe(false)
    expect(expanded.expandedWarmTurns.has(3)).toBe(true)
  })
})

describe('preview helpers', () => {
  it('truncates long text to 80 chars without ellipsis', () => {
    const long = 'x'.repeat(100)
    expect(compactQuestionText(long)).toHaveLength(80)
  })

  it('keeps short text as-is', () => {
    expect(compactQuestionText('short')).toBe('short')
  })

  it('collapses whitespace', () => {
    expect(compactQuestionText('a\n  b\tc')).toBe('a b c')
  })

  it('appends an ellipsis past the 80 char preview limit', () => {
    const long = 'y'.repeat(100)
    const preview = warmUserPreview(long)
    expect(preview).toHaveLength(80)
    expect(preview.endsWith('...')).toBe(true)
  })
})

describe('messagesForTurnsFrom', () => {
  const messages = [
    msg('u1', 'user', undefined, { text: 'q1' }),
    msg('a1', 'assistant', 'agentMessage', { text: 'a1' }),
    msg('u2', 'user', undefined, { text: 'q2' }),
    msg('a2', 'assistant', 'agentMessage', { text: 'a2' }),
    msg('u3', 'user', undefined, { text: 'q3' }),
  ]
  const groups = buildTurnGroups(messages)

  it('returns the tail from the warmEndTurn boundary', () => {
    const tail = messagesForTurnsFrom(messages, groups, 1)
    expect(tail.map((m) => m.id)).toEqual(['u2', 'a2', 'u3'])
  })

  it('returns everything when warmEndTurn is 0', () => {
    expect(messagesForTurnsFrom(messages, groups, 0)).toHaveLength(5)
  })

  it('falls back to the full list when there are no turn groups', () => {
    const only = [msg('a1', 'assistant', 'agentMessage', { text: 'x' })]
    expect(messagesForTurnsFrom(only, [], 0)).toHaveLength(1)
  })

  it('returns an empty list when warmEndTurn exceeds the group count', () => {
    expect(messagesForTurnsFrom(messages, groups, 9)).toHaveLength(0)
  })
})

describe('scrollVersion', () => {
  it('marks assistant messages by streaming state only', () => {
    const messages = [
      msg('a1', 'assistant', 'agentMessage', { text: 'x' }),
      msg('a2', 'assistant', 'agentMessage.live', { text: 'y' }),
    ]
    const v1 = scrollVersion(messages)
    const changed = scrollVersion([
      msg('a1', 'assistant', 'agentMessage', { text: 'x changed' }),
      msg('a2', 'assistant', 'agentMessage.live', { text: 'y changed' }),
    ])
    expect(changed).toBe(v1)
  })

  it('changes when a tool status changes', () => {
    const v1 = scrollVersion([msg('t1', 'system', 'toolCall', { toolCall: { server: 's', tool: 'r', status: 'completed' } })])
    const v2 = scrollVersion([msg('t1', 'system', 'toolCall', { toolCall: { server: 's', tool: 'r', status: 'inProgress' } })])
    expect(v2).not.toBe(v1)
  })
})
