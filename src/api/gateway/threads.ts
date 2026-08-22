import { asRecord, callRpc, readString } from './core'
import { normalizeCodexApiError } from '../codexErrors'
import type {
  ConfigReadResponse,
  ModelListResponse,
  ThreadForkResponse,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadStartResponse,
  Turn,
} from '../appServerDtos'
import {
  isReasoningEffort,
  type CollaborationModeKind,
  type ReasoningEffort,
  type SpeedMode,
  type UiExternalSession,
  type UiMessage,
  type UiProjectGroup,
  type UiThread,
} from '../../types/codex'
import {
  normalizeThreadGroupsV2,
  normalizeThreadMessagesV2,
  normalizeThreadSummaryV2,
  readActiveTurnIdFromResponse,
  readExternalSessionFromResponse,
  readThreadInProgressFromResponse,
} from '../normalizers/v2'

type ThreadTurnIndexById = Record<string, number>

type CurrentModelConfig = {
  model: string
  providerId: string
  reasoningEffort: ReasoningEffort | ''
  speedMode: SpeedMode
}

type ResolvedCollaborationModeSettings = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

type ProviderModelsResponse = {
  data?: unknown
  exclusive?: unknown
}

// AvailableModel is canonical in gateway/models.ts; threads keeps a private copy
// of the model cluster (getAvailableModels/getAvailableModelIds/getCurrentModelConfig)
// only for startThreadTurn's collaboration-mode resolution.
type AvailableModel = {
  id: string
  supportedReasoningEfforts: ReasoningEffort[] | null
  defaultReasoningEffort: ReasoningEffort | null
}

const INITIAL_THREAD_LIST_LIMIT = 50

const RESUME_THREAD_COALESCE_TTL_MS = 30_000
const recentResumeThreadById = new Map<string, Promise<ResumedThread>>()

// ponytail: getCurrentModelConfig/getAvailableModelIds (and the model helpers they
// pull in) are cross-domain shared and belong in a future gateway/models.ts. They are
// duplicated here so threads.ts stays self-contained until that extraction lands.
const PROVIDER_MODELS_FETCH_TIMEOUT_MS = 5_000

export type ThreadGroupsPage = {
  groups: UiProjectGroup[]
  nextCursor: string | null
}

export type ThreadTurnPage = {
  messages: UiMessage[]
  inProgress: boolean
  activeTurnId: string
  hasMoreOlder: boolean
  startTurnIndex: number
  turnIndexByTurnId: ThreadTurnIndexById
}

export type ResumedThread = {
  model: string
  modelProvider: string
  messages: UiMessage[]
  inProgress: boolean
  activeTurnId: string
  hasMoreOlder: boolean
  turnIndexByTurnId: ThreadTurnIndexById
  externalSession: UiExternalSession | null
}

export type StartedThread = {
  threadId: string
  model: string
  modelProvider: string
}

export type ForkedThread = {
  threadId: string
  cwd: string
  model: string
  messages: UiMessage[]
}

export type FileAttachmentParam = { label: string; path: string; fsPath: string }

function normalizePlanModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

function normalizeCollaborationModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  return isReasoningEffort(value) ? value : ''
}

function normalizeSpeedMode(value: unknown): SpeedMode {
  return typeof value === 'string' && value.trim().toLowerCase() === 'fast'
    ? 'fast'
    : 'standard'
}

function buildTurnIndexByTurnId(payload: ThreadReadResponse, baseTurnIndex = 0): ThreadTurnIndexById {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const lookup: ThreadTurnIndexById = {}

  for (let turnOffset = 0; turnOffset < turns.length; turnOffset += 1) {
    const turnIndex = baseTurnIndex + turnOffset
    const turn = turns[turnOffset]
    if (typeof turn?.id !== 'string' || turn.id.length === 0) continue
    lookup[turn.id] = turnIndex
  }

  return lookup
}

function readThreadTurnStartIndex(payload: ThreadReadResponse): number {
  const record = asRecord(payload)
  const raw = record?.threadTurnStartIndex
  return Math.max(0, Math.floor(typeof raw === 'number' ? raw : 0))
}

function normalizeThreadIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>

  const thread = record.thread
  if (thread && typeof thread === 'object') {
    const threadId = (thread as Record<string, unknown>).id
    if (typeof threadId === 'string' && threadId.length > 0) {
      return threadId
    }
  }
  return ''
}

function normalizeThreadCwdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>

  const thread = record.thread
  if (thread && typeof thread === 'object') {
    const cwd = (thread as Record<string, unknown>).cwd
    if (typeof cwd === 'string' && cwd.length > 0) {
      return cwd
    }
  }
  return ''
}

function normalizeThreadModelFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const model = (payload as Record<string, unknown>).model
  return typeof model === 'string' ? model.trim() : ''
}

function normalizeThreadModelProviderFromPayload(payload: unknown): string {
  const record = asRecord(payload)
  if (!record) return ''
  const modelProvider = readString(record.modelProvider)?.trim() ?? ''
  if (modelProvider) return modelProvider
  const thread = asRecord(record.thread)
  return readString(thread?.modelProvider)?.trim() ?? ''
}

function extractLocalImagePathFromUrl(value: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value, 'http://localhost')
    if (parsed.pathname !== '/codex-local-image') return null
    const path = parsed.searchParams.get('path')?.trim() ?? ''
    return path.length > 0 ? path : null
  } catch {
    return null
  }
}

function buildTextWithAttachments(
  prompt: string,
  files: FileAttachmentParam[],
): string {
  if (files.length === 0) return prompt
  let prefix = '# Files mentioned by the user:\n'
  for (const f of files) {
    prefix += `\n## ${f.label}: ${f.path}\n`
  }
  return `${prefix}\n## My request for Codex:\n\n${prompt}\n`
}

function fileNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? normalized
}

async function fetchProviderModelIds(providerId?: string): Promise<{ ids: string[], exclusive: boolean } | null> {
  try {
    const normalizedProviderId = providerId?.trim() ?? ''
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
      return {
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
  return null
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

async function getAvailableModels(options: { includeProviderModels?: boolean; requireProviderModels?: boolean; providerId?: string } = {}): Promise<AvailableModel[]> {
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

async function getAvailableModelIds(options: { includeProviderModels?: boolean; requireProviderModels?: boolean; providerId?: string } = {}): Promise<string[]> {
  return (await getAvailableModels(options)).map((model) => model.id)
}

async function getCurrentModelConfig(): Promise<CurrentModelConfig> {
  const payload = await callRpc<ConfigReadResponse>('config/read', {})
  const model = payload.config.model ?? ''
  const providerId = typeof payload.config.model_provider === 'string' ? payload.config.model_provider : ''
  const reasoningEffort = normalizeReasoningEffort(payload.config.model_reasoning_effort)
  const speedMode = normalizeSpeedMode(payload.config.service_tier)
  return { model, providerId, reasoningEffort, speedMode }
}

async function resolveCollaborationModeSettings(
  mode: CollaborationModeKind,
  model?: string,
  effort?: ReasoningEffort,
): Promise<ResolvedCollaborationModeSettings> {
  const explicitModel = model?.trim() ?? ''
  if (explicitModel) {
    return {
      model: explicitModel,
      reasoningEffort: mode === 'plan'
        ? normalizePlanModeReasoningEffort(effort)
        : normalizeCollaborationModeReasoningEffort(effort),
    }
  }

  let currentConfig: CurrentModelConfig | null = null
  try {
    currentConfig = await getCurrentModelConfig()
  } catch {
    currentConfig = null
  }

  const configuredModel = currentConfig?.model.trim() ?? ''
  if (configuredModel) {
    return {
      model: configuredModel,
      reasoningEffort: mode === 'plan'
        ? normalizePlanModeReasoningEffort(effort ?? currentConfig?.reasoningEffort)
        : normalizeCollaborationModeReasoningEffort(effort ?? currentConfig?.reasoningEffort),
    }
  }

  let availableModelIds: string[] = []
  try {
    availableModelIds = await getAvailableModelIds()
  } catch {
    availableModelIds = []
  }

  const fallbackModel = availableModelIds.find((candidate) => candidate.trim().length > 0)?.trim() ?? ''
  if (fallbackModel) {
    return {
      model: fallbackModel,
      reasoningEffort: mode === 'plan'
        ? normalizePlanModeReasoningEffort(effort ?? currentConfig?.reasoningEffort)
        : normalizeCollaborationModeReasoningEffort(effort ?? currentConfig?.reasoningEffort),
    }
  }

  throw new Error(`${mode === 'plan' ? 'Plan' : 'Default'} mode requires an available model. Wait for models to load and try again.`)
}

async function getThreadGroupsPageV2(cursor: string | null, limit: number): Promise<ThreadGroupsPage> {
  const payload = await callRpc<ThreadListResponse>('thread/list', {
    archived: false,
    limit,
    sortKey: 'updated_at',
    modelProviders: [],
    cursor,
  })
  return {
    groups: normalizeThreadGroupsV2(payload),
    nextCursor: typeof payload.nextCursor === 'string' && payload.nextCursor.length > 0
      ? payload.nextCursor
      : null,
  }
}

async function getThreadMessagesV2(threadId: string): Promise<UiMessage[]> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })
  return normalizeThreadMessagesV2(payload, readThreadTurnStartIndex(payload))
}

async function getThreadSummaryV2(threadId: string): Promise<UiThread> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: false,
  })
  return normalizeThreadSummaryV2(payload)
}

