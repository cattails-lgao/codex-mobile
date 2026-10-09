import { describe, expect, it, vi } from 'vitest'
import {
  isTurnListUnsupportedError,
  readBoundedThreadTurnPage,
  readThreadTurnIds,
  ThreadTurnPageCursorChain,
  ThreadTurnPageUnsupportedError,
  TURN_ID_MAX_PAGES,
  TURN_LIST_SERVER_PAGE_CLAMP,
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
      // round-136: the chain-seed rebuild asks for the newest `limit` ids (the
      // full id listing asks for 10_000 and gets the whole thread), so the fake
      // has to bound the page the way the server does -- the page's oldest id
      // then *is* the anchor, which is what makes its nextCursor the right seed.
      const want = Number.isFinite(Number(p.limit)) ? Number(p.limit) : ascIds.length
      const take = Math.max(1, Math.min(ascIds.length, Math.floor(want)))
      const cut = ascIds.length - take
      return { data: [...ascIds.slice(cut)].reverse().map((id) => ({ id })), nextCursor: cut > 0 ? encodeCut(cut) : null }
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

  // round-102 P0：0.158.0 对 thread/turns/list 回 `-32601: list_turns is not
  // supported yet`。这必须作为「不支持」抛出而不是 null——null 会让调用方回落
  // 全量水合，而那个路径在这个构建上挂死 UI。
  // （round-130：0.160.1 已实现该方法，本测试用 stub 模拟旧二进制。）
  it('throws the unsupported error instead of falling back when the app-server does not implement the listing', async () => {
    const rpc = vi.fn(async () => { throw new Error('-32601: list_turns is not supported yet') })
    await expect(readThreadTurnIds(rpc, 'thread-1')).rejects.toBeInstanceOf(ThreadTurnPageUnsupportedError)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('classifies only genuine unsupported-method errors', () => {
    expect(isTurnListUnsupportedError(new Error('-32601: list_turns is not supported yet'))).toBe(true)
    expect(isTurnListUnsupportedError(new Error('thread not found'))).toBe(false)
    expect(isTurnListUnsupportedError(new Error('boom'))).toBe(false)
    expect(isTurnListUnsupportedError(undefined)).toBe(false)
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

  // round-136 之前这条叫「链上没游标就回落」。现在冷链会先重建种子（见下），
  // 于是这个入口只剩「重建也答不出来」这一种失败：列表本身报错 ⇒ 保持回落，
  // 且绝不因此去跑全量读。
  it('falls back (null) when the anchor has no cursor and the rebuild listing fails', async () => {
    let listings = 0
    const rpc = vi.fn(async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>
      if (method === 'thread/read') return { thread: { id: 'thread-1', turns: [] } }
      listings += 1
      // 第一次是全量 id 列表，第二次是重建种子那一次 —— 让它失败。
      if (listings === 1) return { data: [...TURN_IDS].reverse().map((id) => ({ id })), nextCursor: null }
      throw new Error('listing down')
    })
    expect(await readBoundedThreadTurnPage(deps(rpc), 'thread-1', 't6', 10)).toBeNull()
    expect(rpc.mock.calls.some((call) => (call[1] as Record<string, unknown>)?.itemsView === 'full')).toBe(false)
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

  // round-102 P0：两条 turns/list 调用点（id 列表、整页获取）都必须把「未实现」
  // 升级为不支持错误——这条路径上的 null 等于让调用方去跑会挂死的全量水合。
  it('throws the unsupported error from either turns/list call site', async () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', encodeCut(6))

    // The id listing is the first call; its failure surfaces the error directly.
    await expect(readBoundedThreadTurnPage(
      deps(vi.fn(async () => { throw new Error('list_turns is not supported yet') }), chain),
      'thread-1', 't6', 10,
    )).rejects.toBeInstanceOf(ThreadTurnPageUnsupportedError)

    // The full-page fetch fails on the same method and must classify too.
    let listed = false
    const rpc = vi.fn(async (_method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>
      if (p.itemsView === 'notLoaded') {
        listed = true
        return { data: [...TURN_IDS].reverse().map((id) => ({ id })), nextCursor: null }
      }
      throw new Error('-32601: list_turns is not supported yet')
    })
    await expect(readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10))
      .rejects.toBeInstanceOf(ThreadTurnPageUnsupportedError)
    expect(listed).toBe(true)
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

  // round-136：链未命中时不再直接回落全量读。同窗口同锚点实测，回落 7202ms 而命中
  // 链 969ms（round-132 §3.1），且回落路径不登记锚点 ⇒ 同一位置反复付 6–7s
  // （round-132 §3.3）。现在先用一次**只含 id** 的列表把缺失的种子重建出来。
  it('rebuilds a missing chain seed from one id listing instead of falling back', async () => {
    const { rpc, calls } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()

    const page = await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)

    expect(page).not.toBeNull()
    expect(idsOf((page as { result: { thread: { turns: unknown[] } } }).result.thread.turns)).toEqual(
      ['t0', 't1', 't2', 't3', 't4', 't5'],
    )
    expect(page?.startTurnIndex).toBe(0)

    // 两次列表：先是全量 id 列表（16 轮），再是重建种子那一次（锚点在 index 6，
    // 故只问最新 10 个 id）。重建不发全量读。
    const idListings = calls.filter((call) => call.params.itemsView === 'notLoaded')
    expect(idListings).toHaveLength(2)
    expect(idListings[1].params).toMatchObject({ threadId: 'thread-1', sortDirection: 'desc', limit: 10 })
    expect(idListings[1].params.cursor).toBeUndefined()
    expect(calls.some((call) => call.method === 'thread/read' && call.params.includeTurns === true)).toBe(false)
  })

  it('records the rebuilt seed, so the next request at that anchor is a chain hit', async () => {
    const { rpc } = makeRpc()
    const chain = new ThreadTurnPageCursorChain()

    await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)

    // 与 resume/read 首开时种下的种子同形：锚点轮 -> 「更早那些轮」的游标。
    expect(chain.lookup('thread-1', 't6')).toBe(encodeCut(6))
  })

  it('still falls back when the anchor is more than one page from the newest turn', async () => {
    const ascIds = Array.from({ length: 130 }, (_, index) => `t${index}`)
    const { rpc, calls } = makeRpc(ascIds)
    const chain = new ThreadTurnPageCursorChain()

    expect(await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't10', 10)).toBeNull()
    // 130 - 10 = 120 > 服务端单页上限：重建需要逐步回溯（本模块有意不做）⇒ 仍回落。
    expect(ascIds.length - 10).toBeGreaterThan(TURN_LIST_SERVER_PAGE_CLAMP)
    expect(calls.filter((call) => call.params.itemsView === 'notLoaded')).toHaveLength(1)
    expect(fullPageCalls(calls)).toHaveLength(0)
  })

  it('refuses a rebuilt cursor whose page does not end at the anchor', async () => {
    const rpc = vi.fn(async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>
      if (method === 'thread/read') return { thread: { id: 'thread-1', turns: [] } }
      if (p.itemsView === 'notLoaded') {
        // 列表答的是从最新处切下的另一段：最老一轮不是锚点 ⇒ 它的游标指错窗口。
        return { data: [...TURN_IDS].reverse().map((id) => ({ id })), nextCursor: encodeCut(3) }
      }
      throw new Error('the bounded path must not fetch a page off an unverified cursor')
    })
    const chain = new ThreadTurnPageCursorChain()

    expect(await readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10)).toBeNull()
    expect(chain.lookup('thread-1', 't6')).toBeNull()
  })

  it('keeps classifying an app-server that does not implement turns/list while rebuilding', async () => {
    // 重建同样走 thread/turns/list，所以「未实现」必须仍是 NotSupported 而不是 null
    // —— 在这条路径上 null 等于让调用方回落会挂死 UI 的全量水合（round-102 P0）。
    const rpc = vi.fn(async (_method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>
      if (p.itemsView === 'notLoaded') {
        const want = Number.isFinite(Number(p.limit)) ? Number(p.limit) : TURN_IDS.length
        const take = Math.max(1, Math.min(TURN_IDS.length, Math.floor(want)))
        const cut = TURN_IDS.length - take
        return { data: [...TURN_IDS.slice(cut)].reverse().map((id) => ({ id })), nextCursor: cut > 0 ? encodeCut(cut) : null }
      }
      throw new Error('-32601: list_turns is not supported yet')
    })
    const chain = new ThreadTurnPageCursorChain()

    await expect(readBoundedThreadTurnPage(deps(rpc, chain), 'thread-1', 't6', 10))
      .rejects.toBeInstanceOf(ThreadTurnPageUnsupportedError)
  })
})
