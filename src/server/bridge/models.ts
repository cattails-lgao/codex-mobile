import { join } from 'node:path'
import { asRecord, getCodexHomeDir, getErrorMessage, readNonEmptyString } from './core.js'
import {
  FREE_MODE_STATE_FILE,
  filterOpenCodeZenModelsForAuthState,
  getFreeModels,
  OPENCODE_ZEN_DEFAULT_MODEL,
} from '../freeMode.js'
import { ensureDefaultFreeModeStateForMissingAuthSync } from './codexAuthState.js'

export type ProviderModelsResponse = {
  data: string[]
  providerId: string
  source: 'provider'
}

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000

function logProviderModelDiscoveryWarning(message: string, details: Record<string, unknown>): void {
  console.warn('[codex-provider-models]', message, details)
}

function isTimeoutError(payload: unknown): boolean {
  return payload instanceof Error && (payload.name === 'AbortError' || payload.name === 'TimeoutError')
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function normalizeQueryParams(value: unknown): URLSearchParams {
  const params = new URLSearchParams()
  const record = asRecord(value)
  if (!record) return params

  for (const [key, rawValue] of Object.entries(record)) {
    const normalized = normalizeHeaderValue(rawValue)
    if (!normalized) continue
    params.set(key, normalized)
  }

  return params
}

function buildProviderModelsUrl(baseUrl: string, queryParams: unknown): URL {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.endsWith('/') ? `${url.pathname}models` : `${url.pathname}/models`
  const extraParams = normalizeQueryParams(queryParams)
  for (const [key, value] of extraParams.entries()) {
    url.searchParams.set(key, value)
  }
  return url
}

export function normalizeProviderModelsData(payload: unknown): string[] {
  const record = asRecord(payload)
  const dataRows = Array.isArray(record?.data) ? record.data : null
  const modelRows = Array.isArray(record?.models) ? record.models : null
  const rows = dataRows?.length ? dataRows : modelRows?.length ? modelRows : dataRows ?? modelRows
  if (!rows) {
    throw new Error('provider /models payload is missing a data/models array')
  }

  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const candidateFromString = readNonEmptyString(row)
    const entry = asRecord(row)
    const candidate = candidateFromString
      || readNonEmptyString(entry?.id)
      || readNonEmptyString(entry?.model)
      || readNonEmptyString(entry?.slug)
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    ids.push(candidate)
  }
  return ids
}

async function fetchCustomEndpointDefaultModel(baseUrl: string, apiKey: string): Promise<string> {
  const normalizedBaseUrl = baseUrl.trim()
  if (!normalizedBaseUrl) return ''

  try {
    const modelsUrl = buildProviderModelsUrl(normalizedBaseUrl, null)
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    const response = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS) })
    if (!response.ok) return ''
    const payload = await response.json() as unknown
    const modelIds = normalizeProviderModelsData(payload)
    return modelIds[0] ?? ''
  } catch {
    return ''
  }
}

const CUSTOM_ENDPOINT_PATH_SUFFIXES = ['/chat/completions', '/responses'] as const

/**
 * Normalize a user-supplied custom endpoint URL to its base form. Users often
 * paste the full endpoint (`https://host/v1/chat/completions`); the proxy later
 * appends `/chat/completions` or `/responses` itself, so keeping the suffix
 * would produce a doubled path (404) and break `/models` discovery (round-41).
 */
export function normalizeCustomEndpointBaseUrl(input: string): string {
  let url = input.trim()
  if (!url) return ''
  url = url.replace(/\/+$/u, '')
  const lowered = url.toLowerCase()
  for (const suffix of CUSTOM_ENDPOINT_PATH_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      url = url.slice(0, url.length - suffix.length)
      break
    }
  }
  return url.replace(/\/+$/u, '')
}

/** Fetch the model id list from a custom endpoint's `/models` (round-41). */
async function fetchCustomEndpointModelIds(customBaseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const modelsUrl = customBaseUrl.replace(/\/+$/, '') + '/models'
    const headers: Record<string, string> = {}
    if (apiKey && apiKey !== 'dummy') {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return []
    return normalizeProviderModelsData(await resp.json() as unknown)
  } catch {
    return []
  }
}