async function getThreadDetailV2(threadId: string): Promise<{
  model: string
  modelProvider: string
  messages: UiMessage[]
  inProgress: boolean
  activeTurnId: string
  hasMoreOlder: boolean
  turnIndexByTurnId: ThreadTurnIndexById
  externalSession: UiExternalSession | null
}> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })
  const startTurnIndex = readThreadTurnStartIndex(payload)
  const normalized = normalizeThreadMessagesV2(payload, startTurnIndex)
  return {
    model: normalizeThreadModelFromPayload(payload),
    modelProvider: normalizeThreadModelProviderFromPayload(payload),
    messages: normalized,
    inProgress: readThreadInProgressFromResponse(payload),
    activeTurnId: readActiveTurnIdFromResponse(payload),
    hasMoreOlder: startTurnIndex > 0,
    turnIndexByTurnId: buildTurnIndexByTurnId(payload, startTurnIndex),
    externalSession: readExternalSessionFromResponse(payload),
  }
}

async function getOlderThreadMessagesV2(threadId: string, beforeTurnId: string, limit = 10): Promise<ThreadTurnPage> {
  const params = new URLSearchParams({
    threadId,
    beforeTurnId,
    limit: String(limit),
  })
  const response = await fetch(`/codex-api/thread-turn-page?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Older thread page request failed with ${response.status}`)
  }
  const payload = await response.json() as {
    result?: ThreadReadResponse
    hasMoreOlder?: unknown
    startTurnIndex?: unknown
  }
  if (!payload.result) {
    throw new Error('Older thread page response did not include a thread result')
  }
  const startTurnIndex = Math.max(0, Math.floor(typeof payload.startTurnIndex === 'number' ? payload.startTurnIndex : 0))

  return {
    messages: normalizeThreadMessagesV2(payload.result, startTurnIndex),
    inProgress: readThreadInProgressFromResponse(payload.result),
    activeTurnId: readActiveTurnIdFromResponse(payload.result),
    hasMoreOlder: payload.hasMoreOlder === true,
    startTurnIndex,
    turnIndexByTurnId: buildTurnIndexByTurnId(payload.result, startTurnIndex),
  }
}

export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  try {
    return (await getThreadGroupsPageV2(null, INITIAL_THREAD_LIST_LIMIT)).groups
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load thread groups', 'thread/list')
  }
}

export async function getThreadGroupsPage(
  cursor: string | null = null,
  limit = INITIAL_THREAD_LIST_LIMIT,
): Promise<ThreadGroupsPage> {
  try {
    return await getThreadGroupsPageV2(cursor, limit)
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load thread groups', 'thread/list')
  }
}

