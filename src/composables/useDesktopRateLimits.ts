import { computed, ref } from 'vue'
import { getAccountRateLimits } from '../api/codexGateway'
import type { UiRateLimitSnapshot } from '../types/codex'

const RATE_LIMIT_REFRESH_DEBOUNCE_MS = 500

export function createDesktopRateLimits() {
  const codexRateLimit = ref<UiRateLimitSnapshot | null>(null)
  const accountRateLimitSnapshots = ref<UiRateLimitSnapshot[]>([])
  const codexQuota = computed<UiRateLimitSnapshot | null>(() => codexRateLimit.value)
  let refreshTimer: number | null = null
  let refreshPromise: Promise<void> | null = null

  function setCodexRateLimit(nextSnapshot: UiRateLimitSnapshot | null): void {
    codexRateLimit.value = nextSnapshot
  }

  async function refreshRateLimits(): Promise<void> {
    if (refreshPromise) {
      await refreshPromise
      return
    }

    refreshPromise = (async () => {
      try {
        const snapshot = await getAccountRateLimits()
        setCodexRateLimit(snapshot)
        accountRateLimitSnapshots.value = snapshot ? [snapshot] : []
      } catch {
        // Keep the last known state while the endpoint is temporarily unavailable.
      } finally {
        refreshPromise = null
      }
    })()

    await refreshPromise
  }

  function scheduleRateLimitRefresh(): void {
    if (typeof window === 'undefined') {
      void refreshRateLimits()
      return
    }

    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      void refreshRateLimits()
    }, RATE_LIMIT_REFRESH_DEBOUNCE_MS)
  }

  function stopRateLimitRefresh(): void {
    if (refreshTimer === null || typeof window === 'undefined') return
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }

  return {
    accountRateLimitSnapshots,
    codexQuota,
    refreshRateLimits,
    scheduleRateLimitRefresh,
    setCodexRateLimit,
    stopRateLimitRefresh,
  }
}
