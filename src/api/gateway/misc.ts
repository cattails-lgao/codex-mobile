import {
  fetchRpcNotificationCatalog,
  fetchPendingServerRequests,
  respondServerRequest,
  subscribeRpcNotifications,
  type RpcNotification,
} from '../codexRpcClient'
import {
  asRecord,
  callRpc,
  getErrorMessageFromPayload,
  readBoolean,
  readNumber,
  readString,
} from './core'
import type {
  CollaborationModeKind,
  UiCreditsSnapshot,
  UiRateLimitSnapshot,
  UiRateLimitWindow,
} from '../../types/codex'

export type { RpcNotification }

export type ComposerPromptInfo = {
  name: string
  path: string
  content: string
  description: string
}

export type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: CollaborationModeKind
}

export type ThreadQueueState = Record<string, StoredQueuedMessage[]>

export type TelegramStatus = {
  configured: boolean
  active: boolean
  mappedChats: number
  mappedThreads: number
  allowedUsers: number
  allowAllUsers: boolean
  lastError: string
}

export type TelegramConfig = {
  botToken: string
  allowedUserIds: Array<number | '*'>
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

export function pickCodexRateLimitSnapshot(payload: unknown): UiRateLimitSnapshot | null {
  const record = asRecord(payload)
  if (!record) return null

  const rateLimitsByLimitId = asRecord(record.rateLimitsByLimitId ?? record.rate_limits_by_limit_id)
  const codexBucket = normalizeRateLimitSnapshot(rateLimitsByLimitId?.codex)
  if (codexBucket) return codexBucket

  return normalizeRateLimitSnapshot(record.rateLimits ?? record.rate_limits)
}

const BACKGROUND_THREAD_LIST_LIMIT = 100

export function getBackgroundThreadListLimit(): number {
  return BACKGROUND_THREAD_LIST_LIMIT
}

export async function getNotificationCatalog(): Promise<string[]> {
  return fetchRpcNotificationCatalog()
}

export function subscribeCodexNotifications(onNotification: (value: RpcNotification) => void): () => void {
  return subscribeRpcNotifications(onNotification)
}

export async function replyToServerRequest(
  id: number,
  payload: { result?: unknown; error?: { code?: number; message: string } },
): Promise<void> {
  await respondServerRequest({
    id,
    ...payload,
  })
}

export async function getPendingServerRequests(): Promise<unknown[]> {
  return fetchPendingServerRequests()
}

function normalizeStoredQueuedMessage(value: unknown): StoredQueuedMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null

  const imageUrls = Array.isArray(record.imageUrls)
    ? record.imageUrls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const skills = Array.isArray(record.skills)
    ? record.skills.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const itemRecord = item as Record<string, unknown>
      const name = typeof itemRecord.name === 'string' ? itemRecord.name.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      return name && path ? [{ name, path }] : []
    })
    : []
  const fileAttachments = Array.isArray(record.fileAttachments)
    ? record.fileAttachments.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const itemRecord = item as Record<string, unknown>
      const label = typeof itemRecord.label === 'string' ? itemRecord.label.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      const fsPath = typeof itemRecord.fsPath === 'string' ? itemRecord.fsPath.trim() : ''
      return label && path && fsPath ? [{ label, path, fsPath }] : []
    })
    : []

  return {
    id,
    text: typeof record.text === 'string' ? record.text : '',
    imageUrls,
    skills,
    fileAttachments,
    collaborationMode: record.collaborationMode === 'plan' ? 'plan' : 'default',
  }
}

function normalizeThreadQueueState(value: unknown): ThreadQueueState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const state: ThreadQueueState = {}
  for (const [threadId, rawMessages] of Object.entries(value as Record<string, unknown>)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Array.isArray(rawMessages)) continue
    const messages = rawMessages.flatMap((item) => {
      const message = normalizeStoredQueuedMessage(item)
      return message ? [message] : []
    })
    if (messages.length > 0) {
      state[normalizedThreadId] = messages
    }
  }
  return state
}