async function fetchOpenCodeZenModelIds(apiKey: string | null | undefined): Promise<string[]> {
  const headers: Record<string, string> = {}
  if (apiKey && apiKey !== 'dummy') {
    headers.Authorization = `Bearer ${apiKey}`
  }
  const response = await fetch('https://opencode.ai/zen/v1/models', {
    headers,
    signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) return []
  return normalizeProviderModelsData(await response.json() as unknown)
}

function sortOpenCodeZenModelIds(modelIds: string[]): string[] {
  const freeIds = modelIds.filter((id) => id.endsWith('-free') || id === OPENCODE_ZEN_DEFAULT_MODEL)
  const paidIds = modelIds.filter((id) => !id.endsWith('-free') && id !== OPENCODE_ZEN_DEFAULT_MODEL)
  return [...freeIds, ...paidIds]
}

// Structural rpc facade matching the shell's AppServerProcess .rpc surface; the
// two readProvider*ModelIds entry points only need config/read, so they take a
// narrow { rpc } executor instead of the full shell instance.
export type RpcExecutor = {
  rpc: (method: string, params: unknown) => Promise<unknown>
}

export async function readProviderBackedModelIds(appServer: RpcExecutor): Promise<ProviderModelsResponse> {
  const configPayload = asRecord(await appServer.rpc('config/read', {}))
  const config = asRecord(configPayload?.config)
  const providerId = readNonEmptyString(config?.model_provider)
  if (!providerId) {
    return { data: [], providerId: '', source: 'provider' }
  }

  const providers = asRecord(config?.model_providers)
  const provider = asRecord(providers?.[providerId])
  if (!provider) {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const wireApi = readNonEmptyString(provider.wire_api)
  if (wireApi !== 'responses') {
    return { data: [], providerId, source: 'provider' }
  }

  const baseUrl = readNonEmptyString(provider.base_url)
  if (!baseUrl) {
    logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const headers = new Headers()
  const configuredHeaders = asRecord(provider.http_headers)
  if (configuredHeaders) {
    for (const [key, rawValue] of Object.entries(configuredHeaders)) {
      const normalized = normalizeHeaderValue(rawValue)
      if (!normalized) continue
      headers.set(key, normalized)
    }
  }

  const bearerToken = readNonEmptyString(provider.experimental_bearer_token)
  if (bearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearerToken}`)
  }

  const envKey = readNonEmptyString(provider.env_key)
  const envHttpHeaders = asRecord(provider.env_http_headers)
  if (envKey || envHttpHeaders) {
    logProviderModelDiscoveryWarning('provider discovery skipped env-backed auth/header expansion', {
      providerId,
      hasEnvKey: Boolean(envKey),
      hasEnvHttpHeaders: Boolean(envHttpHeaders),
    })
  }

  let requestUrl: URL
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, provider.query_params)
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models URL was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid url'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models request failed', {
      providerId,
      error: isTimeoutError(error) ? `request timed out after ${PROVIDER_MODELS_FETCH_TIMEOUT_MS}ms` : getErrorMessage(error, 'network error'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models response was not valid JSON', {
      providerId,
      status: response.status,
      error: getErrorMessage(error, 'invalid json'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  if (!response.ok) {
    logProviderModelDiscoveryWarning('provider /models request returned non-2xx', {
      providerId,
      status: response.status,
      statusText: response.statusText,
    })
    return { data: [], providerId, source: 'provider' }
  }

  try {
    return {
      data: normalizeProviderModelsData(payload),
      providerId,
      source: 'provider',
    }
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models payload was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid payload'),
    })
    return { data: [], providerId, source: 'provider' }
  }
}

export async function readProviderModelIdsForProvider(
  appServer: RpcExecutor,
  providerId: string,
): Promise<ProviderModelsResponse> {
  const normalizedProviderId = providerId.trim().toLowerCase().replace(/_/g, '-')
  if (!normalizedProviderId || normalizedProviderId === 'codex' || normalizedProviderId === 'openai') {
    return { data: [], providerId: '', source: 'provider' }
  }

  const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
  if (normalizedProviderId === 'opencode-zen') {
    try {
      const modelIds = filterOpenCodeZenModelsForAuthState(
        sortOpenCodeZenModelIds(await fetchOpenCodeZenModelIds(fmState?.provider === 'opencode-zen' ? fmState.apiKey : null)),
        fmState?.provider === 'opencode-zen' ? fmState.apiKey : null,
      )
      if (modelIds.length > 0) {
        return { data: modelIds, providerId: 'opencode-zen', source: 'provider' }
      }
    } catch {
      // Fall through to the offline Zen defaults.
    }
    return {
      data: ['big-pickle', 'minimax-m2.5-free', 'nemotron-3-super-free', 'trinity-large-preview-free'],
      providerId: 'opencode-zen',
      source: 'provider',
    }
  }

  if (normalizedProviderId === 'openrouter-free' || normalizedProviderId === 'openrouter') {
    return {
      data: await getFreeModels(),
      providerId: 'openrouter-free',
      source: 'provider',
    }
  }

  return readProviderBackedModelIds(appServer)
}

export {
  buildProviderModelsUrl,
  fetchCustomEndpointDefaultModel,
  fetchCustomEndpointModelIds,
  fetchOpenCodeZenModelIds,
  isTimeoutError,
  logProviderModelDiscoveryWarning,
  normalizeHeaderValue,
  PROVIDER_MODELS_FETCH_TIMEOUT_MS,
  sortOpenCodeZenModelIds,
}