import { computed, ref } from 'vue'
import {

  archiveThread,
  forkThread,
  getAvailableCollaborationModes,
  getAccountRateLimits,
  renameThread,
  getAvailableModels,
  getCurrentModelConfig,
  getPendingServerRequests,
  getSkillsList,
  getThreadDetail,
  getOlderThreadMessages,
  getBackgroundThreadListLimit,
  interruptThreadTurn,
  pickCodexRateLimitSnapshot,
  replyToServerRequest,
  revertThreadFileChanges,
  rollbackThread,
  getThreadGroupsPage,
  getThreadQueueState,
  getWorkspaceRootsState,
  setCodexSpeedMode,
  setThreadQueueState,
  setWorkspaceRootsState,
  getThreadTitleCache,
  persistThreadTitle,
  generateThreadTitle,
  getThreadReasoningArchive,
  persistThreadReasoningArchive,
  resumeThread,
  compactThread,
  normalizeFuzzyFileSearchResults,

  startThread,
  subscribeCodexNotifications,
  startThreadTurn,
  listHooks,
  type RpcNotification,
  type AvailableModel,
  type SkillInfo,
  type ThreadQueueState,
  type UiHooksListEntry,
  type WorkspaceRootsState,
} from '../api/codexGateway'
import { CodexApiError } from '../api/codexErrors'
import { normalizeFileChangeStatus, toUiFileChanges } from '../api/normalizers/v2'
import { REASONING_EFFORTS } from '../types/codex'
import type {
  CollaborationModeKind,
  CollaborationModeOption,
  CommandExecutionData,
  UiPendingRequestState,
  ReasoningEffort,
  SpeedMode,
  UiFileChange,
  UiLiveOverlay,
  UiMessage,
  UiPlanData,
  UiPlanStep,
  UiProjectGroup,
  UiRateLimitSnapshot,
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
  buildWorkspaceRootsProjectOrderState,
  cloneStringKeyedRecord,
  dedupeAssistantAgentMessageText,
  delay,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  findReasoningAnchorIndex,
  flattenThreads,
  formatTurnDuration,
  insertTurnSummaryMessage,
  isCodexCliMissingError,
  isNewThreadContextId,
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
  normalizeCollaborationMode,
  normalizeMessageText,
  normalizeProviderContextId,
  normalizeStoredModelId,
  omitKey,
  omitKeys,
  omitStringKeyedRecordKey,
  orderGroupsByProjectOrder,
  orderGroupsByWorkspaceProjectOrder,
  parseIsoTimestamp,
  pruneLiveMessageSortKeys,
  pruneThreadContextStateMap,
  pruneThreadStateMap,
  readSelectedCollaborationMode,
  readSelectedModel,
  removePersistedLiveMessages,
  removeRedundantLiveAgentMessages,
  removeThreadFromGroups,
  sortKeyForLiveMessage,
  toForkedThreadTitle,
  toOptimisticThreadTitle,
  toThreadContextId,
  upsertMessage,
  writeSelectedCollaborationModeForContext,
  addWorkspaceRootPlaceholderGroups,
  clamp,
  collectDuplicateProjectLeafNames,
  collectWorkspaceRootPathsForProjectRemoval,
  disambiguateProjectGroupsByCwd,
  getRemoteProjectDisplayName,
  getWorkspaceProjectOrderNames,
  getWorkspaceProjectOrderPaths,
  hasOptimisticUserMessages,
  isProjectlessGroup,
  matchesWorkspaceRootProject,
  mergeProjectOrder,
  NEW_THREAD_COLLABORATION_MODE_CONTEXT,
  OPTIMISTIC_THREAD_TITLE_MAX,
  pruneLiveMessageSortKeysByActiveThreads,
  reorderStringArray,
  resetLiveMessageSortKeys,
  toProjectNameFromWorkspaceRoot,
  toProviderModelContextId,
  type TurnCompletedInfo,
  type TurnErrorState,
  type TurnStartedInfo,
  type InterruptRecoverPayload,
  type TurnActivityState,
  type TurnSummaryState,
} from './useDesktopStateUtils'
import {
  asRecord,
  buildPlanMessageText,
  extractThreadIdFromNotification,
  getRateLimitSnapshotKey,
  normalizePlanStepStatus,
  normalizeRateLimitSnapshot,
  normalizeRateLimitSnapshotsPayload,
  normalizeRateLimitWindow,
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
  GLOBAL_SERVER_REQUEST_SCOPE,
  isApprovalRequestMethod,
  normalizeServerRequest,
  readToolRequestUserInputQuestionIds,
} from './useDesktopStateRequests'
import {
  LIVE_REASONING_SNAPSHOT_STORAGE_KEY,
  loadLastPlanMap,
  loadLiveReasoningSnapshotMap,
  loadPersistedReasoningMap,
  loadProjectDisplayNames,
  loadProjectOrder,
  loadReadStateMap,
  loadSelectedCollaborationModeMap,
  loadSelectedModelMap,
  loadSelectedThreadId,
  loadThreadTerminalOpenMap,
  loadThreadTokenUsageMap,
  loadUnreadCutoffIso,
  saveLastPlanMap,
  savePersistedReasoningMap,
  saveProjectDisplayNames,
  saveProjectOrder,
  saveReadStateMap,
  saveSelectedCollaborationModeMap,
  saveSelectedModelMap,
  saveSelectedThreadId,
  saveThreadTerminalOpenMap,
  saveThreadTokenUsageMap,
  saveUnreadCutoffIso,
  type LiveReasoningSnapshot,
} from './useDesktopStatePersistence'

type SelectThreadResult = 'ok' | 'not-found' | 'error'