export async function getThreadQueueState(): Promise<ThreadQueueState> {
  const response = await fetch('/codex-api/thread-queue-state')
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error('Failed to load thread queue state')
  }
  const envelope =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  return normalizeThreadQueueState(envelope.data)
}

export async function setThreadQueueState(nextState: ThreadQueueState): Promise<void> {
  const response = await fetch('/codex-api/thread-queue-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeThreadQueueState(nextState)),
  })
  if (!response.ok) {
    throw new Error('Failed to save thread queue state')
  }
}

export type RealtimeVoices = {
  v1: string[]
  v2: string[]
  defaultV1: string
  defaultV2: string
}

export type RealtimeAudioChunk = {
  data: string
  sampleRate: number
  numChannels: number
  samplesPerChannel?: number
}

export type RealtimeTranscriptPart = {
  role: string
  text: string
}

export async function listRealtimeVoices(): Promise<RealtimeVoices> {
  const payload = await callRpc<{ voices: RealtimeVoices }>('thread/realtime/listVoices', {})
  return payload.voices
}

export async function startRealtimeSession(params: {
  threadId: string
  outputModality: 'text' | 'audio'
  includeStartupContext?: boolean
  voice?: string
}): Promise<void> {
  await callRpc<Record<string, never>>('thread/realtime/start', params)
}

export async function appendRealtimeAudio(params: {
  threadId: string
  audio: RealtimeAudioChunk
}): Promise<void> {
  await callRpc<Record<string, never>>('thread/realtime/appendAudio', params)
}

export async function stopRealtimeSession(threadId: string): Promise<void> {
  await callRpc<Record<string, never>>('thread/realtime/stop', { threadId })
}

export async function configureTelegramBot(
  botToken: string,
  allowedUserIds: Array<number | '*'>,
): Promise<void> {
  const response = await fetch('/codex-api/telegram/configure-bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      botToken,
      allowedUserIds,
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to connect Telegram bot')
    throw new Error(message)
  }
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const response = await fetch('/codex-api/telegram/config')
  const payload = await response.json()
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to load Telegram configuration')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  const rawAllowedUserIds = Array.isArray(data.allowedUserIds) ? data.allowedUserIds : []
  const allowedUserIds: Array<number | '*'> = []
  for (const value of rawAllowedUserIds) {
    if (value === '*') {
      allowedUserIds.push('*')
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      allowedUserIds.push(Math.trunc(value))
    }
  }
  return {
    botToken: typeof data.botToken === 'string' ? data.botToken : '',
    allowedUserIds,
  }
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const response = await fetch('/codex-api/telegram/status')
  const payload = await response.json()
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to load Telegram status')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  return {
    configured: data.configured === true,
    active: data.active === true,
    mappedChats: typeof data.mappedChats === 'number' ? data.mappedChats : 0,
    mappedThreads: typeof data.mappedThreads === 'number' ? data.mappedThreads : 0,
    allowedUsers: typeof data.allowedUsers === 'number' ? data.allowedUsers : 0,
    allowAllUsers: data.allowAllUsers === true,
    lastError: typeof data.lastError === 'string' ? data.lastError : '',
  }
}

export type ThreadTitleCache = { titles: Record<string, string>; order: string[] }
export type ThreadPinnedState = { threadIds: string[] }
export type FirstLaunchPluginsCardPreference = { dismissed: boolean }

export async function getThreadTitleCache(): Promise<ThreadTitleCache> {
  try {
    const response = await fetch('/codex-api/thread-titles')
    if (!response.ok) return { titles: {}, order: [] }
    const envelope = (await response.json()) as { data?: ThreadTitleCache }
    return envelope.data ?? { titles: {}, order: [] }
  } catch {
    return { titles: {}, order: [] }
  }
}

