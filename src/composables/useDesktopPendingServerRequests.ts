// Pending server-request cache read side + ownership, sliced out of
// useDesktopState()'s closure. This module owns the pendingServerRequestsByThreadId
// and pendingReplyErrorByRequestId refs, the read/derived helpers
// (selectedThreadServerRequests, getThreadPendingRequests, readPendingRequestState,
// pendingReplyErrorForRequest), the background read request
// (loadPendingServerRequestsFromBridge, pendingRequestStillExistsOnServer) and a
// scoped prune. Write-side orchestration (notification dispatch, reply flow) stays in
// the main closure; only the thin upsert/remove/replace wrappers and the
// applyThreadFlags callback are injected as narrow deps so this module stays
// cycle-free. Per-operation writes delegate to the existing useDesktopStateRequests
// Impls, which operate on the injected refs this module owns.
import { computed, ref } from 'vue'
import { getPendingServerRequests } from '../api/codexGateway'
import type { UiPendingRequestState, UiServerRequest } from '../types/codex'
import { asRecord } from './useDesktopStateNormalizers'
import {
  GLOBAL_SERVER_REQUEST_SCOPE,
  isApprovalRequestMethod,
  normalizeServerRequest,
  readPendingReplyErrorForRequest,
  removePendingServerRequestById,
  replacePendingServerRequests,
  upsertPendingServerRequest,
  type PendingRequestWriteDeps,
} from './useDesktopStateRequests'

export interface PendingServerRequestsDeps {
  applyThreadFlags: () => void
  getSelectedThreadId: () => string | null
}

export function createDesktopPendingServerRequests(deps: PendingServerRequestsDeps) {
  const pendingServerRequestsByThreadId = ref<Record<string, UiServerRequest[]>>({})
  // round-23：审批/询问面板回复失败时展示的可见错误（按 requestId），
  // 让「点了没反应」不再无声发生。
  const pendingReplyErrorByRequestId = ref<Record<string, string>>({})

  function buildWriteDeps(): PendingRequestWriteDeps {
    return {
      pendingServerRequestsByThreadId,
      pendingReplyErrorByRequestId,
      applyThreadFlags: deps.applyThreadFlags,
    }
  }

  function upsert(request: UiServerRequest): void {
    upsertPendingServerRequest(buildWriteDeps(), request)
  }

  function removeById(requestId: number): void {
    removePendingServerRequestById(buildWriteDeps(), requestId)
  }

  function replace(requests: UiServerRequest[]): void {
    replacePendingServerRequests(buildWriteDeps(), requests)
  }

  function replyErrorForRequest(requestId: number): string {
    return readPendingReplyErrorForRequest(buildWriteDeps(), requestId)
  }

  const selectedThreadServerRequests = computed<UiServerRequest[]>(() => {
    const rows: UiServerRequest[] = []
    const selected = deps.getSelectedThreadId()
    if (selected && Array.isArray(pendingServerRequestsByThreadId.value[selected])) {
      rows.push(...pendingServerRequestsByThreadId.value[selected])
    }
    if (Array.isArray(pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])) {
      rows.push(...pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])
    }
    return rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
  })

  function getThreadPendingRequests(threadId: string): UiServerRequest[] {
    if (!threadId) return []
    return Array.isArray(pendingServerRequestsByThreadId.value[threadId])
      ? pendingServerRequestsByThreadId.value[threadId]
      : []
  }

  function readPendingRequestState(requests: UiServerRequest[]): UiPendingRequestState | null {
    if (requests.some((request) => isApprovalRequestMethod(request.method))) {
      return 'approval'
    }
    return requests.length > 0 ? 'response' : null
  }

  function prunePendingServerRequestsByActiveThreads(activeThreadIds: Set<string>): void {
    const nextPending: Record<string, UiServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      if (threadId === GLOBAL_SERVER_REQUEST_SCOPE || activeThreadIds.has(threadId)) {
        nextPending[threadId] = requests
      }
    }
    pendingServerRequestsByThreadId.value = nextPending
  }

  async function loadPendingServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await getPendingServerRequests()
      const normalizedRequests = rows
        .map((row) => normalizeServerRequest(row))
        .filter((request): request is UiServerRequest => request !== null)
      replace(normalizedRequests)
    } catch {
      // Keep UI usable when pending request endpoint is temporarily unavailable.
    }
  }

  async function pendingRequestStillExistsOnServer(requestId: number): Promise<boolean> {
    try {
      const rows = await getPendingServerRequests()
      for (const row of rows) {
        const record = asRecord(row)
        if (record?.id === requestId) return true
      }
      return false
    } catch {
      // 对账接口不可用时保守处理：视为仍存在，保留面板并展示错误。
      return true
    }
  }

  return {
    getThreadPendingRequests,
    loadPendingServerRequestsFromBridge,
    pendingReplyErrorByRequestId,
    pendingReplyErrorForRequest: replyErrorForRequest,
    pendingRequestStillExistsOnServer,
    pendingServerRequestsByThreadId,
    prunePendingServerRequestsByActiveThreads,
    readPendingRequestState,
    removePendingServerRequestById: removeById,
    replacePendingServerRequests: replace,
    selectedThreadServerRequests,
    upsertPendingServerRequest: upsert,
  }
}