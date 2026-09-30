// round-110：`thread/read {includeTurns:true}` 的有界读取契约。
//
// ThreadReadParams 只有 {threadId, includeTurns}，没有 excludeTurns/
// initialTurnsPage，所以有界打开 = 元数据读 + thread/turns/list 一页，组装成
// 「全量读被裁剪后」的同一种线上形状（thread.turns 升序 + threadTurnStartIndex）。
// 任何一步不能干净作答时回落重放原请求（= 改动前的行为）。
import { describe, expect, it, vi } from 'vitest'
import {
  buildThreadReadParamsWithoutTurns,
  readThreadWithTurnPage,
  type ThreadReadTurnPageDeps,
} from './threadReadTurnPage.js'

const META = {
  thread: {
    id: 'thread-1',
    path: '/tmp/rollout.jsonl',
    model: 'gpt-test',
    modelProvider: 'test',
    status: { type: 'notLoaded' },
    turns: [],
  },
}

function turn(id: string): Record<string, unknown> {
  return { id, items: [] }
}

type Call = { method: string; params: Record<string, unknown> }

function harness(options: {
  meta?: unknown
  metaSequence?: unknown[]
  page?: unknown
  pageSequence?: unknown[]
  count?: unknown
}) {
  const calls: Call[] = []
  let metaIndex = 0
  let pageIndex = 0
  const rpc = vi.fn(async (method: string, params: unknown) => {
    const p = (params ?? {}) as Record<string, unknown>
    calls.push({ method, params: p })
    if (method !== 'thread/turns/list') throw new Error(`unexpected method ${method}`)
    if (p.itemsView === 'notLoaded') {
      if (options.count && (options.count as { __throw?: unknown }).__throw) {
        throw new Error(String((options.count as { __throw: unknown }).__throw))
      }
      return options.count ?? { data: [], nextCursor: null }
    }
    const seq = options.pageSequence ?? [options.page]
    const value = seq[Math.min(pageIndex++, seq.length - 1)]
    if (value && (value as { __throw?: unknown }).__throw) {
      throw new Error(String((value as { __throw: unknown }).__throw))
    }
    return value
  })
  const sendRead = vi.fn(async (_params: unknown) => {
    const seq = options.metaSequence ?? [options.meta]
    return seq[Math.min(metaIndex++, seq.length - 1)]
  })
  const deps: ThreadReadTurnPageDeps = { rpc, sendRead }
  return { deps, rpc, sendRead, calls }
}

describe('buildThreadReadParamsWithoutTurns', () => {
  it('rewrites an includeTurns:true read into the metadata read', () => {
    expect(buildThreadReadParamsWithoutTurns({ threadId: 't', includeTurns: true }))
      .toEqual({ threadId: 't', includeTurns: false })
  })

  it('returns the same reference when the rewrite does not apply', () => {
    const cases: unknown[] = [
      null,
      {},
      { threadId: '' },
      { threadId: 't' },
      { threadId: 't', includeTurns: false },
      { threadId: 't', includeTurns: 'true' },
    ]
    for (const params of cases) {
      expect(buildThreadReadParamsWithoutTurns(params)).toBe(params)
    }
  })
})

