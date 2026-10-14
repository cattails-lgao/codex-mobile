import { describe, expect, it, vi } from 'vitest'
import {
  buildThreadResumeParamsWithTurnPage,
  dropTurnsMissingFromIndex,
  isThreadResumeTurnPageSupported,
  promoteResumeTurnPage,
  readThreadTurnCount,
  resumeThreadWithTurnPage,
  type ThreadResumeTurnPageDeps,
} from './threadResumeTurnPage.js'

// Ids copied from the real 16-turn probe thread, newest first — the exact order
// `initialTurnsPage` returned with `sortDirection: "desc"` (see
// scripts/probe-resume-turn-page.cjs).
const DESC_PAGE_IDS = [
  '01a04784-ac47-7960-8b0d-f742724f0478',
  '01a04781-973a-7d51-9fb5-13290e189432',
  '01a04776-4bb7-7630-9c88-710c1c807812',
]
const ASC_PAGE_IDS = [...DESC_PAGE_IDS].reverse()

// round-143：权威索引（thread/turns/list）与 rollout 页在正常线程上逐位一致，
// 这里让夹具也一致：索引 = 页内三轮 + 13 条更老的轮次（oldest first）。索引接口
// 按 desc 返回，所以 mock 必须反过来给。
const OLDER_IDS = Array.from({ length: 13 }, (_, i) => `older-${String(i + 1).padStart(2, '0')}`)
const INDEX_IDS = [...OLDER_IDS, ...ASC_PAGE_IDS]
const NEWEST_NINE_ASC = INDEX_IDS.slice(-9)

function indexPage(ids: string[] = INDEX_IDS): { data: Array<{ id: string }>; nextCursor: null } {
  return { data: [...ids].reverse().map((id) => ({ id })), nextCursor: null }
}

function page(ids: string[], nextCursor: string | null = null): Record<string, unknown> {
  return {
    initialTurnsPage: {
      data: ids.map((id) => ({ id, status: 'completed', items: [] })),
      nextCursor,
      backwardsCursor: 'opaque',
    },
  }
}

function resumeResult(ids: string[], nextCursor: string | null = null): Record<string, unknown> {
  return {
    ...page(ids, nextCursor),
    thread: { id: 'thread-1', turns: [] },
    turnsBackwardsCursor: 'opaque',
  }
}

function deps(overrides: Partial<ThreadResumeTurnPageDeps> = {}): ThreadResumeTurnPageDeps {
  return {
    rpc: vi.fn(async () => indexPage()),
    sendResume: vi.fn(async () => resumeResult([])),
    ...overrides,
  }
}

describe('buildThreadResumeParamsWithTurnPage', () => {
  it('asks for metadata plus one descending full-item turn page', () => {
    expect(buildThreadResumeParamsWithTurnPage({ threadId: 'thread-1' })).toEqual({
      threadId: 'thread-1',
      excludeTurns: true,
      initialTurnsPage: { limit: 10, sortDirection: 'desc', itemsView: 'full' },
    })
  })

  it('honours an explicit page size and rejects a nonsensical one', () => {
    expect(buildThreadResumeParamsWithTurnPage({ threadId: 't' }, 25)).toMatchObject({
      initialTurnsPage: { limit: 25 },
    })
    expect(buildThreadResumeParamsWithTurnPage({ threadId: 't' }, 0)).toMatchObject({
      initialTurnsPage: { limit: 10 },
    })
    expect(buildThreadResumeParamsWithTurnPage({ threadId: 't' }, Number.NaN)).toMatchObject({
      initialTurnsPage: { limit: 10 },
    })
  })

  it('preserves the other resume parameters', () => {
    expect(buildThreadResumeParamsWithTurnPage({ threadId: 't', model: 'gpt-5', cwd: '/w' })).toMatchObject({
      model: 'gpt-5',
      cwd: '/w',
      excludeTurns: true,
    })
  })

  it.each([
    ['a resume without a thread id (path/history resume)', { path: '/rollout.jsonl' }],
    ['a caller that already chose excludeTurns', { threadId: 't', excludeTurns: false }],
    ['a caller that already chose a page', { threadId: 't', initialTurnsPage: { limit: 3 } }],
    ['a non-object payload', null],
  ])('returns the input object unchanged for %s', (_label, params) => {
    expect(buildThreadResumeParamsWithTurnPage(params)).toBe(params)
  })
})

