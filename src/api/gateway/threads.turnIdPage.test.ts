// round-141: 回退前的服务端轮次存在性探针。`thread/turns/list` 的 desc 分页里
// `itemsView: "notLoaded"` 只回 id（实测一页 ~625B / 14ms），且 app-server 把一页钳到
// 100 条（round-104 实测，见 bridge/threadTurnPage.ts 的 TURN_LIST_SERVER_PAGE_CLAMP），
// 所以 `complete`（本页没有 nextCursor）才是「这就是全部轮次」的凭据——调用方只许在
// `complete === true` 时把「id 不在页里」判定为「服务端没有该轮」。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadTurnsListResponse } from '../appServerDtos'

const callRpcMock = vi.hoisted(() => vi.fn())

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return { ...actual, callRpc: callRpcMock }
})

import { listThreadTurnIdPage } from './threads'

beforeEach(() => {
  callRpcMock.mockReset()
})

describe('listThreadTurnIdPage', () => {
  it('asks for the newest id page only (notLoaded) and reports it complete when there is no cursor', async () => {
    callRpcMock.mockResolvedValue({
      data: [{ id: 'turn-2' }, { id: 'turn-1' }],
      nextCursor: null,
      backwardsCursor: null,
    } as unknown as ThreadTurnsListResponse)

    const page = await listThreadTurnIdPage('thread-1')

    expect(callRpcMock).toHaveBeenCalledWith('thread/turns/list', {
      threadId: 'thread-1',
      limit: 10000,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    })
    expect(page).toEqual({ turnIds: ['turn-2', 'turn-1'], complete: true })
  })

  it('reports complete: false when a nextCursor means older turns were left out', async () => {
    callRpcMock.mockResolvedValue({
      data: [{ id: 'turn-3' }],
      nextCursor: 'cursor-9',
      backwardsCursor: null,
    } as unknown as ThreadTurnsListResponse)

    expect(await listThreadTurnIdPage('thread-1')).toEqual({ turnIds: ['turn-3'], complete: false })
  })

  it('drops malformed rows instead of leaking an unusable id into the check', async () => {
    callRpcMock.mockResolvedValue({
      data: [{ id: 'turn-1' }, { id: '' }, { id: null }, {}],
      nextCursor: null,
      backwardsCursor: null,
    } as unknown as ThreadTurnsListResponse)

    expect(await listThreadTurnIdPage('thread-1')).toEqual({ turnIds: ['turn-1'], complete: true })
  })
})
