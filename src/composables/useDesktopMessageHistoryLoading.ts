// Message-history read request + cache ownership sliced out of
// useDesktopState()'s closure. This module owns the per-thread load cache
// (loaded/loadedVersion/hasMoreOlder/loadingOlder flags) and the request
// coalescing maps, plus the read functions that fetch and hydrate a thread's
// messages. Write-side orchestration (setPersistedMessagesForThread, live
// writes, turn-index rebinding, model resolution, turn errors) stays in
// useDesktopState and is injected via a narrow deps object so this module
// stays cycle-free. Only read requests and cache ownership move here; the
// live-turn / final-summary / realtime write flows are untouched.
import { ref, type Ref } from 'vue'
import { getOlderThreadMessages, getThreadDetail, resumeThread } from '../api/codexGateway'
import type { UiExternalSession, UiMessage } from '../types/codex'
import {
  hasOptimisticUserMessages,
  mergeMessages,
  omitKey,
  pruneThreadStateMap,
  removeRedundantLiveAgentMessages,
  type TurnErrorState,
} from './useDesktopStateUtils'

const RECENT_THREAD_MESSAGE_LOAD_REUSE_MS = 2000

export interface MessageHistoryLoadingDeps {
  selectedThreadId: Ref<string>
  error: Ref<string>
  persistedMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  liveAgentMessagesByThreadId: Ref<Record<string, UiMessage[]>>
  inProgressById: Ref<Record<string, boolean>>
  externalSessionByThreadId: Ref<Record<string, UiExternalSession | null>>
  resumedThreadById: Ref<Record<string, boolean>>
  turnIndexByTurnIdByThreadId: Ref<Record<string, Record<string, number>>>
  turnErrorByThreadId: Ref<Record<string, TurnErrorState>>
  activeTurnIdByThreadId: Ref<Record<string, string>>

  markThreadAsRead: (threadId: string) => void
  markThreadMessagesPersisted: (threadId: string, messages: UiMessage[]) => void
  replaceTurnIndexLookupForThread: (threadId: string, nextLookup: Record<string, number>) => void
  rebindLiveFileChangeTurnIndices: (threadId: string) => void
  setPersistedMessagesForThread: (threadId: string, nextMessages: UiMessage[]) => void
  setLiveAgentMessagesForThread: (threadId: string, nextMessages: UiMessage[]) => void
  clearLiveAgentMessagesForThread: (threadId: string) => void
  removeLiveCommandsPersistedIn: (threadId: string, persistedMessages: UiMessage[]) => void
  removeLiveFileChangesPersistedIn: (threadId: string, persistedMessages: UiMessage[]) => void
  setThreadInProgress: (threadId: string, nextInProgress: boolean) => void
  setThreadModelProviderId: (threadId: string, providerId: string) => void
  setThreadModelId: (threadId: string, modelId: string) => void
  resolveThreadModelForProvider: (threadId: string, modelId: string, providerId: string) => string
  clearTransientTurnErrorForThread: (threadId: string) => void
  clearCompletedTurnLiveState: (threadId: string) => void
  setTurnErrorForThread: (
    threadId: string,
    message: string | null,
    options?: { transient?: boolean },
  ) => void
  getFirstPersistedTurnId: (threadId: string) => string
  currentThreadVersion: (threadId: string) => string
}

