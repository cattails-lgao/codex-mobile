// useDesktopState「A 批」纯工具函数。绝不触碰 localStorage / window /
// 响应式 ref，只做纯计算、比较与合并；B 批持久化与主 useDesktopState()
// 从这里导入，避免闭包共享 ref 造成的循环依赖（见 domain-modularization-plan）。
import type {
  CommandExecutionData,
  UiFileChange,
  UiMessage,
  UiPlanData,
  UiPlanStep,
  UiThread,
  UiThreadTokenUsage,
  UiProjectGroup,
} from '../types/codex'
import { CodexApiError } from '../api/codexErrors'
import type { WorkspaceRootsState } from '../api/codexGateway'
import { isProjectlessChatPath, normalizePathForUi, toProjectName } from '../pathUtils.js'

export * from './useDesktopStateContext'

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined') {
      window.setTimeout(resolve, ms)
    } else {
      globalThis.setTimeout(resolve, ms)
    }
  })
}

export function flattenThreads(groups: UiProjectGroup[]): UiThread[] {
  return groups.flatMap((group) => group.threads)
}

export function findAdjacentThreadId(threads: UiThread[], threadId: string): string {
  const targetIndex = threads.findIndex((thread) => thread.id === threadId)
  if (targetIndex < 0) return ''
  return threads[targetIndex + 1]?.id ?? threads[targetIndex - 1]?.id ?? ''
}

export function isCodexCliMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes('Codex CLI is not available')
}

export function isThreadNotFoundError(error: unknown): boolean {
  if (error instanceof CodexApiError && error.status === 404) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /\b404\b|thread.*not found|conversation.*not found|no such thread|no rollout found for thread id/i.test(message)
}

function isThreadUpdatedAfterCutoff(updatedAtIso: string, cutoffIso: string): boolean {
  if (!updatedAtIso || !cutoffIso) return false
  const updatedAtMs = new Date(updatedAtIso).getTime()
  const cutoffMs = new Date(cutoffIso).getTime()
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(cutoffMs)) return false
  return updatedAtMs > cutoffMs
}

export function isThreadUnreadByLastRead(
  updatedAtIso: string,
  threadReadStateIso: string | undefined,
  unreadCutoffIso: string,
): boolean {
  const effectiveLastReadIso = threadReadStateIso ?? unreadCutoffIso
  return isThreadUpdatedAfterCutoff(updatedAtIso, effectiveLastReadIso)
}

export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue)
}

export function normalizeStoredTokenCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value))
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed))
    }
  }

  return null
}

export function normalizeTokenUsageBreakdown(value: unknown): UiThreadTokenUsage['last'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  return {
    totalTokens: normalizeStoredTokenCount(record.totalTokens) ?? 0,
    inputTokens: normalizeStoredTokenCount(record.inputTokens) ?? 0,
    cachedInputTokens: normalizeStoredTokenCount(record.cachedInputTokens) ?? 0,
    outputTokens: normalizeStoredTokenCount(record.outputTokens) ?? 0,
    reasoningOutputTokens: normalizeStoredTokenCount(record.reasoningOutputTokens) ?? 0,
  }
}

export function normalizeThreadTokenUsage(value: unknown): UiThreadTokenUsage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const total = normalizeTokenUsageBreakdown(record.total)
  const last = normalizeTokenUsageBreakdown(record.last)
  if (!total || !last) return null

  const modelContextWindow = normalizeStoredTokenCount(record.modelContextWindow)
  const currentContextTokens = last.totalTokens
  const remainingContextTokens = typeof modelContextWindow === 'number'
    ? Math.max(modelContextWindow - currentContextTokens, 0)
    : null
  const remainingContextPercent = typeof modelContextWindow === 'number' && modelContextWindow > 0
    ? clamp(Math.round((remainingContextTokens ?? 0) / modelContextWindow * 100), 0, 100)
    : null

  return {
    total,
    last,
    modelContextWindow,
    currentContextTokens,
    remainingContextTokens,
    remainingContextPercent,
  }
}

export function mergeProjectOrder(previousOrder: string[], incomingGroups: UiProjectGroup[]): string[] {
  const nextOrder: string[] = []

  for (const projectName of previousOrder) {
    if (!nextOrder.includes(projectName)) {
      nextOrder.push(projectName)
    }
  }

  for (const group of incomingGroups) {
    if (!nextOrder.includes(group.projectName)) {
      nextOrder.push(group.projectName)
    }
  }

  return areStringArraysEqual(previousOrder, nextOrder) ? previousOrder : nextOrder
}

export function orderGroupsByProjectOrder(incoming: UiProjectGroup[], projectOrder: string[]): UiProjectGroup[] {
  const incomingByName = new Map(incoming.map((group) => [group.projectName, group]))
  const ordered: UiProjectGroup[] = projectOrder
    .map((projectName) => incomingByName.get(projectName) ?? null)
    .filter((group): group is UiProjectGroup => group !== null)

  for (const group of incoming) {
    if (!projectOrder.includes(group.projectName)) {
      ordered.push(group)
    }
  }

  return ordered
}

export function areStringArraysEqual(first?: string[], second?: string[]): boolean {
  const left = Array.isArray(first) ? first : []
  const right = Array.isArray(second) ? second : []
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export function reorderStringArray(items: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return items
  }

  if (fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function areCommandExecutionsEqual(first?: CommandExecutionData, second?: CommandExecutionData): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return first.status === second.status && first.aggregatedOutput === second.aggregatedOutput && first.exitCode === second.exitCode
}

export function arePlanStepsEqual(first: UiPlanStep[] = [], second: UiPlanStep[] = []): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index]?.step !== second[index]?.step || first[index]?.status !== second[index]?.status) {
      return false
    }
  }
  return true
}

export function arePlanDataEqual(first?: UiPlanData, second?: UiPlanData): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return (
    first.explanation === second.explanation &&
    first.isStreaming === second.isStreaming &&
    arePlanStepsEqual(first.steps, second.steps)
  )
}

export function isUnsupportedChatGptModelError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('not supported when using codex with a chatgpt account') ||
    message.includes('model is not supported') ||
    message.includes('requires a newer version of codex')
  )
}

export function areMessageFieldsEqual(first: UiMessage, second: UiMessage): boolean {
  return (
    first.id === second.id &&
    first.role === second.role &&
    first.text === second.text &&
    areStringArraysEqual(first.images, second.images) &&
    areUiFileChangesEqual(first.fileChanges, second.fileChanges) &&
    first.fileChangeStatus === second.fileChangeStatus &&
    first.messageType === second.messageType &&
    first.rawPayload === second.rawPayload &&
    first.isUnhandled === second.isUnhandled &&
    areCommandExecutionsEqual(first.commandExecution, second.commandExecution) &&
    arePlanDataEqual(first.plan, second.plan) &&
    first.turnId === second.turnId &&
    first.turnIndex === second.turnIndex &&
    first.isAutomationRun === second.isAutomationRun &&
    first.automationDisplayName === second.automationDisplayName
  )
}

export function areMessageArraysEqual(first: UiMessage[], second: UiMessage[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

export function mergeMessages(
  previous: UiMessage[],
  incoming: UiMessage[],
  options: { preserveMissing?: boolean } = {},
): UiMessage[] {
  const previousById = new Map(previous.map((message) => [message.id, message]))
  const incomingById = new Map(incoming.map((message) => [message.id, message]))

  const mergedIncoming = incoming.map((incomingMessage) => {
    const previousMessage = previousById.get(incomingMessage.id)
    if (previousMessage && areMessageFieldsEqual(previousMessage, incomingMessage)) {
      return previousMessage
    }
    return incomingMessage
  })

  if (options.preserveMissing !== true) {
    return areMessageArraysEqual(previous, mergedIncoming) ? previous : mergedIncoming
  }

  const mergedFromPrevious = previous
    .map((previousMessage) => {
      const nextMessage = incomingById.get(previousMessage.id)
      if (!nextMessage) {
        return previousMessage
      }
      if (areMessageFieldsEqual(previousMessage, nextMessage)) {
        return previousMessage
      }
      return nextMessage
    })
    .filter((message) => !isOptimisticUserMessage(message) || !hasEquivalentUserMessage(message, incoming))

  const previousIdSet = new Set(previous.map((message) => message.id))
  const appended = mergedIncoming.filter((message) => !previousIdSet.has(message.id))
  const merged = [...mergedFromPrevious, ...appended]

  return areMessageArraysEqual(previous, merged) ? previous : merged
}

export function areUiFileChangesEqual(first?: UiFileChange[], second?: UiFileChange[]): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    const firstChange = first[index]
    const secondChange = second[index]
    if (
      firstChange.path !== secondChange.path ||
      firstChange.operation !== secondChange.operation ||
      firstChange.movedToPath !== secondChange.movedToPath ||
      firstChange.diff !== secondChange.diff ||
      firstChange.addedLineCount !== secondChange.addedLineCount ||
      firstChange.removedLineCount !== secondChange.removedLineCount
    ) {
      return false
    }
  }
  return true
}

export function normalizeMessageText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

export function isOptimisticUserMessage(message: UiMessage): boolean {
  return message.messageType === 'userMessage.optimistic'
}

export function hasOptimisticUserMessages(messages: UiMessage[]): boolean {
  return messages.some(isOptimisticUserMessage)
}

export function hasEquivalentUserMessage(target: UiMessage, messages: UiMessage[]): boolean {
  if (target.role !== 'user') return false
  const targetText = normalizeMessageText(target.text)
  const targetImages = Array.isArray(target.images) ? target.images : []
  const targetFileCount = Array.isArray(target.fileAttachments) ? target.fileAttachments.length : 0
  const targetSkillCount = Array.isArray(target.skills) ? target.skills.length : 0

  return messages.some((message) => {
    if (message === target || message.role !== 'user' || isOptimisticUserMessage(message)) return false
    const messageText = normalizeMessageText(message.text)
    const messageImages = Array.isArray(message.images) ? message.images : []
    const messageFileCount = Array.isArray(message.fileAttachments) ? message.fileAttachments.length : 0
    const messageSkillCount = Array.isArray(message.skills) ? message.skills.length : 0
    return (
      messageText === targetText &&
      areStringArraysEqual(messageImages, targetImages) &&
      messageFileCount === targetFileCount &&
      messageSkillCount === targetSkillCount
    )
  })
}

// round-52：最终汇合后、按 turn（以 user 消息为界）对 assistant agentMessage
// 做文本级去重——同 turn 内规范化文本相等的助手消息只保留最后一条。与
// buildTurnRenderGroups 的 turn 分组语义一致，避免误删跨 turn 的相同助手文本；
// 与 upsertLiveAgentMessage / removeRedundantLiveAgentMessages 同用
// normalizeMessageText，去重语义统一。只作用 agentMessage（含 .live），不动
// plan / command / file-change / reasoning。
export function dedupeAssistantAgentMessageText(messages: UiMessage[]): UiMessage[] {
  const result: UiMessage[] = []
  let turnAssistantTexts = new Map<string, number>()
  for (const message of messages) {
    const isAssistantAgentMessage =
      message.role === 'assistant' && typeof message.messageType === 'string'
      && (message.messageType === 'agentMessage' || message.messageType === 'agentMessage.live')
    if (!isAssistantAgentMessage) {
      if (message.role === 'user') {
        turnAssistantTexts = new Map()
      }
      result.push(message)
      continue
    }
    const normalized = normalizeMessageText(message.text)
    if (normalized.length === 0) {
      result.push(message)
      continue
    }
    const duplicateIndex = turnAssistantTexts.get(normalized)
    if (typeof duplicateIndex === 'number') {
      // 同 turn 已有同文本助手消息 → 移除旧的那条，保留最新
      result.splice(duplicateIndex, 1)
      for (const [key, index] of turnAssistantTexts) {
        if (index > duplicateIndex) turnAssistantTexts.set(key, index - 1)
      }
      turnAssistantTexts.set(normalized, result.length)
      result.push(message)
    } else {
      turnAssistantTexts.set(normalized, result.length)
      result.push(message)
    }
  }
  return result
}

export function removeRedundantLiveAgentMessages(previous: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const incomingMessageIds = new Set(incoming.map((message) => message.id))
  const incomingAssistantTexts = new Set(
    incoming
      .filter((message) => message.role === 'assistant')
      .map((message) => normalizeMessageText(message.text))
      .filter((text) => text.length > 0),
  )

  if (incomingAssistantTexts.size === 0) {
    return previous
  }

  const next = previous.filter((message) => {
    if (message.messageType !== 'agentMessage.live') return true
    if (incomingMessageIds.has(message.id)) return false
    const normalized = normalizeMessageText(message.text)
    if (normalized.length === 0) return false
    return !incomingAssistantTexts.has(normalized)
  })

  return next.length === previous.length ? previous : next
}

export function removePersistedLiveMessages(previous: UiMessage[], incoming: UiMessage[]): UiMessage[] {
  const incomingIds = new Set(incoming.map((message) => message.id))
  const next = previous.filter((message) => !incomingIds.has(message.id))
  return next.length === previous.length ? previous : next
}

export function upsertMessage(previous: UiMessage[], nextMessage: UiMessage): UiMessage[] {
  const existingIndex = previous.findIndex((message) => message.id === nextMessage.id)
  if (existingIndex < 0) {
    return [...previous, nextMessage]
  }

  const existing = previous[existingIndex]
  if (areMessageFieldsEqual(existing, nextMessage)) {
    return previous
  }

  const next = [...previous]
  next.splice(existingIndex, 1, nextMessage)
  return next
}

export type TurnSummaryState = {
  turnId: string
  durationMs: number
}

export type TurnActivityState = {
  label: string
  details: string[]
}

export type TurnErrorState = {
  message: string
  transient: boolean
}

// 中断后服务端整体移除未提交 turn 时，回填输入框的用户消息载荷
// （结构与 ThreadComposer 的 ComposerDraftPayload 一致）
export type InterruptRecoverPayload = {
  text: string
  imageUrls: string[]
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  skills: Array<{ name: string; path: string }>
}

export type TurnStartedInfo = {
  threadId: string
  turnId: string
  startedAtMs: number
}

export type TurnCompletedInfo = {
  threadId: string
  turnId: string
  completedAtMs: number
  startedAtMs?: number
}

export const WORKED_MESSAGE_TYPE = 'worked'

