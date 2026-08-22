import { rpcCall } from '../codexRpcClient'
import { normalizeCodexApiError } from '../codexErrors'

/**
 * Shared low-level primitives for the codex API gateway domain files.
 * Kept in a leaf module so gateway/<domain>.ts files can reuse these
 * without creating a circular import against codexGateway.ts.
 */

export async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

export function getErrorMessageFromPayload(payload: unknown, fallback: string): string {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
  const message = record.message
  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }
  const error = record.error
  return typeof error === 'string' && error.trim().length > 0 ? error : fallback
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error(`Expected JSON response from ${response.url || 'request'}`)
  }
}