// round-176：/codex-api/provider-models 缓存行为 —— 成功值长缓存（5min）、过期后
// stale-while-revalidate（立即回旧值 + 后台重验）、失败只短负缓存（3s）。这条缓存
// 在选线程/模型下拉的关键路径上：此前 30s TTL + 失败也缓存 30s，是「模型列表有
// 延迟」「有时只剩默认模型」的来源之一。
import { afterEach, describe, expect, it, vi } from 'vitest'

const callRpcMock = vi.fn()

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return {
    ...actual,
    callRpc: (...args: unknown[]) => callRpcMock(...(args as [])),
  }
})

async function loadModels() {
  vi.resetModules()
  return await import('./models')
}

function providerPayload(ids: string[]): unknown {
  return { ok: true, json: async () => ({ data: ids, exclusive: false }) }
}

function stubProviderFetch(next: () => unknown): { calls: number } {
  const state = { calls: 0 }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input)
    if (url.includes('/codex-api/provider-models')) {
      state.calls += 1
      return next()
    }
    throw new Error('unexpected fetch: ' + url)
  }) as unknown as typeof fetch
  return state
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

const originalFetch = globalThis.fetch

describe('provider model catalog caching', () => {
  it('serves repeated calls from the cache within the TTL', async () => {
    vi.useFakeTimers()
    callRpcMock.mockResolvedValue({ data: [] })
    const state = stubProviderFetch(() => providerPayload(['zen-a', 'zen-b']))
    const { getAvailableModels } = await loadModels()

    const first = await getAvailableModels({ providerId: 'opencode-zen' })
    vi.advanceTimersByTime(60_000)
    const second = await getAvailableModels({ providerId: 'opencode-zen' })

    expect(first.map((m) => m.id)).toEqual(['zen-a', 'zen-b'])
    expect(second.map((m) => m.id)).toEqual(['zen-a', 'zen-b'])
    expect(state.calls).toBe(1)
  })

  it('serves the stale list immediately after the TTL and refreshes in the background', async () => {
    vi.useFakeTimers()
    callRpcMock.mockResolvedValue({ data: [] })
    let ids = ['zen-a']
    const state = stubProviderFetch(() => providerPayload(ids))
    const { getAvailableModels } = await loadModels()

    await getAvailableModels({ providerId: 'opencode-zen' })
    expect(state.calls).toBe(1)

    ids = ['zen-c']
    vi.advanceTimersByTime(6 * 60_000)

    // 过期：立即回陈旧值（不等待慢刷新）。
    const stale = await getAvailableModels({ providerId: 'opencode-zen' })
    expect(stale.map((m) => m.id)).toEqual(['zen-a'])

    // 后台重验完成后，下一次调用拿到新值。
    await vi.advanceTimersByTimeAsync(0)
    const fresh = await getAvailableModels({ providerId: 'opencode-zen' })
    expect(fresh.map((m) => m.id)).toEqual(['zen-c'])
    expect(state.calls).toBe(2)
  })

  it('does not pin a failed fetch for the full TTL (short negative cache)', async () => {
    vi.useFakeTimers()
    callRpcMock.mockResolvedValue({ data: [] })
    let offline = true
    const state = stubProviderFetch(() => {
      if (offline) throw new Error('offline')
      return providerPayload(['zen-a'])
    })
    const { getAvailableModels } = await loadModels()

    const failed = await getAvailableModels({ requireProviderModels: true, providerId: 'opencode-zen' })
    expect(failed).toEqual([])
    expect(state.calls).toBe(1)

    // 失败后短时间内不重付网络往返。
    vi.advanceTimersByTime(1_000)
    await getAvailableModels({ requireProviderModels: true, providerId: 'opencode-zen' })
    expect(state.calls).toBe(1)

    // 负缓存过期后恢复取数；此时网络已恢复 → 拿到模型。
    offline = false
    vi.advanceTimersByTime(3_000)
    const recovered = await getAvailableModels({ requireProviderModels: true, providerId: 'opencode-zen' })
    expect(recovered.map((m) => m.id)).toEqual(['zen-a'])
    expect(state.calls).toBe(2)
  })
})