export function parseIsoTimestamp(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function formatTurnDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '<1s'
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`)
  }

  const displaySeconds = seconds > 0 || parts.length === 0 ? seconds : 0
  parts.push(`${displaySeconds}s`)
  return parts.join(' ')
}

export function areTurnSummariesEqual(first?: TurnSummaryState, second?: TurnSummaryState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  return first.turnId === second.turnId && first.durationMs === second.durationMs
}

export function areTurnActivitiesEqual(first?: TurnActivityState, second?: TurnActivityState): boolean {
  if (!first && !second) return true
  if (!first || !second) return false
  if (first.label !== second.label) return false
  if (first.details.length !== second.details.length) return false
  for (let index = 0; index < first.details.length; index += 1) {
    if (first.details[index] !== second.details[index]) return false
  }
  return true
}

export function buildTurnSummaryMessage(summary: TurnSummaryState): UiMessage {
  return {
    id: `turn-summary:${summary.turnId}`,
    role: 'system',
    text: `Worked for ${formatTurnDuration(summary.durationMs)}`,
    messageType: WORKED_MESSAGE_TYPE,
    turnId: summary.turnId,
    durationMs: summary.durationMs,
  }
}

export function findLastAssistantMessageIndex(messages: UiMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return index
    }
  }
  return -1
}

export function insertTurnSummaryMessage(messages: UiMessage[], summary: TurnSummaryState): UiMessage[] {
  const summaryMessage = buildTurnSummaryMessage(summary)
  const sanitizedMessages = messages.filter((message) => message.messageType !== WORKED_MESSAGE_TYPE)
  const insertIndex = findLastAssistantMessageIndex(sanitizedMessages)
  if (insertIndex < 0) {
    return [...sanitizedMessages, summaryMessage]
  }
  const next = [...sanitizedMessages]
  next.splice(insertIndex, 0, summaryMessage)
  return next
}

/**
 * round-65：把服务端/本地持久化的各轮耗时（threadId 已限定）合入消息流。
 * 仅当该 turn 尚无 worked 消息时才补一条（live turn 摘要已插入时跳过，避免重复）。
 * 返回的消息只用于按 turnId 聚合耗时（sumTurnDurations），不会作为过程行渲染。
 */
export function insertPersistedTurnDurations(
  messages: UiMessage[],
  turnDurations: Record<string, number> | undefined,
): UiMessage[] {
  if (!turnDurations) return messages
  const existingTurnIds = new Set<string>()
  for (const message of messages) {
    if (message.messageType === WORKED_MESSAGE_TYPE && message.turnId) {
      existingTurnIds.add(message.turnId)
    }
  }
  const extra: UiMessage[] = []
  for (const [turnId, durationMs] of Object.entries(turnDurations)) {
    if (!turnId || existingTurnIds.has(turnId)) continue
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) continue
    extra.push(buildTurnSummaryMessage({ turnId, durationMs: Math.round(durationMs) }))
    existingTurnIds.add(turnId)
  }
  if (extra.length === 0) return messages
  return [...messages, ...extra]
}

export function omitKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export function omitKeys<TValue>(record: Record<string, TValue>, keys: Set<string>): Record<string, TValue> {
  if (keys.size === 0) return record
  let changed = false
  const next: Record<string, TValue> = {}
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key)) {
      changed = true
      continue
    }
    next[key] = value
  }
  return changed ? next : record
}

export function areThreadFieldsEqual(first: UiThread, second: UiThread): boolean {
  return (
    first.id === second.id &&
    first.title === second.title &&
    first.projectName === second.projectName &&
    first.cwd === second.cwd &&
    first.createdAtIso === second.createdAtIso &&
    first.updatedAtIso === second.updatedAtIso &&
    first.preview === second.preview &&
    first.unread === second.unread &&
    first.inProgress === second.inProgress &&
    first.pendingRequestState === second.pendingRequestState
  )
}

export function areThreadArraysEqual(first: UiThread[], second: UiThread[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

export function areGroupArraysEqual(first: UiProjectGroup[], second: UiProjectGroup[]): boolean {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false
  }
  return true
}

export function pruneThreadStateMap<T>(stateMap: Record<string, T>, threadIds: Set<string>): Record<string, T> {
  const nextEntries = Object.entries(stateMap).filter(([threadId]) => threadIds.has(threadId))
  if (nextEntries.length === Object.keys(stateMap).length) {
    return stateMap
  }
  return Object.fromEntries(nextEntries) as Record<string, T>
}

export function removeThreadFromGroups(groups: UiProjectGroup[], threadId: string): UiProjectGroup[] {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) return groups

  let changed = false
  const nextGroups: UiProjectGroup[] = []

  for (const group of groups) {
    const nextThreads = group.threads.filter((thread) => thread.id !== normalizedThreadId)
    const removedFromGroup = nextThreads.length !== group.threads.length
    if (removedFromGroup) {
      changed = true
    }
    if (nextThreads.length > 0) {
      nextGroups.push(removedFromGroup ? { ...group, threads: nextThreads } : group)
    } else if (group.threads.length === 0) {
      nextGroups.push(group)
    }
  }

  return changed ? nextGroups : groups
}

export function mergeThreadGroups(
  previous: UiProjectGroup[],
  incoming: UiProjectGroup[],
): UiProjectGroup[] {
  const previousGroupsByName = new Map(previous.map((group) => [group.projectName, group]))
  const mergedGroups: UiProjectGroup[] = incoming.map((incomingGroup) => {
    const previousGroup = previousGroupsByName.get(incomingGroup.projectName)
    const previousThreadsById = new Map(previousGroup?.threads.map((thread) => [thread.id, thread]) ?? [])

    const mergedThreads = incomingGroup.threads.map((incomingThread) => {
      const previousThread = previousThreadsById.get(incomingThread.id)
      if (previousThread && areThreadFieldsEqual(previousThread, incomingThread)) {
        return previousThread
      }
      return incomingThread
    })

    if (
      previousGroup &&
      previousGroup.projectName === incomingGroup.projectName &&
      areThreadArraysEqual(previousGroup.threads, mergedThreads)
    ) {
      return previousGroup
    }

    return {
      projectName: incomingGroup.projectName,
      threads: mergedThreads,
    }
  })

  return areGroupArraysEqual(previous, mergedGroups) ? previous : mergedGroups
}

export function mergeIncomingWithLocalInProgressThreads(
  previous: UiProjectGroup[],
  incoming: UiProjectGroup[],
  inProgressById: Record<string, boolean>,
): UiProjectGroup[] {
  const incomingThreadIds = new Set(flattenThreads(incoming).map((thread) => thread.id))
  const localInProgressThreads = flattenThreads(previous).filter(
    (thread) => inProgressById[thread.id] === true && !incomingThreadIds.has(thread.id),
  )

  if (localInProgressThreads.length === 0) {
    return incoming
  }

  const incomingByProjectName = new Map(incoming.map((group) => [group.projectName, group]))
  const merged: UiProjectGroup[] = incoming.map((group) => ({
    projectName: group.projectName,
    threads: [...group.threads],
  }))

  for (const thread of localInProgressThreads) {
    const existingGroup = incomingByProjectName.get(thread.projectName)
    if (existingGroup) {
      const mergedGroupIndex = merged.findIndex((group) => group.projectName === thread.projectName)
      if (mergedGroupIndex >= 0) {
        merged[mergedGroupIndex] = {
          projectName: merged[mergedGroupIndex].projectName,
          threads: [thread, ...merged[mergedGroupIndex].threads],
        }
      }
      continue
    }

    merged.push({
      projectName: thread.projectName,
      threads: [thread],
    })
  }

  return merged
}

export function toProjectNameFromWorkspaceRoot(value: string): string {
  return toProjectName(value)
}

export function getRemoteProjectHostLabel(hostId: string): string {
  const normalized = hostId.trim()
  if (!normalized) return ''
  const separatorIndex = normalized.lastIndexOf(':')
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized
}

export function getRemoteProjectDisplayName(remoteProject: NonNullable<WorkspaceRootsState['remoteProjects']>[number]): string {
  const label = remoteProject.label || toProjectName(remoteProject.remotePath) || remoteProject.id
  const hostLabel = getRemoteProjectHostLabel(remoteProject.hostId)
  return hostLabel ? `${label} ${hostLabel}` : label
}

export function getRemoteProjectById(rootsState: WorkspaceRootsState | null): Map<string, NonNullable<WorkspaceRootsState['remoteProjects']>[number]> {
  const remoteProjects = rootsState?.remoteProjects ?? []
  return new Map(remoteProjects.map((project) => [project.id, project]))
}

export function getWorkspaceProjectOrderPaths(rootsState: WorkspaceRootsState | null): string[] {
  if (!rootsState) return []
  const savedRoots = new Set(rootsState.order)
  const remoteProjectIds = new Set((rootsState.remoteProjects ?? []).map((project) => project.id))
  const orderedRoots = rootsState.projectOrder.filter((item) => savedRoots.has(item) || remoteProjectIds.has(item))
  for (const rootPath of rootsState.order) {
    if (!orderedRoots.includes(rootPath)) orderedRoots.push(rootPath)
  }
  for (const remoteProjectId of remoteProjectIds) {
    if (!orderedRoots.includes(remoteProjectId)) orderedRoots.push(remoteProjectId)
  }
  return orderedRoots
}

export function getWorkspaceProjectOrderNames(
  rootsState: WorkspaceRootsState | null,
  duplicateLeafNames: Set<string>,
): string[] {
  const remoteProjectsById = getRemoteProjectById(rootsState)
  return getWorkspaceProjectOrderPaths(rootsState).map((rootPath) => {
    if (remoteProjectsById.has(rootPath)) return rootPath
    const normalizedRootPath = normalizePathForUi(rootPath).trim()
    const leafName = toProjectNameFromWorkspaceRoot(normalizedRootPath)
    return duplicateLeafNames.has(leafName) ? normalizedRootPath : leafName
  })
}

export function matchesWorkspaceRootProject(rootPath: string, projectName: string): boolean {
  const normalizedRootPath = normalizePathForUi(rootPath).trim()
  return normalizedRootPath === projectName || toProjectNameFromWorkspaceRoot(rootPath) === projectName
}

export function collectWorkspaceRootPathsForProjectRemoval(
  rootsState: WorkspaceRootsState,
  projectName: string,
): Set<string> {
  const removedRootPaths = new Set<string>()
  for (const rootPath of rootsState.order) {
    if (matchesWorkspaceRootProject(rootPath, projectName)) {
      removedRootPaths.add(rootPath)
    }
  }
  for (const rootPath of rootsState.active) {
    if (matchesWorkspaceRootProject(rootPath, projectName)) {
      removedRootPaths.add(rootPath)
    }
  }
  for (const rootPath of Object.keys(rootsState.labels)) {
    if (matchesWorkspaceRootProject(rootPath, projectName)) {
      removedRootPaths.add(rootPath)
    }
  }
  return removedRootPaths
}

export function buildWorkspaceRootsProjectOrderState(
  rootsState: WorkspaceRootsState,
  orderedProjectNames: string[],
  groups: UiProjectGroup[],
): Pick<WorkspaceRootsState, 'order' | 'active' | 'projectOrder'> {
  const remoteProjectIds = new Set((rootsState.remoteProjects ?? []).map((project) => project.id))
  const rootByProjectName = new Map<string, string>()
  for (const rootPath of rootsState.order) {
    const projectName = toProjectNameFromWorkspaceRoot(rootPath)
    if (!rootByProjectName.has(projectName)) {
      rootByProjectName.set(projectName, rootPath)
    }
  }
  for (const group of groups) {
    const cwd = group.threads[0]?.cwd?.trim() ?? ''
    if (!cwd) continue
    rootByProjectName.set(group.projectName, cwd)
  }

  const nextProjectOrder: string[] = []
  const pushProjectOrderItem = (item: string): void => {
    if (item && !nextProjectOrder.includes(item)) {
      nextProjectOrder.push(item)
    }
  }

  for (const projectName of orderedProjectNames) {
    if (remoteProjectIds.has(projectName)) {
      pushProjectOrderItem(projectName)
      continue
    }
    const rootPath = rootByProjectName.get(projectName)
    if (rootPath) {
      pushProjectOrderItem(rootPath)
    }
  }
  for (const item of getWorkspaceProjectOrderPaths(rootsState)) {
    pushProjectOrderItem(item)
  }

  const nextOrder = nextProjectOrder.filter((item) => rootsState.order.includes(item))
  for (const rootPath of rootsState.order) {
    if (!nextOrder.includes(rootPath)) {
      nextOrder.push(rootPath)
    }
  }

  const nextActive = rootsState.active.filter((rootPath) => nextOrder.includes(rootPath))
  if (nextActive.length === 0 && nextOrder.length > 0) {
    nextActive.push(nextOrder[0])
  }

  return {
    order: nextOrder,
    active: nextActive,
    projectOrder: nextProjectOrder,
  }
}

export function orderGroupsByWorkspaceProjectOrder(
  groups: UiProjectGroup[],
  rootsState: WorkspaceRootsState | null,
  duplicateLeafNames: Set<string>,
): UiProjectGroup[] {
  const order = getWorkspaceProjectOrderNames(rootsState, duplicateLeafNames)
  if (order.length === 0) return groups
  const orderIndexByName = new Map(order.map((name, index) => [name, index]))
  return [...groups].sort((first, second) => {
    if (isProjectlessGroup(first) || isProjectlessGroup(second)) return 0
    const firstIndex = orderIndexByName.get(first.projectName) ?? Number.POSITIVE_INFINITY
    const secondIndex = orderIndexByName.get(second.projectName) ?? Number.POSITIVE_INFINITY
    if (firstIndex === secondIndex) return 0
    return firstIndex - secondIndex
  })
}

export function collectDuplicateProjectLeafNames(groups: UiProjectGroup[], rootsState: WorkspaceRootsState | null): Set<string> {
  const rootByLeafName = new Map<string, Set<string>>()
  const canonicalWorkspaceRootCountsByLeafName = new Map<string, number>()
  const addPath = (value: string): void => {
    const normalizedPath = normalizePathForUi(value).trim()
    if (!normalizedPath) return
    const leafName = toProjectName(normalizedPath)
    const existing = rootByLeafName.get(leafName) ?? new Set<string>()
    existing.add(normalizedPath)
    rootByLeafName.set(leafName, existing)
  }

  for (const rootPath of rootsState?.order ?? []) {
    const normalizedRootPath = normalizePathForUi(rootPath).trim()
    if (!normalizedRootPath) continue
    const leafName = toProjectName(normalizedRootPath)
    if (!isManagedCodexWorktreePath(normalizedRootPath)) {
      canonicalWorkspaceRootCountsByLeafName.set(leafName, (canonicalWorkspaceRootCountsByLeafName.get(leafName) ?? 0) + 1)
    }
    addPath(rootPath)
  }
  for (const group of groups) {
    for (const thread of group.threads) {
      const normalizedCwd = normalizePathForUi(thread.cwd).trim()
      const leafName = toProjectName(normalizedCwd)
      const isRegisteredRoot = rootsState?.order.some((rootPath) => normalizePathForUi(rootPath).trim() === normalizedCwd) === true
      if (isManagedCodexWorktreePath(normalizedCwd) && !isRegisteredRoot && canonicalWorkspaceRootCountsByLeafName.get(leafName) === 1) continue
      addPath(thread.cwd)
    }
  }

  const duplicateLeafNames = new Set<string>()
  for (const [leafName, paths] of rootByLeafName.entries()) {
    if (paths.size > 1) duplicateLeafNames.add(leafName)
  }
  return duplicateLeafNames
}

export function isManagedCodexWorktreePath(value: string): boolean {
  return value.includes('/.codex/worktrees/')
}

export function disambiguateProjectGroupsByCwd(
  groups: UiProjectGroup[],
  rootsState: WorkspaceRootsState | null,
): UiProjectGroup[] {
  const duplicateLeafNames = collectDuplicateProjectLeafNames(groups, rootsState)
  if (duplicateLeafNames.size === 0) return groups

  const uniqueCanonicalWorkspaceRootLeafNames = new Set<string>()
  const duplicateCanonicalWorkspaceRootLeafNames = new Set<string>()
  const canonicalWorkspaceRootByLeafName = new Map<string, string>()
  const registeredWorkspaceRoots = new Set<string>()
  for (const rootPath of rootsState?.order ?? []) {
    const normalizedRootPath = normalizePathForUi(rootPath).trim()
    if (!normalizedRootPath) continue
    registeredWorkspaceRoots.add(normalizedRootPath)
    if (isManagedCodexWorktreePath(normalizedRootPath)) continue
    const leafName = toProjectName(normalizedRootPath)
    if (uniqueCanonicalWorkspaceRootLeafNames.has(leafName)) {
      uniqueCanonicalWorkspaceRootLeafNames.delete(leafName)
      duplicateCanonicalWorkspaceRootLeafNames.add(leafName)
      canonicalWorkspaceRootByLeafName.delete(leafName)
    } else if (!duplicateCanonicalWorkspaceRootLeafNames.has(leafName)) {
      uniqueCanonicalWorkspaceRootLeafNames.add(leafName)
      canonicalWorkspaceRootByLeafName.set(leafName, normalizedRootPath)
    }
  }

  const disambiguatedGroups: UiProjectGroup[] = []
  const groupsByProjectName = new Map<string, UiProjectGroup>()
  for (const group of groups) {
    for (const thread of group.threads) {
      const normalizedCwd = normalizePathForUi(thread.cwd).trim()
      const leafName = toProjectName(normalizedCwd)
      const isRegisteredRoot = registeredWorkspaceRoots.has(normalizedCwd)
      const isCanonicalWorktreeThread = isManagedCodexWorktreePath(normalizedCwd)
        && !isRegisteredRoot
        && uniqueCanonicalWorkspaceRootLeafNames.has(leafName)
      let projectName = group.projectName
      if (isCanonicalWorktreeThread && duplicateLeafNames.has(leafName)) {
        projectName = canonicalWorkspaceRootByLeafName.get(leafName) ?? group.projectName
      } else if (normalizedCwd && duplicateLeafNames.has(leafName)) {
        projectName = normalizedCwd
      }
      const nextThread = thread.projectName === projectName ? thread : { ...thread, projectName }
      const existingGroup = groupsByProjectName.get(projectName)
      if (existingGroup) {
        existingGroup.threads.push(nextThread)
      } else {
        const nextGroup = { projectName, threads: [nextThread] }
        groupsByProjectName.set(projectName, nextGroup)
        disambiguatedGroups.push(nextGroup)
      }
    }
  }

  return disambiguatedGroups
}

export function addWorkspaceRootPlaceholderGroups(
  groups: UiProjectGroup[],
  rootsState: WorkspaceRootsState | null,
  duplicateLeafNames: Set<string>,
): UiProjectGroup[] {
  if (!rootsState || (rootsState.order.length === 0 && (rootsState.remoteProjects ?? []).length === 0)) return groups
  const existingProjectNames = new Set(groups.map((group) => group.projectName))
  const nextGroups = [...groups]
  const remoteProjectsById = getRemoteProjectById(rootsState)

  for (const rootPath of getWorkspaceProjectOrderPaths(rootsState)) {
    if (remoteProjectsById.has(rootPath)) {
      if (existingProjectNames.has(rootPath)) continue
      nextGroups.push({ projectName: rootPath, threads: [] })
      existingProjectNames.add(rootPath)
      continue
    }
    const normalizedRootPath = normalizePathForUi(rootPath).trim()
    if (!normalizedRootPath) continue
    const leafName = toProjectNameFromWorkspaceRoot(normalizedRootPath)
    const projectName = duplicateLeafNames.has(leafName) ? normalizedRootPath : leafName
    if (existingProjectNames.has(projectName)) continue
    nextGroups.push({ projectName, threads: [] })
    existingProjectNames.add(projectName)
  }

  return nextGroups
}

// round-23：线程名控制在 20 字以内（新线程占位名/兜底名统一收口）
export const OPTIMISTIC_THREAD_TITLE_MAX = 20

export function toOptimisticThreadTitle(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return 'Untitled thread'
  return firstLine.slice(0, OPTIMISTIC_THREAD_TITLE_MAX)
}

export function toForkedThreadTitle(title: string): string {
  const normalizedTitle = title.trim() || 'Untitled thread'
  return /^fork:\s+/iu.test(normalizedTitle) ? normalizedTitle : `Fork: ${normalizedTitle}`
}

export function isProjectlessGroup(group: UiProjectGroup): boolean {
  return group.threads.some((thread) => thread.cwd.trim().length === 0 || isProjectlessChatPath(thread.cwd))
}

export function filterGroupsByWorkspaceRoots(
  groups: UiProjectGroup[],
  rootsState: WorkspaceRootsState | null,
): UiProjectGroup[] {
  const duplicateLeafNames = collectDuplicateProjectLeafNames(groups, rootsState)
  const disambiguatedGroups = disambiguateProjectGroupsByCwd(groups, rootsState)
  const groupsWithWorkspaceRoots = addWorkspaceRootPlaceholderGroups(disambiguatedGroups, rootsState, duplicateLeafNames)
  if (!rootsState || (rootsState.order.length === 0 && (rootsState.remoteProjects ?? []).length === 0)) return groupsWithWorkspaceRoots
  const allowedProjectNames = new Set<string>()
  for (const projectName of getWorkspaceProjectOrderNames(rootsState, duplicateLeafNames)) {
    allowedProjectNames.add(projectName)
  }
  const filteredGroups = groupsWithWorkspaceRoots.filter((group) => allowedProjectNames.has(group.projectName) || isProjectlessGroup(group))
  return orderGroupsByWorkspaceProjectOrder(filteredGroups, rootsState, duplicateLeafNames)
}

// Live 消息按到达顺序交错展示：messages computed 若把 livePlan/liveCommands/
// liveFileChanges/liveAgent 四组数组按组拼接，会出现“命令一堆、文本一堆、
// 思考一堆”的扎堆观感。这里用单调递增 sortKey 记录每条 live 消息首次出现的
// 顺序（通知本身按真实时间序到达），合并时整体按 sortKey 排序还原交错。
const liveMessageSortKeyByComposite = new Map<string, number>()
let liveMessageSortCounter = 0

export function sortKeyForLiveMessage(threadId: string, message: UiMessage): number {
  const composite = `${threadId}:${message.id}`
  const existing = liveMessageSortKeyByComposite.get(composite)
  if (existing !== undefined) return existing
  liveMessageSortCounter += 1
  liveMessageSortKeyByComposite.set(composite, liveMessageSortCounter)
  return liveMessageSortCounter
}

export function pruneLiveMessageSortKeys(threadId: string): void {
  const prefix = `${threadId}:`
  for (const composite of [...liveMessageSortKeyByComposite.keys()]) {
    if (composite.startsWith(prefix)) liveMessageSortKeyByComposite.delete(composite)
  }
}

export function clearLiveMessageSortKeys(): void {
  liveMessageSortKeyByComposite.clear()
}

// 复位 live 排序状态（含递增计数器），用于整体状态重置。
export function resetLiveMessageSortKeys(): void {
  liveMessageSortKeyByComposite.clear()
  liveMessageSortCounter = 0
}

// 仅清理已不在活跃线程中的 live sortKey，保持交错排序在状态裁剪后稳定。
export function pruneLiveMessageSortKeysByActiveThreads(activeThreadIds: Set<string>): void {
  if (liveMessageSortKeyByComposite.size === 0) return
  for (const composite of [...liveMessageSortKeyByComposite.keys()]) {
    const separatorIndex = composite.indexOf(':')
    const threadId = separatorIndex > 0 ? composite.slice(0, separatorIndex) : ''
    if (!activeThreadIds.has(threadId)) liveMessageSortKeyByComposite.delete(composite)
  }
}

// 锚点 id 匹配：live 阶段 item/started 的 commandExecution item id 是
// `call_*`，app-server 持久化到线程历史时会给会话内命令加 `session-cmd-` 前缀
// （如 `session-cmd-call_*`）。思考存档记录的是 live id，刷新后按持久化 id
// 找不到锚点会回退到「轮首」——表现为全部思考堆到每轮开头。这里兼容前缀与
// 反前缀两种形态。
export function findReasoningAnchorIndex(messages: UiMessage[], anchorId: string): number {
  const anchor = anchorId.trim()
  if (!anchor) return -1
  const exact = messages.findIndex((message) => message.id === anchor)
  if (exact >= 0) return exact
  const prefixed = `session-cmd-${anchor}`
  const prefixedIndex = messages.findIndex((message) => message.id === prefixed)
  if (prefixedIndex >= 0) return prefixedIndex
  const PREFIX = 'session-cmd-'
  if (anchor.startsWith(PREFIX)) {
    const strippedIndex = messages.findIndex((message) => message.id === anchor.slice(PREFIX.length))
    if (strippedIndex >= 0) return strippedIndex
  }
  return -1
}

// 把本地存档的思考（persistedReasoning）按轮次插回消息流：插入到该轮用户
// 消息之后，形成“提问 -> 思考 -> 回复”的阅读顺序；旧存档没有 turnIndex 时
// 回退到消息流末尾（与历史行为一致）。同一轮多条思考按存档顺序排列。
// round-23：带 reasoningAnchorMessageId 的思考项插到对应工具/命令消息之后
// （按真实出现时序与工具交错，而不是全部堆在轮次开头）。
export function mergePersistedReasoning(persisted: UiMessage[], reasoningMessages: UiMessage[]): UiMessage[] {
  if (reasoningMessages.length === 0) return persisted
  const result = [...persisted]
  const unattached: UiMessage[] = []
  // round-27：按轮收集「无锚点思考」及其顺序（仅用于锚点缺失时的兜底分摊，
  // 见下方 turnIndex 分支）。
  // round-29：锚点「存在但匹配失败」的思考也一并收集——app-server 从会话
  // jsonl 恢复线程历史时会改写消息 id（命令 fc_*→session-cmd-call_*、agent
  // msg_*→item-N），live 存档的锚点刷新后全部失效；若不给它们分摊，就会
  // 全部堆到用户消息之后（「思考块堆在模型回答开头」的一堵墙）。
  const anchorlessByTurn = new Map<number, UiMessage[]>()
  for (const reasoningMessage of reasoningMessages) {
    const anchorId = reasoningMessage.reasoningAnchorMessageId?.trim() ?? ''
    if (anchorId && findReasoningAnchorIndex(result, anchorId) >= 0) continue
    const turnIndex = reasoningMessage.turnIndex
    if (typeof turnIndex !== 'number' || !Number.isFinite(turnIndex)) continue
    const list = anchorlessByTurn.get(turnIndex) ?? []
    list.push(reasoningMessage)
    anchorlessByTurn.set(turnIndex, list)
  }
  // 逆序插入，保证同一轮内多条思考按时间正序排列。
  for (const reasoningMessage of [...reasoningMessages].reverse()) {
    const anchorId = reasoningMessage.reasoningAnchorMessageId?.trim() ?? ''
    if (anchorId) {
      const anchorIndex = findReasoningAnchorIndex(result, anchorId)
      if (anchorIndex >= 0) {
        result.splice(anchorIndex + 1, 0, reasoningMessage)
        continue
      }
    }
    const turnIndex = reasoningMessage.turnIndex
    if (typeof turnIndex !== 'number' || !Number.isFinite(turnIndex)) {
      unattached.push(reasoningMessage)
      continue
    }
    let lastUserIndex = -1
    let lastTurnMessageIndex = -1
    // 轮内非思考消息索引（不含用户消息）：用于无锚点思考的顺序分摊
    const otherIndices: number[] = []
    for (let index = 0; index < result.length; index += 1) {
      if (result[index].turnIndex !== turnIndex) continue
      lastTurnMessageIndex = index
      if (result[index].role === 'user') {
        lastUserIndex = index
      } else if (result[index].messageType !== 'reasoning') {
        otherIndices.push(index)
      }
    }
    // 只有该轮含工作项（命令/工具等）时才分摊：纯问答轮（提问 -> 思考 -> 回复）
    // 保持思考插在用户消息之后；含工作项的轮把无锚点思考按顺序与工具交错。
    const hasWorkItems = otherIndices.some((index) => {
      const type = result[index].messageType
      return type === 'commandExecution' || type === 'toolCall' || type === 'fileChange' || type === 'worked'
    })
    if (hasWorkItems) {
      // round-27：旧存档/无锚点思考不再全部堆在用户消息之后（表现为
      // 「用户消息后、模型回答前」一堵思考墙），而是按存档顺序分摊到该轮
      // 各命令/agent 消息之后，恢复「思考与工具交错」的观感。第 k 条无锚点
      // 思考插到该轮第 k 条非用户消息之后，超出部分插到轮末。
      // round-29：不再要求 !anchorId——锚点匹配失败的思考与无锚点一样分摊，
      // 否则它们会堆在用户消息后（bridge 恢复改写消息 id 后锚点全部失效）。
      const anchorlessList = anchorlessByTurn.get(turnIndex) ?? []
      const position = anchorlessList.indexOf(reasoningMessage)
      const slot = position >= 0 ? position : 0
      result.splice(otherIndices[Math.min(slot, otherIndices.length - 1)] + 1, 0, reasoningMessage)
    } else if (lastUserIndex >= 0) {
      result.splice(lastUserIndex + 1, 0, reasoningMessage)
    } else if (lastTurnMessageIndex >= 0) {
      result.splice(lastTurnMessageIndex + 1, 0, reasoningMessage)
    } else {
      // round-39：turnIndex 在消息流中不存在（该轮已被回滚/删除，如回滚后
      // 存档未清理的思考）——直接丢弃，不再追加到末尾。此前这类孤儿思考会
      // 渲染成「思考过程堆在对话最后」；分页加载补齐旧轮后 turnIndex 会重新
      // 出现，思考届时按正常位置插入。
      continue
    }
  }
  // 主循环是逆序迭代（保证同轮多条思考正序），unattached 因此被反序收集，这里还原。
  return unattached.length > 0 ? [...result, ...unattached.reverse()] : result
}

// 合并 live 四组消息：先去掉已在持久化消息里出现的 id（turn 中刷新会把当前
// 轮部分项写入 persisted，避免重复展示），再按首次到达顺序排序追加到末尾。
export function mergeLiveMessages(threadId: string, liveGroups: UiMessage[][], persisted: UiMessage[]): UiMessage[] {
  const persistedIds = new Set(persisted.map((message) => message.id))
  const unique = new Map<string, UiMessage>()
  for (const group of liveGroups) {
    for (const message of group) {
      if (persistedIds.has(message.id)) continue
      if (!unique.has(message.id)) unique.set(message.id, message)
    }
  }
  const messages = Array.from(unique.values())
  // 先给全部 live 消息分配 sortKey 再排序：若在比较器内惰性分配，
  // key 的赋值顺序取决于排序算法内部的比较序列，结果不确定。
  for (const message of messages) {
    sortKeyForLiveMessage(threadId, message)
  }
  return messages.sort((a, b) => (
    sortKeyForLiveMessage(threadId, a) - sortKeyForLiveMessage(threadId, b)
  ))
}

export function mergeThreadMessageStreams(
  threadId: string,
  persisted: UiMessage[],
  persistedReasoning: UiMessage[],
  liveGroups: UiMessage[][],
  injected: UiMessage[],
): UiMessage[] {
  // round-23：先把持久化 + live 消息合并成完整时序，再插回思考存档——
  // 这样思考的时序锚点既能命中持久化命令/工具，也能命中仍在 live 中的
  // 命令/工具（turn 刚结束时无需等刷新即可按真实顺序交错展示）。
  const liveMessages = mergeLiveMessages(threadId, liveGroups, persisted)
  // 将已知轮次的 live 消息在下一条 user 消息前插回其持久化轮次。两次线性
  // 扫描避免对每条 live 消息 findIndex/splice；未能关联到持久化 user 轮次的消息
  // 保持原有的末尾追加语义。
  const insertAtByTurnIndex = new Map<number, number>()
  let previousTurnIndex: number | undefined
  for (let index = 0; index < persisted.length; index += 1) {
    const message = persisted[index]
    if (message.role !== 'user' || !Number.isInteger(message.turnIndex) || message.turnIndex! < 0) continue
    if (previousTurnIndex !== undefined) insertAtByTurnIndex.set(previousTurnIndex, index)
    previousTurnIndex = message.turnIndex
  }
  if (previousTurnIndex !== undefined) insertAtByTurnIndex.set(previousTurnIndex, persisted.length)

  const liveByInsertIndex = new Map<number, UiMessage[]>()
  const unattachedLive: UiMessage[] = []
  for (const message of liveMessages) {
    const turnIndex = message.turnIndex
    const insertIndex = Number.isInteger(turnIndex) && turnIndex! >= 0
      ? insertAtByTurnIndex.get(turnIndex!)
      : undefined
    if (insertIndex === undefined) {
      unattachedLive.push(message)
      continue
    }
    const messagesAtInsertIndex = liveByInsertIndex.get(insertIndex)
    if (messagesAtInsertIndex) messagesAtInsertIndex.push(message)
    else liveByInsertIndex.set(insertIndex, [message])
  }
  const combined: UiMessage[] = []
  for (let index = 0; index <= persisted.length; index += 1) {
    combined.push(...(liveByInsertIndex.get(index) ?? []))
    if (index < persisted.length) combined.push(persisted[index])
  }
  combined.push(...unattachedLive)
  // round-52：最终汇合的统一去重关口。upsertLiveAgentMessage 只堵 live map
  // 内部；同一段助手文本可能以不同 id 同时存在于 persisted（item.id）与 live
  // （params.itemId），mergeLiveMessages 只按 id 去重 → 跨源同文本不同 id 仍会
  // 双份渲染（进行中 process 区重复块）。此处对 assistant agentMessage 按规范化
  // 文本去重、保留最新一条，覆盖所有来源与轮中 refresh 场景；与轮末/刷新的
  // removeRedundantLiveAgentMessages 同用 normalizeMessageText，语义一致。
  const dedupedCombined = dedupeAssistantAgentMessageText(combined)
  return [...mergePersistedReasoning(dedupedCombined, persistedReasoning), ...injected]
}
