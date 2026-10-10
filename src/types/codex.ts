export type RpcEnvelope<T> = {
  result: T
}

export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.some((effort) => effort === value)
}
export type SpeedMode = 'standard' | 'fast'
export type CollaborationModeKind = 'default' | 'plan' | 'execplans'

export type RpcMethodCatalog = {
  data: string[]
}

export type ThreadListResult = {
  data: ThreadSummary[]
  nextCursor?: string | null
}

export type ThreadSummary = {
  id: string
  preview: string
  title?: string
  name?: string
  cwd: string
  updatedAt: number
  createdAt: number
  source?: unknown
}

export type ThreadReadResult = {
  thread: ThreadDetail
}

export type ThreadDetail = {
  id: string
  cwd: string
  preview: string
  turns: ThreadTurn[]
  updatedAt: number
  createdAt: number
}

export type ThreadTurn = {
  id: string
  status: string
  items: ThreadItem[]
}

export type ThreadItem = {
  id: string
  type: string
  text?: string
  content?: unknown
  summary?: string[]
}

export type UserInput = {
  type: string
  text?: string
  path?: string
  url?: string
}

export type UiThread = {
  id: string
  title: string
  projectName: string
  cwd: string
  hasWorktree: boolean
  createdAtIso: string
  updatedAtIso: string
  preview: string
  /**
   * Persisted history contract of the underlying app-server thread：
   * 0.156 起 `thread/rollback` 已被上游移除（#44915），回退一律走 thread/revert，
   * 该字段仅作信息保留。缺省视为 'paginated'。
   */
  historyMode?: 'legacy' | 'paginated'
  /** round-106：0.157 起线程创建者身份持久化（#47113）。null = 服务器未提供。 */
  originator?: string | null
  unread: boolean
  inProgress: boolean
  externalSession?: UiExternalSession | null
  pendingRequestState?: UiPendingRequestState | null
}

export type UiPendingRequestState = 'approval' | 'response'

export type UiExternalSession = {
  origin: string
  active: boolean
  lastWriteAt: string | null
}

export type UiThreadAutomationStatus = 'ACTIVE' | 'PAUSED'

export type UiThreadAutomation = {
  id: string
  kind: 'heartbeat' | 'cron'
  name: string
  prompt: string
  rrule: string
  status: UiThreadAutomationStatus
  targetThreadId: string | null
  cwds: string[]
  createdAtMs: number | null
  updatedAtMs: number | null
  nextRunAtMs: number | null
}

// Present only when the bridge truncated `aggregatedOutput` (round-76 payload
// slimming). `ref` is the opaque handle for /codex-api/command-output; it is
// empty when the output was too large to spill to disk.
export type CommandOutputSpill = {
  ref: string
  totalBytes: number
  omittedBytes: number
}

export type CommandExecutionData = {
  command: string
  cwd: string | null
  status: 'inProgress' | 'completed' | 'failed' | 'declined' | 'interrupted'
  aggregatedOutput: string
  exitCode: number | null
  outputSpill?: CommandOutputSpill
}

export type UiFileAttachment = { label: string; path: string }
export type UiFileChangeOperation = 'add' | 'delete' | 'update'
export type UiFileChangeStatus = 'inProgress' | 'completed' | 'failed' | 'declined'
export type UiFileChange = {
  path: string
  operation: UiFileChangeOperation
  movedToPath?: string | null
  diff: string
  addedLineCount: number
  removedLineCount: number
}

export type UiReviewScope = 'workspace' | 'baseBranch' | 'commit'
export type UiReviewWorkspaceView = 'unstaged' | 'staged'
export type UiReviewAction = 'stage' | 'unstage' | 'revert'
export type UiReviewActionLevel = 'all' | 'file' | 'hunk'
export type UiReviewFileOperation = 'add' | 'delete' | 'update' | 'rename'

export type UiReviewLine = {
  key: string
  kind: 'meta' | 'hunk' | 'add' | 'remove' | 'context'
  text: string
  oldLine: number | null
  newLine: number | null
}

export type UiReviewHunk = {
  id: string
  header: string
  patch: string
  addedLineCount: number
  removedLineCount: number
  oldStart: number | null
  oldLineCount: number
  newStart: number | null
  newLineCount: number
  lines: UiReviewLine[]
}

export type UiReviewFile = {
  id: string
  path: string
  absolutePath: string
  previousPath: string | null
  previousAbsolutePath: string | null
  operation: UiReviewFileOperation
  addedLineCount: number
  removedLineCount: number
  diff: string
  hunks: UiReviewHunk[]
}

export type UiReviewSnapshot = {
  cwd: string
  gitRoot: string | null
  isGitRepo: boolean
  scope: UiReviewScope
  workspaceView: UiReviewWorkspaceView
  baseBranch: string | null
  baseBranchOptions: string[]
  commitSha: string | null
  headBranch: string | null
  mergeBaseSha: string | null
  generatedAtIso: string
  summary: {
    fileCount: number
    addedLineCount: number
    removedLineCount: number
  }
  files: UiReviewFile[]
}

export type UiReviewSummary = UiReviewSnapshot['summary']

export type UiReviewFinding = {
  id: string
  title: string
  body: string
  path: string | null
  absolutePath: string | null
  startLine: number | null
  endLine: number | null
  rawText: string
}

export type UiReviewResult = {
  reviewText: string
  summary: string
  findings: UiReviewFinding[]
}

export type UiPlanStepStatus = 'pending' | 'inProgress' | 'completed'

export type UiPlanStep = {
  step: string
  status: UiPlanStepStatus
}

export type UiPlanData = {
  explanation?: string
  steps: UiPlanStep[]
  isStreaming?: boolean
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  images?: string[]
  skills?: Array<{ name: string; path: string }>
  fileAttachments?: UiFileAttachment[]
  /** round-137：`{ type:'image', fileId }`（附件引用，无内联 url）的图片 id。UI 渲染成
   *  「不可预览」的可见占位，避免这类图片在历史里静默消失。 */
  imageAttachmentIds?: string[]
  /** round-138：`{ type:'audio', url }` 与 `{ type:'localAudio', path }` 的可见面。
   *  此前这两类（连同 mention）落进 rawBlocks，而 rawBlocks 在 UI 上没有渲染分支、
   *  空正文又被 shouldOmitEmptyGenericMessage 省略 ⇒ 在历史里静默消失。
   *  localAudio 在归一化时已换成本仓既有的 /codex-local-file 代理 URL。 */
  audioSources?: string[]
  /** round-138：`{ type:'mention', name, path }` 的 @ 提及（同因，此前静默消失）。 */
  mentions?: Array<{ name: string; path: string }>
  fileChanges?: UiFileChange[]
  fileChangeStatus?: UiFileChangeStatus
  messageType?: string
  /** round-140：app-server 回写的「客户端提交 id」= `turn/start` / `turn/steer` 的
   *  `clientUserMessageId`。0.161.0 实测：`thread/read` 与 thread_history 库都带这个字段。
   *  `null`/缺失 = 该 userMessage 不经任何客户端提交 —— 由服务端多代理投递管线写入。 */
  clientId?: string | null
  /** round-140：该 user 消息**不是用户本人发出的**（代理间 `sendInput` 投递 / 子代理回报 /
   *  环境注入）。渲染成「代理注记」而不是右侧用户气泡。判据见 normalizers/v2.ts
   *  的 `isInjectedUserMessage`。 */
  isAgentNote?: boolean
  /** round-73：模型切换分割栏消息的旧/新模型，仅 `messageType === 'modelSwitch'` 时使用。 */
  modelSwitchFrom?: string
  modelSwitchTo?: string
  /** round-74：分割栏应插回到切换发生时那条真实消息（id）之后，使其停留在消息流中的正确位置。 */
  modelSwitchInsertAfterId?: string
  rawPayload?: string
  isUnhandled?: boolean
  commandExecution?: CommandExecutionData
  reasoning?: UiReasoningData
  toolCall?: UiToolCallData
  plan?: UiPlanData
  turnId?: string
  turnIndex?: number
  /** round-106：0.157 起 turn 载荷带生命周期时间戳（#47114），消息行可展示时点。 */
  turnStartedAtIso?: string
  /** round-23：本地存档思考的时序锚点——插回到该消息 id 之后（按真实出现顺序与工具交错）。 */
  reasoningAnchorMessageId?: string
  durationMs?: number
  isAutomationRun?: boolean
  automationDisplayName?: string | null
}

export type UiReasoningData = {
  summary: string[]
  content: string[]
}

export type UiToolCallData = {
  server: string
  tool: string
  status: 'inProgress' | 'completed' | 'failed'
  error?: string
  durationMs?: number | null
}

export type UiServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  receivedAtIso: string
  params: unknown
}

export type UiServerRequestReply = {
  id: number
  result?: unknown
  followUpMessageText?: string
  error?: {
    code?: number
    message: string
  }
}

export type UiLiveOverlay = {
  activityLabel: string
  activityDetails: string[]
  reasoningText: string
  errorText: string
}

export type UiCreditsSnapshot = {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

export type UiRateLimitWindow = {
  usedPercent: number
  windowDurationMins: number | null
  windowMinutes: number | null
  resetsAt: number | null
}

export type UiRateLimitSnapshot = {
  limitId: string | null
  limitName: string | null
  primary: UiRateLimitWindow | null
  secondary: UiRateLimitWindow | null
  credits: UiCreditsSnapshot | null
  planType: string | null
}

export type UiTokenUsageBreakdown = {
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

export type UiThreadTokenUsage = {
  total: UiTokenUsageBreakdown
  last: UiTokenUsageBreakdown
  modelContextWindow: number | null
  currentContextTokens: number
  remainingContextTokens: number | null
  remainingContextPercent: number | null
}

export type UiProjectGroup = {
  projectName: string
  threads: UiThread[]
}

export type UiAccountQuotaStatus = 'idle' | 'loading' | 'ready' | 'error'
export type UiAccountUnavailableReason = 'payment_required'

export type UiAccountEntry = {
  accountId: string
  storageId: string
  userId: string | null
  authMode: string | null
  email: string | null
  planType: string | null
  lastRefreshedAtIso: string
  lastActivatedAtIso: string | null
  quotaSnapshot: UiRateLimitSnapshot | null
  quotaUpdatedAtIso: string | null
  quotaStatus: UiAccountQuotaStatus
  quotaError: string | null
  unavailableReason: UiAccountUnavailableReason | null
  isActive: boolean
}

export type ChatMessage = {
  id: string
  role: string
  text: string
  createdAt: string | null
}

export type ChatThread = {
  id: string
  title: string
  projectName: string
  updatedAt: string | null
  messages: ChatMessage[]
}

export type CollaborationModeOption = {
  value: CollaborationModeKind
  label: string
}
