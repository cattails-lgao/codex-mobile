// round-77: the zen / custom-endpoint provider catalogs are fetched from external
// hosts on the thread-open path. These checks pin the memoization that landed.
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch

async function loadModels() {
  vi.resetModules()
  return await import('./models')
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
})

describe('provider catalog caching', () => {
  it('fetches the OpenCode Zen catalog once and reuses it', async () => {
    const state = stubFetch(() => ({ ok: true, json: async () => ({ data: ['zen-a', 'zen-b'] }) }))
    const { fetchOpenCodeZenModelIds } = await loadModels()

    expect(await fetchOpenCodeZenModelIds(null)).toEqual(['zen-a', 'zen-b'])
    expect(await fetchOpenCodeZenModelIds(null)).toEqual(['zen-a', 'zen-b'])
    expect(state.calls).toBe(1)
  })

  it('memoizes an empty catalog so a dead endpoint is not hit on every call', async () => {
    const state = stubFetch(() => ({ ok: false, status: 503, json: async () => ({}) }))
    const { fetchOpenCodeZenModelIds } = await loadModels()

    expect(await fetchOpenCodeZenModelIds(null)).toEqual([])
    expect(await fetchOpenCodeZenModelIds(null)).toEqual([])
    expect(state.calls).toBe(1)
  })

  it('keeps separate cache entries per custom endpoint', async () => {
    const state = stubFetch(() => ({ ok: true, json: async () => ({ data: ['m1'] }) }))
    const { fetchCustomEndpointModelIds } = await loadModels()

    await fetchCustomEndpointModelIds('https://a.example/v1', 'k')
    await fetchCustomEndpointModelIds('https://b.example/v1', 'k')
    await fetchCustomEndpointModelIds('https://a.example/v1', 'k')

    expect(state.calls).toBe(2)
  })
})