describe('isThreadResumeTurnPageSupported', () => {
  it('is true whenever the app-server returned a page, even an empty one', () => {
    expect(isThreadResumeTurnPageSupported(resumeResult([]))).toBe(true)
    expect(isThreadResumeTurnPageSupported(resumeResult(DESC_PAGE_IDS))).toBe(true)
  })

  it('is false when the app-server ignored the page request', () => {
    expect(isThreadResumeTurnPageSupported({ thread: { id: 't', turns: [] } })).toBe(false)
    expect(isThreadResumeTurnPageSupported({ initialTurnsPage: null })).toBe(false)
    expect(isThreadResumeTurnPageSupported({ initialTurnsPage: { data: 'nope' } })).toBe(false)
    expect(isThreadResumeTurnPageSupported(null)).toBe(false)
  })
})

describe('readThreadTurnCount', () => {
  it('counts a single notLoaded page when the cursor is exhausted', async () => {
    const rpc = vi.fn(async () => ({ data: [{ id: 'a' }, { id: 'b' }], nextCursor: null }))

    await expect(readThreadTurnCount(rpc, 'thread-1')).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('thread/turns/list', {
      threadId: 'thread-1',
      limit: 10_000,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    })
  })

  it('pages with the cursor without double counting', async () => {
    const pages = [
      { data: [{ id: 'a' }, { id: 'b' }], nextCursor: 'cursor-1' },
      { data: [{ id: 'c' }], nextCursor: null },
    ]
    const rpc = vi.fn(async (_method: string, params: unknown) => {
      const cursor = (params as { cursor?: string }).cursor
      return cursor ? pages[1] : pages[0]
    })

    await expect(readThreadTurnCount(rpc, 'thread-1')).resolves.toBe(3)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenLastCalledWith('thread/turns/list', expect.objectContaining({ cursor: 'cursor-1' }))
  })

  it('reports unknown instead of guessing when the count cannot be read', async () => {
    await expect(readThreadTurnCount(vi.fn(async () => { throw new Error('boom') }), 'thread-1')).resolves.toBeNull()
    await expect(readThreadTurnCount(vi.fn(async () => ({ nextCursor: null })), 'thread-1')).resolves.toBeNull()
    await expect(readThreadTurnCount(vi.fn(async () => null), 'thread-1')).resolves.toBeNull()
    await expect(readThreadTurnCount(vi.fn(async () => ({ data: [] })), '')).resolves.toBeNull()
  })
})

describe('promoteResumeTurnPage', () => {
  it('reverses the descending page into an ascending transcript and stamps the start index', () => {
    const result = promoteResumeTurnPage(resumeResult(DESC_PAGE_IDS), 16)

    expect(result).toEqual({
      thread: {
        id: 'thread-1',
        turns: [
          { id: ASC_PAGE_IDS[0], status: 'completed', items: [] },
          { id: ASC_PAGE_IDS[1], status: 'completed', items: [] },
          { id: ASC_PAGE_IDS[2], status: 'completed', items: [] },
        ],
      },
      turnsBackwardsCursor: 'opaque',
      threadTurnStartIndex: 13,
    })
  })

  it('drops initialTurnsPage so the turns never travel twice', () => {
    const result = promoteResumeTurnPage(resumeResult(DESC_PAGE_IDS), 16) as Record<string, unknown>
    expect(result).not.toHaveProperty('initialTurnsPage')
  })

  it('starts at 0 when the page covers the whole thread', () => {
    expect(promoteResumeTurnPage(resumeResult(DESC_PAGE_IDS), 3)).toMatchObject({ threadTurnStartIndex: 0 })
  })

  it('omits the start index when the count is unknown, keeping the turns', () => {
    const result = promoteResumeTurnPage(resumeResult(DESC_PAGE_IDS), null) as Record<string, unknown>

    expect(result).not.toHaveProperty('threadTurnStartIndex')
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(3)
  })

  it('treats an empty page as a supported resume that simply has no turns', () => {
    expect(promoteResumeTurnPage(resumeResult([]), 0)).toEqual({
      thread: { id: 'thread-1', turns: [] },
      turnsBackwardsCursor: 'opaque',
      threadTurnStartIndex: 0,
    })
  })

  it('returns the same object when there was no page at all', () => {
    const payload = { thread: { id: 'thread-1', turns: [{ id: 'full' }] } }
    expect(promoteResumeTurnPage(payload, null)).toBe(payload)
  })
})