const LIVE_REASONING_SNAPSHOT_MAX_CHARS = 8_000
const LIVE_REASONING_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1_000
const LIVE_REASONING_SNAPSHOT_SAVE_MS = 1_500
const STASHED_MESSAGES_STORAGE_KEY = 'codex-web-local.stashed-messages.v1'
const AUTO_COMPACT_THRESHOLD_STORAGE_KEY = 'codex-web-local.auto-compact-threshold.v1'
const DEFAULT_AUTO_COMPACT_THRESHOLD = 10
const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = REASONING_EFFORTS
const MODEL_FALLBACK_ID = 'gpt-5.4-mini'
const OPENCODE_ZEN_DEFAULT_MODEL = 'big-pickle'
const CODEX_CLI_MISSING_MESSAGE = 'Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'
const EVENT_SYNC_DEBOUNCE_MS = 220
const BACKGROUND_THREAD_PAGINATION_DELAY_MS = 10_000
const RATE_LIMIT_REFRESH_DEBOUNCE_MS = 500
const TURN_START_FOLLOW_UP_SYNC_DELAY_MS = 3000
const RECENT_THREAD_MESSAGE_LOAD_REUSE_MS = 2000
const RECENT_THREAD_LIST_LOAD_REUSE_MS = 2000
const RECENT_SKILLS_LOAD_REUSE_MS = 2000

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
  const persistedMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const livePlanMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  // round-27：每线程最近一次 plan 的本地存档（刷新后输入框上方的计划面板兜底恢复）
  const lastPlanByThreadId = ref<Record<string, UiMessage>>(loadLastPlanMap())
  const liveAgentMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const injectedSystemMessagesByThreadId = ref<Record<string, UiMessage[]>>({})
  const persistedReasoningByThreadId = ref<Record<string, UiMessage[]>>(loadPersistedReasoningMap())
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
  // round-27：进行中思考文本的轻量快照（内存 + 节流写 localStorage）。
  // 刷新后 overlay 的 live-overlay-reasoning 不再空白/消失——服务端不回放
  // reasoning 增量，纯页面内存态会随刷新丢失；快照在轮次进行中持续更新、
  // 轮次结束（clearLiveReasoningForThread 收口）时删除。
  let liveReasoningSnapshotByThreadId: Record<string, LiveReasoningSnapshot> = loadLiveReasoningSnapshotMap()
  let liveReasoningSnapshotDirty = false
  let liveReasoningSnapshotTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleLiveReasoningSnapshotSave(): void {
    if (liveReasoningSnapshotTimer !== null) return
    liveReasoningSnapshotTimer = setTimeout(() => {
      liveReasoningSnapshotTimer = null
      if (liveReasoningSnapshotDirty) {
        liveReasoningSnapshotDirty = false
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(LIVE_REASONING_SNAPSHOT_STORAGE_KEY, JSON.stringify(liveReasoningSnapshotByThreadId))
          } catch {
            // Ignore localStorage failures (quota/private mode).
          }
        }
      }
      if (liveReasoningSnapshotDirty) scheduleLiveReasoningSnapshotSave()
    }, LIVE_REASONING_SNAPSHOT_SAVE_MS)
  }

  function rememberLiveReasoningSnapshot(threadId: string, text: string): void {
    if (!threadId) return
    if (inProgressById.value[threadId] !== true) return
    const capped = text.length > LIVE_REASONING_SNAPSHOT_MAX_CHARS
      ? text.slice(-LIVE_REASONING_SNAPSHOT_MAX_CHARS)
      : text
    liveReasoningSnapshotByThreadId[threadId] = { text: capped, ts: Date.now() }
    liveReasoningSnapshotDirty = true
    scheduleLiveReasoningSnapshotSave()
  }

  function restoreLiveReasoningSnapshot(threadId: string): void {
    if (!threadId) return
    const current = liveReasoningTextByThreadId.value[threadId]?.trim()
    if (current) return
    const snapshot = liveReasoningSnapshotByThreadId[threadId]
    if (!snapshot?.text) return
    if (Date.now() - snapshot.ts > LIVE_REASONING_SNAPSHOT_MAX_AGE_MS) return
    liveReasoningTextByThreadId.value = {
      ...liveReasoningTextByThreadId.value,
      [threadId]: snapshot.text,
    }
  }

  function clearLiveReasoningSnapshot(threadId: string): void {
    if (!threadId) return
    if (!(threadId in liveReasoningSnapshotByThreadId)) return
    delete liveReasoningSnapshotByThreadId[threadId]
    liveReasoningSnapshotDirty = true
    scheduleLiveReasoningSnapshotSave()
  }
  const externalSessionByThreadId = ref<Record<string, UiExternalSession | null>>({})
  type FileAttachment = { label: string; path: string; fsPath: string }
  type QueuedMessage = {
    id: string
    text: string
    imageUrls: string[]
    skills: Array<{ name: string; path: string }>
    fileAttachments: FileAttachment[]
    collaborationMode: CollaborationModeKind
    // 发送前自动压缩暂存的消息（awaitingCompaction=true），压缩完成后补发。
    awaitingCompaction?: boolean
  }
  type PendingTurnRequest = {
    text: string
    imageUrls: string[]
    skills: Array<{ name: string; path: string }>
    fileAttachments: FileAttachment[]
    effort: ReasoningEffort | ''
    collaborationMode: CollaborationModeKind
    fallbackRetried: boolean
  }
  const queuedMessagesByThreadId = ref<Record<string, QueuedMessage[]>>({})
  const queueProcessingByThreadId = ref<Record<string, boolean>>({})
  // 发送前自动压缩暂存的消息（与服务端 queue 分离，见 STASHED_MESSAGES_STORAGE_KEY 注释）。
  const stashedMessagesByThreadId = ref<Record<string, QueuedMessage[]>>(loadStashedMessagesMap())
  const autoCompactThreshold = ref<number>(loadAutoCompactThreshold())
  // 补发/手动发送暂存消息期间抑制再次预检（压缩刚完成或用户主动发送，避免重复压缩）。
  let suppressAutoCompactStash = false
  let hasLoadedPersistedQueueState = false
  const eventUnreadByThreadId = ref<Record<string, boolean>>({})
  const availableModelIds = ref<string[]>([])
  const availableModelReasoningEfforts = ref<Record<string, ReasoningEffort[]>>({})
  const availableModelDefaultReasoningEfforts = ref<Record<string, ReasoningEffort>>({})
  const availableCollaborationModes = ref<CollaborationModeOption[]>([
    { value: 'default', label: 'Default' },
    { value: 'plan', label: 'Plan' },
  ])
  const selectedCollaborationModeByContext = ref<Record<string, CollaborationModeKind>>(
    loadSelectedCollaborationModeMap(),
  )
  const selectedModelIdByContext = ref<Record<string, string>>(loadSelectedModelMap())
  const selectedCollaborationMode = ref<CollaborationModeKind>(
    readSelectedCollaborationMode(selectedCollaborationModeByContext.value, selectedThreadId.value),
  )
  const selectedModelId = ref(readSelectedModel(selectedModelIdByContext.value, selectedThreadId.value))
  const selectedReasoningEffort = ref<ReasoningEffort | ''>('medium')
  const selectedSpeedMode = ref<SpeedMode>('standard')
  const activeProviderId = ref('')
  const codexCliMissingError = ref('')
  const readStateByThreadId = ref<Record<string, string>>(loadReadStateMap())
  const unreadCutoffIso = ref(loadUnreadCutoffIso())
  const projectOrder = ref<string[]>(loadProjectOrder())
  const projectDisplayNameById = ref<Record<string, string>>(loadProjectDisplayNames())
  const loadedVersionByThreadId = ref<Record<string, string>>({})
  const loadedMessagesByThreadId = ref<Record<string, boolean>>({})
  const hasMoreOlderMessagesByThreadId = ref<Record<string, boolean>>({})
  const loadingOlderMessagesByThreadId = ref<Record<string, boolean>>({})
  const resumedThreadById = ref<Record<string, boolean>>({})
  const turnIndexByTurnIdByThreadId = ref<Record<string, Record<string, number>>>({})
  const turnSummaryByThreadId = ref<Record<string, TurnSummaryState>>({})
  const turnActivityByThreadId = ref<Record<string, TurnActivityState>>({})
  // round-23：审批/询问面板回复失败时展示的可见错误（按 requestId），
  // 让「点了没反应」不再无声发生。
  const pendingReplyErrorByRequestId = ref<Record<string, string>>({})
  const turnErrorByThreadId = ref<Record<string, TurnErrorState>>({})
  const activeTurnIdByThreadId = ref<Record<string, string>>({})
  const interruptBlockedUntilPersistedByThreadId = ref<Record<string, boolean>>({})
  const threadListedByServerById = ref<Record<string, boolean>>({})
  const persistedUserMessageByThreadId = ref<Record<string, boolean>>({})

  // 需求 9 UI 优化：turn/interrupt 中断一个尚未产出 agent 输出的 turn 时，服务端会
  // 把该 turn（含用户消息）从线程历史整体移除（事务式回滚）。检测到该场景后把未
  // 提交的用户消息载荷存于此，供 UI 回填输入框并提示，避免用户以为消息丢失。
  const interruptedUnsubmittedByThreadId = ref<Record<string, InterruptRecoverPayload>>({})
  const pendingServerRequestsByThreadId = ref<Record<string, UiServerRequest[]>>({})
  const pendingTurnRequestByThreadId = ref<Record<string, PendingTurnRequest>>({})
  const codexRateLimit = ref<UiRateLimitSnapshot | null>(null)
  const threadTokenUsageByThreadId = ref<Record<string, UiThreadTokenUsage>>(loadThreadTokenUsageMap())
  const terminalOpenByThreadId = ref<Record<string, boolean>>(loadThreadTerminalOpenMap())
  const threadModelProviderByThreadId = ref<Record<string, string>>({})

  const threadTitleById = ref<Record<string, string>>({})

  const installedSkills = ref<SkillInfo[]>([])
  const accountRateLimitSnapshots = ref<UiRateLimitSnapshot[]>([])
  const hooksList = ref<UiHooksListEntry[]>([])
  const isHooksLoading = ref(false)

  const isLoadingThreads = ref(false)
  const isLoadingMessages = ref(false)
  const isThreadListFullyLoaded = ref(false)
  const isSendingMessage = ref(false)
  const isInterruptingTurn = ref(false)
  const isUpdatingSpeedMode = ref(false)
  const isRollingBack = ref(false)
  const compactingThreadIds = ref(new Set<string>())
  const COMPACT_STATE_TIMEOUT_MS = 60_000
  const fuzzyFileSearchResults = ref<Array<{ path: string }>>([])
  let fuzzyFileSearchSessionId = ''

  const error = ref('')
  const isPolling = ref(false)
  const hasLoadedThreads = ref(false)

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
  let rateLimitRefreshTimer: number | null = null
  const delayedTurnSyncTimerByThreadId = new Map<string, number>()
  let loadThreadsPromise: Promise<void> | null = null
  const loadMessagePromiseByThreadId = new Map<string, Promise<void>>()
  let refreshSkillsPromise: Promise<void> | null = null
  let refreshHooksPromise: Promise<void> | null = null
  let lastThreadListLoadAt = 0
  let hasLoadedSkills = false
  let hasLoadedHooks = false
  let lastSkillsLoadAt = 0
  let lastSkillsLoadKey = ''
  let rateLimitRefreshPromise: Promise<void> | null = null
  let pendingThreadsRefresh = false
  let pendingThreadsRefreshForce = false
  const pendingThreadMessageRefresh = new Set<string>()
  const lastMessageLoadAtByThreadId = new Map<string, number>()
  const lastMessageLoadFailureAtByThreadId = new Map<string, number>()
  let threadListNextCursor: string | null = null
  let threadListBackgroundTimer: number | null = null
  let isLoadingRemainingThreadPages = false
  let hasLoadedAllThreadPages = false
  let loadedThreadListGroups: UiProjectGroup[] = []
  let loadedThreadListRootsState: WorkspaceRootsState | null = null
  let hasHydratedWorkspaceRootsState = false
  let activeReasoningItemId = ''
  let shouldAutoScrollOnNextAgentEvent = false
  const pendingTurnStartsById = new Map<string, TurnStartedInfo>()
  const fallbackRetryInFlightThreadIds = new Set<string>()


  const allThreads = computed(() => flattenThreads(projectGroups.value))
  const selectedThread = computed(() =>
    allThreads.value.find((thread) => thread.id === selectedThreadId.value) ?? null,
  )
  const selectedThreadTerminalOpen = computed(() => {
    const threadId = selectedThreadId.value
    return Boolean(threadId && terminalOpenByThreadId.value[threadId] === true)
  })
  const isSelectedThreadInterruptPending = computed(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return false
    return interruptBlockedUntilPersistedByThreadId.value[threadId] === true
  })
  const selectedThreadServerRequests = computed<UiServerRequest[]>(() => {
    const rows: UiServerRequest[] = []
    const selected = selectedThreadId.value
    if (selected && Array.isArray(pendingServerRequestsByThreadId.value[selected])) {
      rows.push(...pendingServerRequestsByThreadId.value[selected])
    }
    if (Array.isArray(pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])) {
      rows.push(...pendingServerRequestsByThreadId.value[GLOBAL_SERVER_REQUEST_SCOPE])
    }
    return rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
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
  const codexQuota = computed<UiRateLimitSnapshot | null>(() => codexRateLimit.value)
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
    if (!summary) return combined
    return insertTurnSummaryMessage(combined, summary)
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

  function readModelIdForThread(threadId: string): string {
    const contextId = toThreadContextId(threadId)
    if (contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT) {
      const normalizedProviderId = normalizeProviderContextId(activeProviderId.value)
      const providerContextId = toProviderModelContextId(normalizedProviderId)
      const providerModelId = providerContextId
        ? normalizeStoredModelId(selectedModelIdByContext.value[providerContextId])
        : ''
      if (providerModelId) return providerModelId
    }
    return readSelectedModel(selectedModelIdByContext.value, threadId).trim()
  }

  function readProviderIdForThread(threadId: string): string {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return normalizeProviderContextId(activeProviderId.value)
    return normalizeProviderContextId(threadModelProviderByThreadId.value[normalizedThreadId] ?? activeProviderId.value)
  }

  function readSupportedReasoningEffortsForModel(modelId: string): readonly ReasoningEffort[] {
    return availableModelReasoningEfforts.value[modelId.trim()] ?? REASONING_EFFORT_OPTIONS
  }

  function pickReasoningEffortForModel(
    modelId: string,
    preferredEffort: ReasoningEffort | '' = selectedReasoningEffort.value,
  ): ReasoningEffort | '' {
    const normalizedModelId = modelId.trim()
    const supportedEfforts = readSupportedReasoningEffortsForModel(normalizedModelId)
    if (preferredEffort && supportedEfforts.includes(preferredEffort)) return preferredEffort
    if (supportedEfforts.includes('medium')) return 'medium'
    const defaultEffort = availableModelDefaultReasoningEfforts.value[normalizedModelId]
    if (defaultEffort && supportedEfforts.includes(defaultEffort)) return defaultEffort
    return supportedEfforts[0] ?? ''
  }

  function ensureReasoningEffortSupportedForModel(modelId: string): void {
    selectedReasoningEffort.value = pickReasoningEffortForModel(modelId)
  }

  function setAvailableModelMetadata(models: AvailableModel[]): void {
    const reasoningEfforts: Record<string, ReasoningEffort[]> = {}
    const defaultReasoningEfforts: Record<string, ReasoningEffort> = {}
    for (const model of models) {
      if (model.supportedReasoningEfforts !== null) {
        reasoningEfforts[model.id] = [...model.supportedReasoningEfforts]
      }
      if (model.defaultReasoningEffort) {
        defaultReasoningEfforts[model.id] = model.defaultReasoningEffort
      }
    }
    availableModelReasoningEfforts.value = reasoningEfforts
    availableModelDefaultReasoningEfforts.value = defaultReasoningEfforts
  }

  function ensureAvailableModelIds(...modelIds: string[]): void {
    const nextModelIds = [...availableModelIds.value]
    for (const modelId of modelIds) {
      const normalizedModelId = modelId.trim()
      if (normalizedModelId && !nextModelIds.includes(normalizedModelId)) {
        nextModelIds.push(normalizedModelId)
      }
    }
    if (!areStringArraysEqual(availableModelIds.value, nextModelIds)) {
      availableModelIds.value = nextModelIds
    }
  }

  function readProviderCompatibleSelectedModel(modelId: string): string {
    const normalizedModelId = modelId.trim()
    if (availableModelIds.value.length === 0) return normalizedModelId
    if (normalizedModelId && availableModelIds.value.includes(normalizedModelId)) return normalizedModelId
    return availableModelIds.value[0] ?? ''
  }

  function setSelectedThreadId(nextThreadId: string, options: { persist?: boolean } = {}): void {
    if (selectedThreadId.value === nextThreadId) return
    selectedThreadId.value = nextThreadId
    if (options.persist !== false) {
      saveSelectedThreadId(nextThreadId)
    }
    selectedModelId.value = readProviderCompatibleSelectedModel(readModelIdForThread(nextThreadId))
    ensureReasoningEffortSupportedForModel(selectedModelId.value)
    selectedCollaborationMode.value = readSelectedCollaborationMode(
      selectedCollaborationModeByContext.value,
      nextThreadId,
    )
    activeReasoningItemId = ''
    shouldAutoScrollOnNextAgentEvent = false
  }

  function setSelectedModelIdForThread(threadId: string, modelId: string): void {
    const normalizedModelId = modelId.trim()
    const contextId = toThreadContextId(threadId)
    const normalizedProviderId = normalizeProviderContextId(activeProviderId.value)
    const providerContextId =
      contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT
        ? toProviderModelContextId(normalizedProviderId)
        : ''
    const selectedContextId = providerContextId || contextId
    if (normalizedModelId) {
      const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
      nextModelMap[selectedContextId] = normalizedModelId
      if (providerContextId) {
        delete nextModelMap[contextId]
      }
      selectedModelIdByContext.value = nextModelMap
    } else {
      let nextModelMap = omitStringKeyedRecordKey(selectedModelIdByContext.value, selectedContextId)
      if (providerContextId) {
        nextModelMap = omitStringKeyedRecordKey(nextModelMap, contextId)
      }
      selectedModelIdByContext.value = nextModelMap
    }
    if (contextId === toThreadContextId(selectedThreadId.value)) {
      selectedModelId.value = readModelIdForThread(selectedThreadId.value)
      ensureAvailableModelIds(selectedModelId.value)
      ensureReasoningEffortSupportedForModel(selectedModelId.value)
    } else {
      ensureAvailableModelIds(normalizedModelId)
    }
    saveSelectedModelMap(selectedModelIdByContext.value)
  }

  function setSelectedModelId(modelId: string): void {
    setSelectedModelIdForThread(selectedThreadId.value, modelId)
  }

  function setThreadModelId(threadId: string, modelId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    const normalizedModelId = modelId.trim()
    if (normalizedModelId) {
      const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
      nextModelMap[normalizedThreadId] = normalizedModelId
      selectedModelIdByContext.value = nextModelMap
    } else {
      selectedModelIdByContext.value = omitStringKeyedRecordKey(selectedModelIdByContext.value, normalizedThreadId)
    }
    ensureAvailableModelIds(normalizedModelId)
    if (selectedThreadId.value === normalizedThreadId) {
      selectedModelId.value = readModelIdForThread(selectedThreadId.value)
      ensureReasoningEffortSupportedForModel(selectedModelId.value)
    }
    saveSelectedModelMap(selectedModelIdByContext.value)
  }

  function setThreadModelProviderId(threadId: string, providerId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    const normalizedProviderId = normalizeProviderContextId(providerId)
    if (normalizedProviderId) {
      threadModelProviderByThreadId.value = {
        ...threadModelProviderByThreadId.value,
        [normalizedThreadId]: normalizedProviderId,
      }
    } else if (threadModelProviderByThreadId.value[normalizedThreadId]) {
      threadModelProviderByThreadId.value = omitKey(threadModelProviderByThreadId.value, normalizedThreadId)
    }
  }

  function resolveThreadModelForProvider(threadId: string, modelId: string, providerId: string): string {
    const normalizedModelId = modelId.trim()
    const normalizedProviderId = normalizeProviderContextId(providerId)
    if (normalizedProviderId !== 'opencode-zen') {
      return normalizedModelId
    }

    const previousThreadModel = readModelIdForThread(threadId).trim()
    if (previousThreadModel && !/^gpt-/i.test(previousThreadModel)) {
      return previousThreadModel
    }
    if (normalizedModelId && !/^gpt-/i.test(normalizedModelId)) {
      return normalizedModelId
    }
    return OPENCODE_ZEN_DEFAULT_MODEL
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
    const stashed = stashedMessagesByThreadId.value[normalizedThreadId]
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

  function setSelectedCollaborationMode(mode: CollaborationModeKind): void {
    const nextMode: CollaborationModeKind = mode === 'plan' ? 'plan' : 'default'
    const contextId = toThreadContextId(selectedThreadId.value)
    const currentMode = readSelectedCollaborationMode(selectedCollaborationModeByContext.value, selectedThreadId.value)
    if (currentMode === nextMode && selectedCollaborationMode.value === nextMode) return
    selectedCollaborationMode.value = nextMode
    selectedCollaborationModeByContext.value = writeSelectedCollaborationModeForContext(
      selectedCollaborationModeByContext.value,
      contextId,
      nextMode,
    )
    saveSelectedCollaborationModeMap(selectedCollaborationModeByContext.value)
  }

  function setSelectedCollaborationModeForThread(threadId: string, mode: CollaborationModeKind): void {
    const nextMode = mode === 'plan' ? 'plan' : 'default'
    selectedCollaborationModeByContext.value = writeSelectedCollaborationModeForContext(
      selectedCollaborationModeByContext.value,
      threadId,
      nextMode,
    )
    if (threadId.trim() === selectedThreadId.value) {
      selectedCollaborationMode.value = nextMode
    }
    saveSelectedCollaborationModeMap(selectedCollaborationModeByContext.value)
  }

  function setCodexRateLimit(nextSnapshot: UiRateLimitSnapshot | null): void {
    codexRateLimit.value = nextSnapshot
  }

  async function applyFallbackModelSelection(threadId: string = selectedThreadId.value): Promise<void> {
    if (threadId.trim()) {
      setThreadModelId(threadId, MODEL_FALLBACK_ID)
    } else {
      setSelectedModelId(MODEL_FALLBACK_ID)
    }
    ensureAvailableModelIds(MODEL_FALLBACK_ID)
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

  function setSelectedReasoningEffort(effort: ReasoningEffort | ''): void {
    if (effort && !readSupportedReasoningEffortsForModel(selectedModelId.value).includes(effort)) {
      return
    }
    selectedReasoningEffort.value = effort
  }

  async function updateSelectedSpeedMode(mode: SpeedMode): Promise<void> {
    const nextMode: SpeedMode = mode === 'fast' ? 'fast' : 'standard'
    if (isUpdatingSpeedMode.value || selectedSpeedMode.value === nextMode) {
      return
    }

    const previousMode = selectedSpeedMode.value
    selectedSpeedMode.value = nextMode
    isUpdatingSpeedMode.value = true
    error.value = ''

    try {
      await setCodexSpeedMode(nextMode)
    } catch (unknownError) {
      selectedSpeedMode.value = previousMode
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to update Fast mode'
    } finally {
      isUpdatingSpeedMode.value = false
    }
  }

  async function refreshCollaborationModes(): Promise<void> {
    try {
      const modes = await getAvailableCollaborationModes()
      availableCollaborationModes.value = modes
      if (!modes.some((mode) => mode.value === selectedCollaborationMode.value)) {
        setSelectedCollaborationMode('default')
      }
    } catch {
      // Keep the last known collaboration mode choices on transient failures.
    }
  }

  function buildPendingTurnDetails(
    modelId: string,
    effort: ReasoningEffort | '',
    collaborationMode: CollaborationModeKind = selectedCollaborationMode.value,
  ): string[] {
    const modelLabel = modelId.trim() || 'default'
    const effortLabel = effort || 'default'
    const modeLabel = collaborationMode === 'plan' ? 'Plan' : 'Default'
    const speedLabel = selectedSpeedMode.value === 'fast' ? 'Fast' : 'Standard'
    return [`Mode: ${modeLabel}`, `Model: ${modelLabel}`, `Thinking: ${effortLabel}`, `Speed: ${speedLabel}`]
  }

  async function refreshModelPreferences(options?: { providerChanged?: boolean; includeProviderModels?: boolean }): Promise<void> {
    codexCliMissingError.value = ''
    try {
      const currentConfig = await getCurrentModelConfig()
      const normalizedConfiguredModelId = currentConfig.model.trim()
      const normalizedProviderId = normalizeProviderContextId(currentConfig.providerId)
      activeProviderId.value = normalizedProviderId
      const targetProviderId = readProviderIdForThread(selectedThreadId.value)
      // round-42：config.toml 的 model_provider = "custom"（litellm）表示选
      // "Codex" 时走 codex-cli 的模型目录（model_catalog_json，deepseek-v4-flash/pro），
      // 与 UI 的"自定义端点"（custom-endpoint）不同，不应按 provider-backed 处理，
      // 否则模型列表只剩 litellm /models 暴露的模型而丢 model/list 目录项。
      const isProviderBacked = targetProviderId !== 'codex' && targetProviderId !== 'custom'
      const normalizedSelectedModelId = readModelIdForThread(selectedThreadId.value)
      const models = await getAvailableModels({
        includeProviderModels: isProviderBacked || options?.includeProviderModels !== false,
        requireProviderModels: isProviderBacked,
        providerId: isProviderBacked ? targetProviderId : undefined,
      })
      const modelIds = models.map((model) => model.id)
      setAvailableModelMetadata(models)
      const providerModelContextId = toProviderModelContextId(targetProviderId)
      const providerScopedModelId = providerModelContextId
        ? normalizeStoredModelId(selectedModelIdByContext.value[providerModelContextId])
        : ''
      const nextModelIds = [...modelIds]
      if (
        !options?.providerChanged
        && isProviderBacked
        && targetProviderId === normalizedProviderId
        && normalizedConfiguredModelId
        && !nextModelIds.includes(normalizedConfiguredModelId)
      ) {
        nextModelIds.push(normalizedConfiguredModelId)
      }
      availableModelIds.value = nextModelIds

      const currentModelInNewList = normalizedSelectedModelId && modelIds.includes(normalizedSelectedModelId)
      if (!normalizedSelectedModelId || !currentModelInNewList || options?.providerChanged) {
        if (options?.providerChanged && nextModelIds.length > 0) {
          if (providerScopedModelId && modelIds.includes(providerScopedModelId)) {
            setSelectedModelId(providerScopedModelId)
          } else if (targetProviderId === normalizedProviderId && normalizedConfiguredModelId && nextModelIds.includes(normalizedConfiguredModelId)) {
            setSelectedModelId(normalizedConfiguredModelId)
          } else {
            setSelectedModelId(nextModelIds[0])
          }
        } else if (targetProviderId === normalizedProviderId && normalizedConfiguredModelId && nextModelIds.includes(normalizedConfiguredModelId)) {
          setSelectedModelId(currentConfig.model)
        } else if (nextModelIds.length > 0) {
          setSelectedModelId(nextModelIds[0])
        } else {
          setSelectedModelId('')
        }
      } else if (selectedModelId.value.trim() !== normalizedSelectedModelId) {
        setSelectedModelId(normalizedSelectedModelId)
      }
      if (providerModelContextId && selectedModelId.value.trim().length > 0) {
        const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
        nextModelMap[providerModelContextId] = selectedModelId.value.trim()
        const activeProviderModelContextId = toProviderModelContextId(normalizedProviderId)
        if (
          activeProviderModelContextId
          && activeProviderModelContextId !== providerModelContextId
          && normalizedConfiguredModelId
        ) {
          nextModelMap[activeProviderModelContextId] = normalizedConfiguredModelId
        }
        selectedModelIdByContext.value = nextModelMap
        saveSelectedModelMap(selectedModelIdByContext.value)
      }

      selectedReasoningEffort.value = pickReasoningEffortForModel(
        selectedModelId.value,
        currentConfig.reasoningEffort,
      )
      selectedSpeedMode.value = currentConfig.speedMode
    } catch (unknownError) {
      if (isCodexCliMissingError(unknownError)) {
        codexCliMissingError.value = CODEX_CLI_MISSING_MESSAGE
      } else {
        codexCliMissingError.value = ''
      }
      // Keep chat UI usable even if model metadata is temporarily unavailable.
    }
  }

  async function refreshRateLimits(): Promise<void> {
    if (rateLimitRefreshPromise) {
      await rateLimitRefreshPromise
      return
    }

    rateLimitRefreshPromise = (async () => {
      try {
        const snapshot = await getAccountRateLimits()
        setCodexRateLimit(snapshot)
        accountRateLimitSnapshots.value = snapshot ? [snapshot] : []
      } catch {
        // Keep the last known rate-limit state if the endpoint is temporarily unavailable.
      } finally {
        rateLimitRefreshPromise = null
      }
    })()

    await rateLimitRefreshPromise
  }

  function scheduleRateLimitRefresh(): void {
    if (typeof window === 'undefined') {
      void refreshRateLimits()
      return
    }

    if (rateLimitRefreshTimer !== null) {
      window.clearTimeout(rateLimitRefreshTimer)
    }

    rateLimitRefreshTimer = window.setTimeout(() => {
      rateLimitRefreshTimer = null
      void refreshRateLimits()
    }, RATE_LIMIT_REFRESH_DEBOUNCE_MS)
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

  function applyCachedTitlesToGroups(groups: UiProjectGroup[]): UiProjectGroup[] {
    const titles = threadTitleById.value
    // round-24：无论缓存命中与否，展示层统一把线程名收口到 20 字以内——
    // app-server thread/list 返回的 title/preview 可能是第一轮用户消息全文，
    // 仅依赖 thread/name/updated 通知截断覆盖不到（无缓存/刷新后仍超长）。
    if (Object.keys(titles).length === 0) {
      return groups.map((group) => ({
        projectName: group.projectName,
        threads: group.threads.map((thread) => ({ ...thread, title: toOptimisticThreadTitle(thread.title) })),
      }))
    }
    return groups.map((group) => ({
      projectName: group.projectName,
      threads: group.threads.map((thread) => {
        const cached = titles[thread.id]
        return {
          ...thread,
          title: toOptimisticThreadTitle(cached ?? thread.title),
        }
      }),
    }))
  }

  function getThreadPendingRequests(threadId: string): UiServerRequest[] {
    if (!threadId) return []
    return Array.isArray(pendingServerRequestsByThreadId.value[threadId])
      ? pendingServerRequestsByThreadId.value[threadId]
      : []
  }

  function readPendingRequestState(requests: UiServerRequest[]): UiPendingRequestState | null {
    if (requests.some((request) => isApprovalRequestMethod(request.method))) {
      return 'approval'
    }
    return requests.length > 0 ? 'response' : null
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
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }
    applyThreadFlags()
  }

  function pruneThreadScopedState(flatThreads: UiThread[]): void {
    const activeThreadIds = new Set(flatThreads.map((thread) => thread.id))
    const currentThreadId = selectedThreadId.value.trim()
    if (currentThreadId) {
      activeThreadIds.add(currentThreadId)
    }
    const nextSelectedModelMap = pruneThreadContextStateMap(selectedModelIdByContext.value, activeThreadIds)
    if (nextSelectedModelMap !== selectedModelIdByContext.value) {
      selectedModelIdByContext.value = nextSelectedModelMap
      selectedModelId.value = readProviderCompatibleSelectedModel(readModelIdForThread(selectedThreadId.value))
      saveSelectedModelMap(nextSelectedModelMap)
    }
    const nextSelectedCollaborationModeMap = pruneThreadContextStateMap(
      selectedCollaborationModeByContext.value,
      activeThreadIds,
    )
    if (nextSelectedCollaborationModeMap !== selectedCollaborationModeByContext.value) {
      selectedCollaborationModeByContext.value = nextSelectedCollaborationModeMap
      selectedCollaborationMode.value = readSelectedCollaborationMode(
        nextSelectedCollaborationModeMap,
        selectedThreadId.value,
      )
      saveSelectedCollaborationModeMap(nextSelectedCollaborationModeMap)
    }
    const nextReadState = pruneThreadStateMap(readStateByThreadId.value, activeThreadIds)
    if (nextReadState !== readStateByThreadId.value) {
      readStateByThreadId.value = nextReadState
      saveReadStateMap(nextReadState)
    }
    loadedMessagesByThreadId.value = pruneThreadStateMap(loadedMessagesByThreadId.value, activeThreadIds)
    loadedVersionByThreadId.value = pruneThreadStateMap(loadedVersionByThreadId.value, activeThreadIds)
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
    threadModelProviderByThreadId.value = pruneThreadStateMap(threadModelProviderByThreadId.value, activeThreadIds)
    const nextQueuedMessages = pruneThreadStateMap(queuedMessagesByThreadId.value, activeThreadIds)
    if (nextQueuedMessages !== queuedMessagesByThreadId.value) {
      queuedMessagesByThreadId.value = nextQueuedMessages
      persistQueueState()
    }
    threadTokenUsageByThreadId.value = pruneThreadStateMap(threadTokenUsageByThreadId.value, activeThreadIds)
    eventUnreadByThreadId.value = pruneThreadStateMap(eventUnreadByThreadId.value, activeThreadIds)
    inProgressById.value = pruneThreadStateMap(inProgressById.value, activeThreadIds)
    const nextPending: Record<string, UiServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      if (threadId === GLOBAL_SERVER_REQUEST_SCOPE || activeThreadIds.has(threadId)) {
        nextPending[threadId] = requests
      }
    }
    pendingServerRequestsByThreadId.value = nextPending
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
    if (!nextInProgress && !hasActiveInProgressThreads() && threadListNextCursor) {
      scheduleRemainingThreadPages()
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
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    liveAgentMessagesByThreadId.value = {
      ...liveAgentMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function clearLiveAgentMessagesForThread(threadId: string): void {
    if (!threadId) return
    if (!(threadId in liveAgentMessagesByThreadId.value)) return
    liveAgentMessagesByThreadId.value = omitKey(liveAgentMessagesByThreadId.value, threadId)
  }

  function setLiveFileChangeMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = liveFileChangeMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    liveFileChangeMessagesByThreadId.value = {
      ...liveFileChangeMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function setLivePlanMessagesForThread(threadId: string, nextMessages: UiMessage[]): void {
    const previous = livePlanMessagesByThreadId.value[threadId] ?? []
    if (areMessageArraysEqual(previous, nextMessages)) return
    livePlanMessagesByThreadId.value = {
      ...livePlanMessagesByThreadId.value,
      [threadId]: nextMessages,
    }
  }

  function upsertLivePlanMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = livePlanMessagesByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, nextMessage)
    setLivePlanMessagesForThread(threadId, next)
    rememberLastPlan(threadId, nextMessage)
  }

  // round-27：记录该线程最近一次 plan（本地持久化）。部分 provider 下 plan
  // 只实时推送、服务端不持久化，刷新后消息流里没有 plan 消息 → 输入框上方
  // 计划面板消失；这里存一份供 composerPlanPanel 兜底恢复。
  function rememberLastPlan(threadId: string, planMessage: UiMessage): void {
    if (!threadId || !planMessage) return
    lastPlanByThreadId.value = {
      ...lastPlanByThreadId.value,
      [threadId]: planMessage,
    }
    saveLastPlanMap(lastPlanByThreadId.value)
  }

  function upsertLiveAgentMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = liveAgentMessagesByThreadId.value[threadId] ?? []
    let next = upsertMessage(previous, nextMessage)
    // round-52：live 文本级去重。同一段助手文本可能以两个不同 id 进入 live
    // （delta 通道用 params.itemId、completed 通道用 item.id），mergeLiveMessages
    // 只按 id 去重无法消除 → 进行中重复 agentMessage 块 + 副本挂 toolbar。
    // 与轮末/刷新的 removeRedundantLiveAgentMessages 同用 normalizeMessageText，
    // 保留最新一条（同 id 由 upsertMessage 替换、同文本不同 id 在此移除）。
    const normalizedText = normalizeMessageText(nextMessage.text)
    if (nextMessage.role === 'assistant' && normalizedText.length > 0) {
      const deduped = next.filter(
        (message) => message.id === nextMessage.id || normalizeMessageText(message.text) !== normalizedText,
      )
      if (deduped.length !== next.length) {
        next = deduped
      }
    }
    setLiveAgentMessagesForThread(threadId, next)
  }

  function upsertLiveFileChangeMessage(threadId: string, nextMessage: UiMessage): void {
    const previous = liveFileChangeMessagesByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, nextMessage)
    setLiveFileChangeMessagesForThread(threadId, next)
  }

  function setLiveReasoningText(threadId: string, text: string): void {
    if (!threadId) return
    const normalized = text.trim()
    const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
    if (normalized.length === 0) {
      if (!previous) return
      liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
      return
    }
    if (previous === normalized) return
    liveReasoningTextByThreadId.value = {
      ...liveReasoningTextByThreadId.value,
      [threadId]: normalized,
    }
    // round-27：刷新后 overlay 思考文本恢复（快照节流写 localStorage）
    rememberLiveReasoningSnapshot(threadId, normalized)
  }

  function appendLiveReasoningText(threadId: string, delta: string): void {
    if (!threadId) return
    const previous = liveReasoningTextByThreadId.value[threadId] ?? ''
    setLiveReasoningText(threadId, `${previous}${delta}`)
  }

  function recordActiveReasoningTurn(threadId: string): void {
    if (!threadId) return
    const activeTurnId = activeTurnIdByThreadId.value[threadId] ?? ''
    if (activeTurnId) activeReasoningTurnIdByThreadId.set(threadId, activeTurnId)
  }

  // round-27：keepSequence=true 时（agent 内容事件触发的中途清理）保留
  // turnItemSequenceByThreadId 时间线——此前每次 agent 内容事件都删掉时间线，
  // 后续思考项丢失锚点（reasoningAnchorMessageId 为空）→ mergePersistedReasoning
  // 全部回退插到该轮用户消息之后 → 最后一轮思考堆在「用户消息后、模型回答前」。
  // 时间线只在轮次真正结束时删除；存档按稳定 id 原地更新，中途清理不产生重复块。
  function clearLiveReasoningForThread(threadId: string, keepSequence = false): void {
    if (!threadId) return
    const current = liveReasoningTextByThreadId.value[threadId]
    if (current === undefined) {
      if (!keepSequence) {
        turnItemSequenceByThreadId.delete(threadId)
        reasoningAppendedTextByItemId.clear()
      }
      return
    }
    const turnId = activeReasoningTurnIdByThreadId.get(threadId) ?? activeTurnIdByThreadId.value[threadId] ?? ''
    activeReasoningTurnIdByThreadId.delete(threadId)
    const turnIndex = turnId ? turnIndexByTurnIdByThreadId.value[threadId]?.[turnId] : undefined
    // round-23：优先按 item 粒度按时序存档（思考项插回对应工具/命令之后），
    // 拿不到 item 时间线时退回整段文本存档（旧行为）。中途清理（keepSequence）
    // 时不走整段兜底，避免同一轮多次存档产生重复块，等轮末再兜底一次。
    const reasoningItems = buildTurnReasoningItems(threadId)
    if (reasoningItems.length > 0) {
      rememberPersistedReasoningItems(threadId, reasoningItems, turnId || undefined, turnIndex)
    } else if (!keepSequence) {
      rememberPersistedReasoning(threadId, current, turnId || undefined, turnIndex)
    }
    liveReasoningTextByThreadId.value = omitKey(liveReasoningTextByThreadId.value, threadId)
    if (!keepSequence) {
      turnItemSequenceByThreadId.delete(threadId)
      reasoningAppendedTextByItemId.clear()
      clearLiveReasoningSnapshot(threadId)
    }
  }

  // 把完整 thinking 文本存档为 reasoning 消息（本地持久化，刷新后仍展示）。
  function rememberPersistedReasoning(threadId: string, text: string, turnId?: string, turnIndex?: number): void {
    if (!threadId) return
    const normalized = text.trim()
    if (!normalized) return
    const previous = persistedReasoningByThreadId.value[threadId] ?? []
    if (previous.some((message) => message.text === normalized)) return
    const nextMessage: UiMessage = {
      id: `reasoning:local:${threadId}:${Date.now()}`,
      role: 'system',
      text: normalized,
      messageType: 'reasoning',
      reasoning: { summary: [], content: [normalized] },
      turnId: turnId || undefined,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
    }
    // ponytail: 每线程最多保留 20 条，防止 localStorage 无限增长；如需更多
    // 历史可改为按容量或按天裁剪。
    const next = [...previous, nextMessage].slice(-20)
    persistedReasoningByThreadId.value = {
      ...persistedReasoningByThreadId.value,
      [threadId]: next,
    }
    savePersistedReasoningMap(persistedReasoningByThreadId.value)
  }

  // round-23：按 item 粒度按时序存档思考（每条带 reasoningAnchorMessageId，
  // 合并时插到对应工具/命令之后，实现「提问 -> 思考 -> 工具 -> 思考 -> …」顺序）。
  // round-27：改用按 itemId 的稳定 id（reasoning:item:*）。同一推理项在流式
  // 过程中文本增长时原地更新而不是新增条目——此前按 text+turnId 去重，部分文本
  // 先被归档、全量文本再插一条会形成重复思考块。
  function rememberPersistedReasoningItems(
    threadId: string,
    items: Array<{ text: string; anchorMessageId: string; itemId: string }>,
    turnId?: string,
    turnIndex?: number,
  ): void {
    if (!threadId || items.length === 0) return
    const previous = persistedReasoningByThreadId.value[threadId] ?? []
    const next = [...previous]
    for (const item of items) {
      const normalized = item.text.trim()
      if (!normalized) continue
      const stableId = `reasoning:item:${threadId}:${item.itemId}`
      const existingIndex = next.findIndex((message) => message.id === stableId)
      if (existingIndex >= 0) {
        const existing = next[existingIndex]
        const nextAnchor = item.anchorMessageId || existing.reasoningAnchorMessageId
        const nextTurnIndex = typeof turnIndex === 'number' ? turnIndex : existing.turnIndex
        if (existing.text === normalized && existing.turnIndex === nextTurnIndex && existing.reasoningAnchorMessageId === nextAnchor) {
          continue
        }
        next[existingIndex] = {
          ...existing,
          text: normalized,
          reasoning: { summary: [], content: [normalized] },
          turnId: turnId || existing.turnId,
          turnIndex: nextTurnIndex,
          reasoningAnchorMessageId: nextAnchor,
        }
        continue
      }
      // 兼容旧存档：同文本已存在（reasoning:local:* 旧 id 或另一条推理）则跳过，
      // 避免新旧两种存档格式在同一轮并存造成重复块。
      if (next.some((message) => message.text === normalized)) continue
      next.push({
        id: stableId,
        role: 'system',
        text: normalized,
        messageType: 'reasoning',
        reasoning: { summary: [], content: [normalized] },
        turnId: turnId || undefined,
        turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
        reasoningAnchorMessageId: item.anchorMessageId || undefined,
      })
    }
    const pruned = next.slice(-20)
    persistedReasoningByThreadId.value = {
      ...persistedReasoningByThreadId.value,
      [threadId]: pruned,
    }
    savePersistedReasoningMap(persistedReasoningByThreadId.value)
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

  function upsertPendingServerRequest(request: UiServerRequest): void {
    const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
    const current = pendingServerRequestsByThreadId.value[threadId] ?? []
    const index = current.findIndex((row) => row.id === request.id)
    const nextRows = [...current]
    if (index >= 0) {
      nextRows.splice(index, 1, request)
    } else {
      nextRows.push(request)
    }

    pendingServerRequestsByThreadId.value = {
      ...pendingServerRequestsByThreadId.value,
      [threadId]: nextRows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso)),
    }
    applyThreadFlags()
  }

  function removePendingServerRequestById(requestId: number): void {
    const next: Record<string, UiServerRequest[]> = {}
    for (const [threadId, requests] of Object.entries(pendingServerRequestsByThreadId.value)) {
      const filtered = requests.filter((request) => request.id !== requestId)
      if (filtered.length > 0) {
        next[threadId] = filtered
      }
    }
    pendingServerRequestsByThreadId.value = next
    if (pendingReplyErrorByRequestId.value[String(requestId)]) {
      pendingReplyErrorByRequestId.value = omitKey(pendingReplyErrorByRequestId.value, String(requestId))
    }
    applyThreadFlags()
  }

  // round-23：读取某个待办请求的可见回复错误（供审批/询问面板展示）。
  function pendingReplyErrorForRequest(requestId: number): string {
    return pendingReplyErrorByRequestId.value[String(requestId)] ?? ''
  }

  function replacePendingServerRequests(requests: UiServerRequest[]): void {
    const next: Record<string, UiServerRequest[]> = {}
    const liveIds = new Set<number>()
    for (const request of requests) {
      const threadId = request.threadId || GLOBAL_SERVER_REQUEST_SCOPE
      const current = next[threadId] ?? []
      current.push(request)
      next[threadId] = current
      liveIds.add(request.id)
    }

    for (const rows of Object.values(next)) {
      rows.sort((first, second) => first.receivedAtIso.localeCompare(second.receivedAtIso))
    }

    pendingServerRequestsByThreadId.value = next
    const nextErrors: Record<string, string> = {}
    for (const [requestId, message] of Object.entries(pendingReplyErrorByRequestId.value)) {
      if (liveIds.has(Number(requestId))) nextErrors[requestId] = message
    }
    pendingReplyErrorByRequestId.value = nextErrors
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
    const persisted = persistedMessagesByThreadId.value[threadId] ?? []
    let maxTurnIndex = -1
    for (const message of persisted) {
      if (typeof message.turnIndex === 'number' && Number.isFinite(message.turnIndex)) {
        maxTurnIndex = Math.max(maxTurnIndex, message.turnIndex)
      }
    }
    return maxTurnIndex + 1
  }

  function setTurnIndexForThread(threadId: string, turnId: string, turnIndex: number): void {
    if (!threadId || !turnId || !Number.isInteger(turnIndex) || turnIndex < 0) return
    const previous = turnIndexByTurnIdByThreadId.value[threadId] ?? {}
    if (previous[turnId] === turnIndex) return
    turnIndexByTurnIdByThreadId.value = {
      ...turnIndexByTurnIdByThreadId.value,
      [threadId]: {
        ...previous,
        [turnId]: turnIndex,
      },
    }
  }

  function replaceTurnIndexLookupForThread(threadId: string, nextLookup: Record<string, number>): void {
    const previous = turnIndexByTurnIdByThreadId.value[threadId] ?? {}
    const previousEntries = Object.entries(previous)
    const nextEntries = Object.entries(nextLookup)
    if (
      previousEntries.length === nextEntries.length
      && previousEntries.every(([turnId, turnIndex]) => nextLookup[turnId] === turnIndex)
    ) {
      return
    }

    turnIndexByTurnIdByThreadId.value = {
      ...turnIndexByTurnIdByThreadId.value,
      [threadId]: { ...nextLookup },
    }
  }

  // 供 App.vue 在 plan 本地存档兜底路径解析计划轮序号：刷新后按 turnId 从当前
  // 线程的轮次映射重新解析（live 存档中记录的 turnIndex 可能缺失或过期）。
  function resolveThreadTurnIndex(threadId: string, turnId: string): number | undefined {
    if (!threadId || !turnId) return undefined
    const index = turnIndexByTurnIdByThreadId.value[threadId]?.[turnId]
    return typeof index === 'number' ? index : undefined
  }

  function rebindLiveFileChangeTurnIndices(threadId: string): void {
    const current = liveFileChangeMessagesByThreadId.value[threadId]
    if (!current || current.length === 0) return

    const turnIndexByTurnId = turnIndexByTurnIdByThreadId.value[threadId] ?? {}
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
    liveFileChangeMessagesByThreadId.value = {
      ...liveFileChangeMessagesByThreadId.value,
      [threadId]: next,
    }
  }

  function appendReasoningItemProgress(threadId: string, itemId: string, text: string): void {
    if (!threadId || !text) return
    // round-23：记录每个推理项的完整文本，供轮次结束后按 item 粒度按时序存档。
    if (text.trim()) reasoningItemTextByItemId.set(itemId, text.trim())
    const current = liveReasoningTextByThreadId.value[threadId] ?? ''
    const previous = reasoningAppendedTextByItemId.get(itemId) ?? ''
    if (current.endsWith(text) || (previous && text === previous)) {
      reasoningAppendedTextByItemId.set(itemId, text)
      return
    }
    if (previous && text.startsWith(previous)) {
      const delta = text.slice(previous.length)
      if (delta) appendLiveReasoningText(threadId, delta)
      reasoningAppendedTextByItemId.set(itemId, text)
      return
    }
    const separator = current.length > 0 && !current.endsWith('\n') ? '\n\n' : ''
    appendLiveReasoningText(threadId, `${separator}${text}`)
    reasoningAppendedTextByItemId.set(itemId, text)
  }

  // round-23：记录 item/started|item/completed 的到达顺序（推理项与工具项），
  // 供思考存档按真实时序插回消息流。
  // round-24：real 环境 reasoning 常走 item/reasoning/textDelta / summaryTextDelta
  // 增量通道（不伴随 item/started 的 reasoning 项）。若不记录，buildTurnReasoningItems
  // 拿不到 reasoning 项 → 回退整段存档（无 reasoningAnchorMessageId）→ 刷新后
  // 全部思考按 turnIndex 插到轮首。这里把增量通道的 itemId 也按 reasoning 记录。
  function recordTurnItemOrder(notification: RpcNotification): void {
    const params = asRecord(notification.params)
    if (!params) return

    const isItemLifecycle = notification.method === 'item/started' || notification.method === 'item/completed'
    const isReasoningDelta =
      notification.method === 'item/reasoning/textDelta' ||
      notification.method === 'item/reasoning/summaryTextDelta'
    if (!isItemLifecycle && !isReasoningDelta) return

    const item = asRecord(params.item)
    const itemId = isReasoningDelta ? readString(params.itemId) : readString(item?.id)
    if (!itemId) return
    const threadId = extractThreadIdFromNotification(notification)
    if (!threadId) return
    const kind = isReasoningDelta
      ? 'reasoning'
      : readString(item?.type).toLowerCase() === 'reasoning'
        ? 'reasoning'
        : 'other'
    const sequence = turnItemSequenceByThreadId.get(threadId) ?? []
    if (sequence.some((entry) => entry.itemId === itemId)) return
    turnItemSequenceByThreadId.set(threadId, [...sequence, { itemId, kind }])
  }

  // 从本轮时间线构建「按真实顺序排列的思考项」，每项带时序锚点：
  // anchor = 该思考项之前最近一个工具/命令/agent 项的 id（插到它后面）。
  // round-27：返回项带 itemId，供存档用稳定 id 原地更新（流式文本增长去重）。
  function buildTurnReasoningItems(threadId: string): Array<{ text: string; anchorMessageId: string; itemId: string }> {
    const sequence = turnItemSequenceByThreadId.get(threadId) ?? []
    const items: Array<{ text: string; anchorMessageId: string; itemId: string }> = []
    let lastOtherItemId = ''
    for (const entry of sequence) {
      if (entry.kind === 'reasoning') {
        const text = reasoningItemTextByItemId.get(entry.itemId)?.trim() ?? ''
        if (text) items.push({ text, anchorMessageId: lastOtherItemId, itemId: entry.itemId })
      } else {
        lastOtherItemId = entry.itemId
      }
    }
    return items
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
    const previous = liveCommandsByThreadId.value[threadId] ?? []
    const next = upsertMessage(previous, msg)
    if (next === previous) return
    liveCommandsByThreadId.value = { ...liveCommandsByThreadId.value, [threadId]: next }
  }

  function removeLiveCommandsPersistedIn(threadId: string, persistedMessages: UiMessage[]): void {
    const current = liveCommandsByThreadId.value[threadId]
    if (!current || current.length === 0) return
    const persistedIds = new Set(persistedMessages.map((m) => m.id))
    const next = current.filter((m) => !persistedIds.has(m.id))
    if (next.length === current.length) return
    if (next.length === 0) {
      liveCommandsByThreadId.value = omitKey(liveCommandsByThreadId.value, threadId)
    } else {
      liveCommandsByThreadId.value = { ...liveCommandsByThreadId.value, [threadId]: next }
    }
  }

  function removeLiveFileChangesPersistedIn(threadId: string, persistedMessages: UiMessage[]): void {
    const current = liveFileChangeMessagesByThreadId.value[threadId]
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
      liveFileChangeMessagesByThreadId.value = omitKey(liveFileChangeMessagesByThreadId.value, threadId)
    } else {
      liveFileChangeMessagesByThreadId.value = { ...liveFileChangeMessagesByThreadId.value, [threadId]: next }
    }
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
    if (!threadId || !itemId) return
    const messages = liveFileChangeMessagesByThreadId.value[threadId]
    if (!messages) return
    const index = messages.findIndex((message) => message.id === itemId || message.turnId === itemId)
    if (index < 0) return
    const next = [...messages]
    next[index] = { ...next[index], fileChanges: changes }
    setLiveFileChangeMessagesForThread(threadId, next)
  }

  function upsertTurnDiff(threadId: string, turnId: string, diff: string): void {
    if (!threadId || !turnId) return
    const messages = liveFileChangeMessagesByThreadId.value[threadId]
    if (!messages) return
    const index = messages.findIndex((message) => message.turnId === turnId)
    if (index < 0) return
    const next = [...messages]
    const target = next[index]
    next[index] = {
      ...target,
      fileChanges: (target.fileChanges ?? []).map((change) => ({ ...change, diff })),
    }
    setLiveFileChangeMessagesForThread(threadId, next)
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
      upsertLiveAgentMessage(notificationThreadId, {
        id: liveAgentMessageDelta.messageId,
        role: 'assistant',
        text: nextText,
        messageType: 'agentMessage.live',
      })
    }

    const completedAgentMessage = readAgentMessageCompleted(notification)
    if (completedAgentMessage) {
      upsertLiveAgentMessage(notificationThreadId, completedAgentMessage)
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
      if (liveReasoningDelta.itemId && liveReasoningDelta.delta) {
        const previousItemText = reasoningItemTextByItemId.get(liveReasoningDelta.itemId) ?? ''
        if (!previousItemText.endsWith(liveReasoningDelta.delta)) {
          reasoningItemTextByItemId.set(liveReasoningDelta.itemId, `${previousItemText}${liveReasoningDelta.delta}`)
        }
      }
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
      reasoningItemTextByItemId.clear()
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
          projectOrder.value = mergedOrder
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
          projectDisplayNameById.value = nextLabels
        }
      }
    } catch {
      // Keep local storage fallback when global state is unavailable.
    }
  }

  async function loadThreadTitleCacheIfNeeded(options: { force?: boolean } = {}): Promise<void> {
    if (options.force !== true && Object.keys(threadTitleById.value).length > 0) return
    try {
      const cache = await getThreadTitleCache()
      if (Object.keys(cache.titles).length > 0) {
        // round-24：缓存里可能存着 app-server 推送的未截断标题（第一轮用户
        // 消息全文），加载时统一收口到 20 字，避免侧栏/标题展示超长。
        const normalizedTitles: Record<string, string> = {}
        for (const [threadId, title] of Object.entries(cache.titles)) {
          normalizedTitles[threadId] = toOptimisticThreadTitle(title)
        }
        threadTitleById.value = normalizedTitles
      }
    } catch {
      // Title cache is optional; keep UI functional.
    }
  }

  async function loadWorkspaceRootsStateForThreadList(): Promise<WorkspaceRootsState | null> {
    try {
      return await getWorkspaceRootsState()
    } catch {
      return null
    }
  }

  function resolveFallbackThreadTitle(prompt: string, imageUrls: string[], fileAttachments: FileAttachment[]): string {
    const trimmed = prompt.trim()
    if (trimmed) return toOptimisticThreadTitle(trimmed)

    const firstAttachmentLabel = fileAttachments
      .map((attachment) => attachment.label.trim())
      .find((label) => label.length > 0)
    if (firstAttachmentLabel) return toOptimisticThreadTitle(firstAttachmentLabel)

    if (imageUrls.length > 0) return toOptimisticThreadTitle('[Image]')
    return 'Untitled thread'
  }

  async function requestThreadTitleGeneration(
    threadId: string,
    prompt: string,
    cwd: string | null,
    imageUrls: string[] = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<void> {
    if (threadTitleById.value[threadId]) return
    const trimmed = prompt.trim()
    if (!trimmed) {
      const fallbackTitle = resolveFallbackThreadTitle(prompt, imageUrls, fileAttachments)
      threadTitleById.value = { ...threadTitleById.value, [threadId]: fallbackTitle }
      applyThreadFlags()
      void persistThreadTitle(threadId, fallbackTitle)
      return
    }
    const truncated = trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed
    try {
      const title = await generateThreadTitle(truncated, cwd)
      if (!title || threadTitleById.value[threadId]) return
      // round-23：总结结果收口到 20 字以内再重命名
      const normalizedTitle = title.length > OPTIMISTIC_THREAD_TITLE_MAX ? title.slice(0, OPTIMISTIC_THREAD_TITLE_MAX) : title
      threadTitleById.value = { ...threadTitleById.value, [threadId]: normalizedTitle }
      applyThreadFlags()
      void persistThreadTitle(threadId, normalizedTitle)
    } catch {
      // Title generation is best-effort.
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
      projectOrder.value = nextProjectOrder
      if (!hasWorkspaceRootsState) {
        saveProjectOrder(projectOrder.value)
      }
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

  function removeArchivedThreadFromLoadedLists(threadId: string): void {
    loadedThreadListGroups = removeThreadFromGroups(loadedThreadListGroups, threadId)
    sourceGroups.value = removeThreadFromGroups(sourceGroups.value, threadId)
    inProgressById.value = omitKey(inProgressById.value, threadId)
    applyThreadFlags()
  }

  function mergeThreadGroupPages(previous: UiProjectGroup[], incoming: UiProjectGroup[]): UiProjectGroup[] {
    if (previous.length === 0) return incoming
    if (incoming.length === 0) return previous

    const threadById = new Map<string, UiThread>()
    for (const thread of flattenThreads(previous)) {
      threadById.set(thread.id, thread)
    }
    for (const thread of flattenThreads(incoming)) {
      threadById.set(thread.id, thread)
    }
    const groupsByProject = new Map<string, UiThread[]>()
    for (const thread of threadById.values()) {
      const existing = groupsByProject.get(thread.projectName)
      if (existing) existing.push(thread)
      else groupsByProject.set(thread.projectName, [thread])
    }

    return Array.from(groupsByProject.entries())
      .map(([projectName, threads]) => ({
        projectName,
        threads: threads.sort(
          (first, second) => new Date(second.updatedAtIso).getTime() - new Date(first.updatedAtIso).getTime(),
        ),
      }))
      .sort((first, second) => {
        const firstUpdated = new Date(first.threads[0]?.updatedAtIso ?? 0).getTime()
        const secondUpdated = new Date(second.threads[0]?.updatedAtIso ?? 0).getTime()
        return secondUpdated - firstUpdated
      })
  }

  function hasActiveInProgressThreads(): boolean {
    return Object.values(inProgressById.value).some((value) => value === true)
  }

  function scheduleRemainingThreadPages(rootsState: WorkspaceRootsState | null = loadedThreadListRootsState): void {
    if (!threadListNextCursor || isLoadingRemainingThreadPages || hasActiveInProgressThreads()) return

    loadedThreadListRootsState = rootsState

    if (typeof window === 'undefined') {
      void loadRemainingThreadPages(rootsState)
      return
    }

    if (threadListBackgroundTimer !== null) {
      window.clearTimeout(threadListBackgroundTimer)
    }

    threadListBackgroundTimer = window.setTimeout(() => {
      threadListBackgroundTimer = null
      if (!threadListNextCursor || hasActiveInProgressThreads()) return
      void loadRemainingThreadPages(loadedThreadListRootsState)
    }, BACKGROUND_THREAD_PAGINATION_DELAY_MS)
  }

  async function loadRemainingThreadPages(rootsState: WorkspaceRootsState | null): Promise<void> {
    if (isLoadingRemainingThreadPages || !threadListNextCursor || hasActiveInProgressThreads()) return
    isLoadingRemainingThreadPages = true

    try {
      const page = await getThreadGroupsPage(threadListNextCursor, getBackgroundThreadListLimit())
      threadListNextCursor = page.nextCursor
      hasLoadedAllThreadPages = page.nextCursor === null
      isThreadListFullyLoaded.value = hasLoadedAllThreadPages
      loadedThreadListGroups = mergeThreadGroupPages(loadedThreadListGroups, page.groups)
      applyThreadGroups(loadedThreadListGroups, rootsState)
    } catch {
      // Keep the first page usable; a later refresh can retry remaining pages.
    } finally {
      isLoadingRemainingThreadPages = false
      if (threadListNextCursor && !hasActiveInProgressThreads()) {
        scheduleRemainingThreadPages(rootsState)
      }
    }
  }

  async function loadThreads(options: { force?: boolean } = {}) {
    if (loadThreadsPromise) {
      await loadThreadsPromise
      return
    }
    if (
      options.force !== true &&
      hasLoadedThreads.value &&
      Date.now() - lastThreadListLoadAt < RECENT_THREAD_LIST_LOAD_REUSE_MS
    ) {
      return
    }

    loadThreadsPromise = (async () => {
    if (!hasLoadedThreads.value) {
      isLoadingThreads.value = true
    }

    try {
      const [page, rootsState] = await Promise.all([
        getThreadGroupsPage(),
        loadWorkspaceRootsStateForThreadList(),
        loadThreadTitleCacheIfNeeded({ force: options.force === true }),
      ])
      loadedThreadListRootsState = rootsState
      const groups = page.groups
      // The server response is authoritative: replace the list on every load
      // rather than union-merging it with the previous snapshot, so threads the
      // server no longer returns (e.g. subagent sessions filtered out since the
      // last load) disappear from the sidebar instead of lingering.
      loadedThreadListGroups = groups
      threadListNextCursor = page.nextCursor
      hasLoadedAllThreadPages = page.nextCursor === null
      isThreadListFullyLoaded.value = hasLoadedAllThreadPages
      await hydrateWorkspaceRootsStateIfNeeded(groups, rootsState)

      applyThreadGroups(loadedThreadListGroups, rootsState)
      hasLoadedThreads.value = true
      lastThreadListLoadAt = Date.now()
      if (!hasLoadedAllThreadPages) {
        scheduleRemainingThreadPages(rootsState)
      }

      const flatThreads = flattenThreads(projectGroups.value)
      pruneThreadScopedState(flatThreads)

      const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)

      if (!currentExists && !selectedThreadId.value) {
        setSelectedThreadId(flatThreads[0]?.id ?? '')
      }
    } finally {
      isLoadingThreads.value = false
    }
    })().finally(() => {
      loadThreadsPromise = null
    })

    await loadThreadsPromise
  }

  async function loadMessages(threadId: string, options: { silent?: boolean; force?: boolean } = {}) {
    if (!threadId) {
      return
    }
    const recentLoadFailure =
      Date.now() - (lastMessageLoadFailureAtByThreadId.get(threadId) ?? 0) < RECENT_THREAD_MESSAGE_LOAD_REUSE_MS
    if (turnErrorByThreadId.value[threadId]?.transient && (options.silent === true || recentLoadFailure)) {
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
      isLoadingMessages.value = true
    }

    const loadPromise = (async () => {
      try {
      const version = currentThreadVersion(threadId)
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
              inProgressById.value[threadId] !== true
            )
          )

      if (canReuseLoadedMessages) {
        markThreadAsRead(threadId)
        return
      }

      const needsResume = resumedThreadById.value[threadId] !== true
      const resumedThread = needsResume ? await resumeThread(threadId) : null
      const detail = resumedThread ?? await getThreadDetail(threadId)

      if (detail.modelProvider) {
        setThreadModelProviderId(threadId, detail.modelProvider)
      }
      if (detail.model) {
        setThreadModelId(threadId, resolveThreadModelForProvider(threadId, detail.model, detail.modelProvider))
      }
      if (resumedThread) {
        resumedThreadById.value = {
          ...resumedThreadById.value,
          [threadId]: true,
        }
      }

      const { messages: nextMessages, inProgress, activeTurnId, turnIndexByTurnId } = detail
      hasMoreOlderMessagesByThreadId.value = {
        ...hasMoreOlderMessagesByThreadId.value,
        [threadId]: detail.hasMoreOlder === true,
      }
      markThreadMessagesPersisted(threadId, nextMessages)
      replaceTurnIndexLookupForThread(threadId, turnIndexByTurnId)
      rebindLiveFileChangeTurnIndices(threadId)
      const previousPersisted = persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(previousPersisted, nextMessages, {
        preserveMissing: options.silent === true || hasOptimisticUserMessages(previousPersisted),
      })
      setPersistedMessagesForThread(threadId, mergedMessages)

      const previousLiveAgent = liveAgentMessagesByThreadId.value[threadId] ?? []
      if (inProgress) {
        const nextLiveAgent = removeRedundantLiveAgentMessages(previousLiveAgent, nextMessages)
        setLiveAgentMessagesForThread(threadId, nextLiveAgent)
      } else {
        clearLiveAgentMessagesForThread(threadId)
      }
      removeLiveCommandsPersistedIn(threadId, nextMessages)
      removeLiveFileChangesPersistedIn(threadId, nextMessages)

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
      setThreadInProgress(threadId, inProgress)
      if (detail.externalSession) {
        externalSessionByThreadId.value = {
          ...externalSessionByThreadId.value,
          [threadId]: detail.externalSession,
        }
      }
      clearTransientTurnErrorForThread(threadId)
      if (activeTurnId) {
        activeTurnIdByThreadId.value = {
          ...activeTurnIdByThreadId.value,
          [threadId]: activeTurnId,
        }
      } else if (activeTurnIdByThreadId.value[threadId]) {
        activeTurnIdByThreadId.value = omitKey(activeTurnIdByThreadId.value, threadId)
      }
      if (!inProgress) {
        clearCompletedTurnLiveState(threadId)
      }
      markThreadAsRead(threadId)
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : 'Unknown application error'
        if (selectedThreadId.value === threadId) {
          setTurnErrorForThread(threadId, message, { transient: true })
        }
        lastMessageLoadFailureAtByThreadId.set(threadId, Date.now())
        throw unknownError
      } finally {
      if (shouldShowLoading) {
        isLoadingMessages.value = false
      }
      }
    })().finally(() => {
      loadMessagePromiseByThreadId.delete(threadId)
    })

    loadMessagePromiseByThreadId.set(threadId, loadPromise)
    await loadPromise
  }

  async function loadOlderMessages(threadId: string = selectedThreadId.value): Promise<void> {
    if (!threadId) return
    if (loadingOlderMessagesByThreadId.value[threadId] === true) return
    if (hasMoreOlderMessagesByThreadId.value[threadId] !== true) return

    const beforeTurnId = getFirstPersistedTurnId(threadId)
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
      const previousPersisted = persistedMessagesByThreadId.value[threadId] ?? []
      const mergedMessages = mergeMessages(page.messages, previousPersisted, { preserveMissing: true })
      setPersistedMessagesForThread(threadId, mergedMessages)
      replaceTurnIndexLookupForThread(threadId, {
        ...(turnIndexByTurnIdByThreadId.value[threadId] ?? {}),
        ...page.turnIndexByTurnId,
      })
      rebindLiveFileChangeTurnIndices(threadId)
      hasMoreOlderMessagesByThreadId.value = {
        ...hasMoreOlderMessagesByThreadId.value,
        [threadId]: page.hasMoreOlder,
      }
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : 'Failed to load earlier messages'
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
    if (options.silent === true && turnErrorByThreadId.value[threadId]?.transient) return
    await loadMessages(threadId, options)
  }

  async function refreshSkills(options: { force?: boolean } = {}): Promise<void> {
    const selectedCwd = selectedThread.value?.cwd?.trim() ?? ''
    const skillsLoadKey = selectedCwd || '__global__'
    if (refreshSkillsPromise) {
      await refreshSkillsPromise
      return
    }
    if (
      options.force !== true &&
      hasLoadedSkills &&
      lastSkillsLoadKey === skillsLoadKey &&
      Date.now() - lastSkillsLoadAt < RECENT_SKILLS_LOAD_REUSE_MS
    ) {
      return
    }

    refreshSkillsPromise = (async () => {
      try {
        installedSkills.value = await getSkillsList(selectedCwd ? [selectedCwd] : undefined)
        hasLoadedSkills = true
        lastSkillsLoadAt = Date.now()
        lastSkillsLoadKey = skillsLoadKey
      } catch {
        // keep previous skills on failure
      } finally {
        refreshSkillsPromise = null
      }
    })()

    await refreshSkillsPromise
  }

  async function refreshHooks(options: { force?: boolean } = {}): Promise<void> {
    if (refreshHooksPromise) {
      await refreshHooksPromise
      return
    }
    if (options.force !== true && hasLoadedHooks) {
      return
    }
    isHooksLoading.value = true
    refreshHooksPromise = (async () => {
      try {
        hooksList.value = await listHooks()
        hasLoadedHooks = true
      } catch {
        // keep previous hooks on failure
      } finally {
        isHooksLoading.value = false
        refreshHooksPromise = null
      }
    })()

    await refreshHooksPromise
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
      await loadThreads({ force: options.forceThreadRefresh === true })
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
      await loadThreads()

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
      await loadThreads()
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
      void loadThreads().catch(() => {})
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

  function saveStashedMessagesMap(): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STASHED_MESSAGES_STORAGE_KEY, JSON.stringify(stashedMessagesByThreadId.value))
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

  function setAutoCompactThreshold(value: number): void {
    const next = Number.isFinite(value) && value > 0 ? Math.round(value) : 0
    if (next === autoCompactThreshold.value) return
    autoCompactThreshold.value = next
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AUTO_COMPACT_THRESHOLD_STORAGE_KEY, String(next))
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

    const queue = stashedMessagesByThreadId.value[threadId] ?? []
    const id = `stash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const collaborationMode: CollaborationModeKind =
      collaborationModeOverride === 'plan'
        ? 'plan'
        : collaborationModeOverride === 'default'
          ? 'default'
          : selectedCollaborationMode.value
    stashedMessagesByThreadId.value = {
      ...stashedMessagesByThreadId.value,
      [threadId]: [...queue, { id, text, imageUrls, skills, fileAttachments, collaborationMode }],
    }
    saveStashedMessagesMap()
    if (!compactingThreadIds.value.has(threadId)) {
      void compactThreadById(threadId)
    }
    return true
  }

  // 压缩完成（或失败兜底）后补发该线程的暂存消息；线程忙时等待空闲再补发。
  async function flushStashedForThread(threadId: string): Promise<void> {
    const stashed = stashedMessagesByThreadId.value[threadId]
    if (!stashed || stashed.length === 0) return
    if (inProgressById.value[threadId] === true) return

    const messages = [...stashed]
    stashedMessagesByThreadId.value = omitKey(stashedMessagesByThreadId.value, threadId)
    saveStashedMessagesMap()
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
      const queue = queuedMessagesByThreadId.value[threadId] ?? []
      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const nextQueue = [...queue]
      const insertIndex = typeof queueInsertIndex === 'number'
        ? Math.max(0, Math.min(queueInsertIndex, nextQueue.length))
        : nextQueue.length
      nextQueue.splice(insertIndex, 0, {
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
      })
      queuedMessagesByThreadId.value = {
        ...queuedMessagesByThreadId.value,
        [threadId]: nextQueue,
      }
      persistQueueState()
      return
    }

    if (isInProgress) {
      shouldAutoScrollOnNextAgentEvent = true
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
    }, 650)
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
      const turnIndex = typeof matchedMessage?.turnIndex === 'number' ? matchedMessage.turnIndex : -1
      if (turnIndex < 0) return
      const maxTurnIndex = persisted.reduce((max, m) => (typeof m.turnIndex === 'number' && m.turnIndex > max ? m.turnIndex : max), -1)
      if (maxTurnIndex < 0 || turnIndex > maxTurnIndex) return
      const numTurns = maxTurnIndex - turnIndex + 1
      if (numTurns < 1) return

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

  let renameProjectTimer: ReturnType<typeof setTimeout> | null = null

  async function persistProjectLabelToGlobalState(projectName: string, displayName: string): Promise<void> {
    try {
      const rootsState = await getWorkspaceRootsState()
      const nextLabels = { ...rootsState.labels }
      let changed = false
      for (const rootPath of rootsState.order) {
        if (!matchesWorkspaceRootProject(rootPath, projectName)) continue
        const trimmed = displayName.trim()
        if (trimmed.length === 0) {
          if (nextLabels[rootPath] !== undefined) {
            delete nextLabels[rootPath]
            changed = true
          }
        } else if (nextLabels[rootPath] !== trimmed) {
          nextLabels[rootPath] = trimmed
          changed = true
        }
      }
      if (changed) {
        await setWorkspaceRootsState({
          order: rootsState.order,
          labels: nextLabels,
          active: rootsState.active,
          projectOrder: rootsState.projectOrder,
        })
      }
    } catch {
      // Keep localStorage-only rename when global state is unavailable.
    }
  }

  function renameProject(projectName: string, displayName: string): void {
    if (projectName.length === 0) return

    const currentValue = projectDisplayNameById.value[projectName] ?? ''
    if (currentValue === displayName) return

    projectDisplayNameById.value = {
      ...projectDisplayNameById.value,
      [projectName]: displayName,
    }
    saveProjectDisplayNames(projectDisplayNameById.value)

    if (renameProjectTimer !== null) clearTimeout(renameProjectTimer)
    renameProjectTimer = setTimeout(() => {
      renameProjectTimer = null
      void persistProjectLabelToGlobalState(projectName, displayName)
    }, 500)
  }

  async function removeProject(projectName: string): Promise<void> {
    if (projectName.length === 0) return

    const nextProjectOrder = projectOrder.value.filter((name) => name !== projectName)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      projectOrder.value = nextProjectOrder
      saveProjectOrder(projectOrder.value)
    }

    sourceGroups.value = sourceGroups.value.filter((group) => group.projectName !== projectName)

    if (projectDisplayNameById.value[projectName] !== undefined) {
      const nextDisplayNames = { ...projectDisplayNameById.value }
      delete nextDisplayNames[projectName]
      projectDisplayNameById.value = nextDisplayNames
      saveProjectDisplayNames(nextDisplayNames)
    }

    applyThreadFlags()

    const flatThreads = flattenThreads(projectGroups.value)
    pruneThreadScopedState(flatThreads)

    const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)
    if (!currentExists) {
      setSelectedThreadId(flatThreads[0]?.id ?? '')
    }

    const removedRootPaths = new Set<string>()
    try {
      const rootsState = await getWorkspaceRootsState()
      collectWorkspaceRootPathsForProjectRemoval(rootsState, projectName).forEach((rootPath) => {
        removedRootPaths.add(rootPath)
      })
    } catch {
      // Keep local-only removal when global state is unavailable.
    }

    if (removedRootPaths.size > 0) {
      try {
        const rootsState = await getWorkspaceRootsState()
        const nextOrder = rootsState.order.filter((rootPath) => !removedRootPaths.has(rootPath))
        const nextActive = rootsState.active.filter((rootPath) => !removedRootPaths.has(rootPath))
        const fallbackActive = nextActive.length === 0 && nextOrder.length > 0
          ? [nextOrder[0]]
          : nextActive
        await setWorkspaceRootsState({
          order: nextOrder,
          labels: omitKeys(rootsState.labels, removedRootPaths),
          active: fallbackActive,
          projectOrder: rootsState.projectOrder.filter((item) => item !== projectName && !removedRootPaths.has(item)),
        })
        return
      } catch {
        // Fall back to order-only persistence if direct removal fails.
      }
    }

    await persistProjectOrderToWorkspaceRoots()
  }

  function reorderProject(projectName: string, toIndex: number): void {
    if (projectName.length === 0) return
    if (sourceGroups.value.length === 0) return

    const visibleOrder = sourceGroups.value.map((group) => group.projectName)
    const fromIndex = visibleOrder.indexOf(projectName)
    if (fromIndex === -1) return

    const clampedToIndex = Math.max(0, Math.min(toIndex, visibleOrder.length - 1))
    const reorderedVisibleOrder = reorderStringArray(visibleOrder, fromIndex, clampedToIndex)
    if (reorderedVisibleOrder === visibleOrder) return

    const normalizedProjectOrder = mergeProjectOrder(reorderedVisibleOrder, sourceGroups.value)
    projectOrder.value = normalizedProjectOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  function pinProjectToTop(projectName: string): void {
    const normalizedName = projectName.trim()
    if (!normalizedName) return
    const nextOrder = [normalizedName, ...projectOrder.value.filter((name) => name !== normalizedName)]
    if (areStringArraysEqual(projectOrder.value, nextOrder)) return
    projectOrder.value = nextOrder
    saveProjectOrder(projectOrder.value)

    const orderedGroups = orderGroupsByProjectOrder(sourceGroups.value, projectOrder.value)
    sourceGroups.value = mergeThreadGroups(sourceGroups.value, orderedGroups)
    applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  async function persistProjectOrderToWorkspaceRoots(): Promise<void> {
    try {
      const rootsState = await getWorkspaceRootsState()
      const nextState = buildWorkspaceRootsProjectOrderState(rootsState, projectOrder.value, sourceGroups.value)

      await setWorkspaceRootsState({
        order: nextState.order,
        labels: rootsState.labels,
        active: nextState.active,
        projectOrder: nextState.projectOrder,
      })
    } catch {
      // Keep local project order when global state persistence is unavailable.
    }
  }

  async function syncThreadStatus(): Promise<void> {
    if (isPolling.value) return
    isPolling.value = true

    try {
      await loadThreads()

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
        await loadThreads({ force: shouldForceThreadRefresh })
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
    pendingThreadsRefresh = !hasLoadedThreads.value
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

  async function loadPendingServerRequestsFromBridge(): Promise<void> {
    try {
      const rows = await getPendingServerRequests()
      const normalizedRequests = rows
        .map((row) => normalizeServerRequest(row))
        .filter((request): request is UiServerRequest => request !== null)
      replacePendingServerRequests(normalizedRequests)
    } catch {
      // Keep UI usable when pending request endpoint is temporarily unavailable.
    }
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

  async function pendingRequestStillExistsOnServer(requestId: number): Promise<boolean> {
    try {
      const rows = await getPendingServerRequests()
      for (const row of rows) {
        const record = asRecord(row)
        if (record?.id === requestId) return true
      }
      return false
    } catch {
      // 对账接口不可用时保守处理：视为仍存在，保留面板并展示错误。
      return true
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
    if (rateLimitRefreshTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(rateLimitRefreshTimer)
      rateLimitRefreshTimer = null
    }
    if (threadListBackgroundTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(threadListBackgroundTimer)
      threadListBackgroundTimer = null
    }
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
    liveCommandsByThreadId.value = {}
    liveFileChangeMessagesByThreadId.value = {}
    turnIndexByTurnIdByThreadId.value = {}
    turnActivityByThreadId.value = {}
    turnSummaryByThreadId.value = {}
    turnErrorByThreadId.value = {}
    activeTurnIdByThreadId.value = {}
    activeReasoningTurnIdByThreadId.clear()
    reasoningItemTextByItemId.clear()
    turnItemSequenceByThreadId.clear()
    resetLiveMessageSortKeys()
    interruptBlockedUntilPersistedByThreadId.value = {}
    threadListedByServerById.value = {}
    persistedUserMessageByThreadId.value = {}
    queuedMessagesByThreadId.value = {}
    queueProcessingByThreadId.value = {}
    stashedMessagesByThreadId.value = {}
    saveStashedMessagesMap()
    persistQueueState()
    codexRateLimit.value = null
    threadTokenUsageByThreadId.value = {}
  }

  const selectedThreadQueuedMessages = computed<QueuedMessage[]>(() => {
    const threadId = selectedThreadId.value
    if (!threadId) return []
    // 面板合并展示：暂存消息（等待压缩后补发）置前 + 服务端 queue 消息。
    const queue = queuedMessagesByThreadId.value[threadId] ?? []
    const stashed = stashedMessagesByThreadId.value[threadId] ?? []
    const stashedRows = stashed.map((message) => ({ ...message, awaitingCompaction: true }))
    return [...stashedRows, ...queue]
  })

  function removeQueuedMessage(messageId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    const stashed = stashedMessagesByThreadId.value[threadId]
    if (stashed?.some((m) => m.id === messageId)) {
      const next = stashed.filter((m) => m.id !== messageId)
      stashedMessagesByThreadId.value = next.length > 0
        ? { ...stashedMessagesByThreadId.value, [threadId]: next }
        : omitKey(stashedMessagesByThreadId.value, threadId)
      saveStashedMessagesMap()
      return
    }
    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue) return
    const next = queue.filter((m) => m.id !== messageId)
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
    // 暂存消息不参与排序（等待压缩后补发，顺序固定置前）。
    const stashed = stashedMessagesByThreadId.value[threadId]
    if (stashed?.some((m) => m.id === draggedId || m.id === targetId)) return

    const fromIndex = queue.findIndex((m) => m.id === draggedId)
    const toIndex = queue.findIndex((m) => m.id === targetId)
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

  function steerQueuedMessage(messageId: string): void {
    const threadId = selectedThreadId.value
    if (!threadId) return
    const stashed = stashedMessagesByThreadId.value[threadId]
    const stashedMessage = stashed?.find((m) => m.id === messageId)
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
    const queue = queuedMessagesByThreadId.value[threadId]
    if (!queue) return
    const msg = queue.find((m) => m.id === messageId)
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
    isLoadingThreads,
    isThreadListFullyLoaded,
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

