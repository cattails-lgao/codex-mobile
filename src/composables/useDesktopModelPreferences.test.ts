import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesktopModelPreferences } from './useDesktopModelPreferences'
import { getAvailableModels, getCurrentModelConfig } from '../api/codexGateway'

vi.mock('../api/codexGateway', () => ({
  getAvailableModels: vi.fn(),
  getCurrentModelConfig: vi.fn(),
  setCodexSpeedMode: vi.fn(),
}))

const gatewayMocks = {
  getAvailableModels: vi.mocked(getAvailableModels),
  getCurrentModelConfig: vi.mocked(getCurrentModelConfig),
}

function modelsWithoutReasoning(...ids: string[]) {
  return ids.map((id) => ({ id, supportedReasoningEfforts: null, defaultReasoningEffort: null }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

function createPrefs() {
  return createDesktopModelPreferences({ selectedThreadId: ref('thread-1'), error: ref('') })
}

// round-72：线程模型切换必须真正生效。startTurnForThread 在首个 turn 前会 resume
// 线程并把服务端持久化的 model 写回（setThreadModelId）；若用户已在 UI 为该线程
// 显式选过模型（hasThreadModelSelection 为真），就不能再用服务端旧 model 覆盖，
// 否则旧模型（已删除/下线）会被继续拿去发请求而 400。这里锁定该判别逻辑。
describe('useDesktopModelPreferences.hasThreadModelSelection', () => {
  it('returns false when the thread has no explicit model selection', () => {
    const prefs = createPrefs()
    expect(prefs.hasThreadModelSelection('thread-1')).toBe(false)
  })

  it('returns true after the UI explicitly selects a model for that thread', () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('thread-1', 'gpt-5.6-terra')
    expect(prefs.hasThreadModelSelection('thread-1')).toBe(true)
    expect(prefs.readModelIdForThread('thread-1')).toBe('gpt-5.6-terra')
  })

  it('flips to true only after an explicit per-thread selection is made', () => {
    const prefs = createPrefs()
    expect(prefs.hasThreadModelSelection('thread-2')).toBe(false)
    prefs.setSelectedModelIdForThread('thread-2', 'gpt-5.6-terra')
    expect(prefs.hasThreadModelSelection('thread-2')).toBe(true)
    expect(prefs.readModelIdForThread('thread-2')).toBe('gpt-5.6-terra')
  })

  it('returns false for the new-thread placeholder context', () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('__new-thread__', 'big-pickle')
    expect(prefs.hasThreadModelSelection('__new-thread__')).toBe(false)
  })
})

// round-87：窄判据只看线程自身的上下文键。宽判据（含裸 `__new-thread__` 兜底读）
// 可能把新线程默认值算成任意线程的选择，不能用来决定「线程详情的服务端 model 是否
// 覆盖本地选择」——那会挡住本线程模型本应发生的初始化。
describe('useDesktopModelPreferences.hasThreadOwnModelSelection', () => {
  it('stays false when the thread only inherits the new-thread default model', () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('__new-thread__', 'big-pickle')

    expect(prefs.hasThreadOwnModelSelection('thread-1')).toBe(false)
    expect(prefs.hasThreadOwnModelSelection('thread-2')).toBe(false)
  })

  it('flips to true after the UI selects a model for that thread', () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('thread-1', 'gpt-5.6-terra')

    expect(prefs.hasThreadOwnModelSelection('thread-1')).toBe(true)
  })

  it('returns false for the new-thread placeholder context', () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('__new-thread__', 'big-pickle')

    expect(prefs.hasThreadOwnModelSelection('__new-thread__')).toBe(false)
  })
})

// round-87：回退换模型是真正的换模型，且只发生在这一个出口（没有水合角色），
// 因此「失效旧模型上下文窗口」的语义下沉到这里，调用方不必各写一遍也不会漏写。
describe('useDesktopModelPreferences.applyFallbackModelSelection', () => {
  it('notifies the host so the stale context window can be invalidated', async () => {
    const changedThreadIds: string[] = []
    const prefs = createDesktopModelPreferences({
      selectedThreadId: ref('thread-1'),
      error: ref(''),
      onThreadModelChanged: (threadId) => changedThreadIds.push(threadId),
    })

    await prefs.applyFallbackModelSelection('thread-1')

    expect(changedThreadIds).toEqual(['thread-1'])
    expect(prefs.readModelIdForThread('thread-1')).toBe('gpt-5.4-mini')
  })

  it('does not notify when there is no thread whose window could be invalidated', async () => {
    const changedThreadIds: string[] = []
    const prefs = createDesktopModelPreferences({
      selectedThreadId: ref(''),
      error: ref(''),
      onThreadModelChanged: (threadId) => changedThreadIds.push(threadId),
    })

    await prefs.applyFallbackModelSelection('')

    expect(changedThreadIds).toEqual([])
  })
})

// round-176：provider-models 是外部往返，一次抖动/失败就会让线程正在用的模型从
// 列表里消失。线程「自身键」里的显式选择不得因此被覆写成 config 默认（用户报障
// 「线程用的模型会被切换到默认模型」的直接根因）；providerChanged 显式换源仍可覆写。
describe('useDesktopModelPreferences.refreshModelPreferences', () => {
  function mockConfig(model: string, providerId: string) {
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model,
      providerId,
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
  }

  it('keeps a thread-own selection that is missing from the refreshed list', async () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('thread-1', 'zen-model-a')
    mockConfig('gpt-5.5', '')
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini'))

    await prefs.refreshModelPreferences({ includeProviderModels: false })

    expect(prefs.readModelIdForThread('thread-1')).toBe('zen-model-a')
    expect(prefs.selectedModelId.value).toBe('zen-model-a')
    expect(prefs.availableModelIds.value).toContain('zen-model-a')
  })

  it('still falls back to the configured model when nothing is selected for the thread', async () => {
    const prefs = createPrefs()
    mockConfig('gpt-5.5', '')
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini'))

    await prefs.refreshModelPreferences({ includeProviderModels: false })

    expect(prefs.selectedModelId.value).toBe('gpt-5.5')
  })

  it('keeps the thread model visible when the stale list lacks it (syncSelectedThreadModel)', async () => {
    const prefs = createPrefs()
    prefs.setSelectedModelIdForThread('thread-1', 'zen-model-a')
    // 模拟陈旧列表：只有 codex 模型、没有线程正在用的 zen-model-a。
    prefs.availableModelIds.value = ['gpt-5.5', 'gpt-5.4-mini']

    prefs.syncSelectedThreadModel('thread-1')

    expect(prefs.selectedModelId.value).toBe('zen-model-a')
    expect(prefs.availableModelIds.value).toContain('zen-model-a')
  })
})