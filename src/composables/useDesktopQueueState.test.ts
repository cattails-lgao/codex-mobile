import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadQueueState } from '../api/codexGateway'
import type { QueuedMessage } from './useDesktopQueueState'

const gatewayMocks = vi.hoisted(() => ({
  getThreadQueueState: vi.fn(),
  setThreadQueueState: vi.fn(),
}))

vi.mock('../api/codexGateway', () => gatewayMocks)

import { createDesktopQueueState } from './useDesktopQueueState'

const STASH_KEY = 'codex-web-local.stashed-messages.v1'
const THRESHOLD_KEY = 'codex-web-local.auto-compact-threshold.v1'

function queuedMessage(id: string, options: { awaitingCompaction?: boolean } = {}): QueuedMessage {
  return {
    id,
    text: `${id} text`,
    imageUrls: [`/${id}.png`],
    skills: [{ name: id, path: `/skills/${id}/SKILL.md` }],
    fileAttachments: [{ label: id, path: `${id}.txt`, fsPath: `/repo/${id}.txt` }],
    collaborationMode: 'default',
    ...options,
  }
}

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
    },
    setTimeout: globalThis.setTimeout,
  })
  return store
}

describe('createDesktopQueueState', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    gatewayMocks.getThreadQueueState.mockReset()
    gatewayMocks.setThreadQueueState.mockReset()
    gatewayMocks.setThreadQueueState.mockResolvedValue(undefined)
  })

  it('restores stashed rows and normalizes the auto-compact threshold', () => {
    const stashed = queuedMessage('stash-1')
    const storage = installTestWindow({
      [STASH_KEY]: JSON.stringify({ 'thread-1': [stashed] }),
      [THRESHOLD_KEY]: '15.4',
    })
    const state = createDesktopQueueState(ref('thread-1'))

    expect(state.autoCompactThreshold.value).toBe(15)
    expect(state.selectedThreadQueuedMessages.value).toEqual([
      { ...stashed, awaitingCompaction: true },
    ])

    state.setAutoCompactThreshold(-1)
    expect(state.autoCompactThreshold.value).toBe(0)
    expect(storage.get(THRESHOLD_KEY)).toBe('0')
  })

  it('loads persisted backend queue state only once', async () => {
    installTestWindow()
    const backendState: ThreadQueueState = { 'thread-1': [queuedMessage('queue-1')] }
    gatewayMocks.getThreadQueueState.mockResolvedValue(backendState)
    const state = createDesktopQueueState(ref('thread-1'))

    await state.loadPersistedQueueStateIfNeeded()
    await state.loadPersistedQueueStateIfNeeded()

    expect(gatewayMocks.getThreadQueueState).toHaveBeenCalledTimes(1)
    expect(state.selectedThreadQueuedMessages.value).toEqual(backendState['thread-1'])

    gatewayMocks.getThreadQueueState.mockRejectedValueOnce(new Error('offline'))
    await state.processQueuedMessages('thread-1')
    expect(state.selectedThreadQueuedMessages.value).toEqual(backendState['thread-1'])
  })

  it('coalesces an in-flight queue refresh and keeps the 650 ms follow-up refresh', async () => {
    vi.useFakeTimers()
    installTestWindow()
    let resolveRequest: ((value: ThreadQueueState) => void) | undefined
    gatewayMocks.getThreadQueueState
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRequest = resolve
      }))
      .mockResolvedValueOnce({})
    const state = createDesktopQueueState(ref('thread-1'))

    const first = state.processQueuedMessages('thread-1')
    const second = state.processQueuedMessages('thread-1')
    expect(gatewayMocks.getThreadQueueState).toHaveBeenCalledTimes(1)
    resolveRequest?.({})
    await Promise.all([first, second])

    state.scheduleQueueStateRefresh('thread-1')
    await Promise.resolve()
    expect(gatewayMocks.getThreadQueueState).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(650)
    expect(gatewayMocks.getThreadQueueState).toHaveBeenCalledTimes(3)
  })

  it('persists queue insertion and reordering without UI-only fields', () => {
    installTestWindow()
    const selectedThreadId = ref('thread-1')
    const state = createDesktopQueueState(selectedThreadId)

    state.enqueueQueuedMessage('thread-1', queuedMessage('queue-1', { awaitingCompaction: true }))
    state.enqueueQueuedMessage('thread-1', queuedMessage('queue-2'), 0)
    expect(state.selectedThreadQueuedMessages.value.map((message) => message.id)).toEqual([
      'queue-2',
      'queue-1',
    ])
    expect(gatewayMocks.setThreadQueueState).toHaveBeenLastCalledWith({
      'thread-1': [
        queuedMessage('queue-2'),
        queuedMessage('queue-1'),
      ],
    })

    state.reorderQueuedMessage('queue-1', 'queue-2')
    expect(state.selectedThreadQueuedMessages.value.map((message) => message.id)).toEqual([
      'queue-1',
      'queue-2',
    ])
  })

  it('keeps stashed rows first, excludes them from reorder, and persists removal', () => {
    const stashed = queuedMessage('stash-1')
    const storage = installTestWindow({
      [STASH_KEY]: JSON.stringify({ 'thread-1': [stashed] }),
    })
    const state = createDesktopQueueState(ref('thread-1'))
    state.enqueueQueuedMessage('thread-1', queuedMessage('queue-1'))

    state.reorderQueuedMessage('stash-1', 'queue-1')
    expect(state.selectedThreadQueuedMessages.value.map((message) => message.id)).toEqual([
      'stash-1',
      'queue-1',
    ])

    state.removeQueuedMessage('stash-1')
    expect(state.selectedThreadQueuedMessages.value.map((message) => message.id)).toEqual(['queue-1'])
    expect(JSON.parse(storage.get(STASH_KEY) ?? '{}')).toEqual({})
  })

  it('takes stashed rows once and clears all queue persistence', () => {
    const storage = installTestWindow()
    const state = createDesktopQueueState(ref('thread-1'))
    state.appendStashedMessage('thread-1', queuedMessage('stash-1'))
    state.enqueueQueuedMessage('thread-1', queuedMessage('queue-1'))

    expect(state.takeStashedMessages('thread-1')).toEqual([queuedMessage('stash-1')])
    expect(state.takeStashedMessages('thread-1')).toEqual([])

    state.clearQueueState()
    expect(state.selectedThreadQueuedMessages.value).toEqual([])
    expect(JSON.parse(storage.get(STASH_KEY) ?? '{}')).toEqual({})
    expect(gatewayMocks.setThreadQueueState).toHaveBeenLastCalledWith({})
  })
})
