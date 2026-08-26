import { describe, expect, it } from 'vitest'
import { FOREGROUND_RESUME_MIN_HIDDEN_MS, shouldSyncAfterForeground } from './foregroundResume'

describe('shouldSyncAfterForeground', () => {
  it('allows one sync after a sufficiently long hidden interval regardless of viewport', () => {
    expect(shouldSyncAfterForeground('visible', 1_000, false, 1_000 + FOREGROUND_RESUME_MIN_HIDDEN_MS)).toBe(true)
  })

  it('skips hidden, short, missing, and already handled resumes', () => {
    expect(shouldSyncAfterForeground('hidden', 1_000, false, 2_000)).toBe(false)
    expect(shouldSyncAfterForeground('visible', 1_000, false, 1_001)).toBe(false)
    expect(shouldSyncAfterForeground('visible', null, false, 2_000)).toBe(false)
    expect(shouldSyncAfterForeground('visible', 1_000, true, 2_000)).toBe(false)
  })
})
