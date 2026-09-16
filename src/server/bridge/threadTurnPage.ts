// Bounded loading of earlier turns (round-86): the "load older messages" route
// used to hydrate the whole thread and then slice it in memory.
//
// Measured on the heaviest local thread (30.89MB rollout / 16 turns) by driving
// the app-server directly, so the bridge's own overhead is excluded:
//
//   thread/read {includeTurns:true}                  1295ms / 12.12MB  <- what we sent
//   thread/read {includeTurns:false}                    2ms /  0.00MB  <- metadata only
//   thread/turns/list {10000, notLoaded, desc}         14ms /  0.00MB  <- ids only
//   thread/turns/list {cursor, desc, full}            338ms /  7.83MB  <- the 6 turns asked for
//
// `ThreadReadParams.includeTurns` documents full-history hydration as deprecated
// for paginated threads and points at `thread/turns/list`; and the metadata read
// returns a `thread` object with the same keys and values as the hydrated one,
// only with `turns` empty. So the route can serve the exact response shape it
// serves today while never hydrating history it is about to throw away.
//
// The obstacle is that a cursor cannot be aimed at a turn. Cursors are opaque
// payloads (`{"rolloutOrdinal":2186,"includeAnchor":true,...}`) and passing a
// turn id is rejected with `invalid cursor: <id>`. Cursors only chain: the page
// a cursor returns carries the `nextCursor` that reaches the turns immediately
// older than that page's own oldest turn. Note also that the resume response's
// top-level `turnsBackwardsCursor` is *not* the cursor for older turns -- it
// carries `includeAnchor: true` and re-serves the page it came with.
//
// So older turns are reached by walking that chain, and the route walks it once
// per page boundary and remembers the result (`ThreadTurnPageCursorChain`). The
// frontend asks for "the turns before the oldest one I hold", which is exactly
// the boundary the previous answer produced, so a scroll through history is one
// cheap `notLoaded` id listing plus one page fetch per step.
//
// Everything here is best-effort: any surprise returns null and the caller falls
// back to the unbounded read, which is byte-for-byte what used to happen.
import { asRecord, readNonEmptyString } from './core.js'

/**
 * Page size for the id listing. `itemsView: "notLoaded"` returns turn ids
 * without items, so a single shot covers any realistic thread (measured 14ms /
 * 0.00MB for 16 turns). Larger threads fall back to cursor paging.
 */
export const TURN_ID_PAGE_LIMIT = 10_000

/** Safety cap on that paging fallback (50 x 10_000 turns). */
export const TURN_ID_MAX_PAGES = 50

export type TurnPageRpc = {
  rpc(method: string, params: unknown): Promise<unknown>
}

export type BoundedThreadTurnPage = {
  /** A `thread/read`-shaped result: the metadata read with the page's turns. */
  result: unknown
  startTurnIndex: number
  hasMoreOlder: boolean
}

export type BoundedThreadTurnPageDeps = TurnPageRpc & {
  chain: ThreadTurnPageCursorChain
}

/**
 * Remembers, per thread, the cursor that reaches the turns immediately older
 * than a given turn. Entries are only added at page boundaries the app-server
 * handed us, so a lookup miss simply means "walk needed" -- which this module
 * does not do: it degrades to the unbounded read instead.
 *
 * Nothing here is invalidated on turn events. A cursor can outlive the turns it
 * points at (a revert, a rollback, an app-server restart renumbering the
 * rollout), so `readBoundedThreadTurnPage` re-lists the ids on every call and
 * verifies the fetched page against them; stale entries then cost a fallback,
 * not a wrong answer.
 */
export class ThreadTurnPageCursorChain {
  private readonly cursorByThreadId = new Map<string, Map<string, string>>()
  private readonly maxThreads: number
  private readonly maxTurnsPerThread: number

  constructor(options: { maxThreads?: number; maxTurnsPerThread?: number } = {}) {
    this.maxThreads = options.maxThreads ?? 64
    this.maxTurnsPerThread = options.maxTurnsPerThread ?? 256
  }

  /** Record that `olderCursor` reaches the turns just before `oldestTurnId`. */
  record(threadId: string, oldestTurnId: string, olderCursor: unknown): void {
    if (!threadId || !oldestTurnId) return
    const cursor = readNonEmptyString(olderCursor)
    if (!cursor) return

    let perThread = this.cursorByThreadId.get(threadId)
    if (!perThread) {
      perThread = new Map<string, string>()
      this.cursorByThreadId.set(threadId, perThread)
      if (this.cursorByThreadId.size > this.maxThreads) {
        const oldestThreadId = this.cursorByThreadId.keys().next().value
        if (typeof oldestThreadId === 'string') this.cursorByThreadId.delete(oldestThreadId)
      }
    }

    // Re-insert so the iteration order is least-recently-recorded first.
    perThread.delete(oldestTurnId)
    perThread.set(oldestTurnId, cursor)
    if (perThread.size > this.maxTurnsPerThread) {
      const oldestTurnId = perThread.keys().next().value
      if (typeof oldestTurnId === 'string') perThread.delete(oldestTurnId)
    }
  }

  lookup(threadId: string, turnId: string): string | null {
    if (!threadId || !turnId) return null
    const perThread = this.cursorByThreadId.get(threadId)
    if (!perThread) return null
    const cursor = perThread.get(turnId)
    if (cursor === undefined) return null
    perThread.delete(turnId)
    perThread.set(turnId, cursor)
    return cursor
  }

  clear(threadId?: string): void {
    if (threadId) this.cursorByThreadId.delete(threadId)
    else this.cursorByThreadId.clear()
  }
}

/**
 * Every turn id of a thread, oldest first.
 *
 * The protocol exposes no turn count or turn list other than this, and the
 * count is what turns the frontend's "before this turn" into an absolute index
 * (`startTurnIndex`, which the client uses to number turns and to decide
 * whether older ones exist). `notLoaded` makes it free.
 *
 * Returns null when the listing cannot be trusted -- a failed call, a page
 * without ids, or more pages than the cap allows. Callers treat null as "use
 * the unbounded read".
 */
export async function readThreadTurnIds(rpc: TurnPageRpc['rpc'], threadId: string): Promise<string[] | null> {
  if (!threadId) return null

  const descending: string[] = []
  let cursor = ''
  for (let page = 0; page < TURN_ID_MAX_PAGES; page += 1) {
    const params: Record<string, unknown> = {
      threadId,
      limit: TURN_ID_PAGE_LIMIT,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    }
    if (cursor) params.cursor = cursor

    let result: unknown
    try {
      result = await rpc('thread/turns/list', params)
    } catch {
      return null
    }

    const record = asRecord(result)
    if (!record || !Array.isArray(record.data)) return null
    for (const turn of record.data) {
      const turnId = readNonEmptyString(asRecord(turn)?.id)
      // An id-less turn would make the index meaningless, so give up entirely
      // rather than serve a page the frontend would number wrongly.
      if (!turnId) return null
      descending.push(turnId)
    }

    const nextCursor = readNonEmptyString(record.nextCursor)
    if (!nextCursor) return descending.reverse()
    cursor = nextCursor
  }

  return null
}

async function buildThreadTurnPage(
  rpc: TurnPageRpc['rpc'],
  threadId: string,
  turns: unknown[],
  startTurnIndex: number,
  hasMoreOlder: boolean,
): Promise<BoundedThreadTurnPage | null> {
  let metadata: unknown
  try {
    metadata = await rpc('thread/read', { threadId, includeTurns: false })
  } catch {
    return null
  }

  const record = asRecord(metadata)
  const thread = asRecord(record?.thread)
  if (!record || !thread) return null

  return {
    result: { ...record, thread: { ...thread, turns } },
    startTurnIndex,
    hasMoreOlder,
  }
}

/**
 * The `limit` turns immediately before `beforeTurnId`, ascending -- the same
 * window the unbounded route produced by slicing the full history, without
 * building the history.
 *
 * Returns null whenever the question cannot be answered cheaply and safely, and
 * the caller then runs the old full-hydration path.
 */
export async function readBoundedThreadTurnPage(
  deps: BoundedThreadTurnPageDeps,
  threadId: string,
  beforeTurnId: string,
  limit: number,
): Promise<BoundedThreadTurnPage | null> {
  if (!threadId || !beforeTurnId) return null
  const pageSize = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1

  const ids = await readThreadTurnIds(deps.rpc, threadId)
  if (!ids) return null

  const beforeIndex = ids.indexOf(beforeTurnId)
  if (beforeIndex < 0) {
    // An anchor that is not in the thread answers with an empty page and
    // `hasMoreOlder: false`, which is how the frontend learns to stop asking.
    return await buildThreadTurnPage(deps.rpc, threadId, [], 0, false)
  }

  const startTurnIndex = Math.max(0, beforeIndex - pageSize)
  const wanted = beforeIndex - startTurnIndex

  let turns: unknown[] = []
  let boundaryTurnId = ''
  let boundaryCursor: unknown = null

  if (wanted > 0) {
    const cursor = deps.chain.lookup(threadId, beforeTurnId)
    // Without a cursor anchored at the anchor turn there is no way to ask for
    // "the turns just before it" -- see the module header.
    if (!cursor) return null

    let page: unknown
    try {
      page = await deps.rpc('thread/turns/list', {
        threadId,
        cursor,
        sortDirection: 'desc',
        limit: wanted,
        itemsView: 'full',
      })
    } catch {
      return null
    }

    const record = asRecord(page)
    const data = Array.isArray(record?.data) ? record.data : null
    if (!data || data.length !== wanted) return null

    // The page arrives newest-first; `thread.turns` is oldest-first everywhere
    // else in the bridge.
    const ascending = [...data].reverse()
    // The cursor can outlive the turns it points at, so check the window is
    // really the one that was asked for before serving it. A mismatch here is
    // exactly the case the unbounded read still answers correctly.
    if (readNonEmptyString(asRecord(ascending[0])?.id) !== ids[startTurnIndex]) return null
    if (wanted > 1 && readNonEmptyString(asRecord(ascending[wanted - 1])?.id) !== ids[beforeIndex - 1]) {
      return null
    }

    turns = ascending
    boundaryTurnId = ids[startTurnIndex]
    boundaryCursor = record?.nextCursor ?? null
  }

  const built = await buildThreadTurnPage(deps.rpc, threadId, turns, startTurnIndex, startTurnIndex > 0)
  if (!built) return null

  // The next request will ask for the turns before `boundaryTurnId`, so record
  // the cursor that reaches them. A null cursor means the thread starts here.
  if (boundaryTurnId) deps.chain.record(threadId, boundaryTurnId, boundaryCursor)
  return built
}
