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