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
// points at the paging pair `thread/turns/list` + `thread/items/list` -- not at
// `excludeTurns`/`initialTurnsPage`, which exist only on `ThreadResumeParams`.
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
//
// round-143 实测推翻了一个隐含前提：`initialTurnsPage` 与 `thread/turns/list`
// **不是同一份数据**。前者按 rollout 字节偏移取页（它的游标里就是
// `rolloutOrdinal`），后者走 app-server 的状态索引。而 `thread/revert` 只清理
// 索引——被回退的轮次仍留在 rollout 里。线上被回退过的线程实测：8 条线程中 7 条
// 两条读路径逐位一致，唯一不一致的那条，rollout 页多出来的正是回退目标那一轮
// （status: interrupted，且它已不在 turns/list 里）。
//
// 这造就了「回退成功了、刷新后那一轮又回来了」：第一次打开线程走的就是本模块
// （thread/resume），它拿到的 rollout 页会把那一轮重新渲染回消息列表；而
// thread/read 走索引，所以当场看不到。清浏览器存储也无用——来源在服务端。
// 因此本模块把页对齐到权威索引，见 `dropTurnsMissingFromIndex`。
import { asRecord, readNonEmptyString, THREAD_RESPONSE_TURN_LIMIT } from './core.js'
import { readThreadTurnIds } from './threadTurnPage.js'

/**
 * Requested page size for the cheap turn-count probe. The app-server clamps a
 * page to 100 entries regardless of `limit` (round-104), so the count is what
 * the `nextCursor` chain below collects, not a single shot. A page is free:
 * `itemsView: "notLoaded"` returns turn metadata without items.
 */
export const TURN_COUNT_PAGE_SIZE = 10_000

/**
 * Safety cap on the cursor chain (50 pages). Reached only by a thread far
 * beyond a rollout file anyone could open, in which case the caller degrades to
 * "count unknown" instead of looping.
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
  /**
   * Reports the cursor that reaches the turns immediately older than
   * `oldestTurnId`, which is the resume page's own `nextCursor` (round-86).
   * `turnsBackwardsCursor` is *not* that cursor -- it carries
   * `includeAnchor: true` and re-serves the page it came with. Feeding this to
   * the older-turn route lets its first scroll-up skip the walk that cursors
   * otherwise require.
   */
  onTurnPageBoundary?: (threadId: string, oldestTurnId: string, olderCursor: string | null) => void
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
      limit: TURN_COUNT_PAGE_SIZE,
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

// round-143：页里那些「权威索引不认识、且已经是终态」的轮次，只可能是回退后留在
// rollout 里的残留。没有 id 的轮次、以及状态可能仍在跑的轮次一律保留：这个过滤
// 只允许剔除能被证明已不存在的轮次——宁可留下一条残留，也不能把正在跑的轮次藏掉。
const TERMINAL_TURN_STATUSES = new Set(['completed', 'failed', 'declined', 'interrupted', 'error'])

function readTurnStatus(turn: unknown): string {
  const record = asRecord(turn)
  const raw = record?.status
  const text = readNonEmptyString(raw) || readNonEmptyString(asRecord(raw)?.type)
  return text.toLowerCase()
}

/**
 * The subset of `pageData` the authoritative turn index still knows about.
 *
 * Order is preserved (the page is newest-first). A turn with no id, an id the
 * index holds, or a status that could still be running is always kept, so this
 * can only ever remove a turn that is provably gone.
 */
export function dropTurnsMissingFromIndex(pageData: unknown[], indexTurnIds: string[]): unknown[] {
  const known = new Set(indexTurnIds)
  return pageData.filter((turn) => {
    const turnId = readNonEmptyString(asRecord(turn)?.id)
    if (!turnId || known.has(turnId)) return true
    return !TERMINAL_TURN_STATUSES.has(readTurnStatus(turn))
  })
}

/**
 * The thread's turn ids, oldest first, or null when they cannot be trusted.
 *
 * `readThreadTurnIds` throws when the app-server does not implement
 * `thread/turns/list`; here that only means "no reconciliation", so it must not
 * take the bounded resume down with it (replaying the untouched request would
 * hydrate the whole history, which is exactly what round-84 removed).
 */