export async function persistThreadTitle(id: string, title: string): Promise<void> {
  try {
    await fetch('/codex-api/thread-titles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    })
  } catch {
    // Best-effort persist
  }
}

// round-23：跨浏览器共享的思考存档。app-server 不持久化 reasoning，前端把
// 存档镜像到桥接层（thread-reasoning），换浏览器/刷新后仍能从同一台服务端加载。
export async function getThreadReasoningArchive(): Promise<Record<string, unknown[]>> {
  try {
    const response = await fetch('/codex-api/thread-reasoning')
    if (!response.ok) return {}
    const envelope = (await response.json()) as { data?: Record<string, unknown[]> }
    return envelope.data ?? {}
  } catch {
    return {}
  }
}

export async function persistThreadReasoningArchive(threadId: string, messages: unknown[]): Promise<void> {
  try {
    await fetch('/codex-api/thread-reasoning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, messages }),
    })
  } catch {
    // Best-effort persist
  }
}

export type ThreadTurnDurationMap = Record<string, Record<string, number>>

// round-65：跨浏览器共享的轮耗时存档。app-server 不持久化 turn 完成耗时，
// 前端把每轮耗时镜像到桥接层（thread-turn-durations），刷新/换浏览器后仍能恢复。
export async function getThreadTurnDurationArchive(): Promise<ThreadTurnDurationMap> {
  try {
    const response = await fetch('/codex-api/thread-turn-durations')
    if (!response.ok) return {}
    const envelope = (await response.json()) as { data?: ThreadTurnDurationMap }
    return envelope.data ?? {}
  } catch {
    return {}
  }
}

export async function persistThreadTurnDuration(threadId: string, turnId: string, durationMs: number): Promise<void> {
  try {
    await fetch('/codex-api/thread-turn-durations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, turnId, durationMs }),
    })
  } catch {
    // Best-effort persist
  }
}

export async function getPinnedThreadState(): Promise<ThreadPinnedState> {
  try {
    const response = await fetch('/codex-api/thread-pins')
    if (!response.ok) return { threadIds: [] }
    const envelope = (await response.json()) as { data?: ThreadPinnedState }
    return envelope.data ?? { threadIds: [] }
  } catch {
    return { threadIds: [] }
  }
}

export async function persistPinnedThreadIds(threadIds: string[]): Promise<void> {
  try {
    await fetch('/codex-api/thread-pins', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadIds }),
    })
  } catch {
    // Best-effort persist
  }
}

export async function getFirstLaunchPluginsCardPreference(): Promise<FirstLaunchPluginsCardPreference> {
  try {
    const response = await fetch('/codex-api/preferences/first-launch-plugins-card')
    if (!response.ok) return { dismissed: false }
    const envelope = (await response.json()) as { data?: FirstLaunchPluginsCardPreference }
    return { dismissed: envelope.data?.dismissed === true }
  } catch {
    return { dismissed: false }
  }
}

export async function persistFirstLaunchPluginsCardPreference(dismissed: boolean): Promise<void> {
  try {
    await fetch('/codex-api/preferences/first-launch-plugins-card', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed }),
    })
  } catch {
    // Best-effort persist
  }
}

export async function generateThreadTitle(prompt: string, cwd: string | null): Promise<string> {
  try {
    const result = await callRpc<{ title?: string }>('generate-thread-title', { prompt, cwd })
    return result.title?.trim() ?? ''
  } catch {
    return ''
  }
}

export type SkillInfo = {
  name: string
  displayName?: string
  description: string
  path: string
  scope: string
  enabled: boolean
}

function normalizeSkillMarkdownPath(skillPath: string): string {
  if (!skillPath) return ''
  return skillPath.endsWith('/SKILL.md') ? skillPath : `${skillPath}/SKILL.md`
}

function deriveGroupedSkillRoot(
  skillPath: string,
  knownPaths: Set<string>,
): { rootPath: string; rootName: string; isNested: boolean } | null {
  const normalizedPath = normalizeSkillMarkdownPath(skillPath)
  const parts = normalizedPath.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const pluginSkillsIndex = parts.lastIndexOf('skills')
  if (pluginSkillsIndex >= 2) {
    const pluginName = parts[pluginSkillsIndex - 2] ?? ''
    if (pluginName) {
      const pluginRootPath = `/${[...parts.slice(0, pluginSkillsIndex + 1), pluginName, 'SKILL.md'].join('/')}`
      if (knownPaths.has(pluginRootPath)) {
        return { rootPath: pluginRootPath, rootName: pluginName, isNested: pluginRootPath !== normalizedPath }
      }
    }
  }

  const firstSkillsIndex = parts.indexOf('skills')
  if (firstSkillsIndex < 0 || firstSkillsIndex + 1 >= parts.length - 1) return null
  const rootName = parts[firstSkillsIndex + 1] ?? ''
  if (!rootName) return null
  const rootPath = `/${[...parts.slice(0, firstSkillsIndex + 2), 'SKILL.md'].join('/')}`
  if (!knownPaths.has(rootPath)) return { rootPath, rootName, isNested: rootPath !== normalizedPath }
  return { rootPath, rootName, isNested: rootPath !== normalizedPath }
}

type SkillsListResponseEntry = {
  cwd: string
  skills: Array<{
    name: string
    description: string
    shortDescription?: string
    path: string
    scope: string
    enabled: boolean
  }>
  errors: unknown[]
}

export async function getSkillsList(cwds?: string[]): Promise<SkillInfo[]> {
  try {
    const params: Record<string, unknown> = {}
    if (cwds && cwds.length > 0) params.cwds = cwds
    const payload = await callRpc<{ data: SkillsListResponseEntry[] }>('skills/list', params)
    const allSkills = payload.data.flatMap((entry) => entry.skills)
    const pathSet = new Set(allSkills.map((skill) => normalizeSkillMarkdownPath(skill.path)).filter(Boolean))
    const grouped = new Map<string, SkillInfo & { __hasRoot: boolean }>()
    for (const entry of payload.data) {
      for (const skill of entry.skills) {
        if (!skill.name) continue
        const groupInfo = deriveGroupedSkillRoot(skill.path, pathSet)
        const normalizedPath = normalizeSkillMarkdownPath(skill.path)
        const shouldCollapseIntoRoot = Boolean(groupInfo?.isNested && pathSet.has(groupInfo.rootPath))
        const key = shouldCollapseIntoRoot ? groupInfo!.rootPath : normalizedPath
        const isRoot = normalizedPath === key
        const existing = grouped.get(key)
        const candidate: SkillInfo & { __hasRoot: boolean } = {
          name: skill.name,
          displayName: groupInfo && key === groupInfo.rootPath ? groupInfo.rootName : undefined,
          description: skill.shortDescription || skill.description || '',
          path: key,
          scope: skill.scope,
          enabled: skill.enabled,
          __hasRoot: isRoot,
        }
        if (!existing) {
          grouped.set(key, candidate)
          continue
        }
        existing.enabled = existing.enabled || skill.enabled
        if (!existing.__hasRoot && isRoot) {
          grouped.set(key, candidate)
          continue
        }
        if (!existing.displayName && candidate.displayName) {
          existing.displayName = candidate.displayName
        }
        if (!existing.description && candidate.description) {
          existing.description = candidate.description
        }
      }
    }
    return Array.from(grouped.values()).map(({ __hasRoot: _ignored, ...skill }) => skill)
  } catch {
    return []
  }
}

export async function getComposerPrompts(): Promise<ComposerPromptInfo[]> {
  try {
    const response = await fetch('/codex-api/prompts')
    if (!response.ok) return []
    const payload = (await response.json()) as { data?: ComposerPromptInfo[] }
    return Array.isArray(payload.data) ? payload.data : []
  } catch {
    return []
  }
}

export async function createComposerPrompt(name: string, content: string): Promise<ComposerPromptInfo | null> {
  try {
    const response = await fetch('/codex-api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { data?: ComposerPromptInfo }
    return payload.data ?? null
  } catch {
    return null
  }
}

export async function removeComposerPrompt(path: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ path })
    const response = await fetch(`/codex-api/prompts?${params.toString()}`, {
      method: 'DELETE',
    })
    return response.ok
  } catch {
    return false
  }
}

const FILE_UPLOAD_TIMEOUT_MS = 60_000

export async function uploadFile(file: File): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FILE_UPLOAD_TIMEOUT_MS)
  try {
    const form = new FormData()
    form.append('file', file)
    const resp = await fetch('/codex-api/upload-file', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { path?: string }
    return data.path ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}