import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_THREAD_MESSAGE_SNAPSHOT_BYTES,
  MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES,
  THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY,
  clearThreadMessageSnapshot,
  readThreadMessageSnapshot,
  saveThreadMessageSnapshot,
} from './useDesktopStatePersistence'
import type { UiMessage } from '../types/codex'

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  })
  return store
}

function userMessage(id: string, text: string): UiMessage {
  return { id, role: 'user', text, messageType: 'userMessage' }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('thread message snapshot store', () => {
  it('保存后可原样读回（消息 + 轮次索引 + hasMoreOlder）', () => {
    installTestWindow()
    const messages = [userMessage('u1', 'hello'), { id: 'a1', role: 'assistant' as const, text: 'hi' }]
    saveThreadMessageSnapshot('thread-a', messages, { t1: 0, t2: 1 }, true)
    const entry = readThreadMessageSnapshot('thread-a')
    expect(entry).not.toBeNull()
    expect(entry?.messages).toEqual(messages)
    expect(entry?.turnIndexByTurnId).toEqual({ t1: 0, t2: 1 })
    expect(entry?.hasMoreOlder).toBe(true)
    expect(entry?.v).toBe(1)
  })

  it('损坏的 JSON / 版本不符 / 空消息表 → 读回 null 且不抛', () => {
    installTestWindow({
      [THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY]: '{corrupted',
    })
    expect(readThreadMessageSnapshot('thread-a')).toBeNull()

    installTestWindow({
      [THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY]: JSON.stringify({
        'thread-a': { v: 2, savedAt: 1, messages: [{ id: 'u1' }] },
      }),
    })
    expect(readThreadMessageSnapshot('thread-a')).toBeNull()

    installTestWindow({
      [THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY]: JSON.stringify({
        'thread-a': { v: 1, savedAt: 1, messages: [] },
      }),
    })
    expect(readThreadMessageSnapshot('thread-a')).toBeNull()
  })

  it('LRU：超过上限淘汰最旧线程', () => {
    installTestWindow()
    for (let i = 0; i < MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES + 1; i += 1) {
      const savedAt = 1000 + i
      vi.spyOn(Date, 'now').mockReturnValue(savedAt)
      saveThreadMessageSnapshot(`thread-${i}`, [userMessage(`u${i}`, 'x')], {}, false)
    }
    vi.restoreAllMocks()
    expect(readThreadMessageSnapshot('thread-0')).toBeNull()
    expect(readThreadMessageSnapshot(`thread-${MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES}`)).not.toBeNull()
  })

  it('超预算条目从最旧端裁剪，保最新消息', () => {
    installTestWindow()
    const big = 'x'.repeat(60 * 1024)
    const messages: UiMessage[] = []
    for (let i = 0; i < 20; i += 1) messages.push(userMessage(`u${i}`, big))
    saveThreadMessageSnapshot('thread-big', messages, {}, false)
    const entry = readThreadMessageSnapshot('thread-big')
    expect(entry).not.toBeNull()
    expect(entry?.messages.length).toBeGreaterThan(0)
    expect(entry?.messages.length).toBeLessThan(20)
    // 保留的是最新端：最后一条 id 必须还在。
    expect(entry?.messages[entry.messages.length - 1]?.id).toBe('u19')
    expect(JSON.stringify(entry?.messages).length).toBeLessThanOrEqual(MAX_THREAD_MESSAGE_SNAPSHOT_BYTES + 1024)
  })

  it('空消息表 / 空 threadId 保存为 no-op', () => {
    const store = installTestWindow()
    saveThreadMessageSnapshot('thread-a', [], {}, false)
    saveThreadMessageSnapshot('', [userMessage('u1', 'x')], {}, false)
    expect(store.get(THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY)).toBeUndefined()
  })

  it('clear 只丢目标线程，其余线程保留（回退后防「刷新又回来」）', () => {
    installTestWindow()
    saveThreadMessageSnapshot('thread-a', [userMessage('u1', 'a')], {}, false)
    saveThreadMessageSnapshot('thread-b', [userMessage('u2', 'b')], {}, false)
    clearThreadMessageSnapshot('thread-a')
    expect(readThreadMessageSnapshot('thread-a')).toBeNull()
    expect(readThreadMessageSnapshot('thread-b')?.messages[0]?.id).toBe('u2')
  })

  it('clear 未知线程 / 空 id 不抛也不写盘', () => {
    const store = installTestWindow()
    clearThreadMessageSnapshot('')
    clearThreadMessageSnapshot('thread-unknown')
    expect(store.get(THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY)).toBeUndefined()
  })
})
