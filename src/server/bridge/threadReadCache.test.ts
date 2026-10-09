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

// round-136：这个谓词现在也门控「上翻更早轮次」的两个缓存
// （codexAppServerBridge 的 emitNotification）。
//
// 为什么实时流不该清它们：那些缓存只服务更早的窗口，窗口边界由锚点轮的位置
// 决定；一次回合里真正高频的是 item/*（agentMessage / reasoning 的增量与
// item 生命周期），它们改的是**最新一轮**，不移动更早窗口。原先「任意带
// threadId 的通知都清」使缓存恒为冷 ⇒ 同一锚点重复上翻重复付 6–7s
// （round-132 §3.3）。轮次结构真的变了（新回合、回滚、revert、会话生命周期）
// 仍必须清，这条断言把两侧都钉住。
describe('older-turn caches: which notifications invalidate (round-136)', () => {
  it('clears on anything that can move, truncate, or reorder the turn list', () => {
    for (const method of [
      'turn/started',
      'turn/completed',
      'turn/interrupt',
      'thread/rollback',
      'thread/revert',
      'thread/compact/start',
      'thread/archived',
      'thread/resumed',
      // 谓词刻意保守：thread/name/ 也在模式里，于是改名也会清一次 —— 浪费但安全。
      'thread/name/updated',
    ]) {
      expect(threadReadInvalidatesCache(method)).toBe(true)
    }
  })

  it('keeps the cache through in-place content traffic and status pings', () => {
    for (const method of [
      'item/started',
      'item/completed',
      'item/agentMessage/delta',
      'item/reasoning/textDelta',
      'item/reasoning/summaryTextDelta',
      'thread/status/changed',
      'thread/tokenUsage/updated',
    ]) {
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
