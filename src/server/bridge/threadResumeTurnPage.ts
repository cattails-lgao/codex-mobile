// Bounded open-thread hydration (round-84): stop paying for a full-history
// `thread/resume` and then throwing most of it away.
//
// Measured on the heaviest local thread (30.9MB rollout / 16 turns) by driving
// the app-server directly, so the bridge's own overhead is excluded:
//
//   thread/resume {threadId}                        2118ms / 12.12MB   <- what we sent
//   thread/resume {excludeTurns, initialTurnsPage}   486ms /  4.29MB
//   thread/turns/list {10000, notLoaded, desc}        14ms /  0.00MB   <- total count
//
// The bridge already sliced the response down to THREAD_RESPONSE_TURN_LIMIT
// turns — but it did so *after* the app-server had constructed all of them, so
// `trimThreadTurnsInRpcResult` could never reduce the cost. `ThreadReadParams`
// documents full-history hydration as deprecated for paginated threads and
// points at exactly this pair of calls (`excludeTurns` + `initialTurnsPage`).
//
// Wire contract kept for the browser: the response still carries `thread.turns`
// (ascending, at most THREAD_RESPONSE_TURN_LIMIT of them) plus
// `threadTurnStartIndex`, so the existing trim / inline-image / session-merge
// pipeline and the frontend normalizer both run unchanged. `initialTurnsPage`
// is dropped before the pipeline returns — leaving it in would ship the same
// turns twice (4.29MB -> 8.6MB).
//
// Two assumptions this module depends on, both verified against the shipped
// app-server and re-checkable with `scripts/probe-resume-turn-page.cjs`:
//   1. an `initialTurnsPage` with `sortDirection: "desc"` is returned newest
//      first, i.e. exactly `fullHydration.slice(-limit).reverse()`;
//   2. `turnsBackwardsCursor`/`nextCursor` are non-null while older turns exist
//      and null once the page reaches the start of the thread.
import { asRecord, readNonEmptyString, THREAD_RESPONSE_TURN_LIMIT } from './core.js'

/**
 * Page size for the cheap turn-count probe. `itemsView: "notLoaded"` returns
 * turn metadata without items, so a single shot covers any realistic thread
 * (measured 14ms / 0.00MB for 16 turns). Larger threads fall back to cursor
 * paging rather than failing.
 */
export const TURN_COUNT_PAGE_LIMIT = 10_000

/**
 * Safety cap on the paging fallback (50 x 10_000 turns). Reached only by a
 * thread far beyond a rollout file anyone could open, in which case the caller
 * degrades to "count unknown" instead of looping.
 */
export const TURN_COUNT_MAX_PAGES = 50

type RpcExecutor = {
  rpc(method: string, params: unknown): Promise<unknown>
}

export type ThreadResumeTurnPageDeps = RpcExecutor & {
  /**
   * Performs the actual `thread/resume`. Injected so the shell keeps its
   * archive-recovery wrapper around the call.
   */
  sendResume: (params: unknown) => Promise<unknown>
}

function readPageData(result: unknown): unknown[] | null {
  const page = asRecord(asRecord(result)?.initialTurnsPage)
  if (!page || !Array.isArray(page.data)) return null
  return page.data
}

/**
 * Rewrite a `thread/resume` request to ask for metadata plus one bounded turn
 * page instead of the full history.
 *
 * Returns the input object unchanged (same reference) when the rewrite does not
 * apply, so the caller can detect "I sent the legacy request" by identity:
 * calls without a `threadId` (resume by path/history), and calls whose author
 * already chose `excludeTurns` or `initialTurnsPage` themselves, are left alone.
 */
export function buildThreadResumeParamsWithTurnPage(
  params: unknown,
  limit: number = THREAD_RESPONSE_TURN_LIMIT,
): unknown {
  const record = asRecord(params)
  if (!record) return params
  if (!readNonEmptyString(record.threadId)) return params
  if (typeof record.excludeTurns === 'boolean') return params
  if (record.initialTurnsPage !== undefined && record.initialTurnsPage !== null) return params

  const pageSize = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : THREAD_RESPONSE_TURN_LIMIT
  return {
    ...record,
    excludeTurns: true,
    initialTurnsPage: {
      limit: pageSize,
      sortDirection: 'desc',
      itemsView: 'full',
    },
  }
}

/**
 * True when the app-server honoured `initialTurnsPage`. An older app-server
 * ignores the unknown field while still honouring `excludeTurns`, which would
 * hand the client an empty transcript — the caller uses this to fall back to the
 * legacy full-hydration request instead of rendering a blank conversation.
 */
export function isThreadResumeTurnPageSupported(result: unknown): boolean {
  return readPageData(result) !== null
}

/**
 * Cheap total turn count for a loaded thread.
 *
 * The protocol exposes no turn-count field, and the pagination cursors are
 * rollout byte offsets rather than turn indices, so the count has to be read
 * off a `notLoaded` page. Returns null when the count cannot be established;
 * callers treat that as "unknown" rather than guessing.
 */
export async function readThreadTurnCount(rpc: RpcExecutor['rpc'], threadId: string): Promise<number | null> {
  if (!threadId) return null

  let cursor = ''
  let total = 0
  for (let page = 0; page < TURN_COUNT_MAX_PAGES; page += 1) {
    const params: Record<string, unknown> = {
      threadId,
      limit: TURN_COUNT_PAGE_LIMIT,
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
    total += record.data.length

    const nextCursor = readNonEmptyString(record.nextCursor)
    if (!nextCursor) return total
    cursor = nextCursor
  }

  return null
}

/**
 * Move the bounded page onto `thread.turns` and stamp `threadTurnStartIndex`,
 * dropping `initialTurnsPage` so the turns never travel twice.
 *
 * `totalTurnCount` is the thread's whole turn count (null when unknown). It only
 * becomes the absolute index of the first returned turn, which is what the
 * frontend uses to decide whether older turns exist and how to number them.
 * When it is unknown the index is omitted and the frontend's default of 0
 * applies — the turns themselves still render correctly.
 */
export function promoteResumeTurnPage(result: unknown, totalTurnCount: number | null): unknown {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const pageData = readPageData(result)
  // No page at all means this was never a bounded resume; leave it alone. An
  // empty page still came from one (a brand-new thread), so it is promoted too.
  if (!record || !thread || !pageData) return result

  // The page arrives newest-first (see the module header); `thread.turns` is
  // oldest-first everywhere else in the bridge.
  const turns = [...pageData].reverse()

  const next: Record<string, unknown> = { ...record }
  delete next.initialTurnsPage
  next.thread = { ...thread, turns }

  const total = typeof totalTurnCount === 'number' && Number.isFinite(totalTurnCount)
    ? Math.floor(totalTurnCount)
    : null
  if (total !== null && total >= turns.length) {
    next.threadTurnStartIndex = total - turns.length
  }

  return next
}

/**
 * Full open-thread flow: send the bounded request, and either promote the page
 * or replay the request the legacy way when the app-server did not honour it.
 */
export async function resumeThreadWithTurnPage(
  deps: ThreadResumeTurnPageDeps,
  originalParams: unknown,
): Promise<unknown> {
  const boundedParams = buildThreadResumeParamsWithTurnPage(originalParams)
  const result = await deps.sendResume(boundedParams)

  if (boundedParams === originalParams) return result
  if (!isThreadResumeTurnPageSupported(result)) {
    // The app-server ignored `initialTurnsPage` (older build) but may still have
    // honoured `excludeTurns`, so this response can carry no turns at all.
    // Replay the untouched request rather than render an empty conversation.
    return await deps.sendResume(originalParams)
  }

  const pageData = readPageData(result) ?? []
  const page = asRecord(asRecord(result)?.initialTurnsPage)
  // A full page means older turns may exist, and their existence is the only
  // thing `threadTurnStartIndex` needs the count for. A short page already
  // covers the whole thread, so the extra RPC is skipped on new/small threads.
  const needsCount = pageData.length > 0 && readNonEmptyString(page?.nextCursor) !== ''
  let totalTurnCount: number | null = pageData.length
  if (needsCount) {
    const threadId = readNonEmptyString(asRecord(asRecord(result)?.thread)?.id)
    totalTurnCount = await readThreadTurnCount(deps.rpc, threadId)
  }

  return promoteResumeTurnPage(result, totalTurnCount)
}