export async function getThreadMessages(threadId: string): Promise<UiMessage[]> {
  try {
    return await getThreadMessagesV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getThreadSummary(threadId: string): Promise<UiThread> {
  try {
    return await getThreadSummaryV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getThreadDetail(threadId: string): Promise<{
  model: string
  modelProvider: string
  messages: UiMessage[]
  inProgress: boolean
  activeTurnId: string
  hasMoreOlder: boolean
  turnIndexByTurnId: ThreadTurnIndexById
  externalSession: UiExternalSession | null
}> {
  try {
    return await getThreadDetailV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getOlderThreadMessages(threadId: string, beforeTurnId: string, limit?: number): Promise<ThreadTurnPage> {
  try {
    return await getOlderThreadMessagesV2(threadId, beforeTurnId, limit)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load earlier messages for thread ${threadId}`, 'thread/read')
  }
}

export async function resumeThread(threadId: string): Promise<ResumedThread> {
  const existing = recentResumeThreadById.get(threadId)
  if (existing) return existing

  const promise = (async () => {
    const payload = await callRpc<ThreadResumeResponse>('thread/resume', { threadId })
    const startTurnIndex = readThreadTurnStartIndex(payload)
    const messages = normalizeThreadMessagesV2(payload, startTurnIndex)
    return {
      model: normalizeThreadModelFromPayload(payload),
      modelProvider: normalizeThreadModelProviderFromPayload(payload),
      messages,
      inProgress: readThreadInProgressFromResponse(payload),
      activeTurnId: readActiveTurnIdFromResponse(payload),
      hasMoreOlder: startTurnIndex > 0,
      turnIndexByTurnId: buildTurnIndexByTurnId(payload, startTurnIndex),
      externalSession: readExternalSessionFromResponse(payload),
    }
  })()

  recentResumeThreadById.set(threadId, promise)
  const hardEvictionTimer = globalThis.setTimeout(() => {
    if (recentResumeThreadById.get(threadId) === promise) {
      recentResumeThreadById.delete(threadId)
    }
  }, RESUME_THREAD_COALESCE_TTL_MS)
  void promise.finally(() => {
    globalThis.clearTimeout(hardEvictionTimer)
    globalThis.setTimeout(() => {
      if (recentResumeThreadById.get(threadId) === promise) {
        recentResumeThreadById.delete(threadId)
      }
    }, 2000)
  }).catch(() => undefined)
  return promise
}

export async function archiveThread(threadId: string): Promise<void> {
  await callRpc('thread/archive', { threadId })
}

export async function unarchiveThread(threadId: string): Promise<void> {
  await callRpc('thread/unarchive', { threadId })
}

export async function compactThread(threadId: string): Promise<void> {
  await callRpc('thread/compact/start', { threadId })
}

export async function renameThread(threadId: string, threadName: string): Promise<void> {
  await callRpc('thread/name/set', { threadId, name: threadName })
}

export async function rollbackThread(threadId: string, numTurns: number): Promise<UiMessage[]> {
  const payload = await callRpc<ThreadReadResponse>('thread/rollback', { threadId, numTurns })
  return normalizeThreadMessagesV2(payload, readThreadTurnStartIndex(payload))
}

export async function startThread(cwd?: string, model?: string): Promise<StartedThread> {
  try {
    const params: Record<string, unknown> = {}
    if (typeof cwd === 'string' && cwd.trim().length > 0) {
      params.cwd = cwd.trim()
    }
    if (typeof model === 'string' && model.trim().length > 0) {
      params.model = model.trim()
    }
    const payload = await callRpc<ThreadStartResponse>('thread/start', params)
    const threadId = normalizeThreadIdFromPayload(payload)
    if (!threadId) {
      throw new Error('thread/start did not return a thread id')
    }
    return {
      threadId,
      model: normalizeThreadModelFromPayload(payload),
      modelProvider: normalizeThreadModelProviderFromPayload(payload),
    }
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to start a new thread', 'thread/start')
  }
}

export async function forkThread(threadId: string): Promise<ForkedThread>
export async function forkThread(threadId: string, cwd: string | undefined, model: string | undefined): Promise<StartedThread>
export async function forkThread(
  threadId: string,
  cwd?: string,
  model?: string,
): Promise<StartedThread | ForkedThread> {
  if (arguments.length <= 1) {
    try {
      const payload = await callRpc<ThreadForkResponse & ThreadReadResponse & { thread?: { id?: string; cwd?: string } }>('thread/fork', {
        threadId,
        persistExtendedHistory: true,
      })
      const forkedThreadId = normalizeThreadIdFromPayload(payload)
      if (!forkedThreadId) {
        throw new Error('thread/fork did not return a thread id')
      }
      return {
        threadId: forkedThreadId,
        cwd: normalizeThreadCwdFromPayload(payload),
        model: normalizeThreadModelFromPayload(payload),
        messages: normalizeThreadMessagesV2(payload, readThreadTurnStartIndex(payload)),
      }
    } catch (error) {
      throw normalizeCodexApiError(error, `Failed to fork thread ${threadId}`, 'thread/fork')
    }
  }

  try {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) {
      throw new Error('thread/fork requires threadId')
    }
    const params: Record<string, unknown> = {
      threadId: normalizedThreadId,
    }
    if (typeof cwd === 'string' && cwd.trim().length > 0) {
      params.cwd = cwd.trim()
    }
    if (typeof model === 'string' && model.trim().length > 0) {
      params.model = model.trim()
    }
    const payload = await callRpc<ThreadForkResponse>('thread/fork', params)
    const nextThreadId = normalizeThreadIdFromPayload(payload)
    if (!nextThreadId) {
      throw new Error('thread/fork did not return a thread id')
    }
    return {
      threadId: nextThreadId,
      model: normalizeThreadModelFromPayload(payload),
      modelProvider: normalizeThreadModelProviderFromPayload(payload),
    }
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to fork thread ${threadId}`, 'thread/fork')
  }
}

export async function startThreadTurn(
  threadId: string,
  text: string,
  imageUrls: string[] = [],
  model?: string,
  effort?: ReasoningEffort,
  skills?: Array<{ name: string; path: string }>,
  fileAttachments: FileAttachmentParam[] = [],
  collaborationMode?: CollaborationModeKind,
): Promise<string> {
  try {
    const normalizedModel = model?.trim() ?? ''
    const localImageAttachments: FileAttachmentParam[] = []
    for (const imageUrl of imageUrls) {
      const localImagePath = extractLocalImagePathFromUrl(imageUrl.trim())
      if (!localImagePath) continue
      localImageAttachments.push({
        label: fileNameFromPath(localImagePath),
        path: localImagePath,
        fsPath: localImagePath,
      })
    }
    const allFileAttachments = [...fileAttachments, ...localImageAttachments]
    const dedupedFileAttachments = allFileAttachments.filter((entry, index) =>
      allFileAttachments.findIndex((candidate) => candidate.fsPath === entry.fsPath) === index)
    const finalText = buildTextWithAttachments(text, dedupedFileAttachments)
    const input: Array<Record<string, unknown>> = [{ type: 'text', text: finalText }]
    for (const imageUrl of imageUrls) {
      const normalizedUrl = imageUrl.trim()
      if (!normalizedUrl) continue
      const localImagePath = extractLocalImagePathFromUrl(normalizedUrl)
      if (localImagePath) {
        input.push({
          type: 'localImage',
          path: localImagePath,
        })
        continue
      }
      input.push({
        type: 'image',
        url: normalizedUrl,
        image_url: normalizedUrl,
      })
    }
    if (skills) {
      for (const skill of skills) {
        input.push({ type: 'skill', name: skill.name, path: skill.path })
      }
    }
    const attachments = dedupedFileAttachments.map((f) => ({ label: f.label, path: f.path, fsPath: f.fsPath }))
    const params: Record<string, unknown> = {
      threadId,
      input,
    }
    if (attachments.length > 0) params.attachments = attachments
    if (normalizedModel) {
      params.model = normalizedModel
    }
    if (typeof effort === 'string' && effort.length > 0) {
      params.effort = effort
    }
    if (collaborationMode) {
      const collaborationModeSettings = await resolveCollaborationModeSettings(collaborationMode, normalizedModel, effort)
      params.collaborationMode = {
        mode: collaborationMode,
        settings: {
          model: collaborationModeSettings.model,
          reasoning_effort: collaborationModeSettings.reasoningEffort,
          developer_instructions: null,
        },
      }
    }
    const payload = await callRpc<{ turn?: Turn }>('turn/start', params)
    return typeof payload?.turn?.id === 'string' ? payload.turn.id.trim() : ''
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to start turn for thread ${threadId}`, 'turn/start')
  }
}

export async function interruptThreadTurn(threadId: string, turnId?: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTurnId = turnId?.trim() || ''
  if (!normalizedThreadId) return

  try {
    if (!normalizedTurnId) {
      throw new Error('turn/interrupt requires turnId')
    }
    await callRpc('turn/interrupt', { threadId: normalizedThreadId, turnId: normalizedTurnId })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to interrupt turn for thread ${normalizedThreadId}`, 'turn/interrupt')
  }
}