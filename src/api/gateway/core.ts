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