describe('resumeThreadWithTurnPage', () => {
  it('sends the bounded request, promotes the page and never replays for a long thread', async () => {
    // round-143：夹具必须与权威索引一致 —— 页里三轮都在索引里，索引另有 13 条
    // 更老的轮次，所以 threadTurnStartIndex = 16 - 3 = 13。
    const d = deps({
      sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, 'opaque-cursor')),
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    expect(d.sendResume).toHaveBeenCalledWith({
      threadId: 'thread-1',
      excludeTurns: true,
      initialTurnsPage: { limit: 10, sortDirection: 'desc', itemsView: 'full' },
    })
    expect(result.threadTurnStartIndex).toBe(13)
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(3)
  })

  it('hands the older-turn route the cursor that actually reaches older turns', async () => {
    const onTurnPageBoundary = vi.fn()
    const d = deps({
      sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, 'older-cursor')),
      onTurnPageBoundary,
    })

    await resumeThreadWithTurnPage(d, { threadId: 'thread-1' })

    // The page is newest-first, so its oldest turn is the last one, and the
    // cursor for "even older" is the page's nextCursor -- `turnsBackwardsCursor`
    // carries includeAnchor:true and would just re-serve this same page.
    expect(onTurnPageBoundary).toHaveBeenCalledWith('thread-1', ASC_PAGE_IDS[0], 'older-cursor')
  })

  it('reports a null boundary cursor when the page already starts the thread', async () => {
    const onTurnPageBoundary = vi.fn()
    const d = deps({
      sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, null)),
      onTurnPageBoundary,
    })

    await resumeThreadWithTurnPage(d, { threadId: 'thread-1' })

    expect(onTurnPageBoundary).toHaveBeenCalledWith('thread-1', ASC_PAGE_IDS[0], null)
  })

  it('reports nothing for an empty page, which has no boundary turn', async () => {
    const onTurnPageBoundary = vi.fn()
    const d = deps({
      rpc: vi.fn(async () => ({ data: [], nextCursor: null })),
      sendResume: vi.fn(async () => resumeResult([], 'older-cursor')),
      onTurnPageBoundary,
    })

    await resumeThreadWithTurnPage(d, { threadId: 'thread-1' })

    expect(onTurnPageBoundary).not.toHaveBeenCalled()
  })

  it('needs no second request: one index listing both verifies the page and counts the turns', async () => {
    const d = deps({ sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, null)) })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.rpc).toHaveBeenCalledTimes(1)
    expect(d.rpc).toHaveBeenCalledWith('thread/turns/list', {
      threadId: 'thread-1',
      limit: 10_000,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    })
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(3)
    expect(result.threadTurnStartIndex).toBe(13)
  })

  it('lands on start index 0 when the index holds exactly the page turns', async () => {
    const d = deps({
      rpc: vi.fn(async () => indexPage(ASC_PAGE_IDS)),
      sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, null)),
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(result.threadTurnStartIndex).toBe(0)
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(3)
  })

  it('replays the untouched request when the app-server ignored initialTurnsPage', async () => {
    const legacy = { thread: { id: 'thread-1', turns: [{ id: 'from-full-hydration' }] } }
    const sendResume = vi.fn(async (params: unknown) =>
      (params as { excludeTurns?: boolean }).excludeTurns ? { thread: { id: 'thread-1', turns: [] } } : legacy)
    const d = deps({ sendResume })

    await expect(resumeThreadWithTurnPage(d, { threadId: 'thread-1' })).resolves.toBe(legacy)
    expect(sendResume).toHaveBeenNthCalledWith(1, expect.objectContaining({ excludeTurns: true }))
    expect(sendResume).toHaveBeenNthCalledWith(2, { threadId: 'thread-1' })
  })

  it('leaves a call that already chose its own shape completely alone', async () => {
    const original = { threadId: 'thread-1', excludeTurns: true }
    const d = deps()

    await resumeThreadWithTurnPage(d, original)

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    expect(d.sendResume).toHaveBeenCalledWith(original)
    expect(d.rpc).not.toHaveBeenCalled()
  })

  // round-134：空页 ≠「线程真的没有轮次」。空页会被 promote 成 turns=[] +
  // threadTurnStartIndex=0，于是 app-server 的一次偶发空页就能把打开线程答成一个空对话
  // （round-132 §10.4 第 3 条）。空页先做一次 notLoaded 计数交叉校验。
  it('replays the untouched request when the page is empty but the thread has turns', async () => {
    const legacy = { thread: { id: 'thread-1', turns: [{ id: 'from-full-hydration' }] } }
    const sendResume = vi.fn(async (params: unknown) =>
      (params as { excludeTurns?: boolean }).excludeTurns ? resumeResult([], null) : legacy)
    const d = deps({
      rpc: vi.fn(async () => ({ data: [{ id: 't1' }, { id: 't2' }], nextCursor: null })),
      sendResume,
    })

    await expect(resumeThreadWithTurnPage(d, { threadId: 'thread-1' })).resolves.toBe(legacy)
    expect(sendResume).toHaveBeenCalledTimes(2)
    expect(sendResume).toHaveBeenNthCalledWith(2, { threadId: 'thread-1' })
  })

  it('replays when an empty page cannot be verified (the count probe fails)', async () => {
    const legacy = { thread: { id: 'thread-1', turns: [{ id: 'from-full-hydration' }] } }
    const sendResume = vi.fn(async (params: unknown) =>
      (params as { excludeTurns?: boolean }).excludeTurns ? resumeResult([], null) : legacy)
    const d = deps({ rpc: vi.fn(async () => { throw new Error('turns/list unavailable') }), sendResume })

    await expect(resumeThreadWithTurnPage(d, { threadId: 'thread-1' })).resolves.toBe(legacy)
    expect(sendResume).toHaveBeenCalledTimes(2)
  })

  it('keeps an empty page the count agrees with (a genuinely empty thread)', async () => {
    const d = deps({ rpc: vi.fn(async () => ({ data: [], nextCursor: null })) })
    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    expect((result.thread as { turns: unknown[] }).turns).toEqual([])
    expect(result.threadTurnStartIndex).toBe(0)
  })

  it('still returns the turns when the count probe fails', async () => {
    const d = deps({
      rpc: vi.fn(async () => { throw new Error('turns/list unavailable') }),
      sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, 'opaque-cursor')),
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(result).not.toHaveProperty('threadTurnStartIndex')
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(3)
  })
})

