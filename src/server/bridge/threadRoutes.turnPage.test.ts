// round-102 P0：`/codex-api/thread-turn-page` 的兜底契约。
//
// codex-cli 0.158.0 注册了 `thread/turns/list` 却回 `-32601: list_turns is not
// supported yet`，而它的全量 `thread/read {includeTurns:true}` 在大线程上挂死
// (>90s)。所以有界路径失败时分两种走向：
//   - app-server 承认不实现 turns/list（isThreadTurnPageUnsupported）→ 答边界
//     状态，绝不碰 readThreadForTurnPage；
//   - 其余失败（游标陈旧、瞬时错误等，旧 CLI 上常见）→ 保留原全量回落。
import { describe, expect, it, vi } from 'vitest'
import { handleThreadHttpRequest } from './threadRoutes'
import type { ThreadRouteDeps } from './threadRoutes'
import type { BoundedThreadTurnPage } from './threadTurnPage'

function makeDeps(options: {
  boundedPage: unknown | null
  unsupported: boolean
  fullRead?: unknown
}): { deps: ThreadRouteDeps; calls: { readThreadForTurnPage: number; readBounded: number } } {
  const calls = { readThreadForTurnPage: 0, readBounded: 0 }
  const deps: ThreadRouteDeps = {
    setJson: vi.fn(),
    appServer: {
      rpc: vi.fn(),
      readThreadForTurnPage: vi.fn(async () => {
        calls.readThreadForTurnPage += 1
        return options.fullRead ?? null
      }),
      readBoundedThreadTurnPage: vi.fn(async (): Promise<BoundedThreadTurnPage | null> => {
        calls.readBounded += 1
        return options.boundedPage as BoundedThreadTurnPage | null
      }),
      isThreadTurnPageUnsupported: () => options.unsupported,
      getStreamEvents: () => [],
      storeThreadReadSnapshot: () => undefined,
      getLastThreadReadSnapshot: () => null,
      getCachedLiveState: () => null,
      cacheLiveState: () => undefined,
      mergeItemsIntoTurns: (_threadId, turns) => turns,
    },
    externalSessionTracker: { getExternalSession: () => null },
    sanitizeThreadTurnsInlinePayloads: async (_method, result) => result,
    isThreadMaterializationPendingError: () => false,
  }
  return { deps, calls }
}

async function callTurnPage(deps: ThreadRouteDeps, threadId = 'thread-1', beforeTurnId = 't10'): Promise<{ statusCode: number; payload: unknown }> {
  let statusCode = 0
  let payload: unknown = null
  const originalSetJson = deps.setJson
  deps.setJson = (_res, code, body) => {
    statusCode = code
    payload = body
    originalSetJson(_res, code, body)
  }
  await handleThreadHttpRequest(
    { method: 'GET' } as never,
    {} as never,
    new URL(`/codex-api/thread-turn-page?threadId=${threadId}&beforeTurnId=${beforeTurnId}&limit=10`, 'http://localhost'),
    deps,
  )
  return { statusCode, payload }
}

describe('/codex-api/thread-turn-page fallback contract', () => {
  it('answers the boundary instead of hydrating when the app-server cannot list turns', async () => {
    const { deps, calls } = makeDeps({ boundedPage: null, unsupported: true })

    const { statusCode, payload } = await callTurnPage(deps)

    expect(statusCode).toBe(200)
    expect(payload).toEqual({
      result: null,
      startTurnIndex: 0,
      hasMoreOlder: false,
      olderTurnsUnavailable: true,
    })
    // The whole point: a full-hydration read hangs the UI on such builds.
    expect(calls.readThreadForTurnPage).toBe(0)
  })

  it('keeps the legacy full-read fallback for failures that are not capability gaps', async () => {
    const fullRead = {
      thread: {
        id: 'thread-1',
        turns: [{ id: 't0' }, { id: 't1' }, { id: 't2' }],
      },
    }
    const { deps, calls } = makeDeps({ boundedPage: null, unsupported: false, fullRead })

    const { statusCode, payload } = await callTurnPage(deps, 'thread-1', 't2')

    expect(statusCode).toBe(200)
    expect(calls.readThreadForTurnPage).toBe(1)
    const record = payload as { result: { thread: { turns: { id: string }[] } }; startTurnIndex: number; hasMoreOlder: boolean }
    expect(record.result.thread.turns.map((turn) => turn.id)).toEqual(['t0', 't1'])
    expect(record.startTurnIndex).toBe(0)
    expect(record.hasMoreOlder).toBe(false)
  })
})
