// Live file-change / command write-side sliced out of useDesktopState()'s
// closure. These mutate the live liveCommandsByThreadId /
// liveFileChangeMessagesByThreadId refs as messages stream in from the server,
// then get pruned once the equivalent messages persist. The refs are injected
// as a deps object (rather than imported back into the closure) so this module
// stays cycle-free. setLiveFileChangeMessagesForThread is lifted here too since
// it is used by the other functions in this cluster.
import type { Ref } from 'vue'
import type { UiFileChange, UiMessage } from '../types/codex'
import { saveLastPlanMap } from './useDesktopStatePersistence'
import { areMessageArraysEqual, normalizeMessageText, omitKey, upsertMessage } from './useDesktopStateUtils'

export interface LiveWriteDeps {
  liveCommandsByThreadId: Ref<Record<string, UiMessage[]>>
  liveFileChangeMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  liveAgentMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  livePlanMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  lastPlanByThreadId: Ref<Record<string, UiMessage>>
}

export function setLiveAgentMessagesForThread(
  deps: LiveWriteDeps,
  threadId: string,
  nextMessages: UiMessage[],
): void {
  const previous = deps.liveAgentMessagesByThreadId.value[threadId] ?? []
  if (areMessageArraysEqual(previous, nextMessages)) return
  deps.liveAgentMessagesByThreadId.value = {
    ...deps.liveAgentMessagesByThreadId.value,
    [threadId]: nextMessages,
  }
}

export function clearLiveAgentMessagesForThread(deps: LiveWriteDeps, threadId: string): void {
  if (!threadId) return
  if (!(threadId in deps.liveAgentMessagesByThreadId.value)) return
  deps.liveAgentMessagesByThreadId.value = omitKey(deps.liveAgentMessagesByThreadId.value, threadId)
}

export function setLivePlanMessagesForThread(
  deps: LiveWriteDeps,
  threadId: string,
  nextMessages: UiMessage[],
): void {
  const previous = deps.livePlanMessagesByThreadId.value[threadId] ?? []
  if (areMessageArraysEqual(previous, nextMessages)) return
  deps.livePlanMessagesByThreadId.value = {
    ...deps.livePlanMessagesByThreadId.value,
    [threadId]: nextMessages,
  }
}

export function rememberLastPlan(deps: LiveWriteDeps, threadId: string, planMessage: UiMessage): void {
  if (!threadId || !planMessage) return
  deps.lastPlanByThreadId.value = {
    ...deps.lastPlanByThreadId.value,
    [threadId]: planMessage,
  }
  saveLastPlanMap(deps.lastPlanByThreadId.value)
}

export function upsertLivePlanMessage(deps: LiveWriteDeps, threadId: string, nextMessage: UiMessage): void {
  const previous = deps.livePlanMessagesByThreadId.value[threadId] ?? []
  const next = upsertMessage(previous, nextMessage)
  setLivePlanMessagesForThread(deps, threadId, next)
  rememberLastPlan(deps, threadId, nextMessage)
}

export function upsertLiveFileChangeMessage(deps: LiveWriteDeps, threadId: string, nextMessage: UiMessage): void {
  const previous = deps.liveFileChangeMessagesByThreadId.value[threadId] ?? []
  const next = upsertMessage(previous, nextMessage)
  setLiveFileChangeMessagesForThread(deps, threadId, next)
}

export function upsertLiveAgentMessage(deps: LiveWriteDeps, threadId: string, nextMessage: UiMessage): void {
  const previous = deps.liveAgentMessagesByThreadId.value[threadId] ?? []
  let next = upsertMessage(previous, nextMessage)
  // Live text-level dedupe: the same assistant text can enter live under two
  // different ids (delta channel uses params.itemId, completed channel uses
  // item.id), and upsertMessage only dedupes by id. Remove same-text duplicates
  // while keeping the latest (removed at turn-end / refresh by the persisted
  // message paths too). Shared normalizeMessageText preserves the newest.
  const normalizedText = normalizeMessageText(nextMessage.text)
  if (nextMessage.role === 'assistant' && normalizedText.length > 0) {
    const deduped = next.filter(
      (message) => message.id === nextMessage.id || normalizeMessageText(message.text) !== normalizedText,
    )
    if (deduped.length !== next.length) {
      next = deduped
    }
  }
  setLiveAgentMessagesForThread(deps, threadId, next)
}

export function setLiveFileChangeMessagesForThread(
  deps: LiveWriteDeps,
  threadId: string,
  nextMessages: UiMessage[],
): void {
  const previous = deps.liveFileChangeMessagesByThreadId.value[threadId] ?? []
  if (areMessageArraysEqual(previous, nextMessages)) return
  deps.liveFileChangeMessagesByThreadId.value = {
    ...deps.liveFileChangeMessagesByThreadId.value,
    [threadId]: nextMessages,
  }
}

export function upsertLiveCommand(deps: LiveWriteDeps, threadId: string, msg: UiMessage): void {
  const previous = deps.liveCommandsByThreadId.value[threadId] ?? []
  const next = upsertMessage(previous, msg)
  if (next === previous) return
  deps.liveCommandsByThreadId.value = { ...deps.liveCommandsByThreadId.value, [threadId]: next }
}

export function removeLiveCommandsPersistedIn(deps: LiveWriteDeps, threadId: string, persistedMessages: UiMessage[]): void {
  const current = deps.liveCommandsByThreadId.value[threadId]
  if (!current || current.length === 0) return
  const persistedIds = new Set(persistedMessages.map((m) => m.id))
  const next = current.filter((m) => !persistedIds.has(m.id))
  if (next.length === current.length) return
  if (next.length === 0) {
    deps.liveCommandsByThreadId.value = omitKey(deps.liveCommandsByThreadId.value, threadId)
  } else {
    deps.liveCommandsByThreadId.value = { ...deps.liveCommandsByThreadId.value, [threadId]: next }
  }
}

export function removeLiveFileChangesPersistedIn(deps: LiveWriteDeps, threadId: string, persistedMessages: UiMessage[]): void {
  const current = deps.liveFileChangeMessagesByThreadId.value[threadId]
  if (!current || current.length === 0) return
  const persistedIds = new Set(persistedMessages.map((message) => message.id))
  const persistedTurnIds = new Set(
    persistedMessages
      .filter((message) => message.messageType === 'fileChange' && typeof message.turnId === 'string' && message.turnId.length > 0)
      .map((message) => message.turnId as string),
  )
  const persistedTurnIndices = new Set(
    persistedMessages
      .filter((message) => message.messageType === 'fileChange' && typeof message.turnIndex === 'number')
      .map((message) => message.turnIndex as number),
  )
  const next = current.filter((message) => (
    !persistedIds.has(message.id)
    && !(message.turnId && persistedTurnIds.has(message.turnId))
    && !(typeof message.turnIndex === 'number' && persistedTurnIndices.has(message.turnIndex))
  ))
  if (next.length === current.length) return
  if (next.length === 0) {
    deps.liveFileChangeMessagesByThreadId.value = omitKey(deps.liveFileChangeMessagesByThreadId.value, threadId)
  } else {
    deps.liveFileChangeMessagesByThreadId.value = { ...deps.liveFileChangeMessagesByThreadId.value, [threadId]: next }
  }
}

export function upsertLiveFileChangePatch(deps: LiveWriteDeps, threadId: string, itemId: string, changes: UiFileChange[]): void {
  if (!threadId || !itemId) return
  const messages = deps.liveFileChangeMessagesByThreadId.value[threadId]
  if (!messages) return
  const index = messages.findIndex((message) => message.id === itemId || message.turnId === itemId)
  if (index < 0) return
  const next = [...messages]
  next[index] = { ...next[index], fileChanges: changes }
  setLiveFileChangeMessagesForThread(deps, threadId, next)
}

export function upsertTurnDiff(deps: LiveWriteDeps, threadId: string, turnId: string, diff: string): void {
  if (!threadId || !turnId) return
  const messages = deps.liveFileChangeMessagesByThreadId.value[threadId]
  if (!messages) return
  const index = messages.findIndex((message) => message.turnId === turnId)
  if (index < 0) return
  const next = [...messages]
  const target = next[index]
  next[index] = {
    ...target,
    fileChanges: (target.fileChanges ?? []).map((change) => ({ ...change, diff })),
  }
  setLiveFileChangeMessagesForThread(deps, threadId, next)
}