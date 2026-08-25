import { describe, expect, it, vi } from 'vitest'
import { runRpcResponsePipeline, type RpcPipelineDeps } from './rpcPipeline.js'

function createDeps(subagentIds: string[]): RpcPipelineDeps {
  return {
    appServer: {
      storeThreadReadSnapshot: vi.fn(),
    } as unknown as RpcPipelineDeps['appServer'],
    externalSessionTracker: {
      getExternalSession: () => null,
      getUserFacingSubagentThreadIds: () => new Set(subagentIds),
    },
    sanitizeThreadTurnsInlinePayloads: async (_method, result) => result,
    mergeImportedThreadsIntoThreadListResult: (result) => result,
  }
}

describe('runRpcResponsePipeline', () => {
  it('filters thread/list from the tracker cache without waiting for a scan', async () => {
    const getUserFacingSubagentThreadIds = vi.fn(() => new Set(['subagent-thread']))
    const deps = createDeps([])
    deps.externalSessionTracker.getUserFacingSubagentThreadIds = getUserFacingSubagentThreadIds

    await expect(runRpcResponsePipeline(deps, 'thread/list', {
      data: [{ id: 'user-thread' }, { id: 'subagent-thread' }],
    })).resolves.toEqual({ data: [{ id: 'user-thread' }] })

    expect(getUserFacingSubagentThreadIds).toHaveBeenCalledTimes(1)
  })
})
