// Pure server-request parsing / classification sliced out of useDesktopState()'s
// closure. These reduce an RPC params payload (or an already-normalized
// UiServerRequest) into a classified method / field set without touching any
// reactive ref. The write-side (upsertPendingServerRequest / applyThreadFlags
// / pendingReplyErrorForRequest) stays in the closure.
import type { UiServerRequest } from '../types/codex'
import { asRecord, readString } from './useDesktopStateNormalizers'

export const GLOBAL_SERVER_REQUEST_SCOPE = '__global__'

export function isApprovalRequestMethod(method: string): boolean {
  return (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval' ||
    method === 'item/permissions/requestApproval' ||
    method === 'execCommandApproval' ||
    method === 'applyPatchApproval'
  )
}

export function normalizeServerRequest(params: unknown): UiServerRequest | null {
  const row = asRecord(params)
  if (!row) return null

  const id = row.id
  const rawMethod = readString(row.method)
  const requestParams = row.params
  if (typeof id !== 'number' || !Number.isInteger(id) || !rawMethod) {
    return null
  }

  const requestParamRecord = asRecord(requestParams)
  const method = normalizePendingServerRequestMethod(rawMethod, requestParamRecord)
  const threadId = (
    readString(requestParamRecord?.threadId) ||
    readString(requestParamRecord?.thread_id) ||
    readString(requestParamRecord?.conversationId) ||
    readString(requestParamRecord?.conversation_id) ||
    GLOBAL_SERVER_REQUEST_SCOPE
  )
  const turnId = readString(requestParamRecord?.turnId) || readString(requestParamRecord?.turn_id)
  const itemId = (
    readString(requestParamRecord?.itemId) ||
    readString(requestParamRecord?.item_id) ||
    readString(requestParamRecord?.callId) ||
    readString(requestParamRecord?.call_id)
  )
  const receivedAtIso = readString(row.receivedAtIso) || new Date().toISOString()

  return {
    id,
    method,
    threadId,
    turnId,
    itemId,
    receivedAtIso,
    params: requestParams ?? null,
  }
}

export function normalizePendingServerRequestMethod(
  method: string,
  params: Record<string, unknown> | null,
): string {
  const normalized = method.trim()
  if (!normalized) return normalized

  if (
    normalized === 'item/commandExecution/requestApproval' ||
    normalized === 'execCommandApproval' ||
    normalized === 'exec_approval_request' ||
    looksLikeExecApprovalRequest(params)
  ) {
    return 'item/commandExecution/requestApproval'
  }

  if (
    normalized === 'item/fileChange/requestApproval' ||
    normalized === 'applyPatchApproval' ||
    normalized === 'apply_patch_approval_request' ||
    looksLikePatchApprovalRequest(params)
  ) {
    return 'item/fileChange/requestApproval'
  }

  if (
    normalized === 'item/tool/requestUserInput' ||
    normalized === 'request_user_input' ||
    looksLikeToolUserInputRequest(params)
  ) {
    return 'item/tool/requestUserInput'
  }

  if (
    normalized === 'mcpServer/elicitation/request' ||
    normalized === 'elicitation_request' ||
    looksLikeMcpServerElicitationRequest(params)
  ) {
    return 'mcpServer/elicitation/request'
  }

  if (normalized === 'item/permissions/requestApproval' || looksLikePermissionsApprovalRequest(params)) {
    return 'item/permissions/requestApproval'
  }

  if (
    normalized === 'item/tool/call' ||
    normalized === 'dynamic_tool_call_request' ||
    looksLikeToolCallRequest(params)
  ) {
    return 'item/tool/call'
  }

  return normalized
}

export function looksLikeExecApprovalRequest(params: Record<string, unknown> | null): boolean {
  if (!params) return false
  const command = params.command
  if (Array.isArray(command) && command.some((part) => typeof part === 'string' && part.trim().length > 0)) {
    return true
  }
  if (typeof command === 'string' && command.trim().length > 0) {
    return true
  }
  return Array.isArray(params.commandActions)
}

export function looksLikePatchApprovalRequest(params: Record<string, unknown> | null): boolean {
  if (!params) return false
  if (typeof params.grantRoot === 'string' && params.grantRoot.trim().length > 0) return true
  if (typeof params.grant_root === 'string' && params.grant_root.trim().length > 0) return true
  if (asRecord(params.fileChanges)) return true
  return asRecord(params.changes) !== null
}

export function looksLikeToolUserInputRequest(params: Record<string, unknown> | null): boolean {
  return Boolean(params && Array.isArray(params.questions))
}

export function looksLikeToolCallRequest(params: Record<string, unknown> | null): boolean {
  if (!params) return false
  return (
    typeof params.toolName === 'string' ||
    typeof params.tool_name === 'string' ||
    typeof params.name === 'string' ||
    Array.isArray(params.arguments)
  )
}

export function looksLikeMcpServerElicitationRequest(params: Record<string, unknown> | null): boolean {
  if (!params) return false
  const mode = readString(params.mode)
  return (
    typeof params.serverName === 'string' &&
    typeof params.threadId === 'string' &&
    typeof params.message === 'string' &&
    (mode === 'form' || mode === 'url')
  )
}

export function looksLikePermissionsApprovalRequest(params: Record<string, unknown> | null): boolean {
  if (!params) return false
  return (
    typeof params.threadId === 'string' &&
    typeof params.turnId === 'string' &&
    typeof params.itemId === 'string' &&
    asRecord(params.permissions) !== null
  )
}

export function readToolRequestUserInputQuestionIds(request: UiServerRequest): string[] {
  if (request.method !== 'item/tool/requestUserInput') return []
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const questionIds: string[] = []

  for (const row of questions) {
    const question = asRecord(row)
    const id = readString(question?.id).trim()
    if (id) {
      questionIds.push(id)
    }
  }

  return questionIds
}