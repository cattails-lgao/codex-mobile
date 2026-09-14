// round-79 regression: `thread/turns/list` with `sortDirection: 'desc'` returns
// newest-first (verified live against the app-server). `revertThread` hydrates the
// retained history through that endpoint, so it must reverse the page before
// normalizing — otherwise the reverted thread renders upside down (oldest message
// at the bottom) and turnIndex is assigned in reverse.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadRevertResponse, ThreadTurnsListResponse } from '../appServerDtos'

const callRpcMock = vi.hoisted(() => vi.fn())

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return { ...actual, callRpc: callRpcMock }
})

import { revertThread } from './threads'

function turn(id: string, text: string) {
  return {
    id,
    status: 'completed',
    items: [{ id: `${id}-item`, type: 'agentMessage', text }],
  }
}

beforeEach(() => {
  callRpcMock.mockReset()
})

describe('revertThread hydrate ordering', () => {
  it('reverses the desc page so retained history is chronological', async () => {
    callRpcMock.mockImplementation(async (method: string) => {
      if (method === 'thread/revert') {
        return {
          thread: { id: 'thread-1', turns: [] },
          turnsBackwardsCursor: 'cursor-1',
        } as unknown as ThreadRevertResponse
      }
      // desc page: newest turn first.
      return {
        data: [turn('turn-newest', 'newest turn text'), turn('turn-oldest', 'oldest turn text')],
      } as unknown as ThreadTurnsListResponse
    })

    const messages = await revertThread('thread-1', 'turn-newest')

    expect(callRpcMock).toHaveBeenCalledWith('thread/turns/list', expect.objectContaining({
      threadId: 'thread-1',
      cursor: 'cursor-1',
      sortDirection: 'desc',
    }))
    expect(messages.map((message) => message.text)).toEqual(['oldest turn text', 'newest turn text'])
    // turnIndex follows chronological order: oldest retained turn = 0.
    expect(messages[0]?.turnIndex).toBe(0)
    expect(messages[messages.length - 1]?.turnIndex).toBe(1)
  })

  it('returns no messages when the revert response has no cursor', async () => {
    callRpcMock.mockResolvedValue({
      thread: { id: 'thread-1', turns: [] },
      turnsBackwardsCursor: null,
    } as unknown as ThreadRevertResponse)

    expect(await revertThread('thread-1', 'turn-1')).toEqual([])
    expect(callRpcMock).not.toHaveBeenCalledWith('thread/turns/list', expect.anything())
  })
})
