// round-179：快照保存「不占首屏预算」的接线测试。
//
// 背景：saveThreadMessageSnapshot 对 9360 条消息整表序列化实测 ~150ms，原先在
// loadMessages 返回路径上同步跑 ⇒ 直接推迟首屏渲染。现在改为首帧 paint 之后
// （rAF → setTimeout）执行，并在写入前复核「尾部仍在本地」——延迟窗口内若发生
// 回退（删尾部轮次并清快照），不得把旧快照写回去。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { UiMessage } from '../types/codex'
import type { ResumedThread } from '../api/codexGateway'
import { createDesktopMessageHistoryLoading, type MessageHistoryLoadingDeps } from './useDesktopMessageHistoryLoading'
import { readThreadMessageSnapshot } from './useDesktopStatePersistence'

const gatewayMocks = vi.hoisted(() => ({
  resumeThread: vi.fn(),
  getThreadDetail: vi.fn(),
  getOlderThreadMessages: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({ ...gatewayMocks }))

function installTestWindow() {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
    // 慢加载提示用 5000ms 定时器；测试里压到 5ms，避免挂起 open handle。
    setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, Math.min(ms ?? 0, 5)) as unknown as number,
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
  })
}

const MESSAGES: UiMessage[] = [
  { id: 'u1', role: 'user', text: 'question', messageType: 'userMessage' },
  { id: 'a1', role: 'assistant', text: 'answer' },
]

function makeDeps() {
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const noop = vi.fn()
  const deps = {
    selectedThreadId: ref('thread-1'),
    error: ref(''),
    persistedMessagesByThreadId,
    liveAgentMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
    inProgressById: ref<Record<string, boolean>>({}),
    externalSessionByThreadId: ref<Record<string, unknown>>({}),
    resumedThreadById: ref<Record<string, boolean>>({}),
    turnIndexByTurnIdByThreadId: ref<Record<string, Record<string, number>>>({}),
    turnErrorByThreadId: ref<Record<string, unknown>>({}),
    activeTurnIdByThreadId: ref<Record<string, string>>({}),
    markThreadAsRead: noop,
    markThreadMessagesPersisted: noop,
    replaceTurnIndexLookupForThread: noop,
    rebindLiveFileChangeTurnIndices: noop,
    setPersistedMessagesForThread: (threadId: string, nextMessages: UiMessage[]) => {
      persistedMessagesByThreadId.value = {
        ...persistedMessagesByThreadId.value,
        [threadId]: nextMessages,
      }
    },
    setLiveAgentMessagesForThread: noop,
    clearLiveAgentMessagesForThread: noop,
    removeLiveCommandsPersistedIn: noop,
    removeLiveFileChangesPersistedIn: noop,
    setThreadInProgress: noop,
    setThreadModelProviderId: noop,
    setThreadModelId: noop,
    resolveThreadModelForProvider: (_threadId: string, modelId: string) => modelId,
    hasThreadOwnModelSelection: () => false,
    clearTransientTurnErrorForThread: noop,
    clearCompletedTurnLiveState: noop,
    setTurnErrorForThread: noop,
    getFirstPersistedTurnId: () => '',
    currentThreadVersion: () => '',
  }
  return { deps: deps as unknown as MessageHistoryLoadingDeps, persistedMessagesByThreadId }
}

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.resumeThread.mockResolvedValue({
    model: 'gpt-5',
    modelProvider: 'test',
    messages: MESSAGES,
    inProgress: false,
    activeTurnId: '',
    hasMoreOlder: false,
    turnIndexByTurnId: { t1: 0 },
    externalSession: null,
  } satisfies ResumedThread)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('快照保存延后到首帧之后', () => {
  it('loadMessages 返回时还没写快照；下一拍才落盘', async () => {
    installTestWindow()
    const { deps } = makeDeps()
    const loading = createDesktopMessageHistoryLoading(deps)

    await loading.loadMessages('thread-1')

    // 同步返回路径上不得有序列化产物（否则 9360 条大线程会推迟首屏 ~150ms）。
    expect(readThreadMessageSnapshot('thread-1')).toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 20))
    const snapshot = readThreadMessageSnapshot('thread-1')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.messages.map((message) => message.id)).toEqual(['u1', 'a1'])
  })

  it('延后窗口内尾部被移除（模拟回退）⇒ 不写回旧快照', async () => {
    installTestWindow()
    const { deps, persistedMessagesByThreadId } = makeDeps()
    const loading = createDesktopMessageHistoryLoading(deps)

    await loading.loadMessages('thread-1')
    // 模拟回退：尾部轮次被删（回退路径同时会 clearThreadMessageSnapshot）。
    persistedMessagesByThreadId.value = { 'thread-1': [MESSAGES[0]] }

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readThreadMessageSnapshot('thread-1')).toBeNull()
  })
})
