// Pure notification / snapshot normalizers sliced out of useDesktopState()'s
// closure. None of these capture reactive refs, so they are safe to lift to
// module scope. Kept in a dedicated file (not the utils file) because the
// closure-local normalizeThreadTokenUsage variant deliberately differs from
// the stored-value normalizer already exported by useDesktopStateUtils.ts.
import type { RpcNotification } from '../api/codexGateway'
import type {
  UiPlanData,
  UiPlanStep,
  UiRateLimitSnapshot,
  UiThreadTokenUsage,
  UiTokenUsageBreakdown,
} from '../types/codex'
import { clamp } from './useDesktopStateUtils'

export function normalizePlanStepStatus(value: unknown): UiPlanStep['status'] {
  if (value === 'completed') return 'completed'
  if (value === 'inProgress' || value === 'in_progress') return 'inProgress'
  return 'pending'
}

export function buildPlanMessageText(plan: UiPlanData): string {
  const lines: string[] = []
  if (plan.explanation?.trim()) {
    lines.push(plan.explanation.trim())
  }
  for (const step of plan.steps) {
    const marker = step.status === 'completed' ? 'x' : step.status === 'inProgress' ? '~' : ' '
    lines.push(`- [${marker}] ${step.step}`)
  }
  return lines.join('\n').trim()
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getRateLimitSnapshotKey(snapshot: UiRateLimitSnapshot): string {
  return snapshot.limitId?.trim() || snapshot.limitName?.trim() || '__default__'
}

export function normalizeRateLimitWindow(value: unknown): UiRateLimitSnapshot['primary'] {
  const record = asRecord(value)
  if (!record) return null

  const windowValue = readNumber(record.windowDurationMins)
  return {
    usedPercent: clamp(readNumber(record.usedPercent) ?? 0, 0, 100),
    windowDurationMins: windowValue,
    windowMinutes: windowValue,
    resetsAt: readNumber(record.resetsAt),
  }
}

export function normalizeRateLimitSnapshot(value: unknown): UiRateLimitSnapshot | null {
  const record = asRecord(value)
  if (!record) return null

  const credits = asRecord(record.credits)
  return {
    limitId: readString(record.limitId) || null,
    limitName: readString(record.limitName) || null,
    primary: normalizeRateLimitWindow(record.primary),
    secondary: normalizeRateLimitWindow(record.secondary),
    credits: credits
      ? {
          hasCredits: credits.hasCredits === true,
          unlimited: credits.unlimited === true,
          balance: readString(credits.balance) || null,
        }
      : null,
    planType: readString(record.planType) || null,
  }
}

export function normalizeRateLimitSnapshotsPayload(value: unknown): UiRateLimitSnapshot[] {
  const record = asRecord(value)
  if (!record) return []

  const next: UiRateLimitSnapshot[] = []
  const seen = new Set<string>()
  const pushSnapshot = (snapshot: UiRateLimitSnapshot | null): void => {
    if (!snapshot) return
    const key = getRateLimitSnapshotKey(snapshot)
    if (seen.has(key)) return
    seen.add(key)
    next.push(snapshot)
  }

  pushSnapshot(normalizeRateLimitSnapshot(record.rateLimits))

  const byLimitId = asRecord(record.rateLimitsByLimitId)
  if (byLimitId) {
    for (const snapshot of Object.values(byLimitId)) {
      pushSnapshot(normalizeRateLimitSnapshot(snapshot))
    }
  }

  return next
}

export function normalizeTokenUsageBreakdown(value: unknown): UiTokenUsageBreakdown | null {
  const record = asRecord(value)
  if (!record) return null

  const totalTokens = readNumber(record.totalTokens ?? record.total_tokens)
  const inputTokens = readNumber(record.inputTokens ?? record.input_tokens)
  const cachedInputTokens = readNumber(record.cachedInputTokens ?? record.cached_input_tokens)
  const outputTokens = readNumber(record.outputTokens ?? record.output_tokens)
  const reasoningOutputTokens = readNumber(record.reasoningOutputTokens ?? record.reasoning_output_tokens)
  if (
    totalTokens === null ||
    inputTokens === null ||
    cachedInputTokens === null ||
    outputTokens === null ||
    reasoningOutputTokens === null
  ) {
    return null
  }

  return {
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
  }
}

export function normalizeThreadTokenUsage(value: unknown): UiThreadTokenUsage | null {
  const record = asRecord(value)
  if (!record) return null

  const total = normalizeTokenUsageBreakdown(record.total)
  const last = normalizeTokenUsageBreakdown(record.last)
  if (!total || !last) return null

  const modelContextWindow = readNumber(record.modelContextWindow ?? record.model_context_window)
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

export function readThreadTokenUsageUpdate(notification: RpcNotification): { threadId: string; usage: UiThreadTokenUsage } | null {
  if (notification.method !== 'thread/tokenUsage/updated') return null
  const params = asRecord(notification.params)
  const threadId = extractThreadIdFromNotification(notification)
  const usage = normalizeThreadTokenUsage(params?.tokenUsage ?? params?.token_usage)
  if (!threadId || !usage) return null
  return { threadId, usage }
}

export function extractThreadIdFromNotification(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  const directThreadId = readString(params.threadId)
  if (directThreadId) return directThreadId
  const snakeThreadId = readString(params.thread_id)
  if (snakeThreadId) return snakeThreadId

  const conversationId = readString(params.conversationId)
  if (conversationId) return conversationId
  const snakeConversationId = readString(params.conversation_id)
  if (snakeConversationId) return snakeConversationId

  const thread = asRecord(params.thread)
  const nestedThreadId = readString(thread?.id)
  if (nestedThreadId) return nestedThreadId

  const turn = asRecord(params.turn)
  const turnThreadId = readString(turn?.threadId)
  if (turnThreadId) return turnThreadId
  const turnSnakeThreadId = readString(turn?.thread_id)
  if (turnSnakeThreadId) return turnSnakeThreadId

  return ''
}

export function readTurnErrorMessage(notification: RpcNotification): string {
  if (notification.method !== 'turn/completed') return ''
  const params = asRecord(notification.params)
  const turn = asRecord(params?.turn)
  if (!turn || turn.status !== 'failed') return ''
  const errorPayload = asRecord(turn.error)
  return readString(errorPayload?.message)
}

export function readNotificationErrorState(notification: RpcNotification): { message: string; transient: boolean } | null {
  if (notification.method !== 'error') return null
  const params = asRecord(notification.params)
  const message = (
    readString(params?.message) ||
    readString(asRecord(params?.error)?.message)
  )
  if (!message) return null

  return {
    message,
    transient: params?.willRetry === true,
  }
}