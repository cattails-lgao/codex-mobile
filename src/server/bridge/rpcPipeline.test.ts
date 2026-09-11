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

  it('uses tracker state updated while asynchronous list processing is in flight', async () => {
    let subagentIds = new Set<string>()
    let releaseSanitizer: (() => void) | undefined
    const deps = createDeps([])
    deps.externalSessionTracker.getUserFacingSubagentThreadIds = () => subagentIds
    deps.sanitizeThreadTurnsInlinePayloads = async (_method, result) => new Promise((resolve) => {
      releaseSanitizer = () => resolve(result)
    })

    const pipeline = runRpcResponsePipeline(deps, 'thread/list', {
      data: [{ id: 'user-thread' }, { id: 'subagent-thread' }],
    })
    await vi.waitFor(() => expect(releaseSanitizer).toBeTypeOf('function'))

    // Simulate the background tracker completing its scan while the pipeline
    // awaits asynchronous post-processing.
    subagentIds = new Set(['subagent-thread'])
    releaseSanitizer?.()

    await expect(pipeline).resolves.toEqual({ data: [{ id: 'user-thread' }] })
  })

  it('collapses duplicate thread ids to the newest segment and keeps first-seen order', async () => {
    const deps = createDeps([])

    const result = await runRpcResponsePipeline(deps, 'thread/list', {
      data: [
        { id: 'dup', path: 'segment-old.jsonl', updatedAt: 100 },
        { id: 'other', path: 'other.jsonl', updatedAt: 50 },
        { id: 'dup', path: 'segment-new.jsonl', updatedAt: 300 },
      ],
    })

    expect(result).toEqual({
      data: [
        { id: 'dup', path: 'segment-new.jsonl', updatedAt: 300 },
        { id: 'other', path: 'other.jsonl', updatedAt: 50 },
      ],
    })
  })

  it('passes rows without a usable id through untouched while still deduping the rest', async () => {
    const deps = createDeps([])

    const result = await runRpcResponsePipeline(deps, 'thread/list', {
      data: [{ id: 'dup', updatedAt: 1 }, { path: 'no-id.jsonl' }, { id: 'dup', updatedAt: 9 }],
    })

    expect(result).toEqual({
      data: [{ id: 'dup', updatedAt: 9 }, { path: 'no-id.jsonl' }],
    })
  })

  it('returns the same object when every thread id is already unique', async () => {
    const deps = createDeps([])
    const payload = { data: [{ id: 'a' }, { id: 'b' }] }

    await expect(runRpcResponsePipeline(deps, 'thread/list', payload)).resolves.toBe(payload)
  })
})
