import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiMessage } from '../../types/codex'
import type { TurnFileChangeSummary } from '../../utils/conversationFileChanges'
import { createReplyCopyFork, type ReplyCopyForkDeps } from './useReplyCopyFork'

function assistant(id: string, turnIndex: number): UiMessage {
  return { id, role: 'assistant', messageType: 'message', text: `reply ${id}`, turnIndex } as UiMessage
}

function emptyAssistant(id: string, turnIndex: number): UiMessage {
  return { id, role: 'assistant', messageType: 'message', text: '', turnIndex } as UiMessage
}

function userMessage(id: string, text = 'user msg'): UiMessage {
  return { id, role: 'user', messageType: 'message', text } as UiMessage
}

function depsFor(messages: UiMessage[], summaries: Record<string, TurnFileChangeSummary> = {}): ReturnType<typeof createReplyCopyFork> {
  const deps: ReplyCopyForkDeps = {
    getMessages: () => messages,
    isCopyableAssistantMessage: (m) => m.role === 'assistant',
    isPlanMessage: (m) => m.messageType === 'plan' || m.messageType === 'plan.live',
    planStepCopyMarker: (status) => (status === 'completed' ? '[x]' : '[ ]'),
    buildFileChangeCopyText: (summary) =>
      (summary && 'changes' in summary ? (summary.changes ?? []) : []).map((c) => `- ${c.path}`).join('\n'),
    getAnchoredFileChangeSummaries: () => summaries,
  }
  return createReplyCopyFork(deps)
}

function metadataSummary(turnId: string, path = '/repo/x.ts'): TurnFileChangeSummary {
  return { turnId, sourceMessageIds: [], source: 'metadata', changes: [{ path, operation: 'update', diff: '', addedLineCount: 1, removedLineCount: 0 }] } as TurnFileChangeSummary
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useReplyCopyFork', () => {
  it('groups assistant replies by turn, anchored to the last message of the turn', () => {
    const fork = depsFor([assistant('a1', 0), assistant('a2', 0), assistant('a3', 1)])

    expect(fork.copyableResponseContentByAnchorId.value).toEqual({
      a2: 'reply a1\n\nreply a2',
      a3: 'reply a3',
    })
  })

  it('drops assistant messages with no copyable content', () => {
    const fork = depsFor([emptyAssistant('a1', 0), assistant('a2', 1)])

    expect(fork.copyableResponseContentByAnchorId.value).toEqual({ a2: 'reply a2' })
  })

  it('appends metadata file-change copy text to the anchored response', () => {
    const summary = metadataSummary('t1')
    const fork = depsFor([assistant('a1', 0)], { a1: summary })

    expect(fork.copyableResponseContentByAnchorId.value.a1).toBe('reply a1\n\n- /repo/x.ts')
  })

  it('skips non-metadata file-change summaries', () => {
    const summary = { ...metadataSummary('t1'), source: 'standalone' as const }
    const fork = depsFor([assistant('a1', 0)], { a1: summary })

    expect(fork.copyableResponseContentByAnchorId.value.a1).toBe('reply a1')
  })

  it('maps each forkable turn to its last anchored turn index', () => {
    const fork = depsFor([assistant('a1', 0), assistant('a2', 0), assistant('a3', 2)])

    expect(fork.forkableTurnIndexByAnchorId.value).toEqual({ a2: 0, a3: 2 })
  })

  it('toggles visibility: copy button shows for anchored responses, fork shows for forkable turns', () => {
    const fork = depsFor([assistant('a1', 0), userMessage('u1')])

    expect(fork.showCopyResponseButton(assistant('a1', 0))).toBe(true)
    expect(fork.showForkResponseButton(assistant('a1', 0))).toBe(true)
    expect(fork.showCopyResponseButton(userMessage('u1'))).toBe(false)
    expect(fork.showForkResponseButton(userMessage('u1'))).toBe(false)
  })

  it('reports user messages with content as copyable', () => {
    const fork = depsFor([])

    expect(fork.isCopyableUserMessage(userMessage('u1'))).toBe(true)
    expect(fork.isCopyableUserMessage(userMessage('u2', ''))).toBe(false)
  })

  it('marks a user message copied after a successful clipboard write and resets after the timer', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const fork = depsFor([userMessage('u1')])

    await fork.copyUserMessage('u1')
    expect(fork.copiedResponseAnchorId.value).toBe('u1')

    await vi.advanceTimersByTimeAsync(1800)
    expect(fork.copiedResponseAnchorId.value).toBe('')
  })

  it('marks an anchored response copied after a successful clipboard write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    const fork = depsFor([assistant('a1', 0)])

    await fork.copyResponse('a1')
    expect(fork.copiedResponseAnchorId.value).toBe('a1')
  })

  it('does not set copied state when there is no clipboard and no document fallback', async () => {
    const fork = depsFor([assistant('a1', 0)])

    await fork.copyResponse('a1')
    expect(fork.copiedResponseAnchorId.value).toBe('')

    await fork.copyUserMessage('u1')
    expect(fork.copiedResponseAnchorId.value).toBe('')
  })
})