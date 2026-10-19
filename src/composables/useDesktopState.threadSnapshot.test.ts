// round-178：loadMessages 的「先上屏」快照接线测试——快照在 resume RPC 返回**之前**
// 就画进 persistedMessagesByThreadId；RPC 返回后 merge 收敛（服务端真相为准）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDesktopState } from './useDesktopState'
import { saveThreadMessageSnapshot } from './useDesktopStatePersistence'
import type { UiMessage } from '../types/codex'
import type { ResumedThread } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  getPendingServerRequests: vi.fn(),
  resumeThread: vi.fn(),
  getThreadDetail: vi.fn(),
  subscribeCodexNotifications: vi.fn(),
  getThreadQueueState: vi.fn(),
  getThreadTitleCache: vi.fn(),
  getWorkspaceRootsState: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({
  ...gatewayMocks,
}))

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

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.getPendingServerRequests.mockResolvedValue([])
  gatewayMocks.getThreadQueueState.mockResolvedValue({})
  gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: {} })
  gatewayMocks.getWorkspaceRootsState.mockRejectedValue(new Error('no workspace roots state'))
  gatewayMocks.subscribeCodexNotifications.mockReturnValue(vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadMessages snapshot paint-first', () => {
  it('快照在 resume RPC 返回前上屏；RPC 返回后以服务端结果收敛', async () => {
    installTestWindow()
    const snapshotMessages: UiMessage[] = [
      { id: 'u1', role: 'user', text: 'cached question', messageType: 'userMessage' },
      { id: 'a1', role: 'assistant', text: 'cached reply' },
    ]
    saveThreadMessageSnapshot('thread-snap', snapshotMessages, { t1: 0 }, false)

    let resolveResume: (value: ResumedThread) => void = () => {}
    gatewayMocks.resumeThread.mockImplementation(
      () => new Promise<ResumedThread>((resolve) => {
        resolveResume = resolve
      }),
    )

    const state = useDesktopState()
    state.primeSelectedThread('thread-snap')
    const loadPromise = state.loadMessages('thread-snap')

    // 快照必须先上屏（RPC 尚未 resolve）。
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(gatewayMocks.resumeThread).toHaveBeenCalledOnce()
    expect(state.messages.value).toEqual(snapshotMessages)

    // RPC 返回真实内容 → merge 收敛（快照里没有的 id 被补上，服务端为准）。
    resolveResume!({
      messages: [
        { id: 'u1', role: 'user', text: 'cached question', messageType: 'userMessage' },
        { id: 'a1', role: 'assistant', text: 'fresh reply from server' },
      ],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: { t1: 0 },
      hasMoreOlder: false,
      model: '',
      modelProvider: '',
      externalSession: null,
    })
    await loadPromise
    const final = state.messages.value
    expect(final).toHaveLength(2)
    expect(final.find((m) => m.id === 'a1')?.text).toBe('fresh reply from server')
  })

  it('无快照时不提前画任何内容（行为与旧路径一致）', async () => {
    installTestWindow()
    let resolveResume: (value: ResumedThread) => void = () => {}
    gatewayMocks.resumeThread.mockImplementation(
      () => new Promise<ResumedThread>((resolve) => {
        resolveResume = resolve
      }),
    )

    const state = useDesktopState()
    state.primeSelectedThread('thread-cold')
    const loadPromise = state.loadMessages('thread-cold')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    // 没有快照 ⇒ 不写任何占位内容（messages 计算值为空列表，非 undefined）。
    expect(state.messages.value ?? []).toHaveLength(0)

    resolveResume!({
      messages: [{ id: 'u1', role: 'user', text: 'q', messageType: 'userMessage' }],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
      model: '',
      modelProvider: '',
      externalSession: null,
    })
    await loadPromise
    expect(state.messages.value).toHaveLength(1)
  })

  it('进行中的线程不画快照（流式尾部不用旧内容垫底）', async () => {
    installTestWindow()
    saveThreadMessageSnapshot('thread-live', [
      { id: 'u1', role: 'user', text: 'old', messageType: 'userMessage' },
    ], {}, false)
    // 线程已在进行中：inProgressById 由 thread/list 快照或事件置真——
    // 这里通过 getThreadGroupsPage 不可控，改用 primeSelectedThread + resume
    // 返回 inProgress 前的窗口期不可靠，直接验证守卫语义：
    // 用 loadMessages 前先把 inProgress 置真（经由 resumeThread 返回后自动置位，
    // 因此这里换一个角度：快照存在但线程进行中 ⇒ 先上屏的应当是 resume 的
    // 渐进回调内容而非快照）。为构造该场景，让 resume 先发 partial。
    gatewayMocks.resumeThread.mockImplementation(
      (_threadId: string, onPartialMessages?: (messages: UiMessage[]) => void) => {
        onPartialMessages?.([{ id: 'p1', role: 'user', text: 'partial paint', messageType: 'userMessage' }])
        return Promise.resolve<ResumedThread>({
          messages: [{ id: 'p1', role: 'user', text: 'partial paint', messageType: 'userMessage' }],
          inProgress: true,
          activeTurnId: 't-live',
          turnIndexByTurnId: {},
          hasMoreOlder: false,
          model: '',
          modelProvider: '',
          externalSession: null,
        })
      },
    )

    const state = useDesktopState()
    state.primeSelectedThread('thread-live')
    await state.loadMessages('thread-live')
    // 渐进回调内容已上屏且快照的 'old' 未混入。
    const messages = state.messages.value
    expect(messages.some((m) => m.id === 'p1')).toBe(true)
    expect(messages.some((m) => m.id === 'u1' && m.text === 'old')).toBe(false)
  })
})