async function readAuthoritativeTurnIds(rpc: RpcExecutor['rpc'], threadId: string): Promise<string[] | null> {
  if (!threadId) return null
  try {
    return await readThreadTurnIds(rpc, threadId)
  } catch {
    return null
  }
}

/** The same resume result with its page data replaced by `turns`. */
function withResumePageTurns(result: unknown, turns: unknown[]): unknown {
  const record = asRecord(result)
  const page = asRecord(record?.initialTurnsPage)
  if (!record || !page) return result
  return { ...record, initialTurnsPage: { ...page, data: turns } }
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

  const threadId = readNonEmptyString(asRecord(asRecord(result)?.thread)?.id)
  const page = asRecord(asRecord(result)?.initialTurnsPage)
  const pageData = readPageData(result) ?? []

  // round-143：一次权威 id 列表（状态索引的 id 链）同时服务三件事——空页的交叉
  // 校验（round-134 语义不变）、rollout 残留轮次的剔除、以及
  // `threadTurnStartIndex` 需要的总轮数。拿不到时（旧 app-server 不实现该方法、
  // 分页超过上限、调用失败）三件事全部退回改动前的行为。
  const indexTurnIds = await readAuthoritativeTurnIds(deps.rpc, threadId)

  // round-134：与 threadReadTurnPage 同一条收紧——空页不等于「线程没有轮次」。
  // 此前空页会被 promote 成 turns=[] / threadTurnStartIndex=0，于是 app-server 的
  // 一次偶发空页就能把打开线程答成一个空对话（round-132 §10.4 第 3 条）。空页先做
  // 一次便宜的轮次计数交叉校验：确有轮次、或数不出来时回放未改写的原请求；真正的
  // 空线程（计数 0）仍走 promote 路径，行为不变。
  if (pageData.length === 0) {
    if (indexTurnIds === null || indexTurnIds.length > 0) return await deps.sendResume(originalParams)
  }

  // round-143：把 rollout 页对齐到权威索引 —— 索引里没有、且已是终态的轮次只可能
  // 是回退后留在 rollout 里的残留（thread/revert 只清理索引），剔掉它；否则刷新
  // 打开线程时它会顺着 rollout 页重新回到消息列表。
  let promoted = result
  let pageTurns = pageData
  if (pageData.length > 0 && indexTurnIds !== null && indexTurnIds.length > 0) {
    const kept = dropTurnsMissingFromIndex(pageData, indexTurnIds)
    if (kept.length !== pageData.length) {
      const oldestKeptTurnId = readNonEmptyString(asRecord(kept[kept.length - 1])?.id)
      // 剔除后剩下的必须是索引里的一段连续后缀（回退只会砍掉 rollout 的尾部）。
      // 对不上意味着这段页与索引的关系比这里假设的复杂（例如页首还有一个索引
      // 不认识的运行中轮次）——那就整页照旧返回，只是放弃这一次修复，绝不为了
      // 一条残留把 resume 打回全量水合。
      const anchored = kept.length > 0 &&
        oldestKeptTurnId !== '' &&
        indexTurnIds[indexTurnIds.length - kept.length] === oldestKeptTurnId
      if (anchored) {
        promoted = withResumePageTurns(result, kept)
        pageTurns = kept
      }
    }
  }

  // The page is newest-first, so its oldest turn is the last one; the boundary
  // it hands over is the cursor that reaches the turns before that turn.
  const oldestTurnId = readNonEmptyString(asRecord(pageTurns[pageTurns.length - 1])?.id)
  if (oldestTurnId && deps.onTurnPageBoundary) {
    deps.onTurnPageBoundary(threadId, oldestTurnId, readNonEmptyString(page?.nextCursor) || null)
  }
  // A full page means older turns may exist, and their existence is the only
  // thing `threadTurnStartIndex` needs the count for. A short page already
  // covers the whole thread, so the extra RPC is skipped on new/small threads.
  const needsCount = pageTurns.length > 0 && readNonEmptyString(page?.nextCursor) !== ''
  let totalTurnCount: number | null = pageTurns.length
  if (indexTurnIds !== null) totalTurnCount = indexTurnIds.length
  else if (needsCount) totalTurnCount = await readThreadTurnCount(deps.rpc, threadId)

  return promoteResumeTurnPage(promoted, totalTurnCount)
}
