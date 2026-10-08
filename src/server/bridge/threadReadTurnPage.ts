// Bounded open-thread read (round-110): stop paying for a full-history
// `thread/read {includeTurns:true}` when the bridge immediately trims it to the
// last THREAD_RESPONSE_TURN_LIMIT turns anyway.
//
// Why not `initialTurnsPage` like the resume path (round-84): `ThreadReadParams`
// accepts only `{ threadId, includeTurns }` — it has no
// `excludeTurns`/`initialTurnsPage`. Its own doc comment points at the paging
// pair `thread/turns/list` + `thread/items/list` instead. So the bounded read is
// two `experimentalApi`-gated calls (verified working on the local codex-cli
// 0.158.0, with and without the capability bit; round-130 re-verified on
// codex-cli 0.160.1, where both calls answer for real):
//
//   1. `thread/read { includeTurns: false }` -> full thread metadata (id, path,
//      model, status, cliVersion, ...) with `turns: []`, ~12ms.
//   2. `thread/turns/list { limit, sortDirection: "desc", itemsView: "full" }`
//      -> the newest page of turns, newest-first; its elements are exactly the
//      `thread.turns[]` shape (the app-server hands back the same page for
//      `initialTurnsPage`), so the whole bridge pipeline (trim / inline-media /
//      session-log merge / snapshot) and the frontend normalizer run unchanged.
//
// The page is reversed to ascending and stamped onto `thread.turns`, with
// `threadTurnStartIndex` derived from the thread's total turn count — the same
// wire shape the trimmed full read produced. The count is only fetched when the
// page is full (a short page already covers the whole thread).
//
// Every step degrades safely: whenever the bounded path cannot answer *cheaply
// and safely* — metadata read shape is unexpected, or the turn page fails — the
// caller replays the untouched request, byte-for-byte the pre-round-110
// behaviour. The metadata read's own errors are intentionally not swallowed:
// they bubble to the shell's `thread/read` error handling (empty-thread snapshot
// / materialization-pending), which is more precise than a blind replay.
import { asRecord, readNonEmptyString, THREAD_RESPONSE_TURN_LIMIT } from './core.js'
import { readThreadTurnCount } from './threadResumeTurnPage.js'

type RpcExecutor = {
  rpc(method: string, params: unknown): Promise<unknown>
}

export type ThreadReadTurnPageDeps = RpcExecutor & {
  /**
   * Performs the actual `thread/read`. Injected so the shell keeps its
   * archive-recovery wrapper around the call.
   */
  sendRead: (params: unknown) => Promise<unknown>
  /**
   * Reports the cursor that reaches the turns immediately older than
   * `oldestTurnId` -- this page's own `nextCursor` (round-132), exactly what
   * the resume path hands over with `initialTurnsPage.nextCursor`.
   *
   * Without it a thread opened through `thread/read` seeds no cursor at all,
   * so the first scroll-up misses the chain and falls back to the unbounded
   * full-history read (measured 7202ms against 969ms for the same anchor on
   * the same thread). The route only ever falls back when it has no cursor, so
   * feeding this in is purely a saving.
   */
  onTurnPageBoundary?: (threadId: string, oldestTurnId: string, olderCursor: string | null) => void
}

type TurnPage = { data: unknown[]; nextCursor: string }

/**
 * Rewrite a `thread/read` request that asks for full-history hydration into the
 * metadata-only read.
 *
 * Returns the input object unchanged (same reference) when the rewrite does not
 * apply — a missing/empty `threadId`, or a request that did not explicitly ask
 * for turns (`includeTurns !== true`) — so the caller can detect "I sent the
 * legacy request" by identity.
 */
export function buildThreadReadParamsWithoutTurns(params: unknown): unknown {
  const record = asRecord(params)
  if (!record) return params
  if (!readNonEmptyString(record.threadId)) return params
  if (record.includeTurns !== true) return params
  return { ...record, includeTurns: false }
}

/**
 * The newest page of turns (newest-first) plus the cursor that walks further
 * back. Returns null on any failure or unexpected shape so the caller replays
 * the legacy full read.
 */
async function readLatestTurnPage(rpc: RpcExecutor['rpc'], threadId: string, limit: number): Promise<TurnPage | null> {
  let result: unknown
  try {
    result = await rpc('thread/turns/list', {
      threadId,
      limit,
      sortDirection: 'desc',
      itemsView: 'full',
    })
  } catch {
    return null
  }
  const record = asRecord(result)
  if (!record || !Array.isArray(record.data)) return null
  return { data: record.data, nextCursor: readNonEmptyString(record.nextCursor) }
}

/**
 * Bounded open-thread flow: a metadata read plus one newest turn page,
 * assembled into the same wire shape the trimmed full read produced.
 *
 * Falls back to replaying the untouched request whenever the bounded path
 * cannot answer (see the module header for the exact conditions).
 */
export async function readThreadWithTurnPage(
  deps: ThreadReadTurnPageDeps,
  originalParams: unknown,
  limit: number = THREAD_RESPONSE_TURN_LIMIT,
): Promise<unknown> {
  const metaParams = buildThreadReadParamsWithoutTurns(originalParams)
  if (metaParams === originalParams) return await deps.sendRead(originalParams)

  const pageSize = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : THREAD_RESPONSE_TURN_LIMIT

  const metaResult = await deps.sendRead(metaParams)
  const metaRecord = asRecord(metaResult)
  const metaThread = asRecord(metaRecord?.thread)
  const threadId = readNonEmptyString(metaThread?.id) || readNonEmptyString(asRecord(originalParams)?.threadId)
  if (!metaRecord || !metaThread || !threadId) {
    return await deps.sendRead(originalParams)
  }

  const page = await readLatestTurnPage(deps.rpc, threadId, pageSize)
  if (!page) return await deps.sendRead(originalParams)

  // The page arrives newest-first (see the module header); `thread.turns` is
  // oldest-first everywhere else in the bridge.
  const turns = [...page.data].reverse()

  // round-132: hand this page's own `nextCursor` to the older-turn route, the
  // way the resume path does. The page is newest-first, so after the reverse
  // its oldest turn is `turns[0]`; that turn is the anchor the frontend will
  // ask "what comes before this?" for. A null cursor means the thread starts
  // here, and an empty page (brand-new thread) has no anchor to record.
  const oldestTurnId = readNonEmptyString(asRecord(turns[0])?.id)
  if (oldestTurnId && deps.onTurnPageBoundary) {
    deps.onTurnPageBoundary(threadId, oldestTurnId, page.nextCursor || null)
  }

  // A full page means older turns may exist, and their existence is the only
  // thing `threadTurnStartIndex` needs the count for. A short page already
  // covers the whole thread, so the extra RPC is skipped on new/small threads.
  const needsCount = page.data.length > 0 && page.nextCursor !== ''
  let totalTurnCount: number | null = page.data.length
  if (needsCount) totalTurnCount = await readThreadTurnCount(deps.rpc, threadId)

  const next: Record<string, unknown> = { ...metaRecord, thread: { ...metaThread, turns } }
  const total = typeof totalTurnCount === 'number' && Number.isFinite(totalTurnCount)
    ? Math.floor(totalTurnCount)
    : null
  if (total !== null && total >= turns.length) {
    next.threadTurnStartIndex = total - turns.length
  }
  return next
}