describe('dropTurnsMissingFromIndex', () => {
  const turn = (id: string, status: unknown) => ({ id, status })

  it('drops a terminal turn the index does not know about', () => {
    expect(dropTurnsMissingFromIndex([turn('gone', 'interrupted'), turn('kept', 'completed')], ['kept']))
      .toEqual([turn('kept', 'completed')])
  })

  it('keeps every turn the index still lists', () => {
    const page = [turn('a', 'completed'), turn('b', 'interrupted')]
    expect(dropTurnsMissingFromIndex(page, ['a', 'b'])).toEqual(page)
  })

  it('preserves the page order while dropping', () => {
    const page = [turn('a', 'completed'), turn('gone', 'completed'), turn('b', 'completed')]
    expect(dropTurnsMissingFromIndex(page, ['a', 'b']))
      .toEqual([turn('a', 'completed'), turn('b', 'completed')])
  })

  it('keeps a turn that could still be running, even when the index lacks it', () => {
    for (const status of ['inProgress', 'running', 'active', 'in_progress', '']) {
      const page = [turn('live', status)]
      expect(dropTurnsMissingFromIndex(page, ['older'])).toEqual(page)
    }
  })

  it('keeps a turn with no usable id, which cannot be classified', () => {
    const page = [{ status: 'completed' }, { id: '  ', status: 'interrupted' }]
    expect(dropTurnsMissingFromIndex(page, ['older'])).toEqual(page)
  })

  it('reads an object status as well as a string one', () => {
    const live = { id: 'live', status: { type: 'inProgress' } }
    const gone = { id: 'gone', status: { type: 'interrupted' } }
    expect(dropTurnsMissingFromIndex([gone, live], [])).toEqual([live])
  })
})

