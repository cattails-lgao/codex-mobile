// Queued-turn building helpers (AC batch), extracted from BackendQueueProcessor.
// Pure module-level functions with zero shell closures: collaboration-mode
// reasoning-effort normalization and local-image/message-attachment text
// construction used when assembling queued turn params. The shell imports them
// for its instance methods.
import { asRecord } from './core.js'
import { isReasoningEffort, type ReasoningEffort } from '../../types/codex.js'
import type { StoredQueuedMessage } from './threadQueueState.js'

export type ResolvedCollaborationModeSettings = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  return isReasoningEffort(value) ? value : ''
}

export function normalizeCollaborationModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

export function extractLocalImagePathFromUrl(value: string): string | null {
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

export function buildTextWithAttachments(prompt: string, files: StoredQueuedMessage['fileAttachments']): string {
  if (files.length === 0) return prompt
  let prefix = '# Files mentioned by the user:\n'
  for (const f of files) {
    prefix += `\n## ${f.label}: ${f.path}\n`
  }
  return `${prefix}\n## My request for Codex:\n\n${prompt}\n`
}

export function fileNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? normalized
}

/** Extract a thread id from a notification params payload across shape variants. */
export function extractThreadIdFromNotificationParams(params: unknown): string {
  const record = asRecord(params)
  if (!record) return ''
  const threadId =
    (typeof record.threadId === 'string' ? record.threadId : '') ||
    (typeof record.thread_id === 'string' ? record.thread_id : '') ||
    (typeof record.conversationId === 'string' ? record.conversationId : '') ||
    (typeof record.conversation_id === 'string' ? record.conversation_id : '')
  if (threadId) return threadId
  const thread = asRecord(record.thread)
  if (thread && typeof thread.id === 'string') return thread.id
  const turn = asRecord(record.turn)
  if (turn) {
    const turnThreadId =
      (typeof turn.threadId === 'string' ? turn.threadId : '') ||
      (typeof turn.thread_id === 'string' ? turn.thread_id : '')
    if (turnThreadId) return turnThreadId
  }
  return ''
}

export function isTurnCompletedNotification(notification: { method: string; params: unknown }): boolean {
  return notification.method === 'turn/completed'
}