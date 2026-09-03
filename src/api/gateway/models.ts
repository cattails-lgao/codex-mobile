import { asRecord, callRpc, readString } from './core'
import type {
  CollaborationModeListResponse,
  ConfigReadResponse,
  ModelListResponse,
} from '../appServerDtos'
import { isReasoningEffort } from '../../types/codex'
import type {
  CollaborationModeKind,
  CollaborationModeOption,
  ReasoningEffort,
  SpeedMode,
} from '../../types/codex'

type CurrentModelConfig = {
  model: string
  providerId: string
  reasoningEffort: ReasoningEffort | ''
  speedMode: SpeedMode
}

type ProviderModelsResponse = {
  data?: unknown
  exclusive?: unknown
}

export type AvailableModel = {
  id: string
  supportedReasoningEfforts: ReasoningEffort[] | null
  defaultReasoningEffort: ReasoningEffort | null
}

const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000
const PROVIDER_MODELS_CACHE_TTL_MS = 30_000
const providerModelsCache = new Map<string, { fetchedAt: number; result: { ids: string[], exclusive: boolean } | null }>()

export function clearProviderModelsCache(): void {
  providerModelsCache.clear()
}

const DEFAULT_COLLABORATION_MODE_OPTIONS: CollaborationModeOption[] = [
  { value: 'default', label: 'Default' },
  { value: 'plan', label: 'Plan' },
]

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  return isReasoningEffort(value) ? value : ''
}

function normalizeSpeedMode(value: unknown): SpeedMode {
  return typeof value === 'string' && value.trim().toLowerCase() === 'fast'
    ? 'fast'
    : 'standard'
}

export async function setDefaultModel(model: string): Promise<void> {
  await callRpc('setDefaultModel', { model })
}

export async function setCodexSpeedMode(mode: SpeedMode): Promise<void> {
  const normalizedMode: SpeedMode = mode === 'fast' ? 'fast' : 'standard'
  await callRpc('config/batchWrite', {
    edits: [
      {
        keyPath: 'features.fast_mode',
        value: true,
        mergeStrategy: 'upsert',
      },
      {
        keyPath: 'service_tier',
        value: normalizedMode === 'fast' ? 'fast' : null,
        mergeStrategy: normalizedMode === 'fast' ? 'upsert' : 'replace',
      },
    ],
    filePath: null,
    expectedVersion: null,
  })
}

export interface FreeModeStatus {
  enabled: boolean
  hasCodexAuth?: boolean
  keyCount: number
  models: string[]
  currentModel: string | null
  customKey: boolean
  maskedKey: string | null
  provider?: 'openrouter' | 'custom' | 'opencode-zen'
  customBaseUrl?: string
  wireApi?: 'responses' | 'chat' | null
}

export async function getFreeModeStatus(): Promise<FreeModeStatus> {
  const response = await fetch('/codex-api/free-mode/status')
  return await response.json() as FreeModeStatus
}

export async function setFreeMode(enable: boolean): Promise<{ ok: boolean; enabled: boolean; model?: string; models?: string[] }> {
  const response = await fetch('/codex-api/free-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enable }),
  })
  return await response.json() as { ok: boolean; enabled: boolean; model?: string; models?: string[] }
}

export async function setFreeModeCustomKey(key: string): Promise<{ ok: boolean; customKey: boolean }> {
  const response = await fetch('/codex-api/free-mode/custom-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  return await response.json() as { ok: boolean; customKey: boolean }
}

export async function setCustomProvider(
  baseUrl: string,
  apiKey: string,
  options?: { wireApi?: 'responses' | 'chat'; provider?: 'custom' | 'opencode-zen' | 'openrouter' },
): Promise<{ ok: boolean }> {
  const response = await fetch('/codex-api/free-mode/custom-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl,
      apiKey,
      wireApi: options?.wireApi,
      provider: options?.provider,
    }),
  })
  return await response.json() as { ok: boolean }
}

async function fetchProviderModelIds(providerId?: string): Promise<{ ids: string[], exclusive: boolean } | null> {
  const normalizedProviderId = providerId?.trim() ?? ''
  const cacheKey = normalizedProviderId
  const cached = providerModelsCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < PROVIDER_MODELS_CACHE_TTL_MS) {
    return cached.result
  }
  let result: { ids: string[], exclusive: boolean } | null = null
  try {
    const url = normalizedProviderId
      ? `/codex-api/provider-models?provider=${encodeURIComponent(normalizedProviderId)}`
      : '/codex-api/provider-models'
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    })
    let providerPayload: ProviderModelsResponse | null = null
    try {
      providerPayload = await response.json() as ProviderModelsResponse
    } catch {
      providerPayload = null
    }

    if (response.ok && Array.isArray(providerPayload?.data)) {
      result = {
        ids: providerPayload.data
          .map((candidate) => typeof candidate === 'string' ? candidate.trim() : '')
          .filter((candidate, index, candidates): candidate is string =>
            candidate.length > 0 && candidates.indexOf(candidate) === index),
        exclusive: providerPayload.exclusive === true,
      }
    }
  } catch {
    // Keep Codex usable when the provider-models endpoint is unavailable.
  }
  providerModelsCache.set(cacheKey, { fetchedAt: Date.now(), result })
  return result
}

