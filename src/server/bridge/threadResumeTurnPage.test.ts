import { describe, expect, it, vi } from 'vitest'
import {
  buildThreadResumeParamsWithTurnPage,
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
    rpc: vi.fn(async () => ({ data: [] })),
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
    const d = deps({
      rpc: vi.fn(async () => ({ data: new Array(16).fill({ id: 'x' }), nextCursor: null })),
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

  it('skips the count request entirely when the page already covers the thread', async () => {
    const d = deps({ sendResume: vi.fn(async () => resumeResult(DESC_PAGE_IDS, null)) })

    const result = await resumeThreadWithTurnPage(d, { threadId: 'thread-1' }) as Record<string, unknown>

    expect(d.rpc).not.toHaveBeenCalled()
    expect(result.threadTurnStartIndex).toBe(0)
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
