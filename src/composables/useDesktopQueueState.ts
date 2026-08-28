import { computed, ref, type Ref } from 'vue'
import {
  getThreadQueueState,
  setThreadQueueState,
  type StoredQueuedMessage,
  type ThreadQueueState,
} from '../api/codexGateway'
import { omitKey, pruneThreadStateMap } from './useDesktopStateUtils'

const STASHED_MESSAGES_STORAGE_KEY = 'codex-web-local.stashed-messages.v1'
const AUTO_COMPACT_THRESHOLD_STORAGE_KEY = 'codex-web-local.auto-compact-threshold.v1'
const DEFAULT_AUTO_COMPACT_THRESHOLD = 10
const QUEUE_STATE_FOLLOW_UP_REFRESH_MS = 650

export type FileAttachment = StoredQueuedMessage['fileAttachments'][number]
export type QueuedMessage = StoredQueuedMessage & { awaitingCompaction?: boolean }

function loadStashedMessagesMap(): Record<string, QueuedMessage[]> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STASHED_MESSAGES_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, QueuedMessage[]> = {}
    for (const [threadId, messages] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId || !Array.isArray(messages)) continue
      const rows = messages.filter(
        (message): message is QueuedMessage =>
          !!message
          && typeof message === 'object'
          && typeof (message as QueuedMessage).id === 'string'
          && typeof (message as QueuedMessage).text === 'string',
      )
      if (rows.length > 0) normalizedMap[threadId] = rows
    }
    return normalizedMap
  } catch {
    return {}
  }
}

function loadAutoCompactThreshold(): number {
  if (typeof window === 'undefined') return DEFAULT_AUTO_COMPACT_THRESHOLD

  try {
    const raw = window.localStorage.getItem(AUTO_COMPACT_THRESHOLD_STORAGE_KEY)
    if (raw === null) return DEFAULT_AUTO_COMPACT_THRESHOLD
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_AUTO_COMPACT_THRESHOLD
  } catch {
    return DEFAULT_AUTO_COMPACT_THRESHOLD
  }
}

function normalizeQueueStateForPersistence(state: Record<string, QueuedMessage[]>): ThreadQueueState {
  const next: ThreadQueueState = {}
  for (const [threadId, queue] of Object.entries(state)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || queue.length === 0) continue
    next[normalizedThreadId] = queue.map((message) => ({
      id: message.id,
      text: message.text,
      imageUrls: [...message.imageUrls],
      skills: message.skills.map((skill) => ({ name: skill.name, path: skill.path })),
      fileAttachments: message.fileAttachments.map((attachment) => ({
        label: attachment.label,
        path: attachment.path,
        fsPath: attachment.fsPath,
      })),
      collaborationMode: message.collaborationMode,
    }))
  }
  return next
}

export function createDesktopQueueState(selectedThreadId: Ref<string>) {
  const queuedMessagesByThreadId = ref<Record<string, QueuedMessage[]>>({})
  const queueProcessingByThreadId = ref<Record<string, boolean>>({})
  const stashedMessagesByThreadId = ref<Record<string, QueuedMessage[]>>(loadStashedMessagesMap())
  const autoCompactThreshold = ref<number>(loadAutoCompactThreshold())
  let hasLoadedPersistedQueueState = false

  const selectedThreadQueuedMessages = computed<QueuedMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []
    const queue = queuedMessagesByThreadId.value[threadId] ?? []
    const stashed = stashedMessagesByThreadId.value[threadId] ?? []
    const stashedRows = stashed.map((message) => ({ ...message, awaitingCompaction: true }))
    return [...stashedRows, ...queue]
  })

  function saveStashedMessagesMap(): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STASHED_MESSAGES_STORAGE_KEY, JSON.stringify(stashedMessagesByThreadId.value))
  }

  function persistQueueState(): void {
    void setThreadQueueState(normalizeQueueStateForPersistence(queuedMessagesByThreadId.value)).catch(() => {
      // Queue persistence is best-effort; keep the current in-memory queue usable.
    })
  }

  async function loadPersistedQueueStateIfNeeded(): Promise<void> {
    if (hasLoadedPersistedQueueState) return
    hasLoadedPersistedQueueState = true
    try {
      queuedMessagesByThreadId.value = await getThreadQueueState()
    } catch {
      // Backend queue state is optional during startup.
    }
  }

  async function processQueuedMessages(threadId: string): Promise<void> {
    if (queueProcessingByThreadId.value[threadId] === true) return
    queueProcessingByThreadId.value = {
      ...queueProcessingByThreadId.value,
      [threadId]: true,
    }
    try {
      queuedMessagesByThreadId.value = await getThreadQueueState()
    } catch {
      // Backend queue state is optional during transient bridge failures.
    } finally {
      queueProcessingByThreadId.value = omitKey(queueProcessingByThreadId.value, threadId)
    }
  }

  function scheduleQueueStateRefresh(threadId: string): void {
    void processQueuedMessages(threadId)
    if (typeof window === 'undefined') return
    window.setTimeout(() => {
      void processQueuedMessages(threadId)
    }, QUEUE_STATE_FOLLOW_UP_REFRESH_MS)
  }

  function setAutoCompactThreshold(value: number): void {
    const next = Number.isFinite(value) && value > 0 ? Math.round(value) : 0
    if (next === autoCompactThreshold.value) return
    autoCompactThreshold.value = next
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AUTO_COMPACT_THRESHOLD_STORAGE_KEY, String(next))
  }

  function getStashedMessages(threadId: string): QueuedMessage[] {
    return stashedMessagesByThreadId.value[threadId] ?? []
  }

  function appendStashedMessage(threadId: string, message: QueuedMessage): void {
    stashedMessagesByThreadId.value = {
      ...stashedMessagesByThreadId.value,
      [threadId]: [...getStashedMessages(threadId), message],
    }
    saveStashedMessagesMap()
  }

  function takeStashedMessages(threadId: string): QueuedMessage[] {
    const messages = [...getStashedMessages(threadId)]
    if (messages.length === 0) return messages
    stashedMessagesByThreadId.value = omitKey(stashedMessagesByThreadId.value, threadId)
    saveStashedMessagesMap()
    return messages
  }

  function enqueueQueuedMessage(threadId: string, message: QueuedMessage, insertIndex?: number): void {
    const queue = queuedMessagesByThreadId.value[threadId] ?? []
    const nextQueue = [...queue]
    const normalizedInsertIndex = typeof insertIndex === 'number'
      ? Math.max(0, Math.min(insertIndex, nextQueue.length))
      : nextQueue.length
    nextQueue.splice(normalizedInsertIndex, 0, message)
    queuedMessagesByThreadId.value = {
      ...queuedMessagesByThreadId.value,
      [threadId]: nextQueue,
    }
    persistQueueState()
  }

  function findStashedMessage(threadId: string, messageId: string): QueuedMessage | undefined {
    return getStashedMessages(threadId).find((message) => message.id === messageId)
  }

  function findQueuedMessage(threadId: string, messageId: string): QueuedMessage | undefined {
    return queuedMessagesByThreadId.value[threadId]?.find((message) => message.id === messageId)
  }

  function removeQueuedMessage(messageId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (findStashedMessage(threadId, messageId)) {
      const next = getStashedMessages(threadId).filter((message) => message.id !== messageId)
      stashedMessagesByThreadId.value = next.length > 0
        ? { ...stashedMessagesByThreadId.value, [threadId]: next }
        : omitKey(stashedMessagesByThreadId.value, threadId)
      saveStashedMessagesMap()
      return
    }

    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue) return
    const next = queue.filter((message) => message.id !== messageId)
    queuedMessagesByThreadId.value = next.length > 0
      ? { ...queuedMessagesByThreadId.value, [threadId]: next }
      : omitKey(queuedMessagesByThreadId.value, threadId)
    persistQueueState()
  }

  function reorderQueuedMessage(draggedId: string, targetId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue) return
    if (findStashedMessage(threadId, draggedId) || findStashedMessage(threadId, targetId)) return

    const fromIndex = queue.findIndex((message) => message.id === draggedId)
    const toIndex = queue.findIndex((message) => message.id === targetId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const next = [...queue]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    queuedMessagesByThreadId.value = {
      ...queuedMessagesByThreadId.value,
      [threadId]: next,
    }
    persistQueueState()
  }

  function pruneQueueState(activeThreadIds: Set<string>): void {
    const nextQueuedMessages = pruneThreadStateMap(queuedMessagesByThreadId.value, activeThreadIds)
    if (nextQueuedMessages === queuedMessagesByThreadId.value) return
    queuedMessagesByThreadId.value = nextQueuedMessages
    persistQueueState()
  }

  function clearQueueState(): void {
    queuedMessagesByThreadId.value = {}
    queueProcessingByThreadId.value = {}
    stashedMessagesByThreadId.value = {}
    saveStashedMessagesMap()
    persistQueueState()
  }

  return {
    appendStashedMessage,
    autoCompactThreshold,
    clearQueueState,
    enqueueQueuedMessage,
    findQueuedMessage,
    findStashedMessage,
    getStashedMessages,
    loadPersistedQueueStateIfNeeded,
    processQueuedMessages,
    pruneQueueState,
    removeQueuedMessage,
    reorderQueuedMessage,
    scheduleQueueStateRefresh,
    selectedThreadQueuedMessages,
    setAutoCompactThreshold,
    takeStashedMessages,
  }
}
