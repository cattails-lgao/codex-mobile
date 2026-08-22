import { asRecord, getErrorMessage, readNonEmptyString } from './core.js'
import { OPENCODE_ZEN_DEFAULT_MODEL } from '../freeMode.js'

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