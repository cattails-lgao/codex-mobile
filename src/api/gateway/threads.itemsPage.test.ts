// round-106: codex 0.159 added `thread/items/list` anchor pagination (#48151).
// The protocol shape is pinned by scripts/probe-items-page.cjs (default page of
// 25, records shaped `{turnId, item}`, `nextCursor` chaining). These tests keep
// the gateway wrapper honest about params and record parsing.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRpcMock = vi.hoisted(() => vi.fn())

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return { ...actual, callRpc: callRpcMock }
})

import { listThreadItemsPage } from './threads'

beforeEach(() => {
  callRpcMock.mockReset()
})

describe('listThreadItemsPage', () => {
  it('sends bounded default params and parses `{turnId, item}` records', async () => {
    callRpcMock.mockResolvedValue({
      data: [
        { turnId: 'turn-1', id: 'entry-1', item: { id: 'item-1', type: 'agentMessage', text: 'hello' } },
        { turnId: 'turn-1', item: { type: 'reasoning', summary: ['thinking'] } },
      ],
      nextCursor: 'cursor-2',
    })

    const page = await listThreadItemsPage('thread-1')

    expect(callRpcMock).toHaveBeenCalledWith('thread/items/list', {
      threadId: 'thread-1',
      limit: 25,
      sortDirection: 'asc',
    })
    expect(page.entries).toHaveLength(2)
    expect(page.entries[0]).toEqual({
      id: 'entry-1',
      turnId: 'turn-1',
      item: { id: 'item-1', type: 'agentMessage', text: 'hello' },
    })
    // Missing entry-level id falls back to the nested item id; missing ids stay null.
    expect(page.entries[1]?.id).toBeNull()
    expect(page.nextCursor).toBe('cursor-2')
  })

  it('forwards cursor/limit/sortDirection overrides and tolerates a bare result', async () => {
    callRpcMock.mockResolvedValue({ data: [] })

    const page = await listThreadItemsPage('thread-1', { cursor: 'cursor-9', limit: 50, sortDirection: 'desc' })

    expect(callRpcMock).toHaveBeenCalledWith('thread/items/list', {
      threadId: 'thread-1',
      limit: 50,
      sortDirection: 'desc',
      cursor: 'cursor-9',
    })
    expect(page.entries).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})