describe('resumeThreadWithTurnPage · round-143 回退残留', () => {
  // 线上实测的形状：rollout 页比索引多一轮，多出来的正是用户回退掉的那一轮。
  const STALE_TURN_ID = '01a138aa-1ca2-7381-a4fa-347d8ccfd6d5'
  const ROLLED_BACK_PAGE_IDS = [STALE_TURN_ID, ...[...NEWEST_NINE_ASC].reverse()]

  it('drops the reverted turn the rollout page still carries and renumbers the index', async () => {
    const onTurnPageBoundary = vi.fn()
    const d = deps({
      sendResume: vi.fn(async () => resumeResult(ROLLED_BACK_PAGE_IDS, 'older-cursor')),
      onTurnPageBoundary,
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    const turns = (result.thread as { turns: Array<{ id: string }> }).turns
    expect(turns.map((t) => t.id)).toEqual(NEWEST_NINE_ASC)
    // 索引共 16 轮、页里剩 9 轮 ⇒ 从索引第 7 轮开始（残留还在的话这里会算成 6）。
    expect(result.threadTurnStartIndex).toBe(7)
    expect(onTurnPageBoundary).toHaveBeenCalledWith('thread-1', NEWEST_NINE_ASC[0], 'older-cursor')
    expect(JSON.stringify(result)).not.toContain(STALE_TURN_ID)
  })

  it('leaves the page alone when the kept turns are not a contiguous index suffix', async () => {
    // 页首还有一个索引不认识的运行中轮次 ⇒ 剔除后剩下的接不上索引。此时整页照旧
    // 返回（回到改动前的行为），而不是为了这一条残留把 resume 打回全量水合。
    const liveTurnId = '01a138ff-0000-7000-8000-000000000000'
    const pageIds = [liveTurnId, ...ROLLED_BACK_PAGE_IDS]
    const d = deps({
      sendResume: vi.fn(async () => ({
        initialTurnsPage: {
          data: pageIds.map((id) => ({ id, status: id === liveTurnId ? 'inProgress' : 'completed' })),
          nextCursor: 'older-cursor',
          backwardsCursor: 'opaque',
        },
        thread: { id: 'thread-1', turns: [] },
      })),
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    const turns = (result.thread as { turns: Array<{ id: string }> }).turns
    expect(turns).toHaveLength(11)
    expect(turns.map((t) => t.id)).toContain(liveTurnId)
    expect(turns.map((t) => t.id)).toContain(STALE_TURN_ID)
  })

  it('serves the bounded page anyway when the app-server cannot list turns', async () => {
    const d = deps({
      rpc: vi.fn(async () => { throw new Error('-32601: list_turns is not supported yet') }),
      sendResume: vi.fn(async () => resumeResult(ROLLED_BACK_PAGE_IDS, 'older-cursor')),
    })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.sendResume).toHaveBeenCalledTimes(1)
    expect((result.thread as { turns: unknown[] }).turns).toHaveLength(10)
  })
})
