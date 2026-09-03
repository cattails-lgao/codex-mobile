import { computed, ref } from 'vue'
import {

  archiveThread,
  forkThread,
  renameThread,
  getThreadDetail,
  getOlderThreadMessages,
  getBackgroundThreadListLimit,
  interruptThreadTurn,
  pickCodexRateLimitSnapshot,
  replyToServerRequest,
  revertThreadFileChanges,
  rollbackThread,
  getWorkspaceRootsState,
  setWorkspaceRootsState,
  persistThreadTitle,
  getThreadReasoningArchive,
  persistThreadReasoningArchive,
  getThreadTurnDurationArchive,
  resumeThread,
  compactThread,
  normalizeFuzzyFileSearchResults,

  startThread,
  subscribeCodexNotifications,
  startThreadTurn,
  type RpcNotification,
  type WorkspaceRootsState,
} from '../api/codexGateway'
import { CodexApiError } from '../api/codexErrors'
import { normalizeFileChangeStatus, toUiFileChanges } from '../api/normalizers/v2'
import type {
  CollaborationModeKind,
  CommandExecutionData,
  UiPendingRequestState,
  ReasoningEffort,
  UiFileChange,
  UiLiveOverlay,
  UiMessage,
  UiPlanData,
  UiPlanStep,
  UiProjectGroup,
  UiServerRequest,
  UiServerRequestReply,
  UiThreadTokenUsage,
  UiTokenUsageBreakdown,
  UiThread,
  UiExternalSession,
} from '../types/codex'
import { getPathParent, isProjectlessChatPath, normalizePathForUi, toProjectName } from '../pathUtils.js'
import { parsePlanFromMessageText } from '../utils/plan'

// useDesktopState「A 批」纯工具 +「B 批」持久化（见 domain-modularization-plan）。
// 原文件头 74-1776 的模块级辅助函数已分别卷入 useDesktopStateUtils(tools) 与
// useDesktopStatePersistence(localStorage load/save)。下方 re-export 保持对外 API
// 不变（formatTurnDuration / mergeLiveMessages / useDesktopState 等消费者零改动）；
// 显式 import 供 useDesktopState() 主函数在本地复用。
export * from './useDesktopStateUtils'
export * from './useDesktopStatePersistence'
import {
  areCommandExecutionsEqual,
  areGroupArraysEqual,
  areMessageArraysEqual,
  areMessageFieldsEqual,
  arePlanDataEqual,
  arePlanStepsEqual,
  areStringArraysEqual,
  areThreadArraysEqual,
  areThreadFieldsEqual,
  areTurnActivitiesEqual,
  areTurnSummariesEqual,
  areUiFileChangesEqual,
  buildTurnSummaryMessage,
  dedupeAssistantAgentMessageText,
  delay,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  findReasoningAnchorIndex,
  flattenThreads,
  formatTurnDuration,
  insertPersistedTurnDurations,
  insertTurnSummaryMessage,
  isCodexCliMissingError,
  isOptimisticUserMessage,
  isThreadNotFoundError,
  isThreadUnreadByLastRead,
  isUnsupportedChatGptModelError,
  mergeIncomingWithLocalInProgressThreads,
  mergeLiveMessages,
  mergeMessages,
  mergePersistedReasoning,
  mergeThreadGroups,
  mergeThreadMessageStreams,
  normalizeMessageText,
  omitKey,
  orderGroupsByProjectOrder,
  orderGroupsByWorkspaceProjectOrder,
  parseIsoTimestamp,
  pruneLiveMessageSortKeys,
  pruneThreadStateMap,
  removePersistedLiveMessages,
  removeRedundantLiveAgentMessages,
  removeThreadFromGroups,
  sortKeyForLiveMessage,
  toForkedThreadTitle,
  toOptimisticThreadTitle,
  upsertMessage,
  addWorkspaceRootPlaceholderGroups,
  clamp,
  collectDuplicateProjectLeafNames,
  disambiguateProjectGroupsByCwd,
  getRemoteProjectDisplayName,
  getWorkspaceProjectOrderNames,
  getWorkspaceProjectOrderPaths,
  hasOptimisticUserMessages,
  isProjectlessGroup,
  mergeProjectOrder,
  pruneLiveMessageSortKeysByActiveThreads,
  resetLiveMessageSortKeys,
  toProjectNameFromWorkspaceRoot,
  type TurnCompletedInfo,
  type TurnErrorState,
  type TurnStartedInfo,
  type InterruptRecoverPayload,
  type TurnActivityState,
  type TurnSummaryState,
} from './useDesktopStateUtils'
import {
  NEW_THREAD_COLLABORATION_MODE_CONTEXT,
} from './useDesktopStateContext'
import {
  asRecord,
  buildPlanMessageText,
  extractThreadIdFromNotification,
  normalizePlanStepStatus,
  normalizeThreadTokenUsage,
  normalizeTokenUsageBreakdown,
  readNotificationErrorState,
  readNumber,
  readString,
  readThreadTokenUsageUpdate,
  readTurnErrorMessage,
} from './useDesktopStateNormalizers'
import {
  liveReasoningMessageId,
  readAgentMessageCompleted,
  readAgentMessageDelta,
  readAgentMessageStartedId,
  readCommandOutputDelta,
  readCompletedImageView,
  readReasoningCompletedId,
  readReasoningDelta,
  readReasoningItemNotification,
  readReasoningSectionBreakMessageId,
  readReasoningStartedItemId,
  readTurnActivity,
  readTurnCompletedInfo,
  readTurnStartedInfo,
} from './useDesktopStateReaders'
import {
  normalizeServerRequest,
  readToolRequestUserInputQuestionIds,
} from './useDesktopStateRequests'
import {
  clearLiveAgentMessagesForThread as clearLiveAgentMessagesForThreadImpl,
  rememberLastPlan as rememberLastPlanImpl,
  removeLiveCommandsPersistedIn as removeLiveCommandsPersistedInImpl,
  removeLiveFileChangesPersistedIn as removeLiveFileChangesPersistedInImpl,
  setLiveAgentMessagesForThread as setLiveAgentMessagesForThreadImpl,
  setLiveFileChangeMessagesForThread as setLiveFileChangeMessagesForThreadImpl,
  setLivePlanMessagesForThread as setLivePlanMessagesForThreadImpl,
  upsertLiveAgentMessage as upsertLiveAgentMessageImpl,
  upsertLiveCommand as upsertLiveCommandImpl,
  upsertLiveFileChangeMessage as upsertLiveFileChangeMessageImpl,
  upsertLiveFileChangePatch as upsertLiveFileChangePatchImpl,
  upsertLivePlanMessage as upsertLivePlanMessageImpl,
  upsertTurnDiff as upsertTurnDiffImpl,
  type LiveWriteDeps,
} from './useDesktopStateLiveWrites'
import {
  inferNextTurnIndex as inferNextTurnIndexImpl,
  rebindLiveFileChangeTurnIndices as rebindLiveFileChangeTurnIndicesImpl,
  replaceTurnIndexLookupForThread as replaceTurnIndexLookupForThreadImpl,
  resolveThreadTurnIndex as resolveThreadTurnIndexImpl,
  setTurnIndexForThread as setTurnIndexForThreadImpl,
  type TurnIndexDeps,
} from './useDesktopStateTurnIndex'
import {
  createLiveReasoningTextWrites,
  type LiveReasoningWriteDeps,
} from './useDesktopStateReasoningWrites'
import {
  accumulateReasoningTextDelta as accumulateReasoningTextDeltaImpl,
  appendReasoningItemProgress as appendReasoningItemProgressImpl,
  clearLiveReasoningForThread as clearLiveReasoningForThreadImpl,
  clearReasoningItemTextCache as clearReasoningItemTextCacheImpl,
  recordActiveReasoningTurn as recordActiveReasoningTurnImpl,
  recordTurnItemOrder as recordTurnItemOrderImpl,
  type ReasoningTimelineDeps,
} from './useDesktopStateReasoningTimeline'
import {
  loadLastPlanMap,
  loadPersistedReasoningMap,
  loadPersistedTurnDurationMap,
  loadReadStateMap,
  loadSelectedThreadId,
  loadThreadTerminalOpenMap,
  loadThreadTokenUsageMap,
  loadUnreadCutoffIso,
  saveLastPlanMap,
  savePersistedReasoningMap,
  savePersistedTurnDurationMap,
  saveReadStateMap,
  saveSelectedThreadId,
  saveThreadTerminalOpenMap,
  saveThreadTokenUsageMap,
  saveUnreadCutoffIso,
} from './useDesktopStatePersistence'
import {
  CODEX_CLI_MISSING_MESSAGE,
  MODEL_FALLBACK_ID,
  createDesktopModelPreferences,
} from './useDesktopModelPreferences'
import { createDesktopCollaborationPreferences } from './useDesktopCollaborationPreferences'
import { createDesktopRateLimits } from './useDesktopRateLimits'
import { createDesktopProjectOrganization } from './useDesktopProjectOrganization'
import { createDesktopCatalogs } from './useDesktopCatalogs'
import {
  createDesktopQueueState,
  type FileAttachment,
} from './useDesktopQueueState'
import { createDesktopThreadListLoading } from './useDesktopThreadListLoading'
import { createDesktopMessageHistoryLoading } from './useDesktopMessageHistoryLoading'
import { createDesktopThreadTitleCache } from './useDesktopThreadTitleCache'
import { createDesktopPendingServerRequests } from './useDesktopPendingServerRequests'

type SelectThreadResult = 'ok' | 'not-found' | 'error'

const EVENT_SYNC_DEBOUNCE_MS = 220
const TURN_START_FOLLOW_UP_SYNC_DELAY_MS = 3000

// Official app-server notifications with no UI consumer in codex-mobile.
// Each gets an explicit no-op branch (with debug log) so a future unknown
// notification can never fall through into the error path by accident.
const KNOWN_IGNORED_NOTIFICATION_METHODS = new Set<string>([
  'account/login/completed',
  'account/updated',
  'authStatusChange',
  'command/exec/outputDelta',
  'configWarning',
  'deprecationNotice',
  'externalAgentConfig/import/completed',
  'externalAgentConfig/import/progress',
  'fs/changed', // no directory-browse surface in this UI (DirectoryHub has no fs view)
  'guardianWarning',
  'item/autoApprovalReview/completed', // Guardian auto-review; no approval panel surface
  'item/autoApprovalReview/started', // Guardian auto-review; no approval panel surface
  'item/mcpToolCall/progress',
  'loginChatGptComplete',
  'model/rerouted',
  'model/safetyBuffering/updated',
  'model/verification',
  'process/exited',
  'process/outputDelta',
  'sessionConfigured',
  'thread/environment/connected',
  'thread/environment/disconnected',
  'thread/goal/cleared',
  'thread/goal/updated',
  'thread/realtime/closed', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/error', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/itemAdded', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/outputAudio/delta', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/sdp', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/started', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/transcript/delta', // consumed by useRealtimeVoice's own subscription
  'thread/realtime/transcript/done', // consumed by useRealtimeVoice's own subscription
  'thread/settings/updated',
  'thread/started',
  'turn/moderationMetadata',
  'warning',
  'windows/worldWritableWarning',
  'windowsSandbox/setupCompleted',
])

export function useDesktopState() {
  const projectGroups = ref<UiProjectGroup[]>([])
  const sourceGroups = ref<UiProjectGroup[]>([])
  const selectedThreadId = ref(loadSelectedThreadId())
  const error = ref('')
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const livePlanMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  // round-27：每线程最近一次 plan 的本地存档（刷新后输入框上方的计划面板兜底恢复）
  const lastPlanByThreadId = ref<Record<string, UiMessage>>(loadLastPlanMap())
  const liveAgentMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const injectedSystemMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const persistedReasoningByThreadId = ref<Record<string, UiMessage[]>>(loadPersistedReasoningMap())
  // round-65：每线程各轮耗时存档（threadId → turnId → durationMs），刷新/换浏览器后
  // 仍能恢复「本轮过程」标题旁的耗时徽标（服务端 sidecar + localStorage 镜像）。
  const persistedTurnDurationsByThreadId = ref<Record<string, Record<string, number>>>(loadPersistedTurnDurationMap())
  const liveReasoningTextByThreadId = ref<Record<string, string>>({})
  // 本 app-server（v0.146+）不推送 item/reasoning/textDelta 增量通道，reasoning
  // 内容只随 item/started + item/completed 全量 item 到达；这里按 itemId 记录已
  // 追加的文本，避免 started/completed 重复追加或遗漏增量。
  const reasoningAppendedTextByItemId = new Map<string, string>()
  // round-23：按 item/started 到达顺序记录每轮「推理项/工具项」的时间线，
  // 轮次结束后按真实时序把思考插回消息流，而不是全部堆在轮次开头。
  const reasoningItemTextByItemId = new Map<string, string>()
  const turnItemSequenceByThreadId = new Map<string, Array<{ itemId: string; kind: 'reasoning' | 'other' }>>()
  // 记录每条 reasoning 流属于哪个 turn（turn/completed 通知会先清掉
  // activeTurnIdByThreadId，clearLiveReasoningForThread 时已取不到，故在
  // reasoning 开始时先记一份），供存档时打上轮次以便插回正确位置。
  const activeReasoningTurnIdByThreadId = new Map<string, string>()
  const liveCommandsByThreadId = ref<Record<string, UiMessage[]>>({})
  const liveFileChangeMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const inProgressById = ref<Record<string, boolean>>({})
  const reasoningWriteDeps: LiveReasoningWriteDeps = {
    liveReasoningTextByThreadId,
    inProgressById,
  }
  const reasoningWrites = createLiveReasoningTextWrites(reasoningWriteDeps)
  const externalSessionByThreadId = ref<Record<string, UiExternalSession | null>>({})
  type PendingTurnRequest = {
    text: string
    imageUrls: string[]
    skills: Array<{ name: string; path: string }>
    fileAttachments: FileAttachment[]
    effort: ReasoningEffort | ''
    collaborationMode: CollaborationModeKind
    fallbackRetried: boolean
  }
  // 补发/手动发送暂存消息期间抑制再次预检（压缩刚完成或用户主动发送，避免重复压缩）。
  let suppressAutoCompactStash = false
  const eventUnreadByThreadId = ref<Record<string, boolean>>({})
  const {
    activeProviderId,
    availableModelIds,
    availableModelReasoningEfforts,
    codexCliMissingError,
    isUpdatingSpeedMode,
    selectedModelId,
    selectedReasoningEffort,
    selectedSpeedMode,
    applyFallbackModelSelection,
    buildPendingTurnDetails,
    pruneThreadModelState,
    readModelIdForThread,
    refreshModelPreferences,
    resolveThreadModelForProvider,
    setSelectedModelId,
    setSelectedModelIdForThread,
    setSelectedReasoningEffort,
    setThreadModelId,
    setThreadModelProviderId,
    syncSelectedThreadModel,
    updateSelectedSpeedMode,
  } = createDesktopModelPreferences({ selectedThreadId, error })
  const {
    availableCollaborationModes,
    selectedCollaborationMode,
    pruneThreadCollaborationState,
    refreshCollaborationModes,
    setSelectedCollaborationMode,
    setSelectedCollaborationModeForThread,
    syncSelectedThreadCollaborationMode,
  } = createDesktopCollaborationPreferences(selectedThreadId)
  const readStateByThreadId = ref<Record<string, string>>(loadReadStateMap())
  const unreadCutoffIso = ref(loadUnreadCutoffIso())
  const {
    projectDisplayNameById,
    projectOrder,
    pinProjectToTop,
    removeProject,
    renameProject,
    reorderProject,
    setProjectDisplayNames,
    setProjectOrder,
  } = createDesktopProjectOrganization({
    sourceGroups,
    projectGroups,
    selectedThreadId,
    applyThreadFlags,
    pruneThreadScopedState,
    setSelectedThreadId,
  })
  const resumedThreadById = ref<Record<string, boolean>>({})
  const turnIndexByTurnIdByThreadId = ref<Record<string, Record<string, number>>>({})
  const turnSummaryByThreadId = ref<Record<string, TurnSummaryState>>({})
  const turnActivityByThreadId = ref<Record<string, TurnActivityState>>({})
  const turnErrorByThreadId = ref<Record<string, TurnErrorState>>({})
  const activeTurnIdByThreadId = ref<Record<string, string>>({})

  const messageHistoryLoading = createDesktopMessageHistoryLoading({
    selectedThreadId,
    error,
    persistedMessagesByThreadId,
    liveAgentMessagesByThreadId,
    inProgressById,
    externalSessionByThreadId,
    resumedThreadById,
    turnIndexByTurnIdByThreadId,
    turnErrorByThreadId,
    activeTurnIdByThreadId,
    markThreadAsRead,
    markThreadMessagesPersisted,
    replaceTurnIndexLookupForThread,
    rebindLiveFileChangeTurnIndices,
    setPersistedMessagesForThread,
    setLiveAgentMessagesForThread,
    clearLiveAgentMessagesForThread,
    removeLiveCommandsPersistedIn,
    removeLiveFileChangesPersistedIn,
    setThreadInProgress,
    setThreadModelProviderId,
    setThreadModelId,
    resolveThreadModelForProvider,
    clearTransientTurnErrorForThread,
    clearCompletedTurnLiveState,
    setTurnErrorForThread,
    getFirstPersistedTurnId,
    currentThreadVersion,
  })
  const {
    ensureThreadMessagesLoaded,
    hasMoreOlderMessagesByThreadId,
    isLoadingMessages,
    loadMessages,
    loadOlderMessages,
    loadedMessagesByThreadId,
    loadedVersionByThreadId,
    loadingOlderMessagesByThreadId,
    pruneMessageHistoryState,
  } = messageHistoryLoading

  const threadTitleCache = createDesktopThreadTitleCache({
    applyThreadFlags,
  })
  const {
    threadTitleById,
    applyCachedTitlesToGroups,
    loadThreadTitleCacheIfNeeded,
    requestThreadTitleGeneration,
  } = threadTitleCache

  const pendingServerRequests = createDesktopPendingServerRequests({
    applyThreadFlags,
    getSelectedThreadId: () => selectedThreadId.value,
  })
  const {
    getThreadPendingRequests,
    loadPendingServerRequestsFromBridge,
    pendingReplyErrorByRequestId,
    pendingReplyErrorForRequest,
    pendingRequestStillExistsOnServer,
    pendingServerRequestsByThreadId,
    prunePendingServerRequestsByActiveThreads,
    readPendingRequestState,
    removePendingServerRequestById,
    replacePendingServerRequests,
    selectedThreadServerRequests,
    upsertPendingServerRequest,
  } = pendingServerRequests

  const reasoningTimelineDeps: ReasoningTimelineDeps = {
    liveReasoningTextByThreadId,
    persistedReasoningByThreadId,
    turnIndexByTurnIdByThreadId,
    activeTurnIdByThreadId,
    activeReasoningTurnIdByThreadId,
    reasoningItemTextByItemId,
    reasoningAppendedTextByItemId,
    turnItemSequenceByThreadId,
    appendLiveReasoningText: (threadId: string, delta: string) => reasoningWrites.appendLiveReasoningText(threadId, delta),
    clearLiveReasoningSnapshot: (threadId: string) => reasoningWrites.clearLiveReasoningSnapshot(threadId),
    savePersistedReasoningMap,
  }
  const interruptBlockedUntilPersistedByThreadId = ref<Record<string, boolean>>({})
  const threadListedByServerById = ref<Record<string, boolean>>({})
  const persistedUserMessageByThreadId = ref<Record<string, boolean>>({})

  // 需求 9 UI 优化：turn/interrupt 中断一个尚未产出 agent 输出的 turn 时，服务端会
  // 把该 turn（含用户消息）从线程历史整体移除（事务式回滚）。检测到该场景后把未
  // 提交的用户消息载荷存于此，供 UI 回填输入框并提示，避免用户以为消息丢失。
  const interruptedUnsubmittedByThreadId = ref<Record<string, InterruptRecoverPayload>>({})
  const pendingTurnRequestByThreadId = ref<Record<string, PendingTurnRequest>>({})
  const {
    accountRateLimitSnapshots,
    codexQuota,
    refreshRateLimits,
    scheduleRateLimitRefresh,
    setCodexRateLimit,
    stopRateLimitRefresh,
  } = createDesktopRateLimits()
  const threadTokenUsageByThreadId = ref<Record<string, UiThreadTokenUsage>>(loadThreadTokenUsageMap())
  const terminalOpenByThreadId = ref<Record<string, boolean>>(loadThreadTerminalOpenMap())

  const isSendingMessage = ref(false)
  const isInterruptingTurn = ref(false)
  const isRollingBack = ref(false)
  const compactingThreadIds = ref(new Set<string>())
  const COMPACT_STATE_TIMEOUT_MS = 60_000
  const fuzzyFileSearchResults = ref<Array<{ path: string }>>([])
  let fuzzyFileSearchSessionId = ''

  const isPolling = ref(false)

  function extractLocalImagePathFromUrl(value: string): string {
    try {
      const parsed = new URL(value, 'http://localhost')
      if (parsed.pathname !== '/codex-local-image') return ''
      return parsed.searchParams.get('path')?.trim() ?? ''
    } catch {
      return ''
    }
  }

  function shouldReuseAttachedImageFromPrompt(promptText: string): boolean {
    const normalized = promptText.trim().toLowerCase()
    if (!normalized) return false
    return /\b(attached image|attached screenshot|save the attached|copy (the )?screenshot|save screenshot)\b/i.test(normalized)
  }

  function findLatestUserLocalImageUrl(threadId: string): string {
    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    for (let index = persisted.length - 1; index >= 0; index -= 1) {
      const message = persisted[index]
      if (message.role !== 'user' || !Array.isArray(message.images) || message.images.length === 0) continue
      for (let imageIndex = message.images.length - 1; imageIndex >= 0; imageIndex -= 1) {
        const imageUrl = message.images[imageIndex]?.trim() ?? ''
        if (!imageUrl) continue
        if (extractLocalImagePathFromUrl(imageUrl)) return imageUrl
      }
    }
    return ''
  }
  let stopNotificationStream: (() => void) | null = null
  let eventSyncTimer: number | null = null
  const delayedTurnSyncTimerByThreadId = new Map<string, number>()
  let pendingThreadsRefresh = false
  let pendingThreadsRefreshForce = false
  const pendingThreadMessageRefresh = new Set<string>()
  let hasHydratedWorkspaceRootsState = false
  let activeReasoningItemId = ''
  let shouldAutoScrollOnNextAgentEvent = false
  const pendingTurnStartsById = new Map<string, TurnStartedInfo>()
  const fallbackRetryInFlightThreadIds = new Set<string>()

  const threadListLoading = createDesktopThreadListLoading({
    selectedThreadId,
    projectGroups,
    inProgressById,
    applyThreadGroups,
    hydrateWorkspaceRootsStateIfNeeded,
    loadThreadTitleCacheIfNeeded,
    loadWorkspaceRootsStateForThreadList,
    pruneThreadScopedState,
    setSelectedThreadId,
  })

  const allThreads = computed(() => flattenThreads(projectGroups.value))
  const selectedThread = computed(() =>
    allThreads.value.find((thread) => thread.id === selectedThreadId.value) ?? null,
  )
  const {
    appendStashedMessage,
    autoCompactThreshold,
    clearQueueState,
    enqueueQueuedMessage,
    findQueuedMessage,
    findStashedMessage,
    getStashedMessages,
    loadPersistedQueueStateIfNeeded,
    pruneQueueState,
    removeQueuedMessage,
    reorderQueuedMessage,
    scheduleQueueStateRefresh,
    selectedThreadQueuedMessages,
    setAutoCompactThreshold,
    takeStashedMessages,
  } = createDesktopQueueState(selectedThreadId)
  const {
    hooksList,
    installedSkills,
    isHooksLoading,
    refreshHooks,
    refreshSkills,
  } = createDesktopCatalogs({
    getSelectedCwd: () => selectedThread.value?.cwd ?? '',
  })
  const selectedThreadTerminalOpen = computed(() => {
    const threadId = selectedThreadId.value
    return Boolean(threadId && terminalOpenByThreadId.value[threadId] === true)
  })
  const isSelectedThreadInterruptPending = computed(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return false
    return interruptBlockedUntilPersistedByThreadId.value[threadId] === true
  })
  // round-26：当前选中线程的进行中 turn id（用于 fileChange 块「轮完成后才显示」）
  const selectedActiveTurnId = computed(() => {
    const threadId = selectedThreadId.value
    return threadId ? (activeTurnIdByThreadId.value[threadId] ?? '') : ''
  })
  const selectedLiveOverlay = computed<UiLiveOverlay | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null

    const isInProgress = inProgressById.value[threadId] === true
    const activity = isInProgress ? turnActivityByThreadId.value[threadId] : undefined
    const reasoningText = isInProgress
      ? (liveReasoningTextByThreadId.value[threadId] ?? '').trim()
      : ''
    const liveErrorText = (turnErrorByThreadId.value[threadId]?.message ?? '').trim()
    let latestPersistedTurnErrorText = ''
    if (!isInProgress && liveErrorText) {
      const persistedMessages = persistedMessagesByThreadId.value[threadId] ?? []
      for (let index = persistedMessages.length - 1; index >= 0; index -= 1) {
        const message = persistedMessages[index]
        if (message.messageType !== 'turnError') continue
        latestPersistedTurnErrorText = normalizeMessageText(message.text)
        break
      }
    }
    const errorText =
      !isInProgress && liveErrorText && latestPersistedTurnErrorText === liveErrorText
        ? ''
        : liveErrorText

    if (!isInProgress && !activity && !reasoningText && !errorText) return null
    return {
      activityLabel: activity?.label || 'Thinking',
      activityDetails: activity?.details ?? [],
      reasoningText,
      errorText,
    }
  })
  const selectedThreadTokenUsage = computed<UiThreadTokenUsage | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null
    return threadTokenUsageByThreadId.value[threadId] ?? null
  })
  const messages = computed<UiMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []

    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    const livePlan = livePlanMessagesByThreadId.value[threadId] ?? []
    const liveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
    const liveCommands = liveCommandsByThreadId.value[threadId] ?? []
    const liveFileChanges = liveFileChangeMessagesByThreadId.value[threadId] ?? []
    const injected = injectedSystemMessagesByThreadId.value[threadId] ?? []
    // 本地存档的 thinking（app-server 不持久化 reasoning，见 rememberPersistedReasoning）
    const persistedReasoning = persistedReasoningByThreadId.value[threadId] ?? []

    // When a compaction is not in progress and a compaction.done row already
    // exists in persisted messages (ContextCompaction item), drop stale injected
    // rows — both pending AND done — so the spinner never shows next to a done
    // row and the persisted row is never duplicated by the injected one.
    // (round-27：此前只过滤 injected 的 pending，注入的 done 会与持久化的
    // compaction.done 并存 → 消息列表出现两个「Context compacted」块，
    // 刷新后 injected 被重置只剩持久化一条，表现为「压缩时两个、刷新后一个」。)
    const persistedHasCompactionDone = persisted.some(
      (message) => message.messageType === 'compaction.done',
    )
    const compactionStillActive = compactingThreadIds.value.has(threadId)
    const effectiveInjected = persistedHasCompactionDone && !compactionStillActive
      ? injected.filter(
          (message) => message.messageType !== 'compaction.pending' && message.messageType !== 'compaction.done',
        )
      : injected

    const combined = mergeThreadMessageStreams(
      threadId,
      persisted,
      persistedReasoning,
      [livePlan, liveCommands, liveFileChanges, liveAgent],
      effectiveInjected,
    )

    const summary = turnSummaryByThreadId.value[threadId]
    const withSummary = summary ? insertTurnSummaryMessage(combined, summary) : combined
    // round-65：合入持久化的各轮耗时（live turn 摘要已插入时跳过，避免重复）。
    return insertPersistedTurnDurations(withSummary, persistedTurnDurationsByThreadId.value[threadId])
  })
  // 需求 9：当前线程「中断后服务端移除未提交 turn」时待回填的用户消息载荷
  const interruptedUnsubmittedMessage = computed<InterruptRecoverPayload | null>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return null
    return interruptedUnsubmittedByThreadId.value[threadId] ?? null
  })
  const hasMoreOlderMessages = computed(() => {
    const threadId = selectedThreadId.value
    return threadId ? hasMoreOlderMessagesByThreadId.value[threadId] === true : false
  })
  const isLoadingOlderMessages = computed(() => {
    const threadId = selectedThreadId.value
    return threadId ? loadingOlderMessagesByThreadId.value[threadId] === true : false
  })

  function getFirstPersistedTurnId(threadId: string): string {
    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    for (const message of persisted) {
      const turnId = message.turnId?.trim() ?? ''
      if (turnId) return turnId
    }
    return ''
  }

  function setSelectedThreadId(nextThreadId: string, options: { persist?: boolean } = {}): void {
    if (selectedThreadId.value === nextThreadId) return
    selectedThreadId.value = nextThreadId
    if (options.persist !== false) {
      saveSelectedThreadId(nextThreadId)
    }
    syncSelectedThreadModel(nextThreadId)
    syncSelectedThreadCollaborationMode(nextThreadId)
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
  }

  function setThreadTokenUsage(threadId: string, usage: UiThreadTokenUsage | null): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    if (!usage) {
      if (!(normalizedThreadId in threadTokenUsageByThreadId.value)) return
      threadTokenUsageByThreadId.value = omitKey(threadTokenUsageByThreadId.value, normalizedThreadId)
      saveThreadTokenUsageMap(threadTokenUsageByThreadId.value)
      return
    }

    const current = threadTokenUsageByThreadId.value[normalizedThreadId]
    if (current && JSON.stringify(current) === JSON.stringify(usage)) return

    threadTokenUsageByThreadId.value = {
      ...threadTokenUsageByThreadId.value,
      [normalizedThreadId]: usage,
    }
    saveThreadTokenUsageMap(threadTokenUsageByThreadId.value)
    // 刷新恢复：线程上下文用量同步到达后，若该线程有暂存消息则继续
    // 「检查用量 → 压缩（如需）→ 补发」流程（见方案 3.4 刷新恢复）。
    const stashed = getStashedMessages(normalizedThreadId)
    if (stashed && stashed.length > 0 && autoCompactThreshold.value > 0) {
      const shouldCompact = usage.remainingContextPercent !== null
        && usage.remainingContextPercent <= autoCompactThreshold.value
      if (shouldCompact) {
        if (!compactingThreadIds.value.has(normalizedThreadId)) {
          void compactThreadById(normalizedThreadId)
        }
      } else {
        void flushStashedForThread(normalizedThreadId)
      }
    }
  }

  function setPendingTurnRequest(threadId: string, request: PendingTurnRequest): void {
    pendingTurnRequestByThreadId.value = {
      ...pendingTurnRequestByThreadId.value,
      [threadId]: request,
    }
  }

  function clearPendingTurnRequest(threadId: string): void {
    if (!pendingTurnRequestByThreadId.value[threadId]) return
    pendingTurnRequestByThreadId.value = omitKey(pendingTurnRequestByThreadId.value, threadId)
  }



  async function retryPendingTurnWithFallback(threadId: string): Promise<void> {
    if (fallbackRetryInFlightThreadIds.has(threadId)) return
    const pending = pendingTurnRequestByThreadId.value[threadId]
    if (!pending || pending.fallbackRetried) return

    fallbackRetryInFlightThreadIds.add(threadId)
    setPendingTurnRequest(threadId, {
      ...pending,
      fallbackRetried: true,
    })

    try {
      await applyFallbackModelSelection(threadId)
      // Remove the failed user turn before replaying on fallback model to avoid duplicated user messages.
      try {
        const rolledBackMessages = await rollbackThread(threadId, 1)
        setPersistedMessagesForThread(threadId, rolledBackMessages)
        clearLivePlansForThread(threadId)
        setLiveAgentMessagesForThread(threadId, [])
        clearLiveReasoningForThread(threadId)
        if (liveCommandsByThreadId.value[threadId]) {
          liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
        }
      } catch {
        // If rollback fails, continue with retry rather than dropping the turn.
      }
      setTurnErrorForThread(threadId, null)
      error.value = ''
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(threadId, {
        label: 'Thinking',
        details: buildPendingTurnDetails(MODEL_FALLBACK_ID, pending.effort, pending.collaborationMode),
      })
      setThreadInProgress(threadId, true)

      if (resumedThreadById.value[threadId] !== true) {
        const resumedThread = await resumeThread(threadId)
        if (resumedThread.model) {
          setThreadModelId(threadId, resolveThreadModelForProvider(threadId, resumedThread.model, resumedThread.modelProvider))
        }
        if (resumedThread.modelProvider) {
          setThreadModelProviderId(threadId, resumedThread.modelProvider)
        }
        resumedThreadById.value = {
          ...resumedThreadById.value,
          [threadId]: true,
        }
      }

      await startThreadTurn(
        threadId,
        pending.text,
        pending.imageUrls,
        MODEL_FALLBACK_ID,
        pending.effort || undefined,
        pending.skills.length > 0 ? pending.skills : undefined,
        pending.fileAttachments,
        pending.collaborationMode,
      )

      scheduleRateLimitRefresh()
      pendingThreadMessageRefresh.add(threadId)
      await syncFromNotifications()
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
    } finally {
      fallbackRetryInFlightThreadIds.delete(threadId)
    }
  }

  function clearDelayedTurnSync(threadId: string): void {
    if (!threadId || typeof window === 'undefined') return
    const timerId = delayedTurnSyncTimerByThreadId.get(threadId)
    if (timerId === undefined) return
    window.clearTimeout(timerId)
    delayedTurnSyncTimerByThreadId.delete(threadId)
  }

  function scheduleDelayedTurnSync(threadId: string): void {
    if (!threadId || typeof window === 'undefined') return
    clearDelayedTurnSync(threadId)
    const timerId = window.setTimeout(() => {
      delayedTurnSyncTimerByThreadId.delete(threadId)
      pendingThreadMessageRefresh.add(threadId)
      void syncFromNotifications()
    }, TURN_START_FOLLOW_UP_SYNC_DELAY_MS)
    delayedTurnSyncTimerByThreadId.set(threadId, timerId)
  }

  function applyThreadFlags(): void {
    const withTitles = applyCachedTitlesToGroups(sourceGroups.value)
    const flaggedGroups: UiProjectGroup[] = withTitles.map((group) => ({
      projectName: group.projectName,
      threads: group.threads.map((thread) => {
        const externalSession = externalSessionByThreadId.value[thread.id] ?? thread.externalSession ?? null
        const inProgress = inProgressById.value[thread.id] === true || externalSession?.active === true
        const pendingRequestState = readPendingRequestState(getThreadPendingRequests(thread.id))
        const isSelected = selectedThreadId.value === thread.id
        const unreadByEvent = eventUnreadByThreadId.value[thread.id] === true
        const unreadByTime = isThreadUnreadByLastRead(
          thread.updatedAtIso,
          readStateByThreadId.value[thread.id],
          unreadCutoffIso.value,
        )
        const unread = !isSelected && !inProgress && (unreadByEvent || unreadByTime)

        return {
          ...thread,
          inProgress,
          unread,
          pendingRequestState,
          ...(externalSession ? { externalSession } : {}),
        }
      }),
    }))
    projectGroups.value = mergeThreadGroups(projectGroups.value, flaggedGroups)
  }

  function insertOptimisticThread(threadId: string, cwd: string, firstMessageText: string): void {
    const nowIso = new Date().toISOString()
    const normalizedCwd = normalizePathForUi(cwd)
    const projectName = toProjectName(normalizedCwd)
    const nextThread: UiThread = {
      id: threadId,
      title: toOptimisticThreadTitle(firstMessageText),
      projectName,
      cwd: normalizedCwd,
      hasWorktree: normalizedCwd.includes('/.codex/worktrees/') || normalizedCwd.includes('/.git/worktrees/'),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      preview: firstMessageText,
      unread: false,
      inProgress: false,
    }

    const existingGroupIndex = sourceGroups.value.findIndex((group) => group.projectName === projectName)
    if (existingGroupIndex >= 0) {
      const existingGroup = sourceGroups.value[existingGroupIndex]
      const remainingThreads = existingGroup.threads.filter((thread) => thread.id !== threadId)
      const nextGroup: UiProjectGroup = {
        projectName,
        threads: [nextThread, ...remainingThreads],
      }
      const nextGroups = [...sourceGroups.value]
      nextGroups.splice(existingGroupIndex, 1, nextGroup)
      sourceGroups.value = nextGroups
    } else {
      sourceGroups.value = [{ projectName, threads: [nextThread] }, ...sourceGroups.value]
    }

    const nextProjectOrder = mergeProjectOrder(projectOrder.value, sourceGroups.value)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      setProjectOrder(nextProjectOrder)
    }
    applyThreadFlags()
  }

  function pruneThreadScopedState(flatThreads: UiThread[]): void {
    const activeThreadIds = new Set(flatThreads.map((thread) => thread.id))
    const currentThreadId = selectedThreadId.value.trim()
    if (currentThreadId) {
      activeThreadIds.add(currentThreadId)
    }
    pruneThreadModelState(activeThreadIds)
    pruneThreadCollaborationState(activeThreadIds)
    const nextReadState = pruneThreadStateMap(readStateByThreadId.value, activeThreadIds)
    if (nextReadState !== readStateByThreadId.value) {
      readStateByThreadId.value = nextReadState
      saveReadStateMap(nextReadState)
    }
    pruneMessageHistoryState(activeThreadIds)
    resumedThreadById.value = pruneThreadStateMap(resumedThreadById.value, activeThreadIds)
    turnIndexByTurnIdByThreadId.value = pruneThreadStateMap(turnIndexByTurnIdByThreadId.value, activeThreadIds)
    persistedMessagesByThreadId.value = pruneThreadStateMap(persistedMessagesByThreadId.value, activeThreadIds)
    liveAgentMessagesByThreadId.value = pruneThreadStateMap(liveAgentMessagesByThreadId.value, activeThreadIds)
    liveReasoningTextByThreadId.value = pruneThreadStateMap(liveReasoningTextByThreadId.value, activeThreadIds)
    liveCommandsByThreadId.value = pruneThreadStateMap(liveCommandsByThreadId.value, activeThreadIds)
    liveFileChangeMessagesByThreadId.value = pruneThreadStateMap(liveFileChangeMessagesByThreadId.value, activeThreadIds)
    turnSummaryByThreadId.value = pruneThreadStateMap(turnSummaryByThreadId.value, activeThreadIds)
    turnActivityByThreadId.value = pruneThreadStateMap(turnActivityByThreadId.value, activeThreadIds)
    turnErrorByThreadId.value = pruneThreadStateMap(turnErrorByThreadId.value, activeThreadIds)
    activeTurnIdByThreadId.value = pruneThreadStateMap(activeTurnIdByThreadId.value, activeThreadIds)
    if (activeReasoningTurnIdByThreadId.size > 0) {
      for (const threadId of [...activeReasoningTurnIdByThreadId.keys()]) {
        if (!activeThreadIds.has(threadId)) activeReasoningTurnIdByThreadId.delete(threadId)
      }
    }
    pruneLiveMessageSortKeysByActiveThreads(activeThreadIds)
    interruptBlockedUntilPersistedByThreadId.value = pruneThreadStateMap(
      interruptBlockedUntilPersistedByThreadId.value,
      activeThreadIds,
    )
    threadListedByServerById.value = pruneThreadStateMap(threadListedByServerById.value, activeThreadIds)
    persistedUserMessageByThreadId.value = pruneThreadStateMap(persistedUserMessageByThreadId.value, activeThreadIds)
    pruneQueueState(activeThreadIds)
    threadTokenUsageByThreadId.value = pruneThreadStateMap(threadTokenUsageByThreadId.value, activeThreadIds)
    eventUnreadByThreadId.value = pruneThreadStateMap(eventUnreadByThreadId.value, activeThreadIds)
    inProgressById.value = pruneThreadStateMap(inProgressById.value, activeThreadIds)
    prunePendingServerRequestsByActiveThreads(activeThreadIds)
  }

  function markThreadAsRead(threadId: string): void {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    if (!thread) return

    readStateByThreadId.value = {
      ...readStateByThreadId.value,
      [threadId]: thread.updatedAtIso,
    }
    saveReadStateMap(readStateByThreadId.value)
    if (eventUnreadByThreadId.value[threadId]) {
      eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, threadId)
    }
    applyThreadFlags()
  }

  function setTurnSummaryForThread(threadId: string, summary: TurnSummaryState | null): void {
    if (!threadId) return

    const previous = turnSummaryByThreadId.value[threadId]
    if (summary) {
      if (areTurnSummariesEqual(previous, summary)) return
      turnSummaryByThreadId.value = {
        ...turnSummaryByThreadId.value,
        [threadId]: summary,
      }
    } else {
      if (previous) {
        turnSummaryByThreadId.value = omitKey(turnSummaryByThreadId.value, threadId)
      }
    }
  }

  // round-65：轮耗时持久化。app-server 不持久化 turn 完成耗时（仅流式通知），
  // 这里把每轮耗时记入本地存档并镜像到服务端 sidecar，刷新/换浏览器后仍能恢复
  // 「本轮过程」标题旁的耗时徽标。
  function rememberTurnDuration(threadId: string, turnId: string, durationMs: number): void {
    if (!threadId || !turnId) return
    const perThread = { ...(persistedTurnDurationsByThreadId.value[threadId] ?? {}) }
    const normalized = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0
    if (normalized <= 0) {
      delete perThread[turnId]
    } else {
      perThread[turnId] = normalized
    }
    if (Object.keys(perThread).length === 0) {
      persistedTurnDurationsByThreadId.value = omitKey(persistedTurnDurationsByThreadId.value, threadId)
    } else {
      persistedTurnDurationsByThreadId.value = {
        ...persistedTurnDurationsByThreadId.value,
        [threadId]: perThread,
      }
    }
    savePersistedTurnDurationMap(persistedTurnDurationsByThreadId.value)
  }

  function setThreadInProgress(threadId: string, nextInProgress: boolean): void {
    if (!threadId) return
    const currentValue = inProgressById.value[threadId] === true
    if (currentValue === nextInProgress) return
    if (nextInProgress) {
      inProgressById.value = {
        ...inProgressById.value,
        [threadId]: true,
      }
      // round-27：恢复上次的快照思考文本（刷新后 overlay 不空白）
      restoreLiveReasoningSnapshot(threadId)
    } else {
      inProgressById.value = omitKey(inProgressById.value, threadId)
      clearCompletedTurnLiveState(threadId)
      clearInterruptPersistenceGate(threadId)
      // 线程空闲后补发等待中的暂存消息（如压缩期间用户又发送的消息）。
      void flushStashedForThread(threadId)
    }
    applyThreadFlags()
    if (
      !nextInProgress &&
      !threadListLoading.hasActiveInProgressThreads() &&
      threadListLoading.hasRemainingThreadPages()
    ) {
      threadListLoading.scheduleRemainingThreadPages()
    }
  }

  function clearInterruptPersistenceGate(threadId: string): void {
    if (!threadId) return
    if (interruptBlockedUntilPersistedByThreadId.value[threadId]) {
      interruptBlockedUntilPersistedByThreadId.value = omitKey(interruptBlockedUntilPersistedByThreadId.value, threadId)
    }
    if (threadListedByServerById.value[threadId]) {
      threadListedByServerById.value = omitKey(threadListedByServerById.value, threadId)
    }
    if (persistedUserMessageByThreadId.value[threadId]) {
      persistedUserMessageByThreadId.value = omitKey(persistedUserMessageByThreadId.value, threadId)
    }
  }

  function blockInterruptUntilThreadIsPersisted(threadId: string): void {
    if (!threadId) return
    interruptBlockedUntilPersistedByThreadId.value = {
      ...interruptBlockedUntilPersistedByThreadId.value,
      [threadId]: true,
    }
    if (threadListedByServerById.value[threadId]) {
      threadListedByServerById.value = omitKey(threadListedByServerById.value, threadId)
    }
    if (persistedUserMessageByThreadId.value[threadId]) {
      persistedUserMessageByThreadId.value = omitKey(persistedUserMessageByThreadId.value, threadId)
    }
  }

  function maybeUnblockInterruptForPersistedThread(threadId: string): void {
    if (!threadId) return
    if (interruptBlockedUntilPersistedByThreadId.value[threadId] !== true) return
    if (threadListedByServerById.value[threadId] !== true) return
    if (persistedUserMessageByThreadId.value[threadId] !== true) return
    clearInterruptPersistenceGate(threadId)
  }

  function maybeUnblockInterruptForActiveTurn(threadId: string, turnId: string): void {
    if (!threadId || !turnId) return
    if (interruptBlockedUntilPersistedByThreadId.value[threadId] !== true) return
    clearInterruptPersistenceGate(threadId)
  }

  function markServerListedThreads(serverThreadIds: Set<string>): void {
    const pendingThreadIds = Object.keys(interruptBlockedUntilPersistedByThreadId.value)
    if (pendingThreadIds.length === 0) return

    let nextListedState = threadListedByServerById.value
    let changed = false
    for (const threadId of pendingThreadIds) {
      if (!serverThreadIds.has(threadId) || nextListedState[threadId] === true) continue
      nextListedState = {
        ...nextListedState,
        [threadId]: true,
      }
      changed = true
    }

    if (!changed) return
    threadListedByServerById.value = nextListedState
    for (const threadId of pendingThreadIds) {
      maybeUnblockInterruptForPersistedThread(threadId)
    }
  }

  function markThreadMessagesPersisted(threadId: string, messages: UiMessage[]): void {
    if (!threadId) return
    if (interruptBlockedUntilPersistedByThreadId.value[threadId] !== true) return
    if (!messages.some((message) => message.role === 'user')) return
    if (persistedUserMessageByThreadId.value[threadId] !== true) {
      persistedUserMessageByThreadId.value = {
        ...persistedUserMessageByThreadId.value,
        [threadId]: true,
      }
    }
    maybeUnblockInterruptForPersistedThread(threadId)
  }

  function markThreadUnreadByEvent(threadId: string): void {
    if (!threadId) return
    if (threadId === selectedThreadId.value) return
    if (eventUnreadByThreadId.value[threadId] === true) return
    eventUnreadByThreadId.value = {
      ...eventUnreadByThreadId.value,
      [threadId]: true,
    }
    applyThreadFlags()
  }

  function setTurnActivityForThread(threadId: string, activity: TurnActivityState | null): void {
    if (!threadId) return

    const previous = turnActivityByThreadId.value[threadId]
    if (!activity) {
      if (previous) {
        turnActivityByThreadId.value = omitKey(turnActivityByThreadId.value, threadId)
      }
      return
    }

    const normalizedLabel = sanitizeDisplayText(activity.label) || 'Thinking'
    const incomingDetails = activity.details
      .map((line) => sanitizeDisplayText(line))
      .filter((line) => line.length > 0 && line !== normalizedLabel)
    const mergedDetails = Array.from(new Set([...(previous?.details ?? []), ...incomingDetails])).slice(-3)
    const nextActivity: TurnActivityState = {
      label: normalizedLabel,
      details: mergedDetails,
    }

    if (areTurnActivitiesEqual(previous, nextActivity)) return
    turnActivityByThreadId.value = {
      ...turnActivityByThreadId.value,
      [threadId]: nextActivity,
    }
  }

  function setTurnErrorForThread(
    threadId: string,
    message: string | null,
    options: { transient?: boolean } = {},
  ): void {
    if (!threadId) return

    const previous = turnErrorByThreadId.value[threadId]
    const normalizedMessage = message ? normalizeMessageText(message) : ''
    if (!normalizedMessage) {
      if (previous) {
        turnErrorByThreadId.value = omitKey(turnErrorByThreadId.value, threadId)
      }
      return
    }

    const transient = options.transient === true
    if (previous?.message === normalizedMessage && previous.transient === transient) return

    turnErrorByThreadId.value = {
      ...turnErrorByThreadId.value,
      [threadId]: { message: normalizedMessage, transient },
    }
  }

  function clearTransientTurnErrorForThread(threadId: string): void {
    if (!threadId) return
    if (!turnErrorByThreadId.value[threadId]?.transient) return
    setTurnErrorForThread(threadId, null)
  }

  function clearAllTransientTurnErrors(): void {
    const transientThreadIds = Object.entries(turnErrorByThreadId.value)
      .filter(([, state]) => state?.transient)
      .map(([threadId]) => threadId)
    if (transientThreadIds.length === 0) return

    let nextState = turnErrorByThreadId.value
    for (const threadId of transientThreadIds) {
      nextState = omitKey(nextState, threadId)
    }
    turnErrorByThreadId.value = nextState
  }

  function currentThreadVersion(threadId: string): string {
    const thread = flattenThreads(sourceGroups.value).find((row) => row.id === threadId)
    return thread?.updatedAtIso ?? ''
  }

  function setThreadTerminalOpen(threadId: string, isOpen: boolean): void {
    if (!threadId) return
    const next = { ...terminalOpenByThreadId.value }
    if (isOpen) {
      next[threadId] = true
    } else {
      delete next[threadId]
    }
    terminalOpenByThreadId.value = next
    saveThreadTerminalOpenMap(next)
  }

  function toggleSelectedThreadTerminal(): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    setThreadTerminalOpen(threadId, !selectedThreadTerminalOpen.value)
  }

  function setPersistedMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = persistedMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    persistedMessagesByThreadId.value = {
      ...persistedMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function appendOptimisticUserMessage(
    threadId: string,
    text: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
  ): void {
    const existing = persistedMessagesByThreadId.value[threadId] ?? []
    const nextMessage: UiMessage = {
      id: `optimistic-user:${threadId}:${Date.now()}`,
      role: 'user',
      text,
      images: imageUrls.length > 0 ? [...imageUrls] : undefined,
      skills: skills.length > 0 ? skills.map((skill) => ({ name: skill.name, path: skill.path })) : undefined,
      fileAttachments: fileAttachments.length > 0 ? fileAttachments.map((file) => ({ ...file })) : undefined,
      messageType: 'userMessage.optimistic',
    }
    setPersistedMessagesForThread(threadId, [...existing, nextMessage])
  }

  function setLiveAgentMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    setLiveAgentMessagesForThreadImpl(liveWriteDeps, threadId, nextMessages)
  }

  function clearLiveAgentMessagesForThread(threadId: string): void {
    clearLiveAgentMessagesForThreadImpl(liveWriteDeps, threadId)
  }

  function setLiveFileChangeMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    setLiveFileChangeMessagesForThreadImpl(liveWriteDeps, threadId, nextMessages)
  }

  function setLivePlanMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    setLivePlanMessagesForThreadImpl(liveWriteDeps, threadId, nextMessages)
  }

  function upsertLivePlanMessage(threadId: string, nextMessage: UiMessage): void {
    upsertLivePlanMessageImpl(liveWriteDeps, threadId, nextMessage)
  }

  // round-27：记录该线程最近一次 plan（本地持久化）。部分 provider 下 plan
  // 只实时推送、服务端不持久化，刷新后消息流里没有 plan 消息 → 输入框上方
  // 计划面板消失；这里存一份供 composerPlanPanel 兜底恢复。
  function rememberLastPlan(threadId: string, planMessage: UiMessage): void {
    rememberLastPlanImpl(liveWriteDeps, threadId, planMessage)
  }

  function upsertLiveAgentMessage(threadId: string, nextMessage: UiMessage): void {
    upsertLiveAgentMessageImpl(liveWriteDeps, threadId, nextMessage)
  }

  function upsertLiveFileChangeMessage(threadId: string, nextMessage: UiMessage): void {
    upsertLiveFileChangeMessageImpl(liveWriteDeps, threadId, nextMessage)
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    reasoningWrites.setLiveReasoningText(threadId, text)
  }

  function appendLiveReasoningText(threadId: string, delta: string): void {
    reasoningWrites.appendLiveReasoningText(threadId, delta)
  }

  function restoreLiveReasoningSnapshot(threadId: string): void {
    reasoningWrites.restoreLiveReasoningSnapshot(threadId)
  }

  function recordActiveReasoningTurn(threadId: string): void {
    recordActiveReasoningTurnImpl(reasoningTimelineDeps, threadId)
  }

  function clearLiveReasoningForThread(threadId: string, keepSequence = false): void {
    clearLiveReasoningForThreadImpl(reasoningTimelineDeps, threadId, keepSequence)
  }

  function clearLivePlansForThread(threadId: string): void {
    if (!threadId) return
    if (!(threadId in livePlanMessagesByThreadId.value)) return
    livePlanMessagesByThreadId.value = omitKey(livePlanMessagesByThreadId.value, threadId)
  }

  function clearLiveFileChangesForThread(threadId: string): void {
    if (!threadId) return
    if (!(threadId in liveFileChangeMessagesByThreadId.value)) return
    liveFileChangeMessagesByThreadId.value = omitKey(liveFileChangeMessagesByThreadId.value, threadId)
  }

  function clearCompletedTurnLiveState(threadId: string): void {
    if (!threadId) return
    clearLivePlansForThread(threadId)
    // round-31：对话完成后把本地存档的 plan 从 plan.live 修正为 plan——
    // lastPlanByThreadId 只随 upsert 更新，最后一次 upsert 可能来自
    // turn/plan/updated 或 item/plan/delta（都是 plan.live）。turn 完成即
    // 线程空闲，plan 不再流式，若存档仍是 plan.live，输入框上方的计划面板
    // 会一直显示「更新中」徽标（composerPlanPanel 兜底 streaming 跟随
    // messageType）。这里修正为 plan 并清除 isStreaming 标记。
    const archivedPlan = lastPlanByThreadId.value[threadId]
    if (archivedPlan && archivedPlan.messageType === 'plan.live') {
      const correctedPlan: UiMessage = {
        ...archivedPlan,
        messageType: 'plan',
        plan: archivedPlan.plan ? { ...archivedPlan.plan, isStreaming: false } : archivedPlan.plan,
      }
      lastPlanByThreadId.value = {
        ...lastPlanByThreadId.value,
        [threadId]: correctedPlan,
      }
      saveLastPlanMap(lastPlanByThreadId.value)
    }
    clearLiveReasoningForThread(threadId)
    pruneLiveMessageSortKeys(threadId)
    setTurnActivityForThread(threadId, null)
    if (threadId === selectedThreadId.value) {
      activeReasoningItemId = ''
    }
    if (liveCommandsByThreadId.value[threadId]) {
      liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
    }
    if (activeTurnIdByThreadId.value[threadId]) {
      activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
    }
    clearPendingTurnRequest(threadId)
  }

  function readPlanUpdate(notification: RpcNotification): { threadId: string; message: UiMessage } | null {
    if (notification.method !== 'turn/plan/updated') return null
    const params = asRecord(notification.params)
    const threadId = extractThreadIdFromNotification(notification)
    const turnId = readString(params?.turnId) || readString(params?.turn_id)
    const rawSteps = Array.isArray(params?.plan) ? params?.plan : []
    const steps: UiPlanStep[] = rawSteps
      .map((row) => asRecord(row))
      .map((row) => ({
        step: readString(row?.step),
        status: normalizePlanStepStatus(row?.status),
      }))
      .filter((row) => row.step.length > 0)

    if (!threadId || !turnId) return null

    const explanation = readString(params?.explanation).trim()
    const plan: UiPlanData = {
      explanation: explanation || undefined,
      steps,
      isStreaming: true,
    }
    const turnIndex = turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]

    return {
      threadId,
      message: {
        id: `${turnId}:plan`,
        role: 'assistant',
        text: buildPlanMessageText(plan),
        messageType: 'plan.live',
        plan,
        turnId: turnId || undefined,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      },
    }
  }

  function readPlanDelta(notification: RpcNotification): { threadId: string; message: UiMessage } | null {
    if (notification.method !== 'item/plan/delta') return null
    const params = asRecord(notification.params)
    const threadId = extractThreadIdFromNotification(notification)
    const turnId = readString(params?.turnId) || readString(params?.turn_id)
    const delta = readString(params?.delta)
    if (!threadId || !turnId || !delta) return null

    const messageId = `${turnId}:plan`
    const existing = (livePlanMessagesByThreadId.value[threadId] ?? []).find((message) => message.id === messageId)
    const nextText = `${existing?.text ?? ''}${delta}`
    const nextPlan: UiPlanData | undefined = existing?.plan
      ? { ...existing.plan, isStreaming: true }
      : undefined
    const turnIndex = turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]

    return {
      threadId,
      message: {
        id: messageId,
        role: 'assistant',
        text: nextText,
        messageType: 'plan.live',
        plan: nextPlan,
        turnId: turnId || undefined,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      },
    }
  }

  const liveWriteDeps: LiveWriteDeps = {
    liveCommandsByThreadId,
    liveFileChangeMessagesByThreadId,
    liveAgentMessagesByThreadId,
    livePlanMessagesByThreadId,
    lastPlanByThreadId,
  }

  const turnIndexDeps: TurnIndexDeps = {
    turnIndexByTurnIdByThreadId,
    persistedMessagesByThreadId,
    liveFileChangeMessagesByThreadId,
  }

  function handleServerRequestNotification(notification: RpcNotification): boolean {
    if (notification.method === 'server/request') {
      const request = normalizeServerRequest(notification.params)
      if (!request) return true
      upsertPendingServerRequest(request)
      return true
    }

    if (notification.method === 'server/request/resolved') {
      const row = asRecord(notification.params)
      const id = row?.id
      if (typeof id === 'number' && Number.isInteger(id)) {
        removePendingServerRequestById(id)
      }
      return true
    }

    return false
  }

  function sanitizeDisplayText(value: string): string {
    return value.replace(/\s+/gu, ' ').trim()
  }

  function inferNextTurnIndex(threadId: string): number {
    return inferNextTurnIndexImpl(turnIndexDeps, threadId)
  }

  function setTurnIndexForThread(threadId: string, turnId: string, turnIndex: number): void {
    setTurnIndexForThreadImpl(turnIndexDeps, threadId, turnId, turnIndex)
  }

  function replaceTurnIndexLookupForThread(threadId: string, nextLookup: Record<string, number>): void {
    replaceTurnIndexLookupForThreadImpl(turnIndexDeps, threadId, nextLookup)
  }

  // 供 App.vue 在 plan 本地存档兜底路径解析计划轮序号：刷新后按 turnId 从当前
  // 线程的轮次映射重新解析（live 存档中记录的 turnIndex 可能缺失或过期）。
  function resolveThreadTurnIndex(threadId: string, turnId: string): number | undefined {
    return resolveThreadTurnIndexImpl(turnIndexDeps, threadId, turnId)
  }

  function rebindLiveFileChangeTurnIndices(threadId: string): void {
    rebindLiveFileChangeTurnIndicesImpl(turnIndexDeps, threadId)
  }

  function appendReasoningItemProgress(threadId: string, itemId: string, text: string): void {
    appendReasoningItemProgressImpl(reasoningTimelineDeps, threadId, itemId, text)
  }

  // round-23：记录 item/started|item/completed 的到达顺序（推理项与工具项），
  // 供思考存档按真实时序插回消息流。
  // round-24：real 环境 reasoning 常走 item/reasoning/textDelta / summaryTextDelta
  // 增量通道（不伴随 item/started 的 reasoning 项）。若不记录，buildTurnReasoningItems
  // 拿不到 reasoning 项 → 回退整段存档（无 reasoningAnchorMessageId）→ 刷新后
  // 全部思考按 turnIndex 插到轮首。这里把增量通道的 itemId 也按 reasoning 记录。
  function recordTurnItemOrder(notification: RpcNotification): void {
    recordTurnItemOrderImpl(reasoningTimelineDeps, notification)
  }

  // Plan items also arrive as full item/started + item/completed payloads
  // (alongside the turn/plan/updated / item/plan/delta channels), so the plan
  // panel can appear as soon as the plan exists instead of waiting for a reload.
  function readPlanItemNotification(notification: RpcNotification): { threadId: string; message: UiMessage } | null {
    if (notification.method !== 'item/started' && notification.method !== 'item/completed') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || readString(item.type).toLowerCase() !== 'plan') return null
    const threadId = extractThreadIdFromNotification(notification)
    const turnId = readString(params?.turnId) || readString(params?.turn_id)
    const itemId = readString(item.id)
    const text = readString(item.text)
    if (!threadId || !itemId || !text) return null
    const turnIndex = threadId && turnId
      ? turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
      : undefined
    return {
      threadId,
      message: {
        id: itemId,
        role: 'assistant',
        text,
        messageType: notification.method === 'item/completed' ? 'plan' : 'plan.live',
        plan: parsePlanFromMessageText(text) ?? undefined,
        turnId: turnId || undefined,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      },
    }
  }

  function readCommandExecutionStarted(notification: RpcNotification): UiMessage | null {
    if (notification.method !== 'item/started') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || item.type !== 'commandExecution') return null
    const id = readString(item.id)
    const command = readString(item.command)
    if (!id) return null
    const cwd = typeof item.cwd === 'string' ? item.cwd : null
    const threadId = extractThreadIdFromNotification(notification)
    const turnId = readString(params?.turnId) || readString(params?.turn_id)
    const turnIndex = threadId && turnId
      ? turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
      : undefined
    return {
      id,
      role: 'system',
      text: command,
      messageType: 'commandExecution',
      commandExecution: { command, cwd, status: 'inProgress', aggregatedOutput: '', exitCode: null },
      turnId: turnId || undefined,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
    }
  }

  function readCommandExecutionCompleted(notification: RpcNotification): UiMessage | null {
    if (notification.method !== 'item/completed') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || item.type !== 'commandExecution') return null
    const id = readString(item.id)
    const command = readString(item.command)
    if (!id) return null
    const cwd = typeof item.cwd === 'string' ? item.cwd : null
    const statusRaw = readString(item.status)
    const status: CommandExecutionData['status'] =
      statusRaw === 'failed' ? 'failed' : statusRaw === 'declined' ? 'declined' : statusRaw === 'interrupted' ? 'interrupted' : 'completed'
    const aggregatedOutput = typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : ''
    const exitCode = typeof item.exitCode === 'number' ? item.exitCode : null
    const threadId = extractThreadIdFromNotification(notification)
    const turnId = readString(params?.turnId) || readString(params?.turn_id)
    const turnIndex = threadId && turnId
      ? turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
      : undefined
    return {
      id,
      role: 'system',
      text: command,
      messageType: 'commandExecution',
      commandExecution: { command, cwd, status, aggregatedOutput, exitCode },
      turnId: turnId || undefined,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
    }
  }

  function readCompletedFileChange(notification: RpcNotification): UiMessage | null {
    if (notification.method !== 'item/completed') return null
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    if (!item || item.type !== 'fileChange') return null
    const id = readString(item.id)
    if (!id) return null
    const threadId = readString(params?.threadId)
    const turnId = readString(params?.turnId)
    const turnIndex = threadId && turnId
      ? turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
      : undefined

    const fileChanges = toUiFileChanges(item.changes)
    const fileChangeStatus = normalizeFileChangeStatus(item.status)
    if (fileChanges.length === 0 || fileChangeStatus !== 'completed') return null

    return {
      id,
      role: 'system',
      text: '',
      messageType: 'fileChange',
      fileChangeStatus,
      fileChanges,
      turnId: turnId || undefined,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
    }
  }

  function upsertLiveCommand(threadId: string, msg: UiMessage): void {
    upsertLiveCommandImpl(liveWriteDeps, threadId, msg)
  }

  function removeLiveCommandsPersistedIn(threadId: string, persistedMessages: UiMessage[]): void {
    removeLiveCommandsPersistedInImpl(liveWriteDeps, threadId, persistedMessages)
  }

  function removeLiveFileChangesPersistedIn(threadId: string, persistedMessages: UiMessage[]): void {
    removeLiveFileChangesPersistedInImpl(liveWriteDeps, threadId, persistedMessages)
  }

  function isAgentContentEvent(notification: RpcNotification): boolean {
    if (notification.method === 'item/agentMessage/delta') {
      return true
    }

    const params = asRecord(notification.params)
    if (!params) return false

    if (notification.method === 'item/completed') {
      const item = asRecord(params.item)
      return item?.type === 'agentMessage'
    }

    return false
  }

  type RealtimeEventListener = (method: string) => void
  const realtimeEventListeners = new Set<RealtimeEventListener>()

  function emitRealtimeEvent(method: string): void {
    for (const listener of realtimeEventListeners) {
      try {
        listener(method)
      } catch {
        // A listener failure must not break the notification pipeline.
      }
    }
  }

  function onRealtimeEvent(listener: RealtimeEventListener): () => void {
    realtimeEventListeners.add(listener)
    return () => {
      realtimeEventListeners.delete(listener)
    }
  }

  function upsertLiveFileChangePatch(threadId: string, itemId: string, changes: UiFileChange[]): void {
    upsertLiveFileChangePatchImpl(liveWriteDeps, threadId, itemId, changes)
  }

  function upsertTurnDiff(threadId: string, turnId: string, diff: string): void {
    upsertTurnDiffImpl(liveWriteDeps, threadId, turnId, diff)
  }

  function applyRealtimeUpdates(notification: RpcNotification): void {
    if (handleServerRequestNotification(notification)) {
      return
    }

    // round-23：记录每轮「推理项/工具项」到达顺序，供思考按时序插回消息流。
    recordTurnItemOrder(notification)
    if (notification.method === 'turn/started') {
      const startedThreadId = extractThreadIdFromNotification(notification)
      if (startedThreadId) {
        turnItemSequenceByThreadId.delete(startedThreadId)
      }
    }

    if (KNOWN_IGNORED_NOTIFICATION_METHODS.has(notification.method)) {
      if (import.meta.env?.DEV) {
        console.debug(`[codex-notify] ignore ${notification.method}`)
      }
      return
    }

    if (
      notification.method === 'app/list/updated' ||
      notification.method === 'mcpServer/startupStatus/updated' ||
      notification.method === 'mcpServer/oauthLogin/completed' ||
      notification.method === 'remoteControl/status/changed'
    ) {
      emitRealtimeEvent(notification.method)
      return
    }

    if (notification.method === 'skills/changed') {
      void refreshSkills({ force: true })
      return
    }

    if (notification.method === 'hook/started' || notification.method === 'hook/completed') {
      void refreshHooks({ force: true })
      return
    }

    if (notification.method === 'thread/status/changed') {
      const threadId = extractThreadIdFromNotification(notification)
      // A status change (e.g. another client started a turn) may alter the
      // message payload of the selected thread; queueEventDrivenSync refreshes
      // the thread list for any thread/* notification.
      if (threadId && threadId === selectedThreadId.value) {
        pendingThreadMessageRefresh.add(threadId)
      }
      return
    }

    if (
      notification.method === 'thread/archived' ||
      notification.method === 'thread/unarchived' ||
      notification.method === 'thread/deleted' ||
      notification.method === 'thread/closed'
    ) {
      // queueEventDrivenSync already refreshes the thread list for thread/*
      // notifications; nothing else to do here beyond observability.
      return
    }

    if (notification.method === 'item/fileChange/patchUpdated' || notification.method === 'turn/diff/updated') {
      const params = asRecord(notification.params)
      const threadId = readString(params?.threadId)
      if (threadId) {
        if (notification.method === 'item/fileChange/patchUpdated') {
          upsertLiveFileChangePatch(threadId, readString(params?.itemId), toUiFileChanges(params?.changes))
        } else {
          upsertTurnDiff(threadId, readString(params?.turnId), readString(params?.diff) ?? '')
        }
        if (threadId === selectedThreadId.value) {
          pendingThreadMessageRefresh.add(threadId)
        }
      }
      return
    }

    if (notification.method === 'account/rateLimits/updated') {
      scheduleRateLimitRefresh()
    }

    if (notification.method === 'thread/name/updated') {
      const params = asRecord(notification.params)
      const threadId = readString(params?.threadId)
      const threadName = readString(params?.threadName)
      if (threadId && threadName) {
        // round-24：app-server 推送的 threadName 常是第一轮用户消息全文，
        // 未截断会覆盖本地已收口的 20 字标题。这里统一收口。
        const normalizedName = toOptimisticThreadTitle(threadName)
        threadTitleById.value = { ...threadTitleById.value, [threadId]: normalizedName }
        applyThreadFlags()
        void persistThreadTitle(threadId, normalizedName)
      }
    }

    if (notification.method === 'thread/compacted') {
      const params = asRecord(notification.params)
      const threadId = readString(params?.threadId)
      if (threadId) {
        markThreadCompacting(threadId, false)
        // Surface the compaction as a message inside the thread feed instead of
        // a transient overlay; the injected entry survives later message
        // reloads because it lives in its own store.
        injectCompactionMessage(threadId, 'done')
        // queueEventDrivenSync (called by the notification subscriber) already
        // refreshes the thread list for any thread/* notification; mark the
        // message payload dirty so the compaction summary is re-read too.
        pendingThreadMessageRefresh.add(threadId)
      }
      return
    }

    if (notification.method === 'fuzzyFileSearch/sessionUpdated') {
      const params = asRecord(notification.params)
      const sessionId = readString(params?.sessionId)
      if (sessionId && sessionId === fuzzyFileSearchSessionId) {
        fuzzyFileSearchResults.value = normalizeFuzzyFileSearchResults(params)
      }
      return
    }

    if (notification.method === 'fuzzyFileSearch/sessionCompleted') {
      const params = asRecord(notification.params)
      const sessionId = readString(params?.sessionId)
      if (sessionId && sessionId === fuzzyFileSearchSessionId) {
        fuzzyFileSearchSessionId = ''
      }
      return
    }

    if (notification.method === 'account/rateLimits/updated') {
      setCodexRateLimit(pickCodexRateLimitSnapshot(notification.params))
      return
    }

    const tokenUsageUpdate = readThreadTokenUsageUpdate(notification)
    if (tokenUsageUpdate) {
      setThreadTokenUsage(tokenUsageUpdate.threadId, tokenUsageUpdate.usage)
      return
    }

    const turnActivity = readTurnActivity(notification)
    if (turnActivity) {
      setTurnActivityForThread(turnActivity.threadId, turnActivity.activity)
    }

    const notificationThreadId = extractThreadIdFromNotification(notification)
    const notificationErrorState = readNotificationErrorState(notification)
    if (!notificationErrorState && notificationThreadId) {
      clearTransientTurnErrorForThread(notificationThreadId)
    }

    const startedTurn = readTurnStartedInfo(notification)
    if (startedTurn) {
      pendingTurnStartsById.set(startedTurn.turnId, startedTurn)
      setTurnIndexForThread(startedTurn.threadId, startedTurn.turnId, inferNextTurnIndex(startedTurn.threadId))
      activeTurnIdByThreadId.value = {
        ...activeTurnIdByThreadId.value,
        [startedTurn.threadId]: startedTurn.turnId,
      }
      maybeUnblockInterruptForActiveTurn(startedTurn.threadId, startedTurn.turnId)
      clearLivePlansForThread(startedTurn.threadId)
      clearLiveFileChangesForThread(startedTurn.threadId)
      setTurnSummaryForThread(startedTurn.threadId, null)
      setTurnErrorForThread(startedTurn.threadId, null)
      setThreadInProgress(startedTurn.threadId, true)
      scheduleQueueStateRefresh(startedTurn.threadId)
      if (eventUnreadByThreadId.value[startedTurn.threadId]) {
        eventUnreadByThreadId.value = omitKey(eventUnreadByThreadId.value, startedTurn.threadId)
      }
    }

    const completedTurn = readTurnCompletedInfo(notification)
    const turnErrorMessage = readTurnErrorMessage(notification)
    const completedThreadId = completedTurn?.threadId ?? extractThreadIdFromNotification(notification)
    const completedThreadModelId = completedThreadId ? readModelIdForThread(completedThreadId) : ''
    const shouldRetryWithFallback =
      Boolean(completedThreadId) &&
      Boolean(turnErrorMessage) &&
      completedThreadModelId !== MODEL_FALLBACK_ID &&
      isUnsupportedChatGptModelError(new Error(turnErrorMessage))
    if (completedTurn) {
      const pendingTurnRequest = pendingTurnRequestByThreadId.value[completedTurn.threadId]
      const startedTurnState = pendingTurnStartsById.get(completedTurn.turnId)
      if (startedTurnState) {
        pendingTurnStartsById.delete(completedTurn.turnId)
      }

      const rawDurationMs =
        readNumber(asRecord(notification.params)?.durationMs) ??
        readNumber(asRecord(asRecord(notification.params)?.turn)?.durationMs) ??
        (typeof completedTurn.startedAtMs === 'number'
          ? completedTurn.completedAtMs - completedTurn.startedAtMs
          : null) ??
        (startedTurnState ? completedTurn.completedAtMs - startedTurnState.startedAtMs : null)

      const durationMs = typeof rawDurationMs === 'number' ? Math.max(0, rawDurationMs) : 0
      setTurnSummaryForThread(completedTurn.threadId, {
        turnId: completedTurn.turnId,
        durationMs,
      })
      rememberTurnDuration(completedTurn.threadId, completedTurn.turnId, durationMs)
      if (activeTurnIdByThreadId.value[completedTurn.threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, completedTurn.threadId)
      }
      setThreadInProgress(completedTurn.threadId, false)
      setTurnActivityForThread(completedTurn.threadId, null)
      markThreadUnreadByEvent(completedTurn.threadId)
      if (!shouldRetryWithFallback) {
        clearPendingTurnRequest(completedTurn.threadId)
        scheduleQueueStateRefresh(completedTurn.threadId)
      }
    }

    if (turnErrorMessage) {
      const failedThreadId = completedTurn?.threadId || extractThreadIdFromNotification(notification)
      if (failedThreadId) {
        setTurnErrorForThread(failedThreadId, turnErrorMessage)
      }
      error.value = turnErrorMessage
      if (failedThreadId && shouldRetryWithFallback) {
        void retryPendingTurnWithFallback(failedThreadId)
      }
    } else if (completedTurn) {
      setTurnErrorForThread(completedTurn.threadId, null)
    }

    if (notificationErrorState) {
      const errorThreadId = notificationThreadId
      const errorThreadModelId = errorThreadId ? readModelIdForThread(errorThreadId) : selectedModelId.value.trim()
      if (errorThreadId) {
        setTurnErrorForThread(errorThreadId, notificationErrorState.message, {
          transient: notificationErrorState.transient,
        })
      }
      error.value = notificationErrorState.message
      if (errorThreadModelId !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(new Error(notificationErrorState.message))) {
        if (errorThreadId) {
          void retryPendingTurnWithFallback(errorThreadId)
        } else {
          void applyFallbackModelSelection()
        }
      }
    }

    const planUpdate = readPlanUpdate(notification)
    if (planUpdate) {
      upsertLivePlanMessage(planUpdate.threadId, planUpdate.message)
      setTurnActivityForThread(planUpdate.threadId, {
        label: 'Planning',
        details: planUpdate.message.plan?.steps.map((step) => step.step).slice(0, 2) ?? [],
      })
    }

    const planDelta = readPlanDelta(notification)
    if (planDelta) {
      upsertLivePlanMessage(planDelta.threadId, planDelta.message)
      setTurnActivityForThread(planDelta.threadId, {
        label: 'Planning',
        details: [],
      })
    }

    const planItem = readPlanItemNotification(notification)
    if (planItem) {
      upsertLivePlanMessage(planItem.threadId, planItem.message)
      setTurnActivityForThread(planItem.threadId, {
        label: 'Planning',
        details: planItem.message.plan?.steps.map((step) => step.step).slice(0, 2) ?? [],
      })
    }

    if (!notificationThreadId || notificationThreadId !== selectedThreadId.value) return

    const startedAgentMessageId = readAgentMessageStartedId(notification)
    if (startedAgentMessageId) {
      activeReasoningItemId = ''
    }

    const liveAgentMessageDelta = readAgentMessageDelta(notification)
    if (liveAgentMessageDelta) {
      const existing = (liveAgentMessagesByThreadId.value[notificationThreadId] ?? [])
        .find((message) => message.id === liveAgentMessageDelta.messageId)
      const nextText = `${existing?.text ?? ''}${liveAgentMessageDelta.delta}`
      const turnId = liveAgentMessageDelta.turnId ?? existing?.turnId
      const turnIndex = turnId
        ? turnIndexByTurnIdByThreadId.value[notificationThreadId]?.[turnId]
        : existing?.turnIndex
      upsertLiveAgentMessage(notificationThreadId, {
        id: liveAgentMessageDelta.messageId,
        role: 'assistant',
        text: nextText,
        messageType: 'agentMessage.live',
        turnId,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      })
    }

    const completedAgentMessage = readAgentMessageCompleted(notification)
    if (completedAgentMessage) {
      const turnIndex = completedAgentMessage.turnId
        ? turnIndexByTurnIdByThreadId.value[notificationThreadId]?.[completedAgentMessage.turnId]
        : undefined
      upsertLiveAgentMessage(notificationThreadId, {
        ...completedAgentMessage,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      })
    }

    const completedImageView = readCompletedImageView(notification)
    if (completedImageView) {
      upsertLiveAgentMessage(notificationThreadId, completedImageView)

    }

    const startedReasoningItemId = readReasoningStartedItemId(notification)
    if (startedReasoningItemId) {
      activeReasoningItemId = startedReasoningItemId
      recordActiveReasoningTurn(notificationThreadId)
    }

    const liveReasoningDelta = readReasoningDelta(notification)
    if (liveReasoningDelta) {
      appendLiveReasoningText(notificationThreadId, liveReasoningDelta.delta)
      // round-24：textDelta 增量也累积到 reasoningItemTextByItemId，
      // 让 buildTurnReasoningItems 在轮末能生成带 anchor 的思考存档。
      // （增量通道不伴随 item/started 全量项，此前该 map 无文本 → 回退
      // 整段存档 → 刷新后思考全部插到轮首。）
      accumulateReasoningTextDeltaImpl(reasoningTimelineDeps, liveReasoningDelta.itemId, liveReasoningDelta.delta)
    }

    const reasoningItem = readReasoningItemNotification(notification)
    if (reasoningItem) {
      appendReasoningItemProgress(notificationThreadId, reasoningItem.itemId, reasoningItem.text)
      recordActiveReasoningTurn(notificationThreadId)
    }

    const sectionBreakMessageId = readReasoningSectionBreakMessageId(notification)
    if (sectionBreakMessageId) {
      const current = liveReasoningTextByThreadId.value[notificationThreadId] ?? ''
      if (current.trim().length > 0 && !current.endsWith('\n\n')) {
        setLiveReasoningText(notificationThreadId, `${current}\n\n`)
      }
    }

    const completedReasoningMessageId = readReasoningCompletedId(notification)
    if (completedReasoningMessageId) {
      if (completedReasoningMessageId === liveReasoningMessageId(activeReasoningItemId)) {
        activeReasoningItemId = ''
      }
    }

    const commandStarted = readCommandExecutionStarted(notification)
    if (commandStarted) {
      upsertLiveCommand(notificationThreadId, commandStarted)
      setTurnActivityForThread(notificationThreadId, { label: 'Running command', details: [commandStarted.commandExecution?.command ?? ''] })
    }

    const commandDelta = readCommandOutputDelta(notification)
    if (commandDelta) {
      const current = (liveCommandsByThreadId.value[notificationThreadId] ?? []).find((m) => m.id === commandDelta.itemId)
      if (current?.commandExecution) {
        upsertLiveCommand(notificationThreadId, {
          ...current,
          commandExecution: { ...current.commandExecution, aggregatedOutput: `${current.commandExecution.aggregatedOutput}${commandDelta.delta}` },
        })
      }
    }

    const commandCompleted = readCommandExecutionCompleted(notification)
    if (commandCompleted) {
      upsertLiveCommand(notificationThreadId, commandCompleted)
    }

    const completedFileChange = readCompletedFileChange(notification)
    if (completedFileChange) {
      upsertLiveFileChangeMessage(notificationThreadId, completedFileChange)
    }

    if (isAgentContentEvent(notification)) {
      activeReasoningItemId = ''
      // round-27：中途清理保留时间线（否则该轮后续思考锚点丢失，见
      // clearLiveReasoningForThread 注释），序列与存档在 turn/completed 收口。
      clearLiveReasoningForThread(notificationThreadId, true)
    }

    if (notification.method === 'turn/completed') {
      activeReasoningItemId = ''
      shouldAutoScrollOnNextAgentEvent = false
      clearLiveReasoningForThread(notificationThreadId)
      // round-23：清理本轮推理项文本缓存，避免跨轮残留。
      clearReasoningItemTextCacheImpl(reasoningTimelineDeps)
      if (liveCommandsByThreadId.value[notificationThreadId]) {
        liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, notificationThreadId)
      }
      const completedThreadId = extractThreadIdFromNotification(notification)
      if (completedThreadId) {
        clearDelayedTurnSync(completedThreadId)
        setThreadInProgress(completedThreadId, false)
        setTurnActivityForThread(completedThreadId, null)
        markThreadUnreadByEvent(completedThreadId)
        if (!shouldRetryWithFallback) {
          clearPendingTurnRequest(completedThreadId)
          scheduleQueueStateRefresh(completedThreadId)
        }
      }
    }

  }

  function queueEventDrivenSync(notification: RpcNotification): void {
    if (notification.method === 'thread/tokenUsage/updated') return
    // High-frequency realtime voice blocks are consumed by useRealtimeVoice's
    // own subscription; exclude them so they never force thread-list reloads.
    if (notification.method.startsWith('thread/realtime/')) return

    const method = notification.method
    const shouldRefreshMessages =
      method === 'turn/started' ||
      method === 'turn/completed' ||
      method === 'error'
    const shouldRefreshThreads =
      method.startsWith('thread/') ||
      method === 'turn/completed'

    if (!shouldRefreshMessages && !shouldRefreshThreads) return

    const threadId = extractThreadIdFromNotification(notification)
    if (threadId && shouldRefreshMessages) {
      pendingThreadMessageRefresh.add(threadId)
    }

    if (shouldRefreshThreads) {
      pendingThreadsRefresh = true
      pendingThreadsRefreshForce = true
    }

    if (eventSyncTimer !== null || typeof window === 'undefined') return
    eventSyncTimer = window.setTimeout(() => {
      eventSyncTimer = null
      void syncFromNotifications()
    }, EVENT_SYNC_DEBOUNCE_MS)
  }

  async function hydrateWorkspaceRootsStateIfNeeded(
    groups: UiProjectGroup[],
    rootsState: WorkspaceRootsState | null,
  ): Promise<void> {
    if (hasHydratedWorkspaceRootsState) return
    hasHydratedWorkspaceRootsState = true

    try {
      if (!rootsState) return
      const hydratedOrder: string[] = []
      for (const rootPath of getWorkspaceProjectOrderPaths(rootsState)) {
        const projectName = toProjectNameFromWorkspaceRoot(rootPath)
        if (hydratedOrder.includes(projectName)) continue
        hydratedOrder.push(projectName)
      }

      if (hydratedOrder.length > 0) {
        const mergedOrder = rootsState.projectOrder.length > 0
          ? mergeProjectOrder(hydratedOrder, groups)
          : mergeProjectOrder(projectOrder.value, groups)
        if (!areStringArraysEqual(projectOrder.value, mergedOrder)) {
          setProjectOrder(mergedOrder, { persist: false })
        }
      }

      if (Object.keys(rootsState.labels).length > 0 || (rootsState.remoteProjects ?? []).length > 0) {
        const nextLabels = { ...projectDisplayNameById.value }
        let changed = false
        for (const [rootPath, label] of Object.entries(rootsState.labels)) {
          const normalizedRootPath = normalizePathForUi(rootPath).trim()
          const projectNames = [toProjectNameFromWorkspaceRoot(rootPath)]
          if (normalizedRootPath) projectNames.push(normalizedRootPath)
          for (const projectName of projectNames) {
            if (nextLabels[projectName] === label) continue
            nextLabels[projectName] = label
            changed = true
          }
        }
        for (const rootPath of rootsState.order) {
          const leafName = toProjectNameFromWorkspaceRoot(rootPath)
          const parentLeafName = toProjectName(getPathParent(rootPath))
          if (!parentLeafName.startsWith('.') || parentLeafName === leafName) continue
          const displayName = `${leafName} ${parentLeafName}`
          if (nextLabels[leafName] !== undefined || nextLabels[leafName] === displayName) continue
          nextLabels[leafName] = displayName
          changed = true
        }
        for (const remoteProject of rootsState.remoteProjects ?? []) {
          const label = getRemoteProjectDisplayName(remoteProject)
          if (nextLabels[remoteProject.id] === label) continue
          nextLabels[remoteProject.id] = label
          changed = true
        }
        if (changed) {
          setProjectDisplayNames(nextLabels, { persist: false })
        }
      }
    } catch {
      // Keep local storage fallback when global state is unavailable.
    }
  }

  async function loadWorkspaceRootsStateForThreadList(): Promise<WorkspaceRootsState | null> {
    try {
      return await getWorkspaceRootsState()
    } catch {
      return null
    }
  }

  function filterGroupsByWorkspaceRoots(
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
    const filteredGroups = groupsWithWorkspaceRoots.filter((group) => {
      if (allowedProjectNames.has(group.projectName)) return true
      return isProjectlessGroup(group)
    })
    return orderGroupsByWorkspaceProjectOrder(filteredGroups, rootsState, duplicateLeafNames)
  }

  function applyThreadGroups(groups: UiProjectGroup[], rootsState: WorkspaceRootsState | null): void {
    const visibleGroups = filterGroupsByWorkspaceRoots(groups, rootsState)
    const hasWorkspaceRootsState = Boolean(
      rootsState && (rootsState.order.length > 0 || rootsState.projectOrder.length > 0 || (rootsState.remoteProjects ?? []).length > 0),
    )

    const nextProjectOrder = rootsState?.projectOrder.length
      ? mergeProjectOrder(
        getWorkspaceProjectOrderNames(rootsState, collectDuplicateProjectLeafNames(groups, rootsState)),
        visibleGroups,
      )
      : mergeProjectOrder(projectOrder.value, visibleGroups)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      setProjectOrder(nextProjectOrder, { persist: !hasWorkspaceRootsState })
    }

    const orderedGroups = orderGroupsByProjectOrder(visibleGroups, projectOrder.value)
    markServerListedThreads(new Set(flattenThreads(orderedGroups).map((thread) => thread.id)))
    const mergedWithInProgress = mergeIncomingWithLocalInProgressThreads(
      sourceGroups.value,
      orderedGroups,
      inProgressById.value,
    )
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, mergedWithInProgress)
    inProgressById.value = pruneThreadStateMap(
      inProgressById.value,
      new Set(flattenThreads(sourceGroups.value).map((thread) => thread.id)),
    )
    const listedThreadIds = new Set(flattenThreads(sourceGroups.value).map((thread) => thread.id))
    const nextExternalSessions: Record<string, UiExternalSession | null> = {}
    for (const thread of flattenThreads(sourceGroups.value)) {
      nextExternalSessions[thread.id] = thread.externalSession ?? externalSessionByThreadId.value[thread.id] ?? null
    }
    externalSessionByThreadId.value = nextExternalSessions
    applyThreadFlags()
  }

  function removeArchivedThreadFromLoadedLists(threadId: string): void {
    threadListLoading.removeThreadFromLoadedLists(threadId)
    sourceGroups.value = removeThreadFromGroups(sourceGroups.value, threadId)
    inProgressById.value = omitKey(inProgressById.value, threadId)
    applyThreadFlags()
  }


  async function refreshAncillaryState(
    options: { providerChanged?: boolean; includeProviderModels?: boolean } = {},
  ): Promise<void> {
    await Promise.allSettled([
      refreshModelPreferences({
        providerChanged: options.providerChanged,
        includeProviderModels: options.includeProviderModels,
      }),
      refreshRateLimits(),
      refreshCollaborationModes(),
      refreshSkills(),
    ])
  }

  function scheduleAncillaryStateRefresh(
    options: { providerChanged?: boolean; includeProviderModels?: boolean } = {},
  ): void {
    const run = () => {
      void refreshAncillaryState(options)
    }

    if (typeof window === 'undefined') {
      run()
      return
    }

    window.setTimeout(run, 0)
  }

  async function refreshAll(
    options: { includeSelectedThreadMessages?: boolean; awaitAncillaryRefreshes?: boolean; providerChanged?: boolean; forceThreadRefresh?: boolean } = {},
  ) {
    error.value = ''
    codexCliMissingError.value = ''
    const includeSelectedThreadMessages = options.includeSelectedThreadMessages !== false
    const awaitAncillaryRefreshes = options.awaitAncillaryRefreshes === true

    try {
      await loadPersistedQueueStateIfNeeded()
      await threadListLoading.loadThreads({ force: options.forceThreadRefresh === true })
      if (includeSelectedThreadMessages) {
        try {
          await loadMessages(selectedThreadId.value)
        } catch (unknownError) {
          error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        }
      }
      if (awaitAncillaryRefreshes) {
        await refreshAncillaryState({
          providerChanged: options.providerChanged,
          includeProviderModels: options.providerChanged === true || awaitAncillaryRefreshes,
        })
      } else {
        scheduleAncillaryStateRefresh({
          providerChanged: options.providerChanged,
          includeProviderModels: false,
        })
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      if (isCodexCliMissingError(unknownError)) {
        codexCliMissingError.value = CODEX_CLI_MISSING_MESSAGE
      } else {
        codexCliMissingError.value = ''
      }
    }
  }

  async function selectThread(threadId: string): Promise<SelectThreadResult> {
    setSelectedThreadId(threadId)

    try {
      await loadMessages(threadId)
      await refreshModelPreferences({ includeProviderModels: true })
      void refreshSkills()
      return 'ok'
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      error.value = message
      const result = isThreadNotFoundError(unknownError) ? 'not-found' : 'error'
      if (threadId.trim()) {
        setTurnErrorForThread(threadId, message, { transient: true })
      }
      return result
    }
  }

  async function archiveThreadById(threadId: string) {
    const wasSelectedThread = selectedThreadId.value === threadId
    const nextSelectedThreadId = wasSelectedThread
      ? findAdjacentThreadId(flattenThreads(projectGroups.value), threadId)
      : ''

    if (wasSelectedThread) {
      setSelectedThreadId(nextSelectedThreadId)
      if (nextSelectedThreadId) {
        void loadMessages(nextSelectedThreadId, { silent: true })
      }
    }

    try {
      await archiveThread(threadId)
      removeArchivedThreadFromLoadedLists(threadId)
      await threadListLoading.loadThreads()

      if (wasSelectedThread && nextSelectedThreadId && selectedThreadId.value === nextSelectedThreadId) {
        await ensureThreadMessagesLoaded(nextSelectedThreadId, { silent: true })
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function renameThreadById(threadId: string, threadName: string) {
    const normalizedName = threadName.trim()
    if (!threadId || !normalizedName) return

    try {
      await renameThread(threadId, normalizedName)
      threadTitleById.value = { ...threadTitleById.value, [threadId]: normalizedName }
      applyThreadFlags()
      void persistThreadTitle(threadId, normalizedName)
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
    }
  }

  async function forkThreadById(threadId: string): Promise<string> {
    const sourceThreadId = threadId.trim()
    if (!sourceThreadId) return ''

    const sourceThread = flattenThreads(sourceGroups.value).find((row) => row.id === sourceThreadId)
    const sourceCwd = sourceThread?.cwd?.trim() ?? ''
    const sourceTitle = sourceThread?.title?.trim() ?? 'Forked chat'
    const selectedModel = readModelIdForThread(sourceThreadId)
    error.value = ''

    try {
      const forkedThread = await forkThread(sourceThreadId, sourceCwd || undefined, selectedModel || undefined)
      const nextThreadId = forkedThread.threadId.trim()
      if (!nextThreadId) return ''

      insertOptimisticThread(nextThreadId, sourceCwd, sourceTitle)
      setThreadModelId(nextThreadId, forkedThread.model)
      resumedThreadById.value = {
        ...resumedThreadById.value,
        [nextThreadId]: true,
      }
      setSelectedThreadId(nextThreadId)
      await threadListLoading.loadThreads()
      await loadMessages(nextThreadId)
      return nextThreadId
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      return ''
    }
  }

  async function forkThreadFromTurn(threadId: string, turnIndex: number): Promise<string> {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Number.isInteger(turnIndex) || turnIndex < 0) return ''

    if (inProgressById.value[normalizedThreadId] === true) {
      error.value = 'Finish the current turn before forking from a response.'
      return ''
    }

    if (loadedMessagesByThreadId.value[normalizedThreadId] !== true) {
      try {
        await loadMessages(normalizedThreadId)
      } catch (unknownError) {
        error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        return ''
      }
    }

    const sourceMessages = persistedMessagesByThreadId.value[normalizedThreadId] ?? []
    let lastTurnIndex = -1
    for (const message of sourceMessages) {
      if (typeof message.turnIndex === 'number' && Number.isFinite(message.turnIndex)) {
        lastTurnIndex = Math.max(lastTurnIndex, message.turnIndex)
      }
    }

    if (lastTurnIndex >= 0 && turnIndex > lastTurnIndex) return ''

    const sourceThread = flattenThreads(sourceGroups.value).find((row) => row.id === normalizedThreadId) ?? null

    try {
      error.value = ''
      const forked = await forkThread(normalizedThreadId)
      const forkedThreadId = forked.threadId.trim()
      if (!forkedThreadId) return ''

      const forkedCwd = forked.cwd.trim() || sourceThread?.cwd?.trim() || ''
      const forkedThreadTitle = toForkedThreadTitle(sourceThread?.title || sourceThread?.preview || 'Untitled thread')
      insertOptimisticThread(forkedThreadId, forkedCwd, forkedThreadTitle)
      setThreadModelId(forkedThreadId, forked.model)
      setPersistedMessagesForThread(forkedThreadId, forked.messages)
      loadedMessagesByThreadId.value = {
        ...loadedMessagesByThreadId.value,
        [forkedThreadId]: true,
      }
      resumedThreadById.value = {
        ...resumedThreadById.value,
        [forkedThreadId]: true,
      }
      clearLivePlansForThread(forkedThreadId)
      setLiveAgentMessagesForThread(forkedThreadId, [])
      clearLiveReasoningForThread(forkedThreadId)
      if (liveCommandsByThreadId.value[forkedThreadId]) {
        liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, forkedThreadId)
      }
      setTurnSummaryForThread(forkedThreadId, null)
      setTurnActivityForThread(forkedThreadId, null)
      setTurnErrorForThread(forkedThreadId, null)
      setThreadInProgress(forkedThreadId, false)

      const turnsToRollback = lastTurnIndex - turnIndex
      if (turnsToRollback > 0) {
        const rolledBackMessages = await rollbackThread(forkedThreadId, turnsToRollback)
        setPersistedMessagesForThread(forkedThreadId, rolledBackMessages)
      }

      await renameThreadById(forkedThreadId, forkedThreadTitle)
      setSelectedThreadId(forkedThreadId)
      void threadListLoading.loadThreads().catch(() => {})
      return forkedThreadId
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      return ''
    }
  }

  async function maybeReplyToPendingUserInputRequest(
    threadId: string,
    text: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<boolean> {
    if (!threadId || !text.trim()) return false
    if (imageUrls.length > 0 || skills.length > 0 || fileAttachments.length > 0) return false

    const requests = pendingServerRequestsByThreadId.value[threadId] ?? []
    const userInputRequests = requests.filter((request) => request.method === 'item/tool/requestUserInput')
    if (userInputRequests.length !== 1) return false

    const [request] = userInputRequests
    const questionIds = readToolRequestUserInputQuestionIds(request)
    if (questionIds.length !== 1) return false

    return respondToPendingServerRequest({
      id: request.id,
      result: {
        answers: {
          [questionIds[0]]: {
            answers: [text.trim()],
          },
        },
      },
    })
  }

  // 发送前预检：线程空闲且剩余上下文占比 ≤ 阈值时，把消息暂存并触发压缩；
  // 压缩完成后由 compactThreadById 的收口回调补发。返回 true 表示已暂存处理。
  async function maybeStashForAutoCompact(
    threadId: string,
    text: string,
    imageUrls: string[],
    skills: Array<{ name: string; path: string }>,
    fileAttachments: FileAttachment[],
    collaborationModeOverride?: CollaborationModeKind,
  ): Promise<boolean> {
    if (suppressAutoCompactStash) return false
    if (autoCompactThreshold.value <= 0) return false
    // turn 进行中不预检（上下文已定型，steer 消息直接进入当前 turn）。
    if (inProgressById.value[threadId] === true) return false
    const usage = threadTokenUsageByThreadId.value[threadId]
    if (!usage || usage.remainingContextPercent === null) return false
    if (usage.remainingContextPercent > autoCompactThreshold.value) return false

    const id = `stash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const collaborationMode: CollaborationModeKind =
      collaborationModeOverride === 'plan'
        ? 'plan'
        : collaborationModeOverride === 'default'
          ? 'default'
          : selectedCollaborationMode.value
    appendStashedMessage(threadId, { id, text, imageUrls, skills, fileAttachments, collaborationMode })
    if (!compactingThreadIds.value.has(threadId)) {
      void compactThreadById(threadId)
    }
    return true
  }

  // 压缩完成（或失败兜底）后补发该线程的暂存消息；线程忙时等待空闲再补发。
  async function flushStashedForThread(threadId: string): Promise<void> {
    const stashed = getStashedMessages(threadId)
    if (!stashed || stashed.length === 0) return
    if (inProgressById.value[threadId] === true) return

    const messages = takeStashedMessages(threadId)
    suppressAutoCompactStash = true
    try {
      for (const msg of messages) {
        try {
          await sendMessageToSelectedThread(
            msg.text,
            msg.imageUrls,
            msg.skills,
            'steer',
            msg.fileAttachments,
            undefined,
            msg.collaborationMode,
          )
        } catch {
          // 单条失败不中断其余补发；错误已通过共享 error 状态展示。
        }
      }
    } finally {
      suppressAutoCompactStash = false
    }
  }

  async function sendMessageToSelectedThread(
    text: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    mode: 'steer' | 'queue' = 'steer',
    fileAttachments: FileAttachment[] = [],
    queueInsertIndex?: number,
    collaborationModeOverride?: CollaborationModeKind,
  ): Promise<void> {
    if (isUpdatingSpeedMode.value) return

    const threadId = selectedThreadId.value
    const nextText = text.trim()
    if (!threadId || (!nextText && imageUrls.length === 0 && fileAttachments.length === 0)) return

    if (await maybeReplyToPendingUserInputRequest(threadId, nextText, imageUrls, skills, fileAttachments)) {
      return
    }

    // 发送前自动压缩预检：线程空闲且上下文剩余占比 ≤ 阈值时暂存消息并触发压缩，
    // 压缩完成后自动补发（见 maybeStashForAutoCompact / flushStashedForThread）。
    if (await maybeStashForAutoCompact(threadId, nextText, imageUrls, skills, fileAttachments, collaborationModeOverride)) {
      return
    }

    const isInProgress = inProgressById.value[threadId] === true

    if (isInProgress && mode === 'queue') {
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      enqueueQueuedMessage(threadId, {
        id,
        text: nextText,
        imageUrls,
        skills,
        fileAttachments,
        collaborationMode: collaborationModeOverride === 'plan'
          ? 'plan'
          : collaborationModeOverride === 'default'
            ? 'default'
            : selectedCollaborationMode.value,
      }, queueInsertIndex)
      return
    }

    if (isInProgress) {
      shouldAutoScrollOnNextAgentEvent = true
      appendOptimisticUserMessage(threadId, nextText, imageUrls, skills, fileAttachments)
      void startTurnForThread(
        threadId,
        nextText,
        imageUrls,
        skills,
        fileAttachments,
        collaborationModeOverride,
      ).catch((unknownError) => {
        const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        setTurnErrorForThread(threadId, errorMessage)
        error.value = errorMessage
      })
      return
    }

    error.value = ''
    shouldAutoScrollOnNextAgentEvent = true
    setTurnSummaryForThread(threadId, null)
    appendOptimisticUserMessage(threadId, nextText, imageUrls, skills, fileAttachments)
    setTurnActivityForThread(
      threadId,
      {
        label: 'Thinking',
        details: buildPendingTurnDetails(
          readModelIdForThread(threadId),
          selectedReasoningEffort.value,
          collaborationModeOverride === 'plan'
            ? 'plan'
            : collaborationModeOverride === 'default'
              ? 'default'
              : selectedCollaborationMode.value,
        ),
      },
    )
    setTurnErrorForThread(threadId, null)
    setThreadInProgress(threadId, true)

    try {
      await startTurnForThread(
        threadId,
        nextText,
        imageUrls,
        skills,
        fileAttachments,
        collaborationModeOverride,
      )
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
      throw unknownError
    }
  }

  async function sendMessageToNewThread(
    text: string,
    cwd: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<string> {
    if (isUpdatingSpeedMode.value) return ''

    const nextText = text.trim()
    const targetCwd = cwd.trim()
    const selectedModel = readModelIdForThread(NEW_THREAD_COLLABORATION_MODE_CONTEXT).trim()
    const selectedMode = selectedCollaborationMode.value
    if (!nextText && imageUrls.length === 0 && fileAttachments.length === 0) return ''

    isSendingMessage.value = true
    error.value = ''
    let threadId = ''

    try {
      try {
        const startedThread = await startThread(targetCwd || undefined, selectedModel || undefined)
        threadId = startedThread.threadId
        setThreadModelId(threadId, startedThread.model)
        setThreadModelProviderId(threadId, startedThread.modelProvider || activeProviderId.value)
        setSelectedCollaborationModeForThread(threadId, selectedMode)
      } catch (unknownError) {
        if (selectedModel && selectedModel !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(unknownError)) {
          await applyFallbackModelSelection()
          const fallbackThread = await startThread(targetCwd || undefined, MODEL_FALLBACK_ID)
          threadId = fallbackThread.threadId
          setThreadModelId(threadId, fallbackThread.model)
          setThreadModelProviderId(threadId, fallbackThread.modelProvider || activeProviderId.value)
          setSelectedCollaborationModeForThread(threadId, selectedMode)
        } else {
          throw unknownError
        }
      }
      if (!threadId) return ''

      insertOptimisticThread(threadId, targetCwd, nextText || '[Image]')
      appendOptimisticUserMessage(threadId, nextText, imageUrls, skills, fileAttachments)
      blockInterruptUntilThreadIsPersisted(threadId)
      resumedThreadById.value = {
        ...resumedThreadById.value,
        [threadId]: true,
      }
      setSelectedThreadId(threadId)
      shouldAutoScrollOnNextAgentEvent = true
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(
        threadId,
        {
          label: 'Thinking',
          details: buildPendingTurnDetails(
            readModelIdForThread(threadId),
            selectedReasoningEffort.value,
            selectedMode,
          ),
        },
      )
      setTurnErrorForThread(threadId, null)
      setThreadInProgress(threadId, true)
      const capturedThreadId = threadId
      const capturedCwd = targetCwd || null
      const capturedPrompt = nextText
      void startTurnForThread(threadId, nextText, imageUrls, skills, fileAttachments, selectedMode)
        .catch((unknownError) => {
          shouldAutoScrollOnNextAgentEvent = false
          setThreadInProgress(threadId, false)
          setTurnActivityForThread(threadId, null)
          const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
          setTurnErrorForThread(threadId, errorMessage)
          error.value = errorMessage
        })
        .finally(() => {
          isSendingMessage.value = false
        })
      void requestThreadTitleGeneration(capturedThreadId, capturedPrompt, capturedCwd, imageUrls, fileAttachments)
      return threadId
    } catch (unknownError) {
      shouldAutoScrollOnNextAgentEvent = false
      if (threadId) {
        setThreadInProgress(threadId, false)
        setTurnActivityForThread(threadId, null)
      }
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
      if (threadId) {
        setTurnErrorForThread(threadId, errorMessage)
      }
      error.value = errorMessage
      isSendingMessage.value = false
      throw unknownError
    }
  }

  async function startTurnForThread(
    threadId: string,
    nextText: string,
    imageUrls: string[] = [],
    skills: Array<{ name: string; path: string }> = [],
    fileAttachments: FileAttachment[] = [],
    collaborationModeOverride?: CollaborationModeKind,
  ): Promise<void> {
    const reasoningEffort = selectedReasoningEffort.value
    const collaborationMode = collaborationModeOverride === 'plan' ? 'plan' : collaborationModeOverride === 'default'
      ? 'default'
      : selectedCollaborationMode.value
    const normalizedText = nextText.trim()
    const normalizedImageUrls = [...imageUrls]
    if (
      normalizedImageUrls.length === 0
      && shouldReuseAttachedImageFromPrompt(normalizedText)
    ) {
      const latestAttachedImageUrl = findLatestUserLocalImageUrl(threadId)
      if (latestAttachedImageUrl) {
        normalizedImageUrls.push(latestAttachedImageUrl)
      }
    }
    const normalizedSkills = skills.map((skill) => ({ name: skill.name, path: skill.path }))
    const normalizedFileAttachments = fileAttachments.map((file) => ({ ...file }))

    setPendingTurnRequest(threadId, {
      text: normalizedText,
      imageUrls: [...normalizedImageUrls],
      skills: normalizedSkills,
      fileAttachments: normalizedFileAttachments,
      effort: reasoningEffort,
      collaborationMode,
      fallbackRetried: false,
    })

    try {
      if (resumedThreadById.value[threadId] !== true) {
        const resumedThread = await resumeThread(threadId)
        if (resumedThread.model) {
          setThreadModelId(threadId, resolveThreadModelForProvider(threadId, resumedThread.model, resumedThread.modelProvider))
        }
        if (resumedThread.modelProvider) {
          setThreadModelProviderId(threadId, resumedThread.modelProvider)
        }
        resumedThreadById.value = {
          ...resumedThreadById.value,
          [threadId]: true,
        }
      }
      const modelId = readModelIdForThread(threadId)

      let startedTurnId = ''
      try {
        startedTurnId = await startThreadTurn(
          threadId,
          nextText,
          normalizedImageUrls,
          modelId || undefined,
          reasoningEffort || undefined,
          skills.length > 0 ? skills : undefined,
          fileAttachments,
          collaborationMode,
        )
      } catch (unknownError) {
        if (modelId && modelId !== MODEL_FALLBACK_ID && isUnsupportedChatGptModelError(unknownError)) {
          await applyFallbackModelSelection(threadId)
          setPendingTurnRequest(threadId, {
            text: normalizedText,
            imageUrls: [...normalizedImageUrls],
            skills: normalizedSkills,
            fileAttachments: normalizedFileAttachments,
            effort: reasoningEffort,
            collaborationMode,
            fallbackRetried: true,
          })
          startedTurnId = await startThreadTurn(
            threadId,
            nextText,
            normalizedImageUrls,
            MODEL_FALLBACK_ID,
            reasoningEffort || undefined,
            skills.length > 0 ? skills : undefined,
            fileAttachments,
            collaborationMode,
          )
        } else {
          throw unknownError
        }
      }

      if (startedTurnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: startedTurnId,
        }
        maybeUnblockInterruptForActiveTurn(threadId, startedTurnId)
      }

      pendingThreadMessageRefresh.add(threadId)
      await syncFromNotifications()
      scheduleDelayedTurnSync(threadId)
    } catch (unknownError) {
      throw unknownError
    }
  }

  async function interruptSelectedThreadTurn(): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (inProgressById.value[threadId] !== true) return
    if (interruptBlockedUntilPersistedByThreadId.value[threadId] === true) return
    let turnId = activeTurnIdByThreadId.value[threadId]
    if (!turnId) {
      const { activeTurnId } = await getThreadDetail(threadId)
      turnId = activeTurnId
      if (turnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: turnId,
        }
      }
    }
    if (!turnId) {
      throw new Error('Could not determine active turn id for interrupt')
    }

    // 需求 9 UI 优化：turn/interrupt 中断一个「尚未产出任何 agent 输出」的 turn 时，
    // 服务端会把该 turn（含用户消息）从线程历史整体移除（事务式回滚，见第七轮调研
    // 结论）。在中断前按服务端语义判定：该 turn 无 agentMessage/命令/工具/文件变更/
    // plan 等持久化产物（仅用户消息 + 思考不算），则中断后消息必然消失 → 回填输入框。
    const turnMessages = messages.value.filter((message) => message.turnId === turnId)
    const interruptedUserMessage = turnMessages.find((message) => message.role === 'user')
    const hasAgentOutput = turnMessages.some((message) => {
      if (message.role === 'assistant') return true
      const type = message.messageType ?? ''
      return (
        type === 'commandExecution' ||
        type === 'toolCall' ||
        type === 'worked' ||
        type === 'fileChange' ||
        type === 'plan' ||
        type === 'plan.live' ||
        type === 'compaction.done' ||
        type === 'turnError'
      )
    })

    isInterruptingTurn.value = true
    error.value = ''
    try {
      await interruptThreadTurn(threadId, turnId)
      setThreadInProgress(threadId, false)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      if (activeTurnIdByThreadId.value[threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
      }
      pendingThreadMessageRefresh.add(threadId)
      pendingThreadsRefresh = true
      await syncFromNotifications()
      if (interruptedUserMessage && !hasAgentOutput) {
        // 需求 1（第十六轮）：服务端已把该 turn 整体移除，本地也要同步移除，
        // 否则消息列表残留「被编辑（被中断）」的用户消息。这里同时清理：
        // 1) 持久化消息中该 turn 的全部消息（按 turnId）；
        // 2) 该 turn 的思考存档（clearCompletedTurnLiveState 刚把 thinking
        //    存进 persistedReasoning，若不清理会残留一个没有对应轮次的思考块）；
        // 之后 preserveMissing 合并时 previous 已无这些消息，不会再次保留。
        const turnMessagesRemaining = (persistedMessagesByThreadId.value[threadId] ?? []).filter(
          (message) => message.turnId !== turnId,
        )
        setPersistedMessagesForThread(threadId, turnMessagesRemaining)
        const reasoningForThread = persistedReasoningByThreadId.value[threadId]
        if (reasoningForThread) {
          const reasoningRemaining = reasoningForThread.filter((message) => message.turnId !== turnId)
          if (reasoningRemaining.length !== reasoningForThread.length) {
            persistedReasoningByThreadId.value = {
              ...persistedReasoningByThreadId.value,
              [threadId]: reasoningRemaining,
            }
            savePersistedReasoningMap(persistedReasoningByThreadId.value)
          }
        }
        interruptedUnsubmittedByThreadId.value = {
          ...interruptedUnsubmittedByThreadId.value,
          [threadId]: {
            text: interruptedUserMessage.text ?? '',
            imageUrls: interruptedUserMessage.images ?? [],
            fileAttachments: (interruptedUserMessage.fileAttachments ?? []).map((attachment) => ({
              label: attachment.label,
              path: attachment.path,
              fsPath: (attachment as { fsPath?: string }).fsPath ?? attachment.path,
            })),
            skills: interruptedUserMessage.skills ?? [],
          },
        }
      }
    } catch (unknownError) {
      const errorMessage = unknownError instanceof Error ? unknownError.message : 'Failed to interrupt active turn'
      setTurnErrorForThread(threadId, errorMessage)
      error.value = errorMessage
    } finally {
      isInterruptingTurn.value = false
    }
  }

  // 需求 9：UI 消费完「中断回填载荷」后清除（一次性消费，避免重复回填）
  function clearInterruptedUnsubmittedMessage(threadId: string): void {
    if (!threadId) return
    if (interruptedUnsubmittedByThreadId.value[threadId]) {
      interruptedUnsubmittedByThreadId.value = omitKey(interruptedUnsubmittedByThreadId.value, threadId)
    }
  }

  async function rollbackSelectedThread(turnId: string): Promise<void> {
    const threadId = selectedThreadId.value
    if (!threadId) return
    if (isRollingBack.value) return
    if (!turnId.trim()) return

    isRollingBack.value = true
    error.value = ''
    try {
      // Stop an in-flight turn before rolling back: the agent is still
      // generating on the server side and an edit racing it would be lost.
      if (inProgressById.value[threadId] === true) {
        await interruptSelectedThreadTurn()
      }

      const persisted = persistedMessagesByThreadId.value[threadId] ?? []
      const matchedMessage = persisted.find((message) => message.turnId === turnId)
      // 持久化消息可能缺 turnIndex（如通知增量通道写入的存档），回退到轮次映射兜底，
      // 避免 matchedMessage 存在但 turnIndex 缺失时静默 return 导致「点了确认没反应」。
      const turnIndex = typeof matchedMessage?.turnIndex === 'number'
        ? matchedMessage.turnIndex
        : (turnIndexByTurnIdByThreadId.value[threadId]?.[turnId] ?? -1)
      if (turnIndex < 0) return
      const maxTurnIndex = persisted.reduce((max, m) => (typeof m.turnIndex === 'number' && m.turnIndex > max ? m.turnIndex : max), -1)
      if (maxTurnIndex < 0 || turnIndex > maxTurnIndex) return
      // 回退到目标轮：保留该轮（含其用户消息），仅移除其后的轮次。
      // 此前 +1 会把目标轮一并删掉，回退到首轮时整条线程被清空。
      // 目标轮即最后一轮时 maxTurnIndex - turnIndex 为 0，此时应移除该轮本身
      // （用户回退最后一条消息期望撤销它），而不是静默无操作。
      const numTurns = Math.max(1, maxTurnIndex - turnIndex)

      const threadCwd = selectedThread.value?.cwd?.trim() ?? ''
      if (threadCwd) {
        await revertThreadFileChanges(threadId, turnId, threadCwd)
      }
      const nextMessages = await rollbackThread(threadId, numTurns)
      setPersistedMessagesForThread(threadId, nextMessages)
      setLiveAgentMessagesForThread(threadId, [])
      clearLiveReasoningForThread(threadId)
      if (liveCommandsByThreadId.value[threadId]) {
        liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
      }
      setTurnSummaryForThread(threadId, null)
      setTurnActivityForThread(threadId, null)
      setTurnErrorForThread(threadId, null)
      pendingThreadsRefresh = true
      await syncFromNotifications()
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to rollback thread'
    } finally {
      isRollingBack.value = false
    }
  }

  function injectCompactionMessage(threadId: string, state: 'pending' | 'done'): void {
    const previous = injectedSystemMessagesByThreadId.value[threadId] ?? []
    // Drop any previous pending/done compaction rows for this thread so the feed
    // keeps a single, latest record per compaction run.
    const remaining = previous.filter((message) => message.messageType !== 'compaction.pending' && message.messageType !== 'compaction.done')
    remaining.push({
      id: `compaction:${state}:${threadId}:${Date.now()}`,
      role: 'system',
      text: '',
      messageType: state === 'pending' ? 'compaction.pending' : 'compaction.done',
    })
    injectedSystemMessagesByThreadId.value = {
      ...injectedSystemMessagesByThreadId.value,
      [threadId]: remaining,
    }
  }

  function markThreadCompacting(threadId: string, compacting: boolean): void {
    const next = new Set(compactingThreadIds.value)
    if (compacting) next.add(threadId)
    else next.delete(threadId)
    compactingThreadIds.value = next
  }

  function registerFuzzyFileSearchSession(sessionId: string): void {
    fuzzyFileSearchSessionId = sessionId.trim()
    fuzzyFileSearchResults.value = []
  }

  async function compactThreadById(threadId: string): Promise<void> {
    const normalized = threadId.trim()
    if (!normalized || compactingThreadIds.value.has(normalized)) return

    markThreadCompacting(normalized, true)
    injectCompactionMessage(normalized, 'pending')
    try {
      await compactThread(normalized)
      // Modern codex app-servers no longer emit the deprecated
      // `thread/compacted` notification; the compaction result arrives as a
      // ContextCompaction item in the thread payload. Poll the thread detail
      // until that item lands (or the notification path clears the flag), then
      // swap the pending row for the done row. A timeout guards against stalls.
      const COMPACTION_POLL_MS = 2_000
      const COMPACTION_POLL_MAX = 14
      const timeoutAt = Date.now() + COMPACT_STATE_TIMEOUT_MS
      let pollCount = 0
      while (Date.now() < timeoutAt && pollCount < COMPACTION_POLL_MAX) {
        if (!compactingThreadIds.value.has(normalized)) break
        const detail = await getThreadDetail(normalized)
        const hasCompactionItem = detail.messages.some(
          (message) => message.messageType === 'compaction.done',
        )
        if (hasCompactionItem) {
          markThreadCompacting(normalized, false)
          // Re-read the thread so the persisted ContextCompaction item is
          // normalized into a compaction.done message in the feed.
          if (selectedThreadId.value === normalized) {
            await loadMessages(normalized, { silent: true, force: true })
          }
          injectCompactionMessage(normalized, 'done')
          void flushStashedForThread(normalized)
          break
        }
        pollCount += 1
        await delay(COMPACTION_POLL_MS)
      }
      // Final safety net: clear any stuck pending state.
      if (compactingThreadIds.value.has(normalized)) {
        markThreadCompacting(normalized, false)
        injectCompactionMessage(normalized, 'done')
        void flushStashedForThread(normalized)
      }
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to compact thread'
      markThreadCompacting(normalized, false)
      injectCompactionMessage(normalized, 'done')
      // 压缩失败也补发暂存消息（退化为服务端兜底压缩，见方案 3.5）。
      void flushStashedForThread(normalized)
    }
  }


  async function syncThreadStatus(): Promise<void> {
    if (isPolling.value) return
    isPolling.value = true

    try {
      await threadListLoading.loadThreads()

      if (!selectedThreadId.value) return

      const threadId = selectedThreadId.value
      const currentVersion = currentThreadVersion(threadId)
      const loadedVersion = loadedVersionByThreadId.value[threadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion
      const isInProgress = inProgressById.value[threadId] === true

      if (isInProgress || hasVersionChange) {
        await loadMessages(threadId, { silent: true })
      }
    } catch {
      // ignore poll failures and keep last known state
    } finally {
      isPolling.value = false
    }
  }

  async function syncFromNotifications(): Promise<void> {
    if (isPolling.value) {
      if (typeof window !== 'undefined' && eventSyncTimer === null) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
      return
    }

    isPolling.value = true

    const shouldRefreshThreads = pendingThreadsRefresh
    const shouldForceThreadRefresh = pendingThreadsRefreshForce
    const threadIdsToRefresh = new Set(pendingThreadMessageRefresh)
    pendingThreadsRefresh = false
    pendingThreadsRefreshForce = false
    pendingThreadMessageRefresh.clear()

    try {
      if (shouldRefreshThreads) {
        await threadListLoading.loadThreads({ force: shouldForceThreadRefresh })
      }

      const activeThreadId = selectedThreadId.value
      if (!activeThreadId) return

      const isActiveDirty = threadIdsToRefresh.has(activeThreadId)
      const isInProgress = inProgressById.value[activeThreadId] === true
      const currentVersion = currentThreadVersion(activeThreadId)
      const loadedVersion = loadedVersionByThreadId.value[activeThreadId] ?? ''
      const hasVersionChange = currentVersion.length > 0 && currentVersion !== loadedVersion

      const shouldRefreshActiveThread =
        hasVersionChange ||
        isActiveDirty ||
        (isInProgress && loadedMessagesByThreadId.value[activeThreadId] !== true) ||
        (shouldRefreshThreads && loadedMessagesByThreadId.value[activeThreadId] !== true)

      if (shouldRefreshActiveThread) {
        // Force the reload after turn-level events: the thread's updatedAt
        // version may not change when the server persists new items (e.g. a
        // plan item), so the reuse-cache would otherwise skip the refresh and
        // the plan panel would only appear after a manual page reload.
        await loadMessages(activeThreadId, { silent: true, force: isActiveDirty })
      }
    } catch {
      // Keep UI stable on transient event sync failures.
    } finally {
      isPolling.value = false

      if (
        (pendingThreadsRefresh || pendingThreadMessageRefresh.size > 0) &&
        typeof window !== 'undefined' &&
        eventSyncTimer === null
      ) {
        eventSyncTimer = window.setTimeout(() => {
          eventSyncTimer = null
          void syncFromNotifications()
        }, EVENT_SYNC_DEBOUNCE_MS)
      }
    }
  }

  async function recoverBridgeState(): Promise<void> {
    await loadPendingServerRequestsFromBridge()
    pendingThreadsRefresh = !threadListLoading.hasLoadedThreads.value
    if (
      selectedThreadId.value &&
      loadedMessagesByThreadId.value[selectedThreadId.value] !== true
    ) {
      pendingThreadMessageRefresh.add(selectedThreadId.value)
    }
    await syncFromNotifications()
  }

  function handleExternalSessionChanged(notification: RpcNotification): void {
    const params = asRecord(notification.params)
    const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
    if (!threadId) return
    const rawExternal = asRecord(params?.externalSession)
    const externalSession = rawExternal && typeof rawExternal.origin === 'string' && rawExternal.origin.trim().length > 0
      ? {
          origin: rawExternal.origin.trim(),
          active: rawExternal.active === true,
          lastWriteAt: typeof rawExternal.lastWriteAt === 'string' ? rawExternal.lastWriteAt : null,
        }
      : null
    externalSessionByThreadId.value = {
      ...externalSessionByThreadId.value,
      [threadId]: externalSession,
    }
    setThreadInProgress(threadId, externalSession?.active === true)
    applyThreadFlags()
    pendingThreadsRefresh = true
    if (selectedThreadId.value === threadId) {
      pendingThreadMessageRefresh.add(threadId)
    }
    if (eventSyncTimer === null && typeof window !== 'undefined') {
      eventSyncTimer = window.setTimeout(() => {
        eventSyncTimer = null
        void syncFromNotifications()
      }, EVENT_SYNC_DEBOUNCE_MS)
    }
  }

  function startPolling(): void {
    if (typeof window === 'undefined') return

    if (stopNotificationStream) return
    void loadPendingServerRequestsFromBridge()
    void loadThreadReasoningArchiveIfNeeded()
    void loadThreadTurnDurationsIfNeeded()
    stopNotificationStream = subscribeCodexNotifications((notification) => {
      if (notification.method === 'ready') {
        clearAllTransientTurnErrors()
        void recoverBridgeState()
        return
      }
      if (notification.method === 'externalSessionChanged') {
        handleExternalSessionChanged(notification)
        return
      }
      applyRealtimeUpdates(notification)
      queueEventDrivenSync(notification)
    })
  }

  // round-23：启动时从桥接层恢复跨浏览器思考存档（app-server 不持久化
  // reasoning）。桥接层有该线程的存档时以它为准（覆盖本浏览器 localStorage，
  // 保证换浏览器后一致）；没有时保留本地存档兜底。
  async function loadThreadReasoningArchiveIfNeeded(): Promise<void> {
    try {
      const archive = await getThreadReasoningArchive()
      const entries = Object.entries(archive)
      if (entries.length === 0) return
      const next = { ...persistedReasoningByThreadId.value }
      let changed = false
      for (const [threadId, rows] of entries) {
        const messages = rows.filter(
          (row): row is UiMessage => Boolean(row) && typeof (row as Record<string, unknown>).id === 'string',
        )
        if (messages.length === 0) continue
        const local = next[threadId] ?? []
        const localTexts = new Set(local.map((message) => message.text))
        const merged = [...local]
        for (const message of messages) {
          if (localTexts.has(message.text)) continue
          merged.push(message)
          localTexts.add(message.text)
        }
        next[threadId] = merged.slice(-20)
        changed = true
      }
      if (changed) {
        persistedReasoningByThreadId.value = next
        savePersistedReasoningMap(next)
      }
    } catch {
      // Best-effort restore; localStorage remains the fallback.
    }
  }

  // round-65：启动时从桥接层恢复跨浏览器轮耗时存档。服务端 sidecar 有该线程
  // 的耗时数据时以它为准（覆盖本浏览器 localStorage，保证换浏览器后一致）。
  async function loadThreadTurnDurationsIfNeeded(): Promise<void> {
    try {
      const archive = await getThreadTurnDurationArchive()
      const entries = Object.entries(archive)
      if (entries.length === 0) return
      const next = { ...persistedTurnDurationsByThreadId.value }
      let changed = false
      for (const [threadId, turns] of entries) {
        if (!threadId || !turns || typeof turns !== 'object' || Array.isArray(turns)) continue
        const perTurn: Record<string, number> = {}
        for (const [turnId, durationMs] of Object.entries(turns as Record<string, unknown>)) {
          if (!turnId || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) continue
          perTurn[turnId] = Math.round(durationMs)
        }
        if (Object.keys(perTurn).length === 0) continue
        const merged = { ...(next[threadId] ?? {}), ...perTurn }
        const mergedKeys = Object.keys(merged)
        next[threadId] = mergedKeys.length > 200
          ? Object.fromEntries(mergedKeys.slice(-200).map((k) => [k, merged[k]!]))
          : merged
        changed = true
      }
      if (changed) {
        persistedTurnDurationsByThreadId.value = next
        savePersistedTurnDurationMap(next)
      }
    } catch {
      // Best-effort restore; localStorage remains the fallback.
    }
  }

  async function respondToPendingServerRequest(reply: UiServerRequestReply): Promise<boolean> {
    try {
      await replyToServerRequest(reply.id, {
        result: reply.result,
        error: reply.error,
      })
      removePendingServerRequestById(reply.id)
      pendingReplyErrorByRequestId.value = omitKey(pendingReplyErrorByRequestId.value, String(reply.id))
      return true
    } catch (unknownError) {
      // round-23：回复失败时与服务端待办列表对账。审批面板「发送/跳过点了没反应」
      // 的根因通常是：请求已被服务端解决（超时自动拒绝、TUI 或另一浏览器已应答、
      // app-server 重启）但本地没收到 resolved 通知，残留一个死面板；此时回 RPC
      // 会报错但面板仍留着。对账后把服务端已不存在的请求移除，面板正常关闭。
      const message = unknownError instanceof Error ? unknownError.message : 'Failed to reply to server request'
      const stillPending = await pendingRequestStillExistsOnServer(reply.id)
      if (!stillPending) {
        removePendingServerRequestById(reply.id)
        pendingReplyErrorByRequestId.value = omitKey(pendingReplyErrorByRequestId.value, String(reply.id))
        return true
      }
      error.value = message
      pendingReplyErrorByRequestId.value = {
        ...pendingReplyErrorByRequestId.value,
        [String(reply.id)]: message,
      }
      return false
    }
  }

  function stopPolling(): void {
    if (stopNotificationStream) {
      stopNotificationStream()
      stopNotificationStream = null
    }

    pendingThreadsRefresh = false
    pendingThreadMessageRefresh.clear()
    pendingTurnStartsById.clear()
    if (eventSyncTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(eventSyncTimer)
      eventSyncTimer = null
    }
    stopRateLimitRefresh()
    threadListLoading.dispose()
    if (typeof window !== 'undefined') {
      for (const timerId of delayedTurnSyncTimerByThreadId.values()) {
        window.clearTimeout(timerId)
      }
    }
    delayedTurnSyncTimerByThreadId.clear()
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
    persistedMessagesByThreadId.value = {}
    livePlanMessagesByThreadId.value = {}
    liveAgentMessagesByThreadId.value = {}
    liveReasoningTextByThreadId.value = {}
    persistedReasoningByThreadId.value = {}
    persistedTurnDurationsByThreadId.value = {}
    liveCommandsByThreadId.value = {}
    liveFileChangeMessagesByThreadId.value = {}
    turnIndexByTurnIdByThreadId.value = {}
    turnActivityByThreadId.value = {}
    turnSummaryByThreadId.value = {}
    turnErrorByThreadId.value = {}
    activeTurnIdByThreadId.value = {}
    activeReasoningTurnIdByThreadId.clear()
    clearReasoningItemTextCacheImpl(reasoningTimelineDeps)
    turnItemSequenceByThreadId.clear()
    resetLiveMessageSortKeys()
    interruptBlockedUntilPersistedByThreadId.value = {}
    threadListedByServerById.value = {}
    persistedUserMessageByThreadId.value = {}
    clearQueueState()
    setCodexRateLimit(null)
    threadTokenUsageByThreadId.value = {}
  }

  function steerQueuedMessage(messageId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    const stashedMessage = findStashedMessage(threadId, messageId)
    if (stashedMessage) {
      // 用户主动立即发送暂存消息：跳过预检直接发送（不压缩）。
      removeQueuedMessage(messageId)
      setSelectedCollaborationMode(stashedMessage.collaborationMode)
      suppressAutoCompactStash = true
      void sendMessageToSelectedThread(
        stashedMessage.text,
        stashedMessage.imageUrls,
        stashedMessage.skills,
        'steer',
        stashedMessage.fileAttachments,
      ).finally(() => {
        suppressAutoCompactStash = false
      })
      return
    }
    const msg = findQueuedMessage(threadId, messageId)
    if (!msg) return
    removeQueuedMessage(messageId)
    setSelectedCollaborationMode(msg.collaborationMode)
    void sendMessageToSelectedThread(msg.text, msg.imageUrls, msg.skills, 'steer', msg.fileAttachments)
  }

  function primeSelectedThread(threadId: string, options: { persist?: boolean } = {}): void {
    setSelectedThreadId(threadId, options)
  }

  return {
    projectGroups,
    projectDisplayNameById,
    selectedThread,
    selectedThreadTokenUsage,
    selectedThreadTerminalOpen,
    isSelectedThreadInterruptPending,
    selectedThreadServerRequests,
    selectedLiveOverlay,
    selectedActiveTurnId,
    lastPlanByThreadId,
    resolveThreadTurnIndex,
    codexQuota,
    selectedThreadId,
    availableCollaborationModes,
    availableModelIds,
    availableModelReasoningEfforts,
    selectedCollaborationMode,
    selectedModelId,
    selectedReasoningEffort,
    selectedSpeedMode,
    codexCliMissingError,
    installedSkills,
    accountRateLimitSnapshots,
    messages,
    hasMoreOlderMessages,
    isLoadingThreads: threadListLoading.isLoadingThreads,
    isThreadListFullyLoaded: threadListLoading.isThreadListFullyLoaded,
    isLoadingMessages,
    isLoadingOlderMessages,
    isSendingMessage,
    isInterruptingTurn,
    isUpdatingSpeedMode,
    isRollingBack,
    compactingThreadIds,
    fuzzyFileSearchResults,
    registerFuzzyFileSearchSession,

    error,
    refreshAll,
    refreshSkills,
    refreshHooks,
    hooksList,
    isHooksLoading,
    onRealtimeEvent,
    selectThread,
    loadMessages,
    loadOlderMessages,
    ensureThreadMessagesLoaded,
    setThreadTerminalOpen,
    toggleSelectedThreadTerminal,
    archiveThreadById,
    compactThreadById,
    renameThreadById,
    forkThreadById,
    forkThreadFromTurn,
    rollbackSelectedThread,

    sendMessageToSelectedThread,
    sendMessageToNewThread,
    interruptSelectedThreadTurn,
    interruptedUnsubmittedMessage,
    clearInterruptedUnsubmittedMessage,
    selectedThreadQueuedMessages,
    removeQueuedMessage,
    reorderQueuedMessage,
    steerQueuedMessage,
    autoCompactThreshold,
    setAutoCompactThreshold,
    setSelectedCollaborationMode,
    readModelIdForThread,
    setSelectedModelIdForThread,
    setSelectedModelId,

    setSelectedReasoningEffort,
    updateSelectedSpeedMode,
    respondToPendingServerRequest,
    pendingReplyErrorForRequest,
    renameProject,
    removeProject,
    reorderProject,
    pinProjectToTop,
    startPolling,
    stopPolling,
    primeSelectedThread,
  }
}

