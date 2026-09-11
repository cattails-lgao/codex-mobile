import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildThreadReadCacheKey,
  ThreadReadResultCache,
  threadReadInvalidatesCache,
} from './threadReadCache'

afterEach(() => {
  vi.useRealTimers()
})

describe('buildThreadReadCacheKey', () => {
  it('keys on the parameters that change the response, not the thread id', () => {
    expect(buildThreadReadCacheKey({ threadId: 'a', includeTurns: true }))
      .toBe(buildThreadReadCacheKey({ threadId: 'b', includeTurns: true }))
    expect(buildThreadReadCacheKey({ threadId: 'a', includeTurns: true }))
      .not.toBe(buildThreadReadCacheKey({ threadId: 'a', includeTurns: false }))
  })

  it('is order independent', () => {
    expect(buildThreadReadCacheKey({ includeTurns: true, mode: 'x' }))
      .toBe(buildThreadReadCacheKey({ mode: 'x', includeTurns: true }))
  })

  it('refuses to key on a non-scalar parameter', () => {
    expect(buildThreadReadCacheKey({ includeTurns: true, extra: { nested: 1 } })).toBe('')
    expect(buildThreadReadCacheKey({ includeTurns: true, extra: [1, 2] })).toBe('')
  })
})

describe('threadReadInvalidatesCache', () => {
  it('treats turn writes and thread lifecycle methods as invalidating', () => {
    for (const method of ['turn/start', 'turn/interrupt', 'thread/start', 'thread/fork', 'thread/revert', 'thread/resume', 'thread/archive', 'thread/name/set', 'thread/compact/start']) {
      expect(threadReadInvalidatesCache(method)).toBe(true)
    }
  })

  it('leaves pure reads alone', () => {
    for (const method of ['thread/read', 'thread/list', 'thread/turns/list', 'account/rateLimits/read', 'config/read']) {
      expect(threadReadInvalidatesCache(method)).toBe(false)
    }
  })
})

describe('ThreadReadResultCache', () => {
  it('returns what was stored for the same thread and parameters', () => {
    const cache = new ThreadReadResultCache()
    const result = { thread: { id: 'thread-1', turns: [] } }
    cache.set('thread-1', { threadId: 'thread-1', includeTurns: true }, result)

    expect(cache.get('thread-1', { threadId: 'thread-1', includeTurns: true })).toBe(result)
    expect(cache.get('thread-1', { threadId: 'thread-1' })).toBeNull()
    expect(cache.get('thread-2', { threadId: 'thread-2', includeTurns: true })).toBeNull()
  })

  it('expires entries after the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T00:00:00Z'))
    const cache = new ThreadReadResultCache()
    const params = { threadId: 'thread-1', includeTurns: true }
    cache.set('thread-1', params, { ok: true })

    vi.setSystemTime(new Date('2026-09-11T00:00:19Z'))
    expect(cache.get('thread-1', params)).toEqual({ ok: true })

    vi.setSystemTime(new Date('2026-09-11T00:00:21Z'))
    expect(cache.get('thread-1', params)).toBeNull()
    expect(cache.size).toBe(0)
  })

  it('bounds the number of entries, dropping the oldest write first', () => {
    const cache = new ThreadReadResultCache()
    for (let index = 0; index < 8; index += 1) {
      cache.set(`thread-${index}`, { threadId: `thread-${index}`, includeTurns: true }, index)
    }

    expect(cache.size).toBe(6)
    expect(cache.get('thread-0', { threadId: 'thread-0', includeTurns: true })).toBeNull()
    expect(cache.get('thread-7', { threadId: 'thread-7', includeTurns: true })).toBe(7)
  })

  it('invalidates a single thread without touching the others', () => {
    const cache = new ThreadReadResultCache()
    cache.set('thread-1', { threadId: 'thread-1', includeTurns: true }, 'one')
    cache.set('thread-2', { threadId: 'thread-2', includeTurns: true }, 'two')

    cache.invalidate('thread-1')

    expect(cache.get('thread-1', { threadId: 'thread-1', includeTurns: true })).toBeNull()
    expect(cache.get('thread-2', { threadId: 'thread-2', includeTurns: true })).toBe('two')
  })

  it('clears everything when no thread id is given', () => {
    const cache = new ThreadReadResultCache()
    cache.set('thread-1', { threadId: 'thread-1', includeTurns: true }, 'one')
    cache.set('thread-2', { threadId: 'thread-2', includeTurns: true }, 'two')

    cache.invalidate()

    expect(cache.size).toBe(0)
  })

  it('ignores entries it cannot build a key for', () => {
    const cache = new ThreadReadResultCache()
    cache.set('thread-1', { threadId: 'thread-1', extra: { nested: 1 } }, 'nope')
    cache.set('', { threadId: '', includeTurns: true }, 'nope')

    expect(cache.size).toBe(0)
    expect(cache.get('thread-1', { threadId: 'thread-1', extra: { nested: 1 } })).toBeNull()
  })
})