export function createDesktopMessageHistoryLoading(deps: MessageHistoryLoadingDeps) {
  const loadedVersionByThreadId = ref<Record<string, string>>({})
  const loadedMessagesByThreadId = ref<Record<string, boolean>>({})
  const hasMoreOlderMessagesByThreadId = ref<Record<string, boolean>>({})
  const loadingOlderMessagesByThreadId = ref<Record<string, boolean>>({})
  const isLoadingMessages = ref(false)

  const loadMessagePromiseByThreadId = new Map<string, Promise<void>>()
  const lastMessageLoadAtByThreadId = new Map<string, number>()
  const lastMessageLoadFailureAtByThreadId = new Map<string, number>()
  let loadingIndicatorCount = 0

  async function loadMessages(threadId: string, options: { silent?: boolean; force?: boolean } = {}) {
    if (!threadId) {
      return
    }
    const recentLoadFailure =
      Date.now() - (lastMessageLoadFailureAtByThreadId.get(threadId) ?? 0) < RECENT_THREAD_MESSAGE_LOAD_REUSE_MS
    if (deps.turnErrorByThreadId.value[threadId]?.transient && (options.silent === true || recentLoadFailure)) {
      return
    }

    const existingLoad = loadMessagePromiseByThreadId.get(threadId)
    if (existingLoad && options.force !== true) {
      await existingLoad
      return
    }

    const alreadyLoaded = loadedMessagesByThreadId.value[threadId] === true
    const shouldShowLoading = options.silent !== true && !alreadyLoaded
    if (shouldShowLoading) {
      loadingIndicatorCount += 1
      isLoadingMessages.value = true
    }

    const loadPromise = (async () => {
      try {
      const version = deps.currentThreadVersion(threadId)
      const loadedVersion = loadedVersionByThreadId.value[threadId] ?? ''
      const loadedRecently =
        Date.now() - (lastMessageLoadAtByThreadId.get(threadId) ?? 0) < RECENT_THREAD_MESSAGE_LOAD_REUSE_MS
      const canReuseLoadedMessages =
        options.force === true
          ? false
          : alreadyLoaded &&
          (
            loadedRecently ||
            (
              (version.length === 0 || loadedVersion === version) &&
              deps.inProgressById.value[threadId] !== true
            )
          )

      if (canReuseLoadedMessages) {
        deps.markThreadAsRead(threadId)
        return
      }

      const needsResume = deps.resumedThreadById.value[threadId] !== true
      const resumedThread = needsResume ? await resumeThread(threadId) : null
      const detail = resumedThread ?? await getThreadDetail(threadId)

      if (detail.modelProvider) {
        deps.setThreadModelProviderId(threadId, detail.modelProvider)
      }
      if (detail.model) {
        deps.setThreadModelId(threadId, deps.resolveThreadModelForProvider(threadId, detail.model, detail.modelProvider))
      }
      if (resumedThread) {
        deps.resumedThreadById.value = {
          ...deps.resumedThreadById.value,
          [threadId]: true,
        }
      }

      const { messages: nextMessages, inProgress, activeTurnId, turnIndexByTurnId } = detail
      hasMoreOlderMessagesByThreadId.value = {
        ...hasMoreOlderMessagesByThreadId.value,
        [threadId]: detail.hasMoreOlder === true,
      }
      deps.markThreadMessagesPersisted(threadId, nextMessages)
      deps.replaceTurnIndexLookupForThread(threadId, turnIndexByTurnId)
      deps.rebindLiveFileChangeTurnIndices(threadId)
      const previousPersisted = deps.persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
        preserveMissing: options.silent === true || hasOptimisticUserMessages(previousPersisted),
      })
      deps.setPersistedMessagesForThread(threadId, mergedMessages)

      const previousLiveAgent = deps.liveAgentMessagesByThreadId.value[threadId] ?? []
      if (inProgress) {
        const nextLiveAgent = removeRedundantLiveAgentMessages(previousLiveAgent, nextMessages)
        deps.setLiveAgentMessagesForThread(threadId, nextLiveAgent)
      } else {
        deps.clearLiveAgentMessagesForThread(threadId)
      }
      deps.removeLiveCommandsPersistedIn(threadId, nextMessages)
      deps.removeLiveFileChangesPersistedIn(threadId, nextMessages)

      loadedMessagesByThreadId.value = {
        ...loadedMessagesByThreadId.value,
        [threadId]: true,
      }
      lastMessageLoadAtByThreadId.set(threadId, Date.now())
      lastMessageLoadFailureAtByThreadId.delete(threadId)

      if (version) {
        loadedVersionByThreadId.value = {
          ...loadedVersionByThreadId.value,
          [threadId]: version,
        }
      }
      deps.setThreadInProgress(threadId, inProgress)
      if (detail.externalSession) {
        deps.externalSessionByThreadId.value = {
          ...deps.externalSessionByThreadId.value,
          [threadId]: detail.externalSession,
        }
      }
      deps.clearTransientTurnErrorForThread(threadId)
      if (activeTurnId) {
        deps.activeTurnIdByThreadId.value = {
          ...deps.activeTurnIdByThreadId.value,
          [threadId]: activeTurnId,
        }
      } else if (deps.activeTurnIdByThreadId.value[threadId]) {
        deps.activeTurnIdByThreadId.value = omitKey(deps.activeTurnIdByThreadId.value, threadId)
      }
      if (!inProgress) {
        deps.clearCompletedTurnLiveState(threadId)
      }
      deps.markThreadAsRead(threadId)
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        if (deps.selectedThreadId.value === threadId) {
          deps.setTurnErrorForThread(threadId, message, { transient: true })
        }
        lastMessageLoadFailureAtByThreadId.set(threadId, Date.now())
        throw unknownError
      } finally {
      if (shouldShowLoading) {
        loadingIndicatorCount = Math.max(0, loadingIndicatorCount - 1)
        if (loadingIndicatorCount === 0) {
          isLoadingMessages.value = false
        }
      }
      }
    })().finally(() => {
      loadMessagePromiseByThreadId.delete(threadId)
    })

    loadMessagePromiseByThreadId.set(threadId, loadPromise)
    await loadPromise
  }

  async function loadOlderMessages(threadId: string = deps.selectedThreadId.value): Promise<void> {
    if (!threadId) return
    if (loadingOlderMessagesByThreadId.value[threadId] === true) return
    if (hasMoreOlderMessagesByThreadId.value[threadId] !== true) return

    const beforeTurnId = deps.getFirstPersistedTurnId(threadId)
    if (!beforeTurnId) {
      hasMoreOlderMessagesByThreadId.value = {
        ...hasMoreOlderMessagesByThreadId.value,
        [threadId]: false,
      }
      return
    }

    loadingOlderMessagesByThreadId.value = {
      ...loadingOlderMessagesByThreadId.value,
      [threadId]: true,
    }

    try {
      const page = await getOlderThreadMessages(threadId, beforeTurnId)
      const previousPersisted = deps.persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(page.messages, previousPersisted, { preserveMissing: true })
      deps.setPersistedMessagesForThread(threadId, mergedMessages)
      deps.replaceTurnIndexLookupForThread(threadId, {
        ...(deps.turnIndexByTurnIdByThreadId.value[threadId] ?? {}),
        ...page.turnIndexByTurnId,
      })
      deps.rebindLiveFileChangeTurnIndices(threadId)
      hasMoreOlderMessagesByThreadId.value = {
        ...hasMoreOlderMessagesByThreadId.value,
        [threadId]: page.hasMoreOlder,
      }
    } catch (loadError) {
      deps.error.value = loadError instanceof Error ? loadError.message : 'Failed to load earlier messages'
      throw loadError
    } finally {
      loadingOlderMessagesByThreadId.value = {
        ...loadingOlderMessagesByThreadId.value,
        [threadId]: false,
      }
    }
  }

  async function ensureThreadMessagesLoaded(threadId: string, options: { silent?: boolean } = {}): Promise<void> {
    if (!threadId) return
    if (loadedMessagesByThreadId.value[threadId] === true) return
    if (options.silent === true && deps.turnErrorByThreadId.value[threadId]?.transient) return
    await loadMessages(threadId, options)
  }

  function pruneMessageHistoryState(activeThreadIds: Set<string>): void {
    loadedMessagesByThreadId.value = pruneThreadStateMap(loadedMessagesByThreadId.value, activeThreadIds)
    loadedVersionByThreadId.value = pruneThreadStateMap(loadedVersionByThreadId.value, activeThreadIds)
  }

  return {
    ensureThreadMessagesLoaded,
    hasMoreOlderMessagesByThreadId,
    isLoadingMessages,
    loadMessages,
    loadOlderMessages,
    loadedMessagesByThreadId,
    loadedVersionByThreadId,
    loadingOlderMessagesByThreadId,
    pruneMessageHistoryState,
  }
}