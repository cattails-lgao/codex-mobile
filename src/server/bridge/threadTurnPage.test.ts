import { describe, expect, it, vi } from 'vitest'
import {
  readBoundedThreadTurnPage,
  readThreadTurnIds,
  ThreadTurnPageCursorChain,
  TURN_ID_MAX_PAGES,
  type BoundedThreadTurnPageDeps,
  type TurnPageRpc,
} from './threadTurnPage.js'

// 16-turn ids in the exact shape the real probe thread returned (see
// scripts/probe-turn-page.cjs), oldest first: t0 … t15.
const TURN_IDS = Array.from({ length: 16 }, (_, index) => `t${index}`)

// Cursors on the wire are opaque JSON (`{"rolloutOrdinal":2186,...}`); the fake
// keeps that opacity while making the anchor inspectable: `cut: n` means "the
// turns strictly older than ascending index n".
function encodeCut(cut: number): string {
  return JSON.stringify({ requestedThreadId: 'thread-1', rolloutOrdinal: cut * 37, includeAnchor: false, scope: { kind: 'turns' } })
}
function decodeCut(cursor: unknown): number {
  return JSON.parse(String(cursor)).rolloutOrdinal / 37
}

type Call = { method: string; params: Record<string, unknown> }

/**
 * A fake app-server for the paging path. `ascIds` is the thread's turns, oldest
 * first. Every cursor the module asks for is answered as "the turns strictly
 * older than that index", which is what the shipped app-server does.
 */
function makeRpc(ascIds: string[] = TURN_IDS, options: { countPages?: boolean } = {}) {
  const calls: Call[] = []
  const rpc = vi.fn(async (method: string, params: unknown) => {
    const p = (params ?? {}) as Record<string, unknown>
    calls.push({ method, params: p })

    if (method === 'thread/read') {
      if (p.includeTurns !== false) throw new Error('the bounded path must never hydrate turns')
      return { thread: { id: 'thread-1', path: '/tmp/rollout.jsonl', name: 'probe', turns: [] } }
    }
    if (method !== 'thread/turns/list') throw new Error(`unexpected method ${method}`)

    if (p.itemsView === 'notLoaded') {
      if (options.countPages) return { data: [{ id: `p${calls.length}` }], nextCursor: encodeCut(calls.length) }
      if (p.cursor) throw new Error('the id listing must not be paged for these threads')
      return { data: [...ascIds].reverse().map((id) => ({ id })), nextCursor: null }
    }
    if (p.itemsView !== 'full') throw new Error(`unexpected itemsView ${String(p.itemsView)}`)
    if (p.sortDirection !== 'desc') throw new Error('older turns are reached descending')

    const cut = decodeCut(p.cursor)
    const limit = Number(p.limit)
    const start = Math.max(0, cut - limit)
    const window = ascIds.slice(start, cut)
    return {
      data: [...window].reverse().map((id) => ({ id, status: 'completed', items: [{ type: 'agentMessage', text: id }] })),
      nextCursor: start > 0 ? encodeCut(start) : null,
      backwardsCursor: encodeCut(cut),
    }
  })
  return { rpc, calls }
}

// Deliberately typed as the module's own `rpc` contract rather than as the
// exact vi.fn shape makeRpc returns, so a test can hand in its own stub.
function deps(rpc: TurnPageRpc['rpc'], chain = new ThreadTurnPageCursorChain()): BoundedThreadTurnPageDeps {
  return { rpc, chain }
}

const idsOf = (turns: unknown[]) => turns.map((turn) => (turn as { id: string }).id)
const fullPageCalls = (calls: Call[]) => calls.filter((call) => call.params.itemsView === 'full')

describe('ThreadTurnPageCursorChain', () => {
  it('records and looks up the cursor that reaches the turns before a turn', () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', 'cursor-6')
    expect(chain.lookup('thread-1', 't6')).toBe('cursor-6')
    expect(chain.lookup('thread-1', 't5')).toBeNull()
    expect(chain.lookup('thread-2', 't6')).toBeNull()
  })

  it('ignores entries that carry no cursor, which is how the thread start is recorded', () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't0', null)
    chain.record('thread-1', '', 'cursor')
    chain.record('', 't1', 'cursor')
    chain.record('thread-1', 't2', '   ')
    expect(chain.lookup('thread-1', 't0')).toBeNull()
    expect(chain.lookup('thread-1', 't2')).toBeNull()
  })

  it('bounds the entries it keeps per thread, dropping the least recently used', () => {
    const chain = new ThreadTurnPageCursorChain({ maxTurnsPerThread: 2 })
    chain.record('thread-1', 't0', 'c0')
    chain.record('thread-1', 't1', 'c1')
    chain.record('thread-1', 't2', 'c2')
    expect(chain.lookup('thread-1', 't0')).toBeNull()
    expect(chain.lookup('thread-1', 't2')).toBe('c2')

    // Reading refreshes an entry, so the next insert evicts the other one.
    expect(chain.lookup('thread-1', 't1')).toBe('c1')
    chain.record('thread-1', 't3', 'c3')
    expect(chain.lookup('thread-1', 't1')).toBe('c1')
    expect(chain.lookup('thread-1', 't2')).toBeNull()
  })

  it('bounds the number of threads it tracks', () => {
    const chain = new ThreadTurnPageCursorChain({ maxThreads: 2 })
    chain.record('a', 't0', 'ca')
    chain.record('b', 't0', 'cb')
    chain.record('c', 't0', 'cc')
    expect(chain.lookup('a', 't0')).toBeNull()
    expect(chain.lookup('b', 't0')).toBe('cb')
    expect(chain.lookup('c', 't0')).toBe('cc')
  })

  it('clears one thread or all of them', () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('a', 't0', 'ca')
    chain.record('b', 't0', 'cb')
    chain.clear('a')
    expect(chain.lookup('a', 't0')).toBeNull()
    expect(chain.lookup('b', 't0')).toBe('cb')
    chain.clear()
    expect(chain.lookup('b', 't0')).toBeNull()
  })
})

describe('readThreadTurnIds', () => {
  it('returns every turn id oldest first, from the newest-first listing', async () => {
    const { rpc, calls } = makeRpc()
    expect(await readThreadTurnIds(rpc, 'thread-1')).toEqual(TURN_IDS)
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toMatchObject({
      threadId: 'thread-1',
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    })
  })

  it('walks cursors rather than trusting a truncated page', async () => {
    const pages = [
      { data: [{ id: 't2' }, { id: 't1' }], nextCursor: 'c1' },
      { data: [{ id: 't0' }], nextCursor: null },
    ]
    let call = 0
    const rpc = vi.fn(async () => pages[call++])
    expect(await readThreadTurnIds(rpc, 'thread-1')).toEqual(['t0', 't1', 't2'])
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('gives up rather than loop when the listing never exhausts', async () => {
    let call = 0
    const rpc = vi.fn(async () => ({ data: [{ id: `x${call++}` }], nextCursor: 'more' }))
    expect(await readThreadTurnIds(rpc, 'thread-1')).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(TURN_ID_MAX_PAGES)
  })

  it('returns null when the call fails, the page is malformed, or a turn has no id', async () => {
    expect(await readThreadTurnIds(vi.fn(async () => { throw new Error('boom') }), 'thread-1')).toBeNull()
    expect(await readThreadTurnIds(vi.fn(async () => ({ data: 'nope' })), 'thread-1')).toBeNull()
    expect(await readThreadTurnIds(vi.fn(async () => ({ data: [{ id: '' }] })), 'thread-1')).toBeNull()
    expect(await readThreadTurnIds(vi.fn(async () => ({ data: [{}] })), 'thread-1')).toBeNull()
  })

  it('refuses an empty thread id without calling anything', async () => {
    const rpc = vi.fn(async () => ({ data: [] }))
    expect(await readThreadTurnIds(rpc, '')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('readBoundedThreadTurnPage', () => {
  it('serves the turns before the anchor from one page request', async () => {
    const { rpc, calls } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))

    const page = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)

    // The whole thread is 16 turns and the frontend holds the newest 10, so the
    // remaining window is t0..t5 with nothing older left.
    expect(page).not.toBeNull()
    expect(idsOf((page as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual(
      ['t0', 't1', 't2', 't3', 't4', 't5'],
    )
    expect(page?.startTurnIndex).toBe(0)
    expect(page?.hasMoreOlder).toBe(false)

    const pageCalls = fullPageCalls(calls)
    expect(pageCalls).toHaveLength(1)
    expect(pageCalls[0].params).toMatchObject({ cursor: encodeCut(6), sortDirection: 'desc', limit: 6, itemsView: 'full' })
  })

  it('keeps the metadata read metadata-only and preserves the thread object', async () => {
    const { rpc, calls } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))

    const page = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)
    const result = page?.result as { thread: Record<string, unknown> }

    expect(calls.find((call) => call.method === 'thread/read')?.params).toEqual({ threadId: 'thread-1', includeTurns: false })
    expect(calls.some((call) => call.method === 'thread/read' && call.params.includeTurns === true)).toBe(false)
    expect(result.thread).toMatchObject({ id: 'thread-1', path: '/tmp/rollout.jsonl', name: 'probe' })
  })

  it('answers an unknown anchor with an empty page and no older turns, without a page fetch', async () => {
    const { rpc, calls } = makeRpc()
    const page = await readBoundedThreadTurnPage(deps(rpc), 'thread-1', 'missing-turn', 10)

    expect(page?.startTurnIndex).toBe(0)
    expect(page?.hasMoreOlder).toBe(false)
    expect(idsOf((page as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual([])
    expect(fullPageCalls(calls)).toHaveLength(0)
  })

  it('chains a scroll: each answer seeds the cursor for the next older page', async () => {
    const ascIds = Array.from({ length: 30 }, (_, index) => `t${index}`)
    const { rpc, calls } = makeRpc(ascIds)
    const chain = new ThreadTurnPageCursorChain()
    // Opening the thread served t20..t29 and handed us the cursor for t19 and below.
    chain.record('thread-1', 't20', encodeCut(20))

    const first = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't20', 10)
    expect(idsOf((first as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual(
      ['t10', 't11', 't12', 't13', 't14', 't15', 't16', 't17', 't18', 't19'],
    )
    expect(first?.startTurnIndex).toBe(10)
    expect(first?.hasMoreOlder).toBe(true)

    // The frontend's next request is exactly "before the turn I just got first".
    const second = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't10', 10)
    expect(idsOf((second as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual(
      ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'],
    )
    expect(second?.startTurnIndex).toBe(0)
    expect(second?.hasMoreOlder).toBe(false)
    expect(fullPageCalls(calls)).toHaveLength(2)
  })

  it('serves an empty page for the first turn without spending a request', async () => {
    const { rpc, calls } = makeRpc()
    const page = await readBoundedThreadTurnPage(deps(rpc), 'thread-1', 't0', 10)

    expect(idsOf((page as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual([])
    expect(page?.startTurnIndex).toBe(0)
    expect(page?.hasMoreOlder).toBe(false)
    expect(fullPageCalls(calls)).toHaveLength(0)
  })

  it('falls back (null) when no cursor is known for the anchor', async () => {
    const { rpc, calls } = makeRpc()
    expect(await readBoundedThreadTurnPage(deps(rpc), 'thread-1', 't6', 10)).toBeNull()
    expect(fullPageCalls(calls)).toHaveLength(0)
  })

  it('falls back when the cursor no longer points at the anchor it was recorded for', async () => {
    const { rpc } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()
    // A revert moved the turns around: this cursor now cuts somewhere else.
    chain.record('thread-1', 't6', encodeCut(3))

    expect(await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)).toBeNull()
  })

  it('falls back when the page is shorter than the window that was asked for', async () => {
    const ascIds = TURN_IDS
    const rpc = vi.fn(async (method: string, params: unknown) => {
      const p = params as Record<string, unknown>
      if (method === 'thread/read') return { thread: { id: 'thread-1', turns: [] } }
      if (p.itemsView === 'notLoaded') return { data: [...ascIds].reverse().map((id) => ({ id })), nextCursor: null }
      // A page that drops the oldest requested turn.
      return { data: [{ id: 't5' }, { id: 't4' }], nextCursor: null }
    })
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))

    expect(await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)).toBeNull()
  })

  it('falls back when the id listing or the metadata read fails', async () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))
    expect(await readBoundedThreadTurnPage(
      deps(vi.fn(async () => { throw new Error('down') }), chain),
      'thread-1', 't6', 10,
    )).toBeNull()

    let servedListing = false
    const rpc = vi.fn(async (method: string) => {
      if (method === 'thread/read') throw new Error('metadata down')
      servedListing = true
      return { data: [...TURN_IDS].reverse().map((id) => ({ id })), nextCursor: null }
    })
    expect(await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)).toBeNull()
    expect(servedListing).toBe(true)
  })

  it('refuses an empty thread id or anchor without calling anything', async () => {
    const { rpc } = makeRpc()
    expect(await readBoundedThreadTurnPage(deps(rpc), '', 't6', 10)).toBeNull()
    expect(await readBoundedThreadTurnPage(deps(rpc), 'thread-1', '', 10)).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats a nonsensical page size as one turn rather than asking for none', async () => {
    const { rpc, calls } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))

    const page = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 0)
    expect(page?.startTurnIndex).toBe(5)
    expect(fullPageCalls(calls)[0].params.limit).toBe(1)
    expect(idsOf((page as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual(['t5'])
  })
})
