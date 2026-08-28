import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiRateLimitSnapshot } from '../types/codex'

const gatewayMocks = vi.hoisted(() => ({
  getAccountRateLimits: vi.fn(),
}))

vi.mock('../api/codexGateway', () => gatewayMocks)

import { createDesktopRateLimits } from './useDesktopRateLimits'

const snapshot: UiRateLimitSnapshot = {
  limitId: 'codex',
  limitName: 'Codex',
  primary: null,
  secondary: null,
  credits: null,
  planType: 'plus',
}

describe('createDesktopRateLimits', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    gatewayMocks.getAccountRateLimits.mockReset()
  })

  it('reuses an in-flight refresh and keeps the last snapshot on failure', async () => {
    let resolveRequest: ((value: UiRateLimitSnapshot) => void) | undefined
    gatewayMocks.getAccountRateLimits.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))
    const state = createDesktopRateLimits()

    const first = state.refreshRateLimits()
    const second = state.refreshRateLimits()
    expect(gatewayMocks.getAccountRateLimits).toHaveBeenCalledTimes(1)
    resolveRequest?.(snapshot)
    await Promise.all([first, second])
    expect(state.codexQuota.value).toEqual(snapshot)
    expect(state.accountRateLimitSnapshots.value).toEqual([snapshot])

    gatewayMocks.getAccountRateLimits.mockRejectedValueOnce(new Error('offline'))
    await state.refreshRateLimits()
    expect(state.codexQuota.value).toEqual(snapshot)
    expect(state.accountRateLimitSnapshots.value).toEqual([snapshot])
  })

  it('debounces scheduled refreshes and cancels pending work on stop', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    })
    gatewayMocks.getAccountRateLimits.mockResolvedValue(snapshot)
    const state = createDesktopRateLimits()

    state.scheduleRateLimitRefresh()
    state.scheduleRateLimitRefresh()
    await vi.advanceTimersByTimeAsync(499)
    expect(gatewayMocks.getAccountRateLimits).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(gatewayMocks.getAccountRateLimits).toHaveBeenCalledTimes(1)

    state.scheduleRateLimitRefresh()
    state.stopRateLimitRefresh()
    await vi.advanceTimersByTimeAsync(500)
    expect(gatewayMocks.getAccountRateLimits).toHaveBeenCalledTimes(1)
  })
})