describe('readThreadWithTurnPage', () => {
  it('opens a thread as metadata + one newest page, ascending, with the page boundary', async () => {
    const h = harness({
      meta: META,
      // newest-first, as `thread/turns/list {sortDirection:"desc"}` returns it
      page: { data: [turn('t3'), turn('t2'), turn('t1')], nextCursor: null },
    })

    const result = await readThreadWithTurnPage(h.deps, { threadId: 'thread-1', includeTurns: true }) as {
      thread: Record<string, unknown>
      threadTurnStartIndex?: number
    }

    // metadata read first, then exactly one full page
    expect(h.sendRead).toHaveBeenCalledTimes(1)
    expect(h.sendRead).toHaveBeenCalledWith({ threadId: 'thread-1', includeTurns: false })
    expect(h.calls).toEqual([
      { method: 'thread/turns/list', params: { threadId: 'thread-1', limit: 10, sortDirection: 'desc', itemsView: 'full' } },
    ])

    // turns reversed to oldest-first, metadata preserved
    expect((result.thread.turns as Array<{ id: string }>).map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(result.thread.path).toBe('/tmp/rollout.jsonl')
    expect(result.thread.model).toBe('gpt-test')
    // a short page covers the whole thread: index 0, and no count probe
    expect(result.threadTurnStartIndex).toBe(0)
  })

  it('takes the total count only when the page is full, so older turns are announced', async () => {
    const fullPage = Array.from({ length: 10 }, (_, i) => turn(`t${20 - i}`))
    const h = harness({
      meta: META,
      page: { data: fullPage, nextCursor: 'cursor-back' },
      // the count probe: 20 turns, single page
      count: { data: Array.from({ length: 20 }, (_, i) => ({ id: `t${i + 1}`, items: [] })), nextCursor: null },
    })

    const result = await readThreadWithTurnPage(h.deps, { threadId: 'thread-1', includeTurns: true }) as {
      thread: Record<string, unknown>
      threadTurnStartIndex?: number
    }

    expect(result.threadTurnStartIndex).toBe(10)
    // a full page triggers exactly one notLoaded count probe
    expect(h.calls.filter((c) => c.params.itemsView === 'notLoaded')).toHaveLength(1)
  })

  it('omits threadTurnStartIndex when the count cannot be established', async () => {
    const fullPage = Array.from({ length: 10 }, (_, i) => turn(`t${20 - i}`))
    const h = harness({
      meta: META,
      page: { data: fullPage, nextCursor: 'cursor-back' },
      count: { __throw: 'count probe failed' },
    })

    const result = await readThreadWithTurnPage(h.deps, { threadId: 'thread-1', includeTurns: true }) as {
      threadTurnStartIndex?: number
    }

    expect(result.threadTurnStartIndex).toBeUndefined()
  })

  it('replays the untouched request when the turn page fails', async () => {
    const original = { threadId: 'thread-1', includeTurns: true }
    // First metadata read succeeds; the page call then fails; the replay returns.
    const h = harness({
      metaSequence: [META, { thread: { id: 'thread-1', turns: [turn('full')] } }],
      page: { __throw: 'list_turns failed' },
    })

    const result = await readThreadWithTurnPage(h.deps, original) as { thread: { turns: Array<{ id: string }> } }

    expect(result.thread.turns.map((t) => t.id)).toEqual(['full'])
    expect(h.sendRead).toHaveBeenCalledTimes(2)
    expect(h.sendRead.mock.calls[0][0]).toEqual({ threadId: 'thread-1', includeTurns: false })
    // the replay is byte-for-byte the original request (same reference)
    expect(h.sendRead.mock.calls[1][0]).toBe(original)
  })

  it('replays the untouched request when the metadata read shape is unexpected', async () => {
    const original = { threadId: 'thread-1', includeTurns: true }
    const h = harness({
      metaSequence: [{}, { thread: { id: 'thread-1', turns: [] } }],
      page: { data: [turn('t1')], nextCursor: null },
    })

    const result = await readThreadWithTurnPage(h.deps, original) as { thread: { id: string } }

    expect(result.thread.id).toBe('thread-1')
    expect(h.sendRead).toHaveBeenCalledTimes(2)
    expect(h.sendRead.mock.calls[1][0]).toBe(original)
    // never reached the turn page: the metadata read was rejected first
    expect(h.calls).toHaveLength(0)
  })

  it('leaves a read that did not ask for turns alone (single untouched call)', async () => {
    const original = { threadId: 'thread-1', includeTurns: false }
    const h = harness({ meta: META })

    await readThreadWithTurnPage(h.deps, original)

    expect(h.sendRead).toHaveBeenCalledTimes(1)
    expect(h.sendRead.mock.calls[0][0]).toBe(original)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
