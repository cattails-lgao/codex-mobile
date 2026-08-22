import {
  asRecord,
  callRpc,
  getErrorMessageFromPayload,
  readBoolean,
  readNumber,
  readString,
} from './core'
import { normalizeCodexApiError } from '../codexErrors'
import type { GetAccountRateLimitsResponse } from '../appServerDtos'
import type {
  UiAccountEntry,
  UiAccountQuotaStatus,
  UiAccountUnavailableReason,
  UiCreditsSnapshot,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../../types/codex'
import { pickCodexRateLimitSnapshot } from './misc'

export type AccountsListResult = {
  activeAccountId: string | null
  activeStorageId: string | null
  accounts: UiAccountEntry[]
  importedAccountId?: string
  importedStorageId?: string
}

function normalizeAccountUnavailableReason(value: unknown): UiAccountUnavailableReason | null {
  return value === 'payment_required' ? value : null
}

function isPaymentRequiredErrorMessage(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized.includes('payment required') || /\b402\b/.test(normalized)
}

function normalizeRateLimitWindow(value: unknown): UiRateLimitWindow | null {
  const record = asRecord(value)
  if (!record) return null

  const usedPercent = readNumber(record.usedPercent ?? record.used_percent)
  if (usedPercent === null) return null

  const windowValue = readNumber(record.windowDurationMins ?? record.window_minutes)
  return {
    usedPercent,
    windowDurationMins: windowValue,
    windowMinutes: windowValue,
    resetsAt: readNumber(record.resetsAt ?? record.resets_at),
  }
}

function normalizeCreditsSnapshot(value: unknown): UiCreditsSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const hasCredits = readBoolean(record.hasCredits ?? record.has_credits)
  const unlimited = readBoolean(record.unlimited)
  if (hasCredits === null || unlimited === null) return null

  return {
    hasCredits,
    unlimited,
    balance: readString(record.balance),
  }
}

function normalizeRateLimitSnapshot(value: unknown): UiRateLimitSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const primary = normalizeRateLimitWindow(record.primary)
  const secondary = normalizeRateLimitWindow(record.secondary)
  const credits = normalizeCreditsSnapshot(record.credits)

  if (!primary && !secondary && !credits) return null

  return {
    limitId: readString(record.limitId ?? record.limit_id),
    limitName: readString(record.limitName ?? record.limit_name),
    primary,
    secondary,
    credits,
    planType: readString(record.planType ?? record.plan_type),
  }
}

function normalizeAccountEntry(
  value: unknown,
  activeAccountId: string | null = null,
  activeStorageId: string | null = null,
): UiAccountEntry | null {
  const record = asRecord(value)
  if (!record) return null
  const accountId = readString(record.accountId)
  const storageId = readString(record.storageId) ?? accountId
  const quotaStatusRaw = readString(record.quotaStatus)
  const quotaStatus: UiAccountQuotaStatus =
    quotaStatusRaw === 'loading' || quotaStatusRaw === 'ready' || quotaStatusRaw === 'error' ? quotaStatusRaw : 'idle'
  if (!accountId) return null
  return {
    accountId,
    storageId: storageId ?? accountId,
    userId: readString(record.userId),
    authMode: readString(record.authMode),
    email: readString(record.email),
    planType: readString(record.planType),
    lastRefreshedAtIso: readString(record.lastRefreshedAtIso) ?? '',
    lastActivatedAtIso: readString(record.lastActivatedAtIso),
    quotaSnapshot: normalizeRateLimitSnapshot(record.quotaSnapshot),
    quotaUpdatedAtIso: readString(record.quotaUpdatedAtIso),
    quotaStatus,
    quotaError: readString(record.quotaError),
    unavailableReason: normalizeAccountUnavailableReason(record.unavailableReason)
      ?? (isPaymentRequiredErrorMessage(readString(record.quotaError)) ? 'payment_required' : null),
    isActive: readBoolean(record.isActive) ?? (storageId === activeStorageId || accountId === activeAccountId),
  }
}

export interface UiRemoteControlStatus {
  enabled: boolean
  clients: Array<{ clientId: string; deviceName: string; lastSeenAt: string | null }>
}

export interface UiRemotePairingCode {
  pairingCode: string
  expiresAt: string | null
}

function normalizeRemoteClient(value: unknown): { clientId: string; deviceName: string; lastSeenAt: string | null } | null {
  const record = asRecord(value)
  if (!record) return null
  const clientId = readString(record.clientId ?? record.client_id ?? record.id)
  if (!clientId) return null
  return {
    clientId,
    deviceName: readString(record.deviceName ?? record.device_name ?? record.name) ?? '',
    lastSeenAt: readString(record.lastSeenAt ?? record.last_seen_at ?? record.lastSeen),
  }
}

export async function readRemoteControlStatus(): Promise<UiRemoteControlStatus> {
  const payload = await callRpc<{
    enabled?: unknown
    clients?: unknown[] | null
    data?: unknown[] | null
  }>('remoteControl/status/read', {})
  const clients = Array.isArray(payload.clients) ? payload.clients : Array.isArray(payload.data) ? payload.data : []
  return {
    enabled: readBoolean(payload.enabled) ?? false,
    clients: clients.map(normalizeRemoteClient).filter((row): row is { clientId: string; deviceName: string; lastSeenAt: string | null } => row !== null),
  }
}

export type ApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

export async function readApprovalPolicy(): Promise<ApprovalPolicy> {
  const response = await fetch('/codex-api/approval-policy')
  const payload = (await response.json()) as { data?: { policy?: unknown }; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to read approval policy')
  }
  const policy = readString(payload.data?.policy) ?? ''
  if (policy === 'untrusted' || policy === 'on-failure' || policy === 'on-request' || policy === 'never') {
    return policy
  }
  return 'never'
}

export async function writeApprovalPolicy(policy: ApprovalPolicy): Promise<void> {
  const response = await fetch('/codex-api/approval-policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy }),
  })
  const payload = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to save approval policy')
  }
}

export async function setRemoteControlEnabled(enabled: boolean): Promise<void> {
  await callRpc(enabled ? 'remoteControl/enable' : 'remoteControl/disable', {})
}

export async function startRemoteControlPairing(): Promise<UiRemotePairingCode> {
  const payload = await callRpc<{
    pairingCode?: unknown
    pairing_code?: unknown
    code?: unknown
    expiresAt?: unknown
    expires_at?: unknown
  }>('remoteControl/pairing/start', {})
  return {
    pairingCode: readString(payload.pairingCode ?? payload.pairing_code ?? payload.code) ?? '',
    expiresAt: readString(payload.expiresAt ?? payload.expires_at),
  }
}

export async function listRemoteControlClients(): Promise<Array<{ clientId: string; deviceName: string; lastSeenAt: string | null }>> {
  const payload = await callRpc<{ clients?: unknown[] | null; data?: unknown[] | null }>('remoteControl/client/list', {})
  const clients = Array.isArray(payload.clients) ? payload.clients : Array.isArray(payload.data) ? payload.data : []
  return clients.map(normalizeRemoteClient).filter((row): row is { clientId: string; deviceName: string; lastSeenAt: string | null } => row !== null)
}

export async function revokeRemoteControlClient(clientId: string): Promise<void> {
  await callRpc('remoteControl/client/revoke', { clientId })
}

export async function getAccountRateLimits(): Promise<UiRateLimitSnapshot | null> {
  try {
    const payload = await callRpc<unknown>('account/rateLimits/read')
    return pickCodexRateLimitSnapshot(payload)
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load account rate limits', 'account/rateLimits/read')
  }
}

function normalizeAccountsListResult(payload: unknown): AccountsListResult {
  const record = asRecord(payload)
  const activeAccountId = readString(record?.activeAccountId)
  const activeStorageId = readString(record?.activeStorageId)
  const data = Array.isArray(record?.accounts) ? record?.accounts : []
  return {
    activeAccountId,
    activeStorageId,
    importedAccountId: readString(record?.importedAccountId) ?? undefined,
    importedStorageId: readString(record?.importedStorageId) ?? undefined,
    accounts: data
      .map((entry) => normalizeAccountEntry(entry, activeAccountId, activeStorageId))
      .filter((entry): entry is UiAccountEntry => entry !== null),
  }
}

export async function getAccounts(): Promise<AccountsListResult> {
  const response = await fetch('/codex-api/accounts')
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to load accounts'))
  }
  const envelope = asRecord(payload)
  return normalizeAccountsListResult(envelope?.data)
}

export async function refreshAccountsFromAuth(): Promise<AccountsListResult> {
  const response = await fetch('/codex-api/accounts/refresh', {
    method: 'POST',
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to refresh accounts'))
  }
  const envelope = asRecord(payload)
  return normalizeAccountsListResult(envelope?.data)
}

export async function startCodexLogin(): Promise<string> {
  const response = await fetch('/codex-api/accounts/login/start', {
    method: 'POST',
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to start Codex login'))
  }
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  const loginUrl = readString(data?.loginUrl)
  if (!loginUrl) {
    throw new Error('Failed to start Codex login')
  }
  return loginUrl
}

export async function completeCodexLogin(callbackUrl: string): Promise<AccountsListResult> {
  const response = await fetch('/codex-api/accounts/login/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callbackUrl }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to complete Codex login'))
  }
  const envelope = asRecord(payload)
  return normalizeAccountsListResult(envelope?.data)
}

export async function switchAccount(storageId: string): Promise<UiAccountEntry> {
  const response = await fetch('/codex-api/accounts/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageId }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to switch account'))
  }
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  const account = normalizeAccountEntry(data?.account, readString(data?.activeAccountId), readString(data?.activeStorageId))
  if (!account) {
    throw new Error('Failed to switch account')
  }
  return account
}

export async function removeAccount(storageId: string): Promise<AccountsListResult> {
  const response = await fetch('/codex-api/accounts/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageId }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to remove account'))
  }
  const envelope = asRecord(payload)
  return normalizeAccountsListResult(envelope?.data)
}

export async function getAccountRateLimitsResponse(): Promise<GetAccountRateLimitsResponse> {
  return await callRpc<GetAccountRateLimitsResponse>('account/rateLimits/read')
}