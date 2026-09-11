// round-77: /codex-api/provider-models sits on the client's open-thread path
// (selectThread awaits refreshModelPreferences). These checks pin the cache
// behaviour that keeps a slow or failing provider off that path.
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch

async function loadFreeMode() {
  vi.resetModules()
  return await import('./freeMode')
}

function modelsPayload(ids: string[]): unknown {
  return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) }
}

function stubFetch(next: () => unknown): { calls: number } {
  const state = { calls: 0 }
  globalThis.fetch = (async () => {
    state.calls += 1
    return next()
  }) as unknown as typeof fetch
  return state
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

describe('free model catalog caching', () => {
  it('memoizes a failed fetch so later calls do not re-pay the network round trip', async () => {
    const state = stubFetch(() => { throw new Error('offline') })
    const { getFreeModels } = await loadFreeMode()

    const first = await getFreeModels()
    const second = await getFreeModels()

    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
    expect(state.calls).toBe(1)
  })

  it('memoizes a successful fetch instead of refetching on every call', async () => {
    const state = stubFetch(() => modelsPayload(['alpha:free', 'beta:free']))
    const { getFreeModels } = await loadFreeMode()

    const first = await getFreeModels()
    const second = await getFreeModels()

    expect(first).toEqual(['openrouter/free', 'alpha:free', 'beta:free'])
    expect(second).toEqual(first)
    expect(state.calls).toBe(1)
  })

  it('serves the stale list immediately and refreshes in the background after the TTL', async () => {
    vi.useFakeTimers()
    let ids = ['alpha:free']
    const state = stubFetch(() => modelsPayload(ids))
    const { getFreeModels } = await loadFreeMode()
    await getFreeModels()
    expect(state.calls).toBe(1)

    ids = ['gamma:free']
    vi.advanceTimersByTime(11 * 60 * 1000)

    // Stale value is returned without waiting on the (slow) refresh.
    const stale = await getFreeModels()
    expect(stale).toEqual(['openrouter/free', 'alpha:free'])
    expect(state.calls).toBe(2)

    await vi.advanceTimersByTimeAsync(0)
    expect(await getFreeModels()).toEqual(['openrouter/free', 'gamma:free'])
  })
})
