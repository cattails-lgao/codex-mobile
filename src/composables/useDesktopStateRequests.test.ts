import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { UiServerRequest } from '../types/codex'
import {
  readPendingReplyErrorForRequest,
  removePendingServerRequestById,
  replacePendingServerRequests,
  upsertPendingServerRequest,
  type PendingRequestWriteDeps,
} from './useDesktopStateRequests'

function makeDeps(): { deps: PendingRequestWriteDeps; applyThreadFlags: ReturnType<typeof vi.fn> } {
  const applyThreadFlags = vi.fn()
  const deps: PendingRequestWriteDeps = {
    pendingServerRequestsByThreadId: ref<Record<string, UiServerRequest[]>>({}),
    pendingReplyErrorByRequestId: ref<Record<string, string>>({}),
    applyThreadFlags,
  }
  return { deps, applyThreadFlags }
}

function req(id: number, receivedAtIso: string, threadId = 't1'): UiServerRequest {
  return { id, method: 'item/commandExecution/requestApproval', threadId, receivedAtIso, params: null, turnId: '', itemId: '' }
}

describe('useDesktopStateRequests pending-request writes', () => {
  it('upsert appends and sorts by receivedAtIso', () => {
    const { deps, applyThreadFlags } = makeDeps()
    upsertPendingServerRequest(deps, req(2, '2026-01-02T00:00:00Z'))
    upsertPendingServerRequest(deps, req(1, '2026-01-01T00:00:00Z'))
    expect(deps.pendingServerRequestsByThreadId.value.t1.map((r) => r.id)).toEqual([1, 2])
    expect(applyThreadFlags).toHaveBeenCalledTimes(2)
  })

  it('upsert replaces an existing request by id without duplicating', () => {
    const { deps } = makeDeps()
    upsertPendingServerRequest(deps, req(1, '2026-01-01T00:00:00Z'))
    upsertPendingServerRequest(deps, req(1, '2026-01-01T00:00:00Z'))
    expect(deps.pendingServerRequestsByThreadId.value.t1).toHaveLength(1)
  })

  it('remove drops the request and its stored reply error, flags threads', () => {
    const { deps, applyThreadFlags } = makeDeps()
    upsertPendingServerRequest(deps, req(7, '2026-01-01T00:00:00Z'))
    deps.pendingReplyErrorByRequestId.value['7'] = 'boom'
    const callsBefore = applyThreadFlags.mock.calls.length
    removePendingServerRequestById(deps, 7)
    expect(deps.pendingServerRequestsByThreadId.value.t1 ?? []).toHaveLength(0)
    expect(deps.pendingReplyErrorByRequestId.value['7']).toBeUndefined()
    expect(applyThreadFlags.mock.calls.length).toBe(callsBefore + 1)
  })

  it('replace resets the request map and prunes stale reply errors', () => {
    const { deps } = makeDeps()
    upsertPendingServerRequest(deps, req(1, '2026-01-01T00:00:00Z'))
    upsertPendingServerRequest(deps, req(2, '2026-01-02T00:00:00Z'))
    deps.pendingReplyErrorByRequestId.value['1'] = 'kept'
    deps.pendingReplyErrorByRequestId.value['9'] = 'stale'
    replacePendingServerRequests(deps, [req(1, '2026-01-01T00:00:00Z')])
    expect(deps.pendingServerRequestsByThreadId.value.t1.map((r) => r.id)).toEqual([1])
    expect(deps.pendingReplyErrorByRequestId.value['1']).toBe('kept')
    expect(deps.pendingReplyErrorByRequestId.value['9']).toBeUndefined()
  })

  it('readPendingReplyErrorForRequest returns the stored message or empty', () => {
    const { deps } = makeDeps()
    deps.pendingReplyErrorByRequestId.value['5'] = 'denied'
    expect(readPendingReplyErrorForRequest(deps, 5)).toBe('denied')
    expect(readPendingReplyErrorForRequest(deps, 42)).toBe('')
  })
})