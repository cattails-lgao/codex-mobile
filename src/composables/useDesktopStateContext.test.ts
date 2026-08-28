import { describe, expect, it } from 'vitest'
import {
  NEW_THREAD_COLLABORATION_MODE_CONTEXT,
  normalizeProviderContextId,
  pruneThreadContextStateMap,
  readSelectedModel,
  toProviderModelContextId,
} from './useDesktopStateContext'

describe('desktop state context', () => {
  it('keeps global and active thread model contexts while pruning stale threads', () => {
    const providerContext = toProviderModelContextId('OpenCode_Zen')
    const state = {
      [NEW_THREAD_COLLABORATION_MODE_CONTEXT]: 'gpt-5.5',
      [providerContext]: 'big-pickle',
      active: 'gpt-5.6-sol',
      stale: 'gpt-5.4-mini',
    }

    const next = pruneThreadContextStateMap(state, new Set(['active']))

    expect(normalizeProviderContextId('OpenCode_Zen')).toBe('opencode-zen')
    expect(next).toEqual({
      [NEW_THREAD_COLLABORATION_MODE_CONTEXT]: 'gpt-5.5',
      [providerContext]: 'big-pickle',
      active: 'gpt-5.6-sol',
    })
    expect(readSelectedModel(next, 'missing')).toBe('gpt-5.5')
  })
})
