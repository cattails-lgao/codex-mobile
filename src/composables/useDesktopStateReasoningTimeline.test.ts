import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import {
  appendReasoningItemProgress,
  buildTurnReasoningItems,
  clearLiveReasoningForThread,
  recordTurnItemOrder,
  rememberPersistedReasoning,
  type ReasoningTimelineDeps,
} from './useDesktopStateReasoningTimeline'

function makeDeps(): ReasoningTimelineDeps {
  const liveReasoningTextByThreadId = ref<Record<string, string>>({})
  const persistedReasoningByThreadId = ref<Record<string, UiMessage[]>>({})
  return {
    liveReasoningTextByThreadId,
    persistedReasoningByThreadId,
    turnIndexByTurnIdByThreadId: ref<Record<string, Record<string, number>>>({}),
    activeTurnIdByThreadId: ref<Record<string, string>>({}),
    activeReasoningTurnIdByThreadId: new Map<string, string>(),
    reasoningItemTextByItemId: new Map<string, string>(),
    reasoningAppendedTextByItemId: new Map<string, string>(),
    turnItemSequenceByThreadId: new Map<string, Array<{ itemId: string; kind: 'reasoning' | 'other' }>>(),
    appendLiveReasoningText: (threadId: string, delta: string) => {
      const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
      liveReasoningTextByThreadId.value = {
        ...liveReasoningTextByThreadId.value,
        [threadId]: `${previous}${delta}`,
      }
    },
    clearLiveReasoningSnapshot: () => {},
    savePersistedReasoningMap: () => {},
  }
}

function startedNotification(threadId: string, item: { id: string; type: string }) {
  return {
    method: 'item/started',
    params: { threadId, item },
    atIso: new Date().toISOString(),
  }
}

describe('useDesktopStateReasoningTimeline order', () => {
  it('buildTurnReasoningItems anchors reasoning behind the nearest previous other item', () => {
    const deps = makeDeps()
    deps.turnItemSequenceByThreadId.set('t1', [
      { itemId: 'r1', kind: 'reasoning' },
      { itemId: 'c1', kind: 'other' },
      { itemId: 'r2', kind: 'reasoning' },
    ])
    deps.reasoningItemTextByItemId.set('r1', 'think one')
    deps.reasoningItemTextByItemId.set('r2', 'think two')
    expect(buildTurnReasoningItems(deps, 't1')).toEqual([
      { text: 'think one', anchorMessageId: '', itemId: 'r1' },
      { text: 'think two', anchorMessageId: 'c1', itemId: 'r2' },
    ])
  })

  it('recordTurnItemOrder records reasoning and other items in arrival order', () => {
    const deps = makeDeps()
    recordTurnItemOrder(deps, startedNotification('t1', { id: 'r1', type: 'reasoning' }))
    recordTurnItemOrder(deps, startedNotification('t1', { id: 'c1', type: 'commandExecution' }))
    expect(deps.turnItemSequenceByThreadId.get('t1')).toEqual([
      { itemId: 'r1', kind: 'reasoning' },
      { itemId: 'c1', kind: 'other' },
    ])
  })
})

describe('useDesktopStateReasoningTimeline progress', () => {
  it('appendReasoningItemProgress appends new text with a separator and tracks per-item text', () => {
    const deps = makeDeps()
    appendReasoningItemProgress(deps, 't1', 'r1', 'first')
    appendReasoningItemProgress(deps, 't1', 'r1', 'second')
    expect(deps.liveReasoningTextByThreadId.value.t1).toBe('first\n\nsecond')
    expect(deps.reasoningItemTextByItemId.get('r1')).toBe('second')
  })
})

describe('useDesktopStateReasoningTimeline archive', () => {
  it('clearLiveReasoningForThread archives per-item reasoning and clears live text', () => {
    const deps = makeDeps()
    deps.liveReasoningTextByThreadId.value = { t1: 'think one\n\nthink two' }
    deps.turnItemSequenceByThreadId.set('t1', [
      { itemId: 'r1', kind: 'reasoning' },
      { itemId: 'c1', kind: 'other' },
      { itemId: 'r2', kind: 'reasoning' },
    ])
    deps.reasoningItemTextByItemId.set('r1', 'think one')
    deps.reasoningItemTextByItemId.set('r2', 'think two')
    deps.activeReasoningTurnIdByThreadId.set('t1', 'turn1')
    deps.turnIndexByTurnIdByThreadId.value = { t1: { turn1: 3 } }

    clearLiveReasoningForThread(deps, 't1')

    const archived = deps.persistedReasoningByThreadId.value.t1
    expect(archived).toHaveLength(2)
    expect(archived[0]).toMatchObject({ messageType: 'reasoning', text: 'think one', turnId: 'turn1', turnIndex: 3, reasoningAnchorMessageId: undefined })
    expect(archived[1]).toMatchObject({ messageType: 'reasoning', text: 'think two', turnId: 'turn1', turnIndex: 3, reasoningAnchorMessageId: 'c1' })
    expect(deps.liveReasoningTextByThreadId.value.t1).toBeUndefined()
  })

  it('clearLiveReasoningForThread falls back to whole-text archive when no item timeline', () => {
    const deps = makeDeps()
    deps.liveReasoningTextByThreadId.value = { t1: 'plain thinking' }
    clearLiveReasoningForThread(deps, 't1')
    expect(deps.persistedReasoningByThreadId.value.t1).toHaveLength(1)
    expect(deps.persistedReasoningByThreadId.value.t1[0].text).toBe('plain thinking')
    expect(deps.liveReasoningTextByThreadId.value.t1).toBeUndefined()
  })

  it('rememberPersistedReasoning dedupes identical archived text', () => {
    const deps = makeDeps()
    rememberPersistedReasoning(deps, 't1', 'same text')
    rememberPersistedReasoning(deps, 't1', 'same text')
    expect(deps.persistedReasoningByThreadId.value.t1).toHaveLength(1)
  })
})