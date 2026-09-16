import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createDesktopModelPreferences } from './useDesktopModelPreferences'

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