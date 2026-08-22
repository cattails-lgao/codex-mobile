// Reasoning overlay write-side sliced out of useDesktopState()'s closure.
// It owns the live reasoning text ref plus the throttled localStorage snapshot
// used to recover the overlay's "thinking" region after a refresh.
//
// Because the snapshot state (map + dirty flag + debounce timer) is per-instance
// mutable state that lives in the composable, this is a factory rather than a
// set of module-scope functions: createLiveReasoningTextWrites() captures that
// state and returns bound callbacks. The injected deps are just the refs the
// cluster needs.
import type { Ref } from 'vue'
import {
  LIVE_REASONING_SNAPSHOT_STORAGE_KEY,
  loadLiveReasoningSnapshotMap,
  type LiveReasoningSnapshot,
} from './useDesktopStatePersistence'
import { omitKey } from './useDesktopStateUtils'

const LIVE_REASONING_SNAPSHOT_MAX_CHARS = 8_000
const LIVE_REASONING_SNAPSHOT_SAVE_MS = 1_500
const LIVE_REASONING_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1_000

export interface LiveReasoningWriteDeps {
  liveReasoningTextByThreadId: Ref<Record<string, string>>
  inProgressById: Ref<Record<string, boolean>>
}

export interface LiveReasoningWriteHandles {
  setLiveReasoningText: (threadId: string, text: string) => void
  appendLiveReasoningText: (threadId: string, delta: string) => void
  restoreLiveReasoningSnapshot: (threadId: string) => void
  clearLiveReasoningSnapshot: (threadId: string) => void
}

export function createLiveReasoningTextWrites(deps: LiveReasoningWriteDeps): LiveReasoningWriteHandles {
  // round-27：进行中思考文本的轻量快照（内存 + 节流写 localStorage）。
  // 刷新后 overlay 的 live-overlay-reasoning 不再空白/消失——服务端不回放
  // reasoning 增量，纯页面内存态会随刷新丢失；快照在轮次进行中持续更新、
  // 轮次结束（clearLiveReasoningForThread 收口）时删除。
  let snapshotByThreadId: Record<string, LiveReasoningSnapshot> = loadLiveReasoningSnapshotMap()
  let snapshotDirty = false
  let snapshotTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleSave(): void {
    if (snapshotTimer !== null) return
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null
      if (snapshotDirty) {
        snapshotDirty = false
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(LIVE_REASONING_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshotByThreadId))
          } catch {
            // Ignore localStorage failures (quota/private mode).
          }
        }
      }
      if (snapshotDirty) scheduleSave()
    }, LIVE_REASONING_SNAPSHOT_SAVE_MS)
  }

  function rememberSnapshot(threadId: string, text: string): void {
    if (!threadId) return
    if (deps.inProgressById.value[threadId] !== true) return
    const capped = text.length > LIVE_REASONING_SNAPSHOT_MAX_CHARS
      ? text.slice(-LIVE_REASONING_SNAPSHOT_MAX_CHARS)
      : text
    snapshotByThreadId[threadId] = { text: capped, ts: Date.now() }
    snapshotDirty = true
    scheduleSave()
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    if (!threadId) return
    const normalized = text.trim()
    const previous = deps.liveReasoningTextByThreadId.value[threadId] ?? ''
    if (normalized.length === 0) {
      if (!previous) return
      deps.liveReasoningTextByThreadId.value = omitKey(deps.liveReasoningTextByThreadId.value, threadId)
      return
    }
    if (previous === normalized) return
    deps.liveReasoningTextByThreadId.value = {
      ...deps.liveReasoningTextByThreadId.value,
      [threadId]: normalized,
    }
    // round-27：刷新后 overlay 思考文本恢复（快照节流写 localStorage）
    rememberSnapshot(threadId, normalized)
  }

  function appendLiveReasoningText(threadId: string, delta: string): void {
    if (!threadId) return
    const previous = deps.liveReasoningTextByThreadId.value[threadId] ?? ''
    setLiveReasoningText(threadId, `${previous}${delta}`)
  }

  function restoreLiveReasoningSnapshot(threadId: string): void {
    if (!threadId) return
    const current = deps.liveReasoningTextByThreadId.value[threadId]?.trim()
    if (current) return
    const snapshot = snapshotByThreadId[threadId]
    if (!snapshot?.text) return
    if (Date.now() - snapshot.ts > LIVE_REASONING_SNAPSHOT_MAX_AGE_MS) return
    deps.liveReasoningTextByThreadId.value = {
      ...deps.liveReasoningTextByThreadId.value,
      [threadId]: snapshot.text,
    }
  }

  function clearLiveReasoningSnapshot(threadId: string): void {
    if (!threadId) return
    if (!(threadId in snapshotByThreadId)) return
    delete snapshotByThreadId[threadId]
    snapshotDirty = true
    scheduleSave()
  }

  return {
    setLiveReasoningText,
    appendLiveReasoningText,
    restoreLiveReasoningSnapshot,
    clearLiveReasoningSnapshot,
  }
}