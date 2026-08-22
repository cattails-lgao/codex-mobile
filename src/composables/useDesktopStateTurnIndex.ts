// Turn-index write-side sliced out of useDesktopState()'s closure. These
// maintain turnIndexByTurnIdByThreadId as turns start, and rebind missing
// turnIndex values onto live file-change messages once known. Refs are injected
// as deps to keep this module cycle-free.
import type { Ref } from 'vue'
import type { UiMessage } from '../types/codex'

export interface TurnIndexDeps {
  turnIndexByTurnIdByThreadId: Ref<Record<string, Record<string, number>>>
  persistedMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  liveFileChangeMessagesByThreadId: Ref<Record<string, UiMessage[]>>
}

export function inferNextTurnIndex(deps: TurnIndexDeps, threadId: string): number {
  const persisted = deps.persistedMessagesByThreadId.value[threadId] ?? []
  let maxTurnIndex = -1
  for (const message of persisted) {
    if (typeof message.turnIndex === 'number' && Number.isFinite(message.turnIndex)) {
      maxTurnIndex = Math.max(maxTurnIndex, message.turnIndex)
    }
  }
  return maxTurnIndex + 1
}

export function setTurnIndexForThread(deps: TurnIndexDeps, threadId: string, turnId: string, turnIndex: number): void {
  if (!threadId || !turnId || !Number.isInteger(turnIndex) || turnIndex < 0) return
  const previous = deps.turnIndexByTurnIdByThreadId.value[threadId] ?? {}
  if (previous[turnId] === turnIndex) return
  deps.turnIndexByTurnIdByThreadId.value = {
    ...deps.turnIndexByTurnIdByThreadId.value,
    [threadId]: {
      ...previous,
      [turnId]: turnIndex,
    },
  }
}

export function replaceTurnIndexLookupForThread(deps: TurnIndexDeps, threadId: string, nextLookup: Record<string, number>): void {
  const previous = deps.turnIndexByTurnIdByThreadId.value[threadId] ?? {}
  const previousEntries = Object.entries(previous)
  const nextEntries = Object.entries(nextLookup)
  if (
    previousEntries.length === nextEntries.length
    && previousEntries.every(([turnId, turnIndex]) => nextLookup[turnId] === turnIndex)
  ) {
    return
  }

  deps.turnIndexByTurnIdByThreadId.value = {
    ...deps.turnIndexByTurnIdByThreadId.value,
    [threadId]: { ...nextLookup },
  }
}

// 供 App.vue 在 plan 本地存档兜底路径解析计划轮序号：刷新后按 turnId 从当前
// 线程的轮次映射重新解析（live 存档中记录的 turnIndex 可能缺失或过期）。
export function resolveThreadTurnIndex(deps: TurnIndexDeps, threadId: string, turnId: string): number | undefined {
  if (!threadId || !turnId) return undefined
  const index = deps.turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
  return typeof index === 'number' ? index : undefined
}

export function rebindLiveFileChangeTurnIndices(deps: TurnIndexDeps, threadId: string): void {
  const current = deps.liveFileChangeMessagesByThreadId.value[threadId]
  if (!current || current.length === 0) return

  const turnIndexByTurnId = deps.turnIndexByTurnIdByThreadId.value[threadId] ?? {}
  let changed = false
  const next = current.map((message) => {
    if (typeof message.turnIndex === 'number' || !message.turnId) {
      return message
    }
    const turnIndex = turnIndexByTurnId[message.turnId]
    if (typeof turnIndex !== 'number') return message
    changed = true
    return { ...message, turnIndex }
  })

  if (!changed) return
  deps.liveFileChangeMessagesByThreadId.value = {
    ...deps.liveFileChangeMessagesByThreadId.value,
    [threadId]: next,
  }
}