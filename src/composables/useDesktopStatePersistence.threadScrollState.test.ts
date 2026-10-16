import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_THREAD_SCROLL_STATE_ENTRIES,
  THREAD_SCROLL_STATE_STORAGE_KEY,
  loadThreadScrollStateMap,
  saveThreadScrollStateMap,
  type ThreadScrollStateEntry,
  type ThreadScrollStateMap,
} from './useDesktopStatePersistence'

function entry(overrides: Partial<ThreadScrollStateEntry> = {}): ThreadScrollStateEntry {
  return {
    v: 1,
    coldPage: 2,
    expandedWarmTurns: [3, 7],
    distanceFromBottomPx: 480.5,
    hotHeights: { 'turn-abc': 320, 'turn-def': 188.25 },
    savedAt: 1_000,
    ...overrides,
  }
}

// 与 useDesktopState.test.ts 的 installTestWindow 同款：node 环境下 stub 假 window。
function installTestWindow(setItemThrows = false) {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (setItemThrows) throw new Error('quota')
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
  })
  return store
}

function getStored(store: Map<string, string>): string | null {
  return store.get(THREAD_SCROLL_STATE_STORAGE_KEY) ?? null
}

describe('thread scroll state persistence (round-173)', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = installTestWindow()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('roundtrips a valid map', () => {
    const state: ThreadScrollStateMap = { 'thread-1': entry() }
    saveThreadScrollStateMap(state)
    expect(getStored(store)).not.toBeNull()
    expect(loadThreadScrollStateMap()).toEqual(state)
  })

  it('drops structurally broken entries and sanitizes nested fields', () => {
    store.set(
      THREAD_SCROLL_STATE_STORAGE_KEY,
      JSON.stringify({
        'bad-version': { ...entry(), v: 2 },
        'bad-coldpage': { ...entry(), coldPage: -1 },
        'bad-coldpage-frac': { ...entry(), coldPage: 1.5 },
        'bad-distance': { ...entry(), distanceFromBottomPx: Number.NaN },
        'bad-distance-neg': { ...entry(), distanceFromBottomPx: -5 },
        'bad-savedat': { ...entry(), savedAt: 0 },
        'bad-shape': [1, 2, 3],
        'sanitized-expanded': entry({ expandedWarmTurns: ['x' as unknown as number, 5, 5] }),
        'sanitized-heights': entry({ hotHeights: { zero: 0, neg: -3, ok: 42 } }),
        good: entry(),
      }),
    )
    const loaded = loadThreadScrollStateMap()
    expect(loaded['bad-version']).toBeUndefined()
    expect(loaded['bad-coldpage']).toBeUndefined()
    expect(loaded['bad-coldpage-frac']).toBeUndefined()
    expect(loaded['bad-distance']).toBeUndefined()
    expect(loaded['bad-distance-neg']).toBeUndefined()
    expect(loaded['bad-savedat']).toBeUndefined()
    expect(loaded['bad-shape']).toBeUndefined()
    // 嵌套字段按项净化：非法项剔除、重复去重，条目本身保留。
    expect(loaded['sanitized-expanded']?.expandedWarmTurns).toEqual([5])
    expect(loaded['sanitized-heights']?.hotHeights).toEqual({ ok: 42 })
    expect(loaded['good']).toEqual(entry())
  })

  it('tolerates corrupted raw storage', () => {
    store.set(THREAD_SCROLL_STATE_STORAGE_KEY, '{not json')
    expect(loadThreadScrollStateMap()).toEqual({})
    store.set(THREAD_SCROLL_STATE_STORAGE_KEY, 'null')
    expect(loadThreadScrollStateMap()).toEqual({})
    store.delete(THREAD_SCROLL_STATE_STORAGE_KEY)
    expect(loadThreadScrollStateMap()).toEqual({})
  })

  it('trims to the LRU cap by savedAt', () => {
    const state: ThreadScrollStateMap = {}
    for (let i = 0; i < MAX_THREAD_SCROLL_STATE_ENTRIES + 3; i += 1) {
      state[`thread-${i}`] = entry({ savedAt: i + 1 })
    }
    saveThreadScrollStateMap(state)
    const loaded = loadThreadScrollStateMap()
    expect(Object.keys(loaded)).toHaveLength(MAX_THREAD_SCROLL_STATE_ENTRIES)
    // 最旧的 3 个被淘汰，存活者从 thread-3 起。
    expect(loaded['thread-0']).toBeUndefined()
    expect(loaded['thread-2']).toBeUndefined()
    expect(loaded['thread-3']).toBeDefined()
    expect(loaded[`thread-${MAX_THREAD_SCROLL_STATE_ENTRIES + 2}`]).toBeDefined()
  })

  it('caps seeded hot heights per entry', () => {
    const hotHeights: Record<string, number> = {}
    for (let i = 0; i < 500; i += 1) hotHeights[`turn-${i}`] = 100 + i
    saveThreadScrollStateMap({ 'thread-1': entry({ hotHeights }) })
    const loaded = loadThreadScrollStateMap()
    const keys = Object.keys(loaded['thread-1']?.hotHeights ?? {})
    expect(keys.length).toBeLessThanOrEqual(200)
    expect(loaded['thread-1']?.distanceFromBottomPx).toBe(480.5)
  })

  it('removes the storage key when the state is empty', () => {
    saveThreadScrollStateMap({ 'thread-1': entry() })
    expect(getStored(store)).not.toBeNull()
    saveThreadScrollStateMap({})
    expect(getStored(store)).toBeNull()
  })

  it('tolerates storage write failures', () => {
    vi.unstubAllGlobals()
    installTestWindow(true)
    expect(() => saveThreadScrollStateMap({ 'thread-1': entry() })).not.toThrow()
    expect(loadThreadScrollStateMap()).toEqual({})
  })
})
