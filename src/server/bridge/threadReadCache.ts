// `thread/read` result cache (round-76 performance work).
//
// Measured baseline: a single `thread/read` for the heaviest local thread cost
// 2.3–3.5s end to end through the bridge, and every reopen paid it again in full
// (the frontend only coalesces concurrent resumes). This cache stores the
// post-pipeline result, so a hit skips the app-server call, the 10-turn trim, the
// session-log command merge and the payload slimming.
//
// Deliberately NOT applied to `thread/resume`: resume establishes app-server
// session state (the frontend guards it with `resumedThreadById` and calls it
// before `turn/start`), so skipping it would leave the thread unresumed.
//
// Invalidation mirrors the existing readThreadForTurnPage pattern — per-thread
// notification is the primary signal, a TTL is the backstop — plus an explicit
// signal for state-mutating RPCs the client drives itself. Slack's "one does not
// simply cache everything" post is the relevant cautionary tale: bounded TTL and
// bounded entry count, not an unbounded store.

const THREAD_READ_RESULT_CACHE_TTL_MS = 20_000
const THREAD_READ_RESULT_CACHE_MAX_ENTRIES = 6

// Methods that can change what a `thread/read` would return. Matching conservatively
// by prefix means an unknown mutating method still clears the cache.
const THREAD_READ_INVALIDATING_METHOD_PATTERN = /^(?:turn\/|thread\/(?:start|fork|rollback|revert|resume|archive|unarchive|delete|compact|name\/))/u

export function threadReadInvalidatesCache(method: string): boolean {
  return THREAD_READ_INVALIDATING_METHOD_PATTERN.test(method)
}

/**
 * Cache key for a `thread/read` request, derived from every parameter except the
 * thread id (which is held separately so a per-thread invalidate can match).
 * Returns '' when a parameter is not a scalar, in which case the caller must not
 * cache rather than risk two different requests sharing a key.
 */
export function buildThreadReadCacheKey(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of Object.keys(params).sort()) {
    if (key === 'threadId') continue
    const value = params[key]
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${String(value)}`)
      continue
    }
    return ''
  }
  return parts.join('&')
}

type Entry = {
  threadId: string
  result: unknown
  expiresAt: number
}

export class ThreadReadResultCache {
  private readonly entries = new Map<string, Entry>()

  get size(): number {
    return this.entries.size
  }

  get(threadId: string, params: Record<string, unknown> | null): unknown | null {
    if (!threadId || !params) return null
    const cacheKey = buildThreadReadCacheKey(params)
    if (!cacheKey) return null

    const mapKey = `${threadId}\u0000${cacheKey}`
    const entry = this.entries.get(mapKey)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(mapKey)
      return null
    }
    return entry.result
  }

  set(threadId: string, params: Record<string, unknown> | null, result: unknown, now = Date.now()): void {
    if (!threadId || !params) return
    const cacheKey = buildThreadReadCacheKey(params)
    if (!cacheKey) return

    const mapKey = `${threadId}\u0000${cacheKey}`
    // Re-insert so the eviction order stays least-recently-written first.
    this.entries.delete(mapKey)
    this.entries.set(mapKey, { threadId, result, expiresAt: now + THREAD_READ_RESULT_CACHE_TTL_MS })

    while (this.entries.size > THREAD_READ_RESULT_CACHE_MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next()
      if (oldestKey.done) break
      this.entries.delete(oldestKey.value)
    }
  }

  invalidate(threadId?: string): void {
    if (!threadId) {
      this.entries.clear()
      return
    }
    for (const [mapKey, entry] of this.entries) {
      if (entry.threadId === threadId) this.entries.delete(mapKey)
    }
  }
}