function normalizeAvailableModel(value: unknown): AvailableModel | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id ?? record.model)?.trim() ?? ''
  if (!id) return null

  const rawEfforts = record.supportedReasoningEfforts ?? record.supported_reasoning_efforts
  const supportedReasoningEfforts = Array.isArray(rawEfforts)
    ? rawEfforts.flatMap((candidate) => {
        const option = asRecord(candidate)
        const effort = option
          ? option.reasoningEffort ?? option.reasoning_effort ?? option.effort
          : candidate
        return isReasoningEffort(effort) ? [effort] : []
      }).filter((effort, index, efforts) => efforts.indexOf(effort) === index)
    : null
  const rawDefault = record.defaultReasoningEffort ?? record.default_reasoning_effort

  return {
    id,
    supportedReasoningEfforts,
    defaultReasoningEffort: isReasoningEffort(rawDefault) ? rawDefault : null,
  }
}

function providerAvailableModel(id: string): AvailableModel {
  return {
    id,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
  }
}

export async function getAvailableModels(options: { includeProviderModels?: boolean; requireProviderModels?: boolean; providerId?: string } = {}): Promise<AvailableModel[]> {
  const shouldIncludeProviderModels = options.includeProviderModels !== false
  const providerModels = shouldIncludeProviderModels ? await fetchProviderModelIds(options.providerId) : null

  if (providerModels?.exclusive || options.requireProviderModels) {
    return (providerModels?.ids ?? []).map(providerAvailableModel)
  }

  const payload = await callRpc<ModelListResponse>('model/list', {})
  const models: AvailableModel[] = []
  for (const row of payload.data) {
    const model = normalizeAvailableModel(row)
    if (!model || models.some((candidate) => candidate.id === model.id)) continue
    models.push(model)
  }

  if (!shouldIncludeProviderModels || !providerModels) return models

  for (const id of providerModels.ids) {
    if (!models.some((candidate) => candidate.id === id)) models.push(providerAvailableModel(id))
  }
  return models
}

export async function getAvailableModelIds(options: { includeProviderModels?: boolean; requireProviderModels?: boolean; providerId?: string } = {}): Promise<string[]> {
  return (await getAvailableModels(options)).map((model) => model.id)
}

export async function getCurrentModelConfig(): Promise<CurrentModelConfig> {
  const payload = await callRpc<ConfigReadResponse>('config/read', {})
  const model = payload.config.model ?? ''
  const providerId = typeof payload.config.model_provider === 'string' ? payload.config.model_provider : ''
  const reasoningEffort = normalizeReasoningEffort(payload.config.model_reasoning_effort)
  const speedMode = normalizeSpeedMode(payload.config.service_tier)
  return { model, providerId, reasoningEffort, speedMode }
}

function normalizeCollaborationModeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase())
}

export async function getAvailableCollaborationModes(): Promise<CollaborationModeOption[]> {
  try {
    const payload = await callRpc<CollaborationModeListResponse>('collaborationMode/list', {})
    const seen = new Set<CollaborationModeKind>()
    const normalized: CollaborationModeOption[] = []

    for (const row of payload.data) {
      const mode = row.mode
      if (mode !== 'default' && mode !== 'plan' && mode !== 'execplans') continue
      if (seen.has(mode)) continue
      seen.add(mode)
      normalized.push({
        value: mode,
        label: normalizeCollaborationModeLabel(row.name || mode) || (mode === 'plan' ? 'Plan' : 'Default'),
      })
    }

    if (normalized.length > 0) {
      for (const fallback of DEFAULT_COLLABORATION_MODE_OPTIONS) {
        if (!seen.has(fallback.value)) {
          normalized.push(fallback)
        }
      }
      return normalized.sort((first, second) => (
        first.value === second.value ? 0 : first.value === 'default' ? -1 : 1
      ))
    }
  } catch {
    // Fall back to static options when the app-server does not expose presets.
  }

  return DEFAULT_COLLABORATION_MODE_OPTIONS
}