import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, mkdir, stat, cp, lstat, readlink, symlink } from 'node:fs/promises'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'
import { handleAccountRoutes } from './accountRoutes.js'
import { buildAppServerArgs, parseApprovalPolicy, readUserConfiguredProviderIds } from './appServerRuntimeConfig.js'
import { handleReviewRoutes } from './reviewGit.js'
import { handleSkillsRoutes, initializeSkillsSyncOnStartup } from './skillsRoutes.js'
import { TelegramThreadBridge } from './telegramThreadBridge.js'
import { createExternalSessionTracker } from './externalSessionTracker.js'
import { listWorkspaceFiles } from './localBrowseUi.js'
import {
  getFreeModels,
  FREE_MODE_STATE_FILE,
  FREE_MODE_RUNTIME_PROVIDER_ID,
  OPENCODE_ZEN_RUNTIME_PROVIDER_ID,
  CUSTOM_RUNTIME_PROVIDER_ID,
  filterOpenCodeZenModelsForAuthState,
  getFreeModeConfigArgs,
  getFreeModeEnvVars,
  getProviderCompatibilityConfigArgs,
  LEGACY_CUSTOM_COMPAT_PATH,
  OPENCODE_ZEN_PROVIDER_ID,
  refreshFreeModelsInBackground,
  shouldCreateDefaultFreeModeStateForMissingAuth,
  shouldSuppressCommunityFreeModeForCodexAuth,
  type FreeModeState,
} from './freeMode.js'
import { handleOpenRouterProxyRequest } from './openRouterProxy.js'
import { handleZenProxyRequest } from './zenProxy.js'
import { handleCustomEndpointProxyRequest } from './customEndpointProxy.js'
import { ThreadTerminalManager } from './terminalManager.js'
import { createExecPtySpawn } from './bridge/execPtyChannel.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'
import {
  resolveCodexCommand,
  resolveRipgrepCommand,
} from '../commandResolution.js'
import { type CollaborationModeKind } from '../types/codex.js'
import {
  asRecord,
  getCodexHomeDir,
  getErrorMessage,
  isSameOrDescendantPath,
  normalizeStringArray,
  normalizeStringRecord,
  quoteShellTokenIfNeeded,
  readNonEmptyString,
  runCommand,
  runCommandCapture,
  runCommandCaptureRaw,
  STREAM_EVENT_BUFFER_LIMIT,
} from './bridge/core.js'
import {
  allocatePermanentWorktreeBranchName,
  assertLocalGitBranch,
  assertNoTrackedGitChanges,
  checkoutGitBranchWithWorktreeRecovery,
  ensureRepoHasInitialCommit,
  HEADER_GIT_RESET_HISTORY_REF_LIMIT,
  isMissingHeadError,
  isNotGitRepositoryError,
  normalizeBranchRefName,
  pruneHeaderGitResetHistoryRefs,
  readGitHeaderState,
  splitGitPathList,
  toHeaderGitResetHistoryRef,
  withPreservedUntrackedFilesForGitTarget,
} from './bridge/git.js'
import { handleComposioHttpRequest } from './bridge/composioRoutes.js'
import { handleChatgptUpstreamHttpRequest } from './bridge/chatgptUpstreamRoutes.js'
import { handleFreeModeHttpRequest } from './bridge/freeModeRoutes.js'
import { handleAutomationsHttpRequest } from './bridge/automationsRoutes.js'
import { handleProjectHttpRequest } from './bridge/projectRoutes.js'
import { handleThreadHttpRequest } from './bridge/threadRoutes.js'
import { runRpcResponsePipeline } from './bridge/rpcPipeline.js'
// round-84：thread/resume 的有界水合（元数据 + 一页轮次），替换协议已标
// deprecated 的全量历史水合；详见 bridge/threadResumeTurnPage.ts 头部实测数据。
import { resumeThreadWithTurnPage } from './bridge/threadResumeTurnPage.js'
// round-110：thread/read 的有界读取（元数据读 + thread/turns/list 一页）；头部实测
// 数据与回落契约见 bridge/threadReadTurnPage.ts。
import { readThreadWithTurnPage } from './bridge/threadReadTurnPage.js'
// round-113：文件回退路由（/codex-api/thread/rollback-files）不再为了拿 session
// 路径与「目标轮及其后」的 id 而全量水合线程；对照数据与回落契约见该模块头部。
import { readRollbackTurnContext } from './bridge/rollbackTurnContext.js'
// round-86：上翻更早轮次不再全量水合；用 turns/list 游标链按页取，详见
// bridge/threadTurnPage.ts 头部实测数据。
import { readBoundedThreadTurnPage, ThreadTurnPageCursorChain, ThreadTurnPageUnsupportedError, type BoundedThreadTurnPage } from './bridge/threadTurnPage.js'
// round-136：游标链的持久化 sidecar（为什么另开文件、容量上限见模块头）。
import { readThreadTurnPageCursors, writeThreadTurnPageCursors } from './bridge/threadTurnPageCursorStore.js'
import {
  handleTelegramHttpRequest,
  readTelegramBridgeConfig,
  writeTelegramBridgeConfig,
} from './bridge/telegramRoutes.js'
// E 批 thread preferences/状态/搜索路由 slice（P 批）：路由处理 + 标题缓存
// 迁移至 threadPreferencesRoutes.ts；标题缓存 helper 现仅供该 slice 内部使用。
import { handleThreadPreferencesHttpRequest } from './bridge/threadPreferencesRoutes.js'
import { handleEventsHttpRequest } from './bridge/eventsRoutes.js'
// AF 批 project ZIP 编排：collectProjectChatZipEntries / importProjectZip 由
// projectRoutes deps 注入（见 createCodexBridgeMiddleware），此处 import 复用。
import { collectProjectChatZipEntries, importProjectZip } from './bridge/projectZip.js'
import {
  canonicalizeThreadListResponseForRead,
  persistWorkspaceRoot,
  readWorkspaceRootsState,
  rollbackCreatedWorktree,
  updateWorkspaceRootsState,
} from './bridge/workspaceRoots.js'
import {
  appendThreadQueuedMessage,
  normalizeThreadQueueState,
  readThreadQueueState,
  withThreadQueueStateUpdate,
  writeThreadQueueState,
  type BackendQueuedTurn,
  type StoredQueuedMessage,
  type ThreadQueueState,
} from './bridge/threadQueueState.js'
// S 批 thread-queue-state 切片：BackendQueueProcessor 与 thread-queue 路由
// 消费 readThreadQueueState / withThreadQueueStateUpdate 等，类型继续透出。
export type { BackendQueuedTurn, StoredQueuedMessage, ThreadQueueState } from './bridge/threadQueueState.js'
// AD 批 HTTP body/响应/文件上传辅助簇：setJson / readJsonBody / readRawBody /
// bufferIndexOf / handleFileUpload 迁入 bridge/httpHelpers.ts；主 Shell import 复用
// 同名函数，并把 readJsonBody / readRawBody / setJson / handleFileUpload 引用注入路由 deps。
import {
  bufferIndexOf,
  handleFileUpload,
  readJsonBody,
  readRawBody,
  setJson,
} from './bridge/httpHelpers.js'
// AE 批 thread-search 索引构建簇：loadAllThreadsForSearch / buildThreadSearchIndex
// 及其 ThreadSearchDocument / ThreadSearchIndex 类型与 THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT
// 常量迁入 bridge/threadSearch.ts；主 Shell 闭包 getThreadSearchIndex 经 import 复用
// buildThreadSearchIndex 与 ThreadSearchIndex 类型。其余类型/常量仅供新模块内部使用。
import {
  buildThreadSearchIndex,
  type ThreadSearchIndex,
} from './bridge/threadSearch.js'
// AC 批 queued-turn 构建辅助簇：协作模式 reasoning-effort 归一化与附件/prompt
// 文本构建纯函数迁入 bridge/turnFactory.ts；BackendQueueProcessor 实例方法经
// import 复用，类型透出以维持契约。
import {
  buildTextWithAttachments,
  extractLocalImagePathFromUrl,
  extractThreadIdFromNotificationParams,
  fileNameFromPath,
  isTurnCompletedNotification,
  normalizeCollaborationModeReasoningEffort,
  normalizeReasoningEffort,
  type ResolvedCollaborationModeSettings,
} from './bridge/turnFactory.js'
// 空正文兜底（见 utils/turnPromptText.ts）：首轮只有附件/图片而无文本时，
// app-server 派生出的 preview 为空串，thread/list 会把整行筛掉且无法用 RPC 修回。
import { resolveTurnPromptText } from '../utils/turnPromptText.js'
// R 批 workspace-roots 切片：canonicalizeThreadListResponseForRead、
// canonicalizeWorkspaceRootsStateForRead 与 writeWorkspaceRootsState 原为本
// 模块公共导出，供测试继续从本模块导入。
export type { WorkspaceRootsState } from './bridge/workspaceRoots.js'
export {
  canonicalizeThreadListResponseForRead,
  canonicalizeWorkspaceRootsStateForRead,
  writeWorkspaceRootsState,
} from './bridge/workspaceRoots.js'
// 自动化领域切片（A 批）公共导出保持原样：仅 parseAutomationToml 与
// toAutomationApiRecord 此前是公共导出，供消费者（含测试）继续从本模块导入。
export { parseAutomationToml, toAutomationApiRecord } from './bridge/automations.js'
// M 批 file/project 切片：buildProjectlessFolderName 原为本模块公共导出，供
// codexAppServerBridge.archive.test.ts 使用，随迁后从 bridge/projectRoutes.js 透出。
export { buildProjectlessFolderName } from './bridge/projectRoutes.js'
import {
  resolveEffectiveApprovalPolicy,
  writeApprovalPolicyToConfigFile,
} from './bridge/approvalPolicy.js'
import { sanitizeThreadTurnsInlinePayloads } from './bridge/inlineImages.js'
import { resolveFileIdImageBlocksInThreadResult, THREAD_ATTACHMENT_LOOKUP_LIMIT } from './bridge/threadAttachmentImageSources.js'
// thread/read 结果缓存切片（round-76）：命中即跳过 app-server 调用与整条响应管道。
import { ThreadReadResultCache, threadReadInvalidatesCache } from './bridge/threadReadCache.js'
// 内联 data-url 净化切片（U 批）：sanitizeThreadTurnsInlinePayloads 原为本
// 模块公共导出（codexAppServerBridge.inlinePayload.test.ts 依赖），保持透出。
export { sanitizeThreadTurnsInlinePayloads } from './bridge/inlineImages.js'
// codex auth.json + free-mode 状态切片（V 批）：auth 刷新/可用性探测与
// free-mode 状态规范化迁至 codexAuthState.ts；被 freeModeRoutes 透传依赖
// 的函数（getCodexAuthPath 等）在此导入并保持 Shell 面可见。
import {
  ensureDefaultFreeModeStateForMissingAuthSync,
  getCodexAuthPath,
  hasUsableCodexAuth,
  hasUsableCodexAuthSyncPublicForBridge as hasUsableCodexAuthSync,
  refreshChatgptAuthTokensForExternalAuth,
  writeFreeModeStateFile,
  type CodexAuth,
  type ChatgptAuthTokensRefreshParams,
  type ChatgptAuthTokensRefreshResponse,
} from './bridge/codexAuthState.js'
// 保持透出：archive/authRefresh 测试及 freeModeRoutes 依赖这些公共导出。
export {
  ensureDefaultFreeModeStateForMissingAuthSync,
  hasUsableCodexAuth,
  refreshChatgptAuthTokensForExternalAuth,
  writeFreeModeStateFile,
  type CodexAuth,
  type ChatgptAuthTokensRefreshParams,
  type ChatgptAuthTokensRefreshResponse,
} from './bridge/codexAuthState.js'
// imported-session state-db 切片（W 批）：session 记录解析/改写与 sqlite
// threads 表读写迁至 importedSessions.ts；project ZIP 编排（collectProjectChatZipEntries /
// importProjectZip）已迁至 bridge/projectZip.ts（AF 批）。
import {
  filterThreadListByIds,
  mergeImportedThreadsIntoThreadListResult,
} from './bridge/importedSessions.js'
export { filterThreadListByIds, mergeImportedThreadsIntoThreadListResult } from './bridge/importedSessions.js'
import {
  API_PERF_BODY_MB_THRESHOLD,
  API_PERF_LOGGING_ENABLED,
  API_PERF_MS_THRESHOLD,
  MB_DIVISOR,
  getChunkByteLength,
} from './bridge/apiPerfLogging.js'
// thread 域错误分类谓词（Z 批）：4 个纯字符串匹配判错误分类函数迁至
// threadErrors.ts；Shell 内注入 threadRoutes 的 isThreadMaterializationPendingError
// 与 archive.test.ts 依赖的 re-export 保持一致。
import {
  buildPendingMaterializationThreadReadResult,
  isEmptyThreadReadError,
  isThreadMaterializationPendingError,
  isThreadNotFoundError,
  isThreadTurnsNotListableError,
  isUnauthenticatedRateLimitError,
} from './bridge/threadErrors.js'
export {
  buildPendingMaterializationThreadReadResult,
  isEmptyThreadReadError,
  isThreadMaterializationPendingError,
  isThreadNotFoundError,
  isThreadTurnsNotListableError,
  isUnauthenticatedRateLimitError,
} from './bridge/threadErrors.js'
// thread archive-recovery 切片（AA 批）：callRpcWithArchiveRecovery /
// extractThreadMessageText 迁至 bridge/threadArchiveRecovery.ts；thread-search
// 索引与 rpc 派发经 import 复用，archive.test.ts 依赖的 re-export 保持一致。
import {
  callRpcWithArchiveRecovery,
  extractThreadMessageText,
} from './bridge/threadArchiveRecovery.js'
export {
  callRpcWithArchiveRecovery,
  extractThreadMessageText,
} from './bridge/threadArchiveRecovery.js'
import {
  applyTurnFileChanges,
  buildSessionFileChangeFallback,
  collectFileChangesForTurns,
  mergeSessionCommandsIntoTurns,
  revertTurnFileChanges,
} from './bridge/session.js'
// 会话领域切片（E 批）公共导出保持原样：mergeSessionSkillInputsIntoTurns /
// mergeSessionCommandsIntoTurns / pathSetMatchesChange / revertTurnFileChanges
// 此前是公共导出，供消费者（含测试）继续从本模块导入。
export {
  mergeSessionCommandsIntoTurns,
  mergeSessionCommandsIntoTurnsFromPath,
  mergeSessionSkillInputsIntoTurns,
  pathSetMatchesChange,
  revertTurnFileChanges,
} from './bridge/session.js'
// Provider 模型发现切片（F 批）：纯磁盘/网络工具迁入 bridge/models.ts，
// 供 middleware 复用；normalizeProviderModelsData / normalizeCustomEndpointBaseUrl
// 此前是公共导出（有测试），保持从本模块导入。
import {
  fetchCustomEndpointModelIds,
  fetchOpenCodeZenModelIds,
  normalizeCustomEndpointBaseUrl,
  normalizeProviderModelsData,
  readProviderBackedModelIds,
  readProviderModelIdsForProvider,
  sortOpenCodeZenModelIds,
} from './bridge/models.js'
export {
  normalizeCustomEndpointBaseUrl,
  normalizeProviderModelsData,
} from './bridge/models.js'
// Terminal 快速命令集群（G 批）。
import { listTerminalQuickCommands } from './bridge/terminal.js'
import { handleGitWorktreeHttpRequest } from './bridge/routes.js'

type JsonRpcCall = {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: {
    code: number
    message: string
  }
  method?: string
  params?: unknown
}

type RpcProxyRequest = {
  method: string
  params?: unknown
}

type ServerRequestReply = {
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

type PendingServerRequest = {
  id: number
  method: string
  params: unknown
  receivedAtIso: string
}

const THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000
// round-136：游标链落盘的去抖。一次上翻会登记一个新边界，而文件是整体重写的，
// 去抖把连续的滚动压成一次写。
const THREAD_TURN_PAGE_CURSOR_SAVE_DEBOUNCE_MS = 2_000
/** Bounds on the round-86 bounded-turn-page cache (per-thread, then per-page). */
const BOUNDED_TURN_PAGE_CACHE_MAX_THREADS = 32
const BOUNDED_TURN_PAGE_CACHE_MAX_PAGES_PER_THREAD = 64

// round-76：`thread/read` 结果缓存（缓存策略/失效/取键见 bridge/threadReadCache.ts）。
// 这里只挂实例 + 把失效信号接到通知与写 RPC 上。

// File / project HTTP route family (projectless / github-clone / file-search /
// prompts) migrated to bridge/projectRoutes.ts; helpers moved with the family.

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  const normalized = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress
  return normalized === '127.0.0.1' || normalized === '::1'
}

let telegramBridgeConfigMutation: Promise<void> = Promise.resolve()

function rememberTelegramChatId(chatId: number): Promise<void> {
  const normalizedChatId = Math.trunc(chatId)
  if (!Number.isFinite(normalizedChatId)) return Promise.resolve()

  telegramBridgeConfigMutation = telegramBridgeConfigMutation.then(async () => {
    const current = await readTelegramBridgeConfig()
    if (current.chatIds.includes(normalizedChatId)) return
    const next = {
      ...current,
      chatIds: [normalizedChatId, ...current.chatIds].slice(0, 50),
    }
    await writeTelegramBridgeConfig(next)
  })
  return telegramBridgeConfigMutation
}

type StreamEventFrame = {
  method: string
  params: unknown
  atIso: string
}

type CapturedItem = {
  id: string
  type: string
  turnId: string
  data: Record<string, unknown>
  completed: boolean
}

const MERGEABLE_ITEM_TYPES = new Set([
  'commandExecution',
  'fileChange',
])

class AppServerProcess {
  private process: ChildProcessWithoutNullStreams | null = null
  private initialized = false
  private initializePromise: Promise<void> | null = null
  private readBuffer = ''
  private nextId = 1
  private stopping = false
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly notificationListeners = new Set<(value: { method: string; params: unknown }) => void>()
  private readonly pendingServerRequests = new Map<number, PendingServerRequest>()
  private readonly streamEventsByThreadId = new Map<string, StreamEventFrame[]>()
  private readonly lastThreadReadSnapshotByThreadId = new Map<string, unknown>()
  private readonly threadTurnPageReadCacheByThreadId = new Map<string, { result: unknown; expiresAt: number }>()
  private readonly threadTurnPageReadPromiseByThreadId = new Map<string, Promise<unknown>>()
  // round-86：上翻更早轮次的有界路径。游标链本身不做失效（陈旧游标由 id 列表
  // 复核拦下）；这里只缓存已组装好的页，语义与 threadTurnPageReadCacheByThreadId 一致。
  private readonly threadTurnPageCursorChain = new ThreadTurnPageCursorChain()
  // round-136：链的持久化。hydrate 只在首次用到时做一次；save 走去抖。
  private cursorChainHydration: Promise<void> | null = null
  private cursorChainSaveTimer: ReturnType<typeof setTimeout> | null = null
  private readonly boundedThreadTurnPageCacheByThreadId = new Map<string, Map<string, { page: BoundedThreadTurnPage; expiresAt: number }>>()
  // round-102 P0：app-server 一旦承认不实现 thread/turns/list（codex-cli 0.158.0
  // 注册了方法但回 `-32601: list_turns is not supported yet`），就记住这个能力位。
  // round-130 复测（0.160.1）：该方法已实现，故这个闩锁只在旧二进制上会置位。
  // 上翻路由据此拒绝回落全量水合——0.158.0 上大线程的全量 thread/read 会挂死 UI。
  private threadTurnPageUnsupported = false
  private readonly threadReadResultCache = new ThreadReadResultCache()
  private readonly capturedItemsByThreadId = new Map<string, Map<string, CapturedItem>>()
  private readonly liveStateCache = new Map<string, { data: unknown; turnCount: number; sessionSize: number }>()
  private chatgptAuthRefreshPromise: Promise<ChatgptAuthTokensRefreshResponse> | null = null
  private activeConfigSignature = ''


  private getCodexCommand(): string {
    const codexCommand = resolveCodexCommand()
    if (!codexCommand) {
      throw new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')
    }
    return codexCommand
  }

  private buildAppServerConfig(): { args: string[]; env: Record<string, string> } {
    const args = buildAppServerArgs()
    let extraEnv: Record<string, string> = {}
    const serverPort = parseInt(process.env.CODEXUI_SERVER_PORT ?? '', 10) || undefined
    // round-122：用户在 config.toml 里自己定义了同名 provider 时不再注入兼容占位——
    // `-c` 优先级高于 config.toml，会把用户的定义（base_url 等）整体顶掉。
    args.push(...getProviderCompatibilityConfigArgs(serverPort, readUserConfiguredProviderIds()))
    const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
    try {
      const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
      if (state) {
        args.push(...getFreeModeConfigArgs(state, serverPort))
        extraEnv = getFreeModeEnvVars(state)
      }
    } catch {
      // No free-mode state or invalid — use defaults
    }
    return { args, env: extraEnv }
  }

  private getAppServerConfigSignature(config: { args: string[]; env: Record<string, string> }): string {
    return JSON.stringify({
      args: config.args,
      env: Object.keys(config.env)
        .sort()
        .map((key) => [key, config.env[key]]),
    })
  }

  private disposeIfConfigChanged(): void {
    if (!this.process) return
    const config = this.buildAppServerConfig()
    const nextSignature = this.getAppServerConfigSignature(config)
    if (this.activeConfigSignature === nextSignature) return
    this.dispose()
  }

  private start(): void {
    if (this.process) return

    this.stopping = false
    const config = this.buildAppServerConfig()
    this.activeConfigSignature = this.getAppServerConfigSignature(config)
    const invocation = getSpawnInvocation(this.getCodexCommand(), config.args)
    const spawnEnv = Object.keys(config.env).length > 0
      ? { ...process.env, ...config.env }
      : undefined
    const proc = spawn(invocation.command, invocation.args, { stdio: ['pipe', 'pipe', 'pipe'], ...(spawnEnv ? { env: spawnEnv } : {}) })
    this.process = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.readBuffer += chunk

      let lineEnd = this.readBuffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = this.readBuffer.slice(0, lineEnd).trim()
        this.readBuffer = this.readBuffer.slice(lineEnd + 1)

        if (line.length > 0) {
          this.handleLine(line)
        }

        lineEnd = this.readBuffer.indexOf('\n')
      }
    })

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', () => {
      // Keep stderr silent in dev middleware; JSON-RPC errors are forwarded via responses.
    })

    proc.on('exit', () => {
      if (this.process !== proc) {
        return
      }

      const failure = new Error(this.stopping ? 'codex app-server stopped' : 'codex app-server exited unexpectedly')
      for (const request of this.pending.values()) {
        request.reject(failure)
      }

      this.pending.clear()
      this.pendingServerRequests.clear()
      this.process = null
      this.initialized = false
      this.initializePromise = null
      this.readBuffer = ''
      this.invalidateThreadReadResultCache()
    })
  }

  private sendLine(payload: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error('codex app-server is not running')
    }

    this.process.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return
    }

    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pendingRequest = this.pending.get(message.id)
      this.pending.delete(message.id)

      if (!pendingRequest) return

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message))
      } else {
        pendingRequest.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string' && typeof message.id !== 'number') {
      this.emitNotification({
        method: message.method,
        params: message.params ?? null,
      })
      return
    }

    // Handle server-initiated JSON-RPC requests (approvals, dynamic tool calls, etc.).
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.handleServerRequest(message.id, message.method, message.params ?? null)
    }
  }

  private emitNotification(notification: { method: string; params: unknown }): void {
    this.recordStreamEvent(notification)
    this.captureItemFromNotification(notification)
    const nThreadId = this.extractThreadIdFromParams(notification.params)
    if (nThreadId) {
      this.invalidateLiveStateCache(nThreadId)
      // round-136：上翻的全量读缓存只服务「更早轮次」这一个窗口，而窗口的边界
      // 由锚点轮的位置决定 —— 实时回合里的 item/* 增量改的是最新一轮，不会移动
      // 更早窗口。原先「任意带 threadId 的通知都清」使它在一次回合里恒为冷，同一
      // 锚点重复上翻就重复付 6–7s（round-132 §3.3）。改为只在可能改变轮次结构的
      // 方法上清（turn/* 与 thread/start|resume|fork|rollback|revert|archive…）。
      if (threadReadInvalidatesCache(notification.method)) {
        this.threadTurnPageReadCacheByThreadId.delete(nThreadId)
      }
      this.invalidateBoundedThreadTurnPageCache(nThreadId)
      this.invalidateThreadReadResultCache(nThreadId)
    }
    for (const listener of this.notificationListeners) {
      listener(notification)
    }
  }

  private extractThreadIdFromParams(params: unknown): string {
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

  private recordStreamEvent(notification: { method: string; params: unknown }): void {
    const threadId = this.extractThreadIdFromParams(notification.params)
    if (!threadId) return
    const frame: StreamEventFrame = {
      method: notification.method,
      params: notification.params,
      atIso: new Date().toISOString(),
    }
    let buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer) {
      buffer = []
      this.streamEventsByThreadId.set(threadId, buffer)
    }
    buffer.push(frame)
    if (buffer.length > STREAM_EVENT_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - STREAM_EVENT_BUFFER_LIMIT)
    }
  }

  getStreamEvents(threadId: string, limit: number): StreamEventFrame[] {
    const buffer = this.streamEventsByThreadId.get(threadId)
    if (!buffer || buffer.length === 0) return []
    return buffer.slice(-limit)
  }

  storeThreadReadSnapshot(threadId: string, snapshot: unknown): void {
    this.lastThreadReadSnapshotByThreadId.set(threadId, snapshot)
    // round-136：这里以前把上翻的全量读缓存一起删。但「存一份快照」并不改变轮次，
    // 而 `thread/read` 也走这条管道 —— 一次纯读就把缓存清空，正是 round-132 §四
    // 里「探针每次上翻前先发一条 thread/read，于是每次都冷」的自污染来源。真正的
    // 轮次变化改由 rpc() 的结构性方法判定（下面）与通知门控负责。
    this.invalidateBoundedThreadTurnPageCache(threadId)
  }

  getLastThreadReadSnapshot(threadId: string): unknown | null {
    return this.lastThreadReadSnapshotByThreadId.get(threadId) ?? null
  }

  async readThreadForTurnPage(threadId: string): Promise<unknown> {
    const now = Date.now()
    const cached = this.threadTurnPageReadCacheByThreadId.get(threadId)
    if (cached && cached.expiresAt > now) return cached.result
    if (cached) this.threadTurnPageReadCacheByThreadId.delete(threadId)

    const pending = this.threadTurnPageReadPromiseByThreadId.get(threadId)
    if (pending) return pending

    const promise = this.rpc('thread/read', {
      threadId,
      includeTurns: true,
    }).then((result) => {
      this.threadTurnPageReadCacheByThreadId.set(threadId, {
        result,
        expiresAt: Date.now() + THREAD_TURN_PAGE_READ_CACHE_TTL_MS,
      })
      return result
    }).finally(() => {
      this.threadTurnPageReadPromiseByThreadId.delete(threadId)
    })

    this.threadTurnPageReadPromiseByThreadId.set(threadId, promise)
    return promise
  }

  /**
   * Record that `olderCursor` reaches the turns immediately before
   * `oldestTurnId`, so the older-turn route can start paging without walking
   * the cursor chain from the newest turn (round-86).
   */
  recordThreadTurnPageBoundary(threadId: string, oldestTurnId: string, olderCursor: string | null): void {
    this.threadTurnPageCursorChain.record(threadId, oldestTurnId, olderCursor)
    this.scheduleThreadTurnPageCursorPersist()
  }

  /**
   * Load the persisted chain, once, best-effort (round-136). The chain is the
   * difference between a 969ms scroll and a 7202ms one for the same anchor
   * (round-132 §3.1), and it used to die with the process -- so the first scroll
   * of every session (every packaged launch, every dev reload) was the slow one.
   * An absent or corrupt file is simply an empty chain.
   */
  private ensureThreadTurnPageCursorChainHydrated(): Promise<void> {
    if (!this.cursorChainHydration) {
      this.cursorChainHydration = readThreadTurnPageCursors()
        .then((state) => { this.threadTurnPageCursorChain.hydrate(state) })
        .catch(() => {})
    }
    return this.cursorChainHydration
  }

  private scheduleThreadTurnPageCursorPersist(): void {
    if (this.cursorChainSaveTimer) return
    this.cursorChainSaveTimer = setTimeout(() => {
      this.cursorChainSaveTimer = null
      this.persistThreadTurnPageCursorChain()
    }, THREAD_TURN_PAGE_CURSOR_SAVE_DEBOUNCE_MS)
    // Never hold the process -- or a test run -- open just to flush a cache.
    this.cursorChainSaveTimer.unref?.()
  }

  private persistThreadTurnPageCursorChain(): void {
    void writeThreadTurnPageCursors(this.threadTurnPageCursorChain.snapshot()).catch(() => {})
  }

  private flushThreadTurnPageCursorChain(): void {
    if (this.cursorChainSaveTimer) {
      clearTimeout(this.cursorChainSaveTimer)
      this.cursorChainSaveTimer = null
    }
    this.persistThreadTurnPageCursorChain()
  }

  /**
   * The turns immediately before `beforeTurnId`, loaded as one `thread/turns/list`
   * page instead of a full-history `thread/read` (round-86; see
   * bridge/threadTurnPage.ts for the measurements and the cursor semantics).
   *
   * Returns null whenever the bounded path cannot answer -- no cursor anchored
   * at the anchor turn, a stale cursor, an app-server that errors on the call --
   * and the caller then runs the unbounded read it used to run.
   */
  async readBoundedThreadTurnPage(
    threadId: string,
    beforeTurnId: string,
    limit: number,
  ): Promise<BoundedThreadTurnPage | null> {
    const pageKey = `${beforeTurnId}\u0000${limit}`
    await this.ensureThreadTurnPageCursorChainHydrated()

    const perThread = this.boundedThreadTurnPageCacheByThreadId.get(threadId)
    const cached = perThread?.get(pageKey)
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.page
      perThread?.delete(pageKey)
    }

    let page: BoundedThreadTurnPage | null
    try {
      page = await readBoundedThreadTurnPage({
        rpc: (method, params) => this.rpc(method, params),
        chain: this.threadTurnPageCursorChain,
      }, threadId, beforeTurnId, limit)
    } catch (error) {
      if (error instanceof ThreadTurnPageUnsupportedError) {
        // Latch for the life of the process: the CLI binary does not change
        // under a running app-server, so one admission is definitive.
        this.threadTurnPageUnsupported = true
      }
      return null
    }
    if (!page) return null

    let bucket = this.boundedThreadTurnPageCacheByThreadId.get(threadId)
    if (!bucket) {
      bucket = new Map()
      this.boundedThreadTurnPageCacheByThreadId.set(threadId, bucket)
      if (this.boundedThreadTurnPageCacheByThreadId.size > BOUNDED_TURN_PAGE_CACHE_MAX_THREADS) {
        const oldestThreadId = this.boundedThreadTurnPageCacheByThreadId.keys().next().value
        if (typeof oldestThreadId === 'string') this.boundedThreadTurnPageCacheByThreadId.delete(oldestThreadId)
      }
    }
    bucket.set(pageKey, { page, expiresAt: Date.now() + THREAD_TURN_PAGE_READ_CACHE_TTL_MS })
    if (bucket.size > BOUNDED_TURN_PAGE_CACHE_MAX_PAGES_PER_THREAD) {
      const oldestKey = bucket.keys().next().value
      if (typeof oldestKey === 'string') bucket.delete(oldestKey)
    }
    return page
  }

  private invalidateBoundedThreadTurnPageCache(threadId?: string): void {
    if (threadId) this.boundedThreadTurnPageCacheByThreadId.delete(threadId)
    else this.boundedThreadTurnPageCacheByThreadId.clear()
  }

  private invalidateThreadTurnPageReadCache(threadId?: string): void {
    if (threadId) this.threadTurnPageReadCacheByThreadId.delete(threadId)
    else this.threadTurnPageReadCacheByThreadId.clear()
  }

  /**
   * True once the app-server has admitted it does not implement
   * `thread/turns/list` (codex-cli 0.158.0 and any future build that retires the
   * method before its replacement ships; codex-cli 0.160.1 implements it, so this
   * stays false there -- round-130). The older-turn route checks this
   * before falling back to the full-hydration read, which hangs the UI on such
   * builds (round-102 P0).
   */
  isThreadTurnPageUnsupported(): boolean {
    return this.threadTurnPageUnsupported
  }

  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void {
    this.liveStateCache.set(threadId, { data, turnCount, sessionSize })
  }

  /**
   * Cache a post-pipeline `thread/read` result. Called by the RPC handler with
   * exactly what was sent to the client, so a hit skips the app-server call, the
   * 10-turn trim, the session-log command merge and the payload slimming.
   */
  cacheThreadReadResult(threadId: string, params: unknown, result: unknown): void {
    this.threadReadResultCache.set(threadId, asRecord(params), result)
  }

  getCachedThreadReadResult(threadId: string, params: unknown): unknown | null {
    return this.threadReadResultCache.get(threadId, asRecord(params))
  }

  invalidateThreadReadResultCache(threadId?: string): void {
    this.threadReadResultCache.invalidate(threadId)
  }

  getCachedLiveState(threadId: string, turnCount: number, sessionSize: number): unknown | null {
    const cached = this.liveStateCache.get(threadId)
    if (!cached) return null
    if (cached.turnCount !== turnCount || cached.sessionSize !== sessionSize) return null
    return cached.data
  }

  invalidateLiveStateCache(threadId: string): void {
    this.liveStateCache.delete(threadId)
  }

  private captureItemFromNotification(notification: { method: string; params: unknown }): void {
    if (notification.method !== 'item/started' && notification.method !== 'item/completed') return

    const params = asRecord(notification.params)
    if (!params) return
    const item = asRecord(params.item)
    if (!item) return
    const itemType = typeof item.type === 'string' ? item.type : ''
    if (!MERGEABLE_ITEM_TYPES.has(itemType)) return

    const itemId = typeof item.id === 'string' ? item.id : ''
    if (!itemId) return

    const threadId = this.extractThreadIdFromParams(params)
    if (!threadId) return

    const turnId =
      (typeof params.turnId === 'string' ? params.turnId : '') ||
      (typeof params.turn_id === 'string' ? params.turn_id : '')
    if (!turnId) return

    let threadItems = this.capturedItemsByThreadId.get(threadId)
    if (!threadItems) {
      threadItems = new Map()
      this.capturedItemsByThreadId.set(threadId, threadItems)
    }

    const isCompleted = notification.method === 'item/completed'
    const existing = threadItems.get(itemId)

    if (existing && existing.completed && !isCompleted) return

    threadItems.set(itemId, {
      id: itemId,
      type: itemType,
      turnId,
      data: item as Record<string, unknown>,
      completed: isCompleted,
    })
  }

  mergeItemsIntoTurns(threadId: string, turns: unknown[]): unknown[] {
    const capturedMap = this.capturedItemsByThreadId.get(threadId)
    if (!capturedMap || capturedMap.size === 0) return turns

    const itemsByTurnId = new Map<string, CapturedItem[]>()
    for (const captured of capturedMap.values()) {
      let group = itemsByTurnId.get(captured.turnId)
      if (!group) {
        group = []
        itemsByTurnId.set(captured.turnId, group)
      }
      group.push(captured)
    }

    return turns.map((turn) => {
      const turnRecord = asRecord(turn)
      if (!turnRecord) return turn
      const turnId = typeof turnRecord.id === 'string' ? turnRecord.id : ''
      if (!turnId) return turn

      const captured = itemsByTurnId.get(turnId)
      if (!captured || captured.length === 0) return turn

      const existingItems = Array.isArray(turnRecord.items) ? (turnRecord.items as Record<string, unknown>[]) : []
      const existingIds = new Set(existingItems.map((it) => (typeof it.id === 'string' ? it.id : '')).filter(Boolean))

      const newItems = captured
        .filter((c) => !existingIds.has(c.id))
        .map((c) => c.data)

      if (newItems.length === 0) return turn

      return {
        ...turnRecord,
        items: [...existingItems, ...newItems],
      }
    })
  }

  private sendServerRequestReply(requestId: number, reply: ServerRequestReply): void {
    if (reply.error) {
      this.sendLine({
        jsonrpc: '2.0',
        id: requestId,
        error: reply.error,
      })
      return
    }

    this.sendLine({
      jsonrpc: '2.0',
      id: requestId,
      result: reply.result ?? {},
    })
  }

  private resolvePendingServerRequest(requestId: number, reply: ServerRequestReply): void {
    const pendingRequest = this.pendingServerRequests.get(requestId)
    if (!pendingRequest) {
      throw new Error(`No pending server request found for id ${String(requestId)}`)
    }
    this.pendingServerRequests.delete(requestId)

    this.sendServerRequestReply(requestId, reply)
    const requestParams = asRecord(pendingRequest.params)
    const threadId =
      typeof requestParams?.threadId === 'string' && requestParams.threadId.length > 0
        ? requestParams.threadId
        : ''
    this.emitNotification({
      method: 'server/request/resolved',
      params: {
        id: requestId,
        method: pendingRequest.method,
        threadId,
        mode: 'manual',
        resolvedAtIso: new Date().toISOString(),
      },
    })
  }

  private async refreshChatgptAuthTokens(params: ChatgptAuthTokensRefreshParams): Promise<ChatgptAuthTokensRefreshResponse> {
    if (!this.chatgptAuthRefreshPromise) {
      this.chatgptAuthRefreshPromise = refreshChatgptAuthTokensForExternalAuth(params).finally(() => {
        this.chatgptAuthRefreshPromise = null
      })
    }
    return await this.chatgptAuthRefreshPromise
  }

  private async handleChatgptAuthTokensRefreshRequest(requestId: number, params: unknown): Promise<void> {
    const requestParams = asRecord(params)
    const previousAccountId = readNonEmptyString(requestParams?.previousAccountId ?? requestParams?.previous_account_id)
    try {
      const result = await this.refreshChatgptAuthTokens({
        reason: readNonEmptyString(requestParams?.reason) || undefined,
        previousAccountId: previousAccountId || undefined,
      })
      this.sendServerRequestReply(requestId, { result })
      this.emitNotification({
        method: 'server/request/resolved',
        params: {
          id: requestId,
          method: 'account/chatgptAuthTokens/refresh',
          mode: 'automatic',
          resolvedAtIso: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.sendServerRequestReply(requestId, {
        error: {
          code: -32001,
          message: getErrorMessage(error, 'Failed to refresh ChatGPT auth tokens'),
        },
      })
    }
  }

  private handleServerRequest(requestId: number, method: string, params: unknown): void {
    if (method === 'account/chatgptAuthTokens/refresh') {
      void this.handleChatgptAuthTokensRefreshRequest(requestId, params)
      return
    }

    const pendingRequest: PendingServerRequest = {
      id: requestId,
      method,
      params,
      receivedAtIso: new Date().toISOString(),
    }
    this.pendingServerRequests.set(requestId, pendingRequest)

    this.emitNotification({
      method: 'server/request',
      params: pendingRequest,
    })
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    this.start()
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.sendLine({
        jsonrpc: '2.0',
        id,
        method,
        params,
      } satisfies JsonRpcCall)
    })
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.initializePromise) {
      await this.initializePromise
      return
    }

    this.initializePromise = this.call('initialize', {
      clientInfo: {
        name: 'codex-web-local',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }).then(() => {
      this.sendLine({
        jsonrpc: '2.0',
        method: 'initialized',
      })
      this.initialized = true
    }).finally(() => {
      this.initializePromise = null
    })

    await this.initializePromise
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    this.disposeIfConfigChanged()
    // A method that can mutate thread state makes every cached read stale; the
    // per-thread notification hook covers the rest.
    if (threadReadInvalidatesCache(method)) {
      const paramsRecord = asRecord(params)
      const threadId = readNonEmptyString(paramsRecord?.threadId)
      this.invalidateThreadReadResultCache(threadId || undefined)
      // round-136：通知门控收窄之后，结构性变更由这里兜住。thread/revert 与
      // thread/rollback（以及 turn/start）是客户端自己发起的 RPC，未必伴随一条
      // 可判定的通知，而它们会截断/重排轮次 —— 上翻的全量读缓存必须作废，否则
      // 会按已经不存在的锚点切窗口。thread/read 不在该模式内，纯读不再自清。
      this.invalidateThreadTurnPageReadCache(threadId || undefined)
    }
    await this.ensureInitialized()
    return this.call(method, params)
  }

  /**
   * Spawn + initialize the app-server ahead of the first user request.
   *
   * Measured cold start: the first page load fires ~20 startup RPCs that all
   * queue behind one just-spawned app-server (head-of-line blocking —
   * free-mode/status 2619ms, meta/methods 1306ms, thread/queue-state 1287ms), so
   * `thread/list` costs 934ms cold vs 63ms warm.
   *
   * Honest scope of the win (measured 2026-09-11, dev server): the frontend's
   * burst arrives ~1-3s after the Vite dev server reports ready, while
   * `ensureInitialized()` here needs ~2.1s. So warm-up only *overlaps* part of
   * the init — the first request still waits for the remainder (observed first
   * GET 1401ms, meta/methods 2118ms). It does not remove the cold start from
   * first paint; it removes it from every *later* load, and it is what makes the
   * warm path (all endpoints <=70ms) reachable without an artificial first
   * request. Treat this as queue-shifting, not as a first-paint fix.
   *
   * Side effect to be aware of: this spawns the app-server eagerly whenever the
   * bridge is created (dev server and packaged `createServer` alike) instead of
   * lazily on the first request.
   *
   * Best-effort: a failure here must not break the bridge, because the next
   * request retries through the normal ensureInitialized path.
   */
  async warmUp(): Promise<void> {
    try {
      this.disposeIfConfigChanged()
      await this.ensureInitialized()
    } catch {
      // Ignore: the first real request will surface the error with context.
    }
  }

  onNotification(listener: (value: { method: string; params: unknown }) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  async respondToServerRequest(payload: unknown): Promise<void> {
    await this.ensureInitialized()

    const body = asRecord(payload)
    if (!body) {
      throw new Error('Invalid response payload: expected object')
    }

    const id = body.id
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid response payload: "id" must be an integer')
    }

    const rawError = asRecord(body.error)
    if (rawError) {
      const message = typeof rawError.message === 'string' && rawError.message.trim().length > 0
        ? rawError.message.trim()
        : 'Server request rejected by client'
      const code = typeof rawError.code === 'number' && Number.isFinite(rawError.code)
        ? Math.trunc(rawError.code)
        : -32000
      this.resolvePendingServerRequest(id, { error: { code, message } })
      return
    }

    if (!('result' in body)) {
      throw new Error('Invalid response payload: expected "result" or "error"')
    }

    this.resolvePendingServerRequest(id, { result: body.result })
  }

  listPendingServerRequests(): PendingServerRequest[] {
    return Array.from(this.pendingServerRequests.values())
  }

  dispose(): void {
    if (!this.process) return

    const proc = this.process
    this.stopping = true
    this.process = null
    this.initialized = false
    this.initializePromise = null
    this.activeConfigSignature = ''
    this.readBuffer = ''
    this.invalidateThreadReadResultCache()
    this.flushThreadTurnPageCursorChain()

    const failure = new Error('codex app-server stopped')
    for (const request of this.pending.values()) {
      request.reject(failure)
    }
    this.pending.clear()
    this.pendingServerRequests.clear()

    try {
      proc.stdin.end()
    } catch {
      // ignore close errors on shutdown
    }

    try {
      proc.kill('SIGTERM')
    } catch {
      // ignore kill errors on shutdown
    }

    const forceKillTimer = setTimeout(() => {
      if (!proc.killed) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore kill errors on shutdown
        }
      }
    }, 1500)
    forceKillTimer.unref()
  }
}

export class BackendQueueProcessor {
  private readonly processingThreadIds = new Set<string>()
  private readonly queueDrainTimersByThreadId = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly queueDrainDueAtByThreadId = new Map<string, number>()
  private readonly unsubscribe: () => void

  constructor(private readonly appServer: AppServerProcess) {
    this.unsubscribe = appServer.onNotification((notification) => {
      if (!isTurnCompletedNotification(notification)) return
      const threadId = extractThreadIdFromNotificationParams(notification.params)
      if (!threadId) return
      void this.processThreadQueue(threadId)
    })
    void this.scheduleAllQueuedThreads(1000)
  }

  dispose(): void {
    this.unsubscribe()
    for (const timer of this.queueDrainTimersByThreadId.values()) {
      clearTimeout(timer)
    }
    this.queueDrainTimersByThreadId.clear()
    this.queueDrainDueAtByThreadId.clear()
    this.processingThreadIds.clear()
  }

  async scheduleAllQueuedThreads(delayMs = 0): Promise<void> {
    try {
      const state = await readThreadQueueState()
      for (const threadId of Object.keys(state)) {
        this.scheduleThreadQueueDrain(threadId, delayMs)
      }
    } catch {
      // Queue recovery is best-effort; normal turn-completed events can still drain later.
    }
  }

  scheduleThreadQueueDrain(threadId: string, delayMs = 5000): void {
    if (!threadId) return
    const normalizedDelayMs = Math.max(0, delayMs)
    const nextDueAt = Date.now() + normalizedDelayMs
    const existingDueAt = this.queueDrainDueAtByThreadId.get(threadId)
    const existingTimer = this.queueDrainTimersByThreadId.get(threadId)
    if (existingTimer) {
      if (existingDueAt !== undefined && existingDueAt <= nextDueAt) return
      clearTimeout(existingTimer)
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
    }
    const timer = setTimeout(() => {
      this.queueDrainTimersByThreadId.delete(threadId)
      this.queueDrainDueAtByThreadId.delete(threadId)
      void this.processThreadQueue(threadId)
    }, normalizedDelayMs)
    timer.unref?.()
    this.queueDrainTimersByThreadId.set(threadId, timer)
    this.queueDrainDueAtByThreadId.set(threadId, nextDueAt)
  }

  async processThreadQueue(threadId: string): Promise<void> {
    if (this.processingThreadIds.has(threadId)) return
    this.processingThreadIds.add(threadId)
    try {
      const canStart = await this.canStartQueuedTurn(threadId)
      if (!canStart) {
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
        return
      }
      const next = await this.popNextQueuedTurn(threadId)
      if (!next) return
      try {
        await this.startQueuedTurn(next)
        if (await this.hasQueuedTurns(threadId)) {
          this.scheduleThreadQueueDrain(threadId)
        }
      } catch {
        await this.restoreQueuedTurn(next)
        this.scheduleThreadQueueDrain(threadId)
      }
    } catch {
      // Queue processing is best-effort. Keep the bridge alive if app-server is unavailable.
      this.scheduleThreadQueueDrain(threadId)
    } finally {
      this.processingThreadIds.delete(threadId)
    }
  }

  private async hasQueuedTurns(threadId: string): Promise<boolean> {
    const state = await readThreadQueueState()
    const queue = state[threadId]
    return Array.isArray(queue) && queue.length > 0
  }

  private async canStartQueuedTurn(threadId: string): Promise<boolean> {
    // round-111：这一问（能不能开跑下一轮）每次队列 drain 都问一次，原先发的是
    // 全量 thread/read（大线程 6.0–6.2s / 26MB）。有界读恰好覆盖它要的两件事：
    // 线程自身的 status 在元数据里，而「有没有正在跑的轮」只看最新一页就够——
    // 正在跑的轮必然是最新的那一轮。失败时 readThreadWithTurnPage 会重放原请求，
    // 与改动前逐字一致。
    const response = asRecord(await readThreadWithTurnPage({
      rpc: (method, params) => this.appServer.rpc(method, params),
      sendRead: (params) => this.appServer.rpc('thread/read', params),
    }, { threadId, includeTurns: true }))
    const thread = asRecord(response?.thread)
    if (!thread) return false

    const status = asRecord(thread.status)
    const statusType = readNonEmptyString(status?.type)
    if (statusType === 'inProgress' || statusType === 'running' || statusType === 'active') return false

    const turns = Array.isArray(thread.turns) ? thread.turns : []
    return !turns.some((turn) => readNonEmptyString(asRecord(turn)?.status) === 'inProgress')
  }

  private async popNextQueuedTurn(threadId: string): Promise<BackendQueuedTurn | null> {
    return withThreadQueueStateUpdate((state) => {
      const queue = state[threadId]
      if (!queue || queue.length === 0) {
        return { nextState: state, result: null }
      }

      const [message, ...rest] = queue
      const nextState = { ...state }
      if (rest.length > 0) {
        nextState[threadId] = rest
      } else {
        delete nextState[threadId]
      }
      return { nextState, result: { threadId, message } }
    })
  }

  private async restoreQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    await withThreadQueueStateUpdate((state) => {
      const queue = state[turn.threadId] ?? []
      return {
        nextState: {
          ...state,
          [turn.threadId]: [turn.message, ...queue],
        },
        result: undefined,
      }
    })
  }

  private async resolveCollaborationModeSettings(mode: CollaborationModeKind): Promise<ResolvedCollaborationModeSettings> {
    let currentConfig: Record<string, unknown> | null = null
    try {
      const configPayload = asRecord(await this.appServer.rpc('config/read', {}))
      currentConfig = asRecord(configPayload?.config)
    } catch {
      currentConfig = null
    }

    const configuredModel = readNonEmptyString(currentConfig?.model)
    if (configuredModel) {
      return {
        model: configuredModel,
        reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
      }
    }

    try {
      const modelsPayload = asRecord(await this.appServer.rpc('model/list', {}))
      const models = Array.isArray(modelsPayload?.data) ? modelsPayload.data : []
      for (const row of models) {
        const record = asRecord(row)
        const candidate = readNonEmptyString(record?.id) || readNonEmptyString(record?.model)
        if (candidate) {
          return {
            model: candidate,
            reasoningEffort: normalizeCollaborationModeReasoningEffort(normalizeReasoningEffort(currentConfig?.model_reasoning_effort)),
          }
        }
      }
    } catch {
      // Fall through to no collaboration-mode payload.
    }

    throw new Error(`${mode === 'plan' ? 'Plan' : 'Default'} mode requires an available model.`)
  }

  private async buildQueuedTurnParams(turn: BackendQueuedTurn): Promise<Record<string, unknown>> {
    const localImageAttachments: StoredQueuedMessage['fileAttachments'] = []
    for (const imageUrl of turn.message.imageUrls) {
      const localImagePath = extractLocalImagePathFromUrl(imageUrl.trim())
      if (!localImagePath) continue
      localImageAttachments.push({
        label: fileNameFromPath(localImagePath),
        path: localImagePath,
        fsPath: localImagePath,
      })
    }

    const allFileAttachments = [...turn.message.fileAttachments, ...localImageAttachments]
    const dedupedFileAttachments = allFileAttachments.filter((entry, index) =>
      allFileAttachments.findIndex((candidate) => candidate.fsPath === entry.fsPath) === index)

    const input: Array<Record<string, unknown>> = [{
      type: 'text',
      text: buildTextWithAttachments(
        resolveTurnPromptText(turn.message.text, dedupedFileAttachments, turn.message.imageUrls),
        dedupedFileAttachments,
      ),
    }]

    for (const imageUrl of turn.message.imageUrls) {
      const normalizedUrl = imageUrl.trim()
      if (!normalizedUrl) continue
      const localImagePath = extractLocalImagePathFromUrl(normalizedUrl)
      if (localImagePath) {
        // 视频路径已作为文件附件下发（attachVideoFile 双写），模型无法接收
        // 视频作为 input_image，跳过本地图片输入以免 turn 失败。
        if (/\.(mp4|m4v|webm|mov|mkv|ogv|ogg|mpeg|avi)$/iu.test(localImagePath)) continue
        input.push({ type: 'localImage', path: localImagePath })
      } else {
        input.push({ type: 'image', url: normalizedUrl, image_url: normalizedUrl })
      }
    }

    for (const skill of turn.message.skills) {
      input.push({ type: 'skill', name: skill.name, path: skill.path })
    }

    const params: Record<string, unknown> = {
      threadId: turn.threadId,
      input,
    }
    if (dedupedFileAttachments.length > 0) {
      params.attachments = dedupedFileAttachments.map((f) => ({ label: f.label, path: f.path, fsPath: f.fsPath }))
    }

    try {
      const settings = await this.resolveCollaborationModeSettings(turn.message.collaborationMode)
      params.collaborationMode = {
        mode: turn.message.collaborationMode,
        settings: {
          model: settings.model,
          reasoning_effort: settings.reasoningEffort,
          developer_instructions: null,
        },
      }
    } catch {
      // Older app-server versions still accept a plain turn/start without collaborationMode.
    }

    return params
  }

  private async startQueuedTurn(turn: BackendQueuedTurn): Promise<void> {
    // round-112：这一发 resume 的唯一目的是把线程加载进 app-server（紧接着就
    // turn/start），返回的轮次从来没人读。原先不传 excludeTurns → app-server 会
    // 全量构造轮次：本机实测 3MB/16 轮线程 3267ms（round-130 复核：这批读数当时
    // 驱动的其实是 0.154.0-alpha.6.2，文档标了 0.158.0；量级结论不变），大线程按 round-84
    // 的量级是 2118ms/12.12MB，而每个排队轮开跑都要付一次。
    // ThreadResumeParams.excludeTurns 的协议语义正是「只返回线程元数据与
    // live-resume 状态、不填 thread.turns」——加载语义不变。探针实测
    // （tmp/probe-0158-resume-exclude-turns.cjs，同线程）：3267ms → 61ms，
    // 返回的 32 个 thread 元数据字段与全量 resume **逐字相同**（除 turns），
    // 且随后 turns/list 照常可用（52ms/5 条）。
    await this.appServer.rpc('thread/resume', { threadId: turn.threadId, excludeTurns: true })
    await this.appServer.rpc('turn/start', await this.buildQueuedTurnParams(turn))
  }
}

class MethodCatalog {
  private methodCache: string[] | null = null
  private notificationCache: string[] | null = null

  private async runGenerateSchemaCommand(outDir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const codexCommand = resolveCodexCommand()
      if (!codexCommand) {
        reject(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))
        return
      }

      const invocation = getSpawnInvocation(codexCommand, ['app-server', 'generate-json-schema', '--out', outDir])
      const process = spawn(invocation.command, invocation.args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''

      process.stderr.setEncoding('utf8')
      process.stderr.on('data', (chunk: string) => {
        stderr += chunk
      })

      process.on('error', reject)
      process.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(stderr.trim() || `generate-json-schema exited with code ${String(code)}`))
      })
    })
  }

  private extractMethodsFromClientRequest(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  private extractMethodsFromServerNotification(payload: unknown): string[] {
    const root = asRecord(payload)
    const oneOf = Array.isArray(root?.oneOf) ? root.oneOf : []
    const methods = new Set<string>()

    for (const entry of oneOf) {
      const row = asRecord(entry)
      const properties = asRecord(row?.properties)
      const methodDef = asRecord(properties?.method)
      const methodEnum = Array.isArray(methodDef?.enum) ? methodDef.enum : []

      for (const item of methodEnum) {
        if (typeof item === 'string' && item.length > 0) {
          methods.add(item)
        }
      }
    }

    return Array.from(methods).sort((a, b) => a.localeCompare(b))
  }

  async listMethods(): Promise<string[]> {
    if (this.methodCache) {
      return this.methodCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const clientRequestPath = join(outDir, 'ClientRequest.json')
    const raw = await readFile(clientRequestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromClientRequest(parsed)

    this.methodCache = methods
    return methods
  }

  async listNotificationMethods(): Promise<string[]> {
    if (this.notificationCache) {
      return this.notificationCache
    }

    const outDir = await mkdtemp(join(tmpdir(), 'codex-web-local-schema-'))
    await this.runGenerateSchemaCommand(outDir)

    const serverNotificationPath = join(outDir, 'ServerNotification.json')
    const raw = await readFile(serverNotificationPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const methods = this.extractMethodsFromServerNotification(parsed)

    this.notificationCache = methods
    return methods
  }
}

type CodexBridgeMiddleware = ((req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>) & {
  dispose: () => void
  subscribeNotifications: (listener: (value: { method: string; params: unknown; atIso: string }) => void) => () => void
}

type SharedBridgeState = {
  version: string
  appServer: AppServerProcess
  terminalManager: ThreadTerminalManager
  methodCatalog: MethodCatalog
  telegramBridge: TelegramThreadBridge
  backendQueueProcessor: BackendQueueProcessor
}

const SHARED_BRIDGE_KEY = '__codexRemoteSharedBridge__'
// 改这个版本号 = 让进程里缓存的共享桥实例被 dispose 并重建。任何**给
// AppServerProcess 增加/重命名公共方法**的改动都必须同步升版本：dev 服务器
// 长驻，模块热更新后 getSharedBridgeState 会复用旧实例，新方法在旧实例上不存在。
// round-76 加 warmUp/threadRead 缓存时就踩过这个坑（dev 日志刷
// 「appServer.warmUp is not a function」并陷入 server restart failed 循环），
// 所以 v2 → v3；round-86 加 readBoundedThreadTurnPage / recordThreadTurnPageBoundary，
// 所以 v3 → v4；round-102 加 isThreadTurnPageUnsupported（翻旧页能力位），
// 所以 v4 → v5；round-116 起 ThreadTerminalManager 改为注入 app-server exec/PTY
// 通道（构造参数变化，复用旧实例会继续用 node-pty），所以 v5 → v6；round-136 给
// ThreadTurnPageCursorChain 加了 hydrate/snapshot、AppServerProcess 新增
// ensureThreadTurnPageCursorChainHydrated / flushThreadTurnPageCursorChain 等
// 私有成员并持有落盘定时器，所以 v6 → v7。
const SHARED_BRIDGE_VERSION = 'experimental-api-v7'

function getSharedBridgeState(): SharedBridgeState {
  const globalScope = globalThis as typeof globalThis & {
    [SHARED_BRIDGE_KEY]?: SharedBridgeState
  }

  const existing = globalScope[SHARED_BRIDGE_KEY]
  if (existing) {
    if (existing.version === SHARED_BRIDGE_VERSION && existing.terminalManager) {
      return existing
    }
    existing.appServer.dispose()
    existing.backendQueueProcessor?.dispose()
    existing.terminalManager?.dispose()
  }

  const appServer = new AppServerProcess()
  const terminalManager = new ThreadTerminalManager({
    // round-116: the integrated terminal runs on the app-server's official
    // exec/PTY channel instead of a locally built native PTY (node-pty), which
    // was an optional dependency whose build failures silently disabled the
    // terminal on affected hosts.
    spawn: createExecPtySpawn({
      rpc: (method, params) => appServer.rpc(method, params),
      onNotification: (listener) => appServer.onNotification(listener),
    }),
  })
  const backendQueueProcessor = new BackendQueueProcessor(appServer)
  const created: SharedBridgeState = {
    version: SHARED_BRIDGE_VERSION,
    appServer,
    terminalManager,
    methodCatalog: new MethodCatalog(),
    backendQueueProcessor,
    telegramBridge: new TelegramThreadBridge(appServer, {
      onChatSeen: (chatId) => {
        void rememberTelegramChatId(chatId).catch(() => {})
      },
    }),
  }
  globalScope[SHARED_BRIDGE_KEY] = created
  return created
}

/**
 * round-77：按当前 free-mode 配置预热 `/codex-api/provider-models` 真正会读的
 * provider 目录。该接口在客户端打开线程的关键路径上（selectThread 会 await
 * refreshModelPreferences），冷缓存时要等一次外部 provider 往返（本机 zen 约
 * 0.4s、冷时 1.4s+），把首次点击线程拖到 ~1.1s。启动时就后台取一次，页面
 * 加载完时目录已在缓存里。纯 best-effort：失败由首次真实请求正常兜底。
 */
export function warmProviderModelCatalog(): void {
  try {
    const state = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
    if (!state?.enabled) return
    if (state.provider === 'custom' && state.customBaseUrl) {
      void fetchCustomEndpointModelIds(state.customBaseUrl, state.apiKey ?? '').catch(() => {})
      return
    }
    if (state.provider === OPENCODE_ZEN_PROVIDER_ID) {
      void fetchOpenCodeZenModelIds(state.apiKey).catch(() => {})
      return
    }
    refreshFreeModelsInBackground()
  } catch {
    // Warm-up is best-effort; the first real request still resolves normally.
  }
}

// round-138：fileId 图片的**机会性解析**（round-137 遗留的「待办 1」）。作为内联载荷
// 净化的**后置一趟**：只有结果里真的出现 `{ type:'image', fileId }` 才会发一次
// thread/attachment/list（无 fileId ⇒ 零 RPC）；命中可渲染内容就把 block 重写成
// `{ type:'image', url }`。识别按**值的形态**（`data:` URL / 绝对图片路径、走既有
// /codex-local-image 代理），**不猜字段名** —— 详见 bridge/threadAttachmentImageSources.ts。
// 放在模块级而不是请求处理闭包里：rpc 管道与 threadRoutes 两个注入点都要用。
function resolveThreadReadFileIdImages(
  appServer: { rpc(method: string, params: unknown): Promise<unknown> },
  result: unknown,
): Promise<unknown> {
  return resolveFileIdImageBlocksInThreadResult(result, async (threadId) => {
    const listed = await appServer.rpc('thread/attachment/list', {
      threadId,
      limit: THREAD_ATTACHMENT_LOOKUP_LIMIT,
    })
    const payload = asRecord(listed)
    return Array.isArray(payload?.data) ? payload.data : null
  })
}

export function createCodexBridgeMiddleware(): CodexBridgeMiddleware {
  const { appServer, terminalManager, methodCatalog, telegramBridge, backendQueueProcessor } = getSharedBridgeState()
  const externalSessionTracker = createExternalSessionTracker()
  externalSessionTracker.start()
  let threadSearchIndex: ThreadSearchIndex | null = null
  let threadSearchIndexPromise: Promise<ThreadSearchIndex> | null = null

  async function getThreadSearchIndex(): Promise<ThreadSearchIndex> {
    if (threadSearchIndex) return threadSearchIndex
    if (!threadSearchIndexPromise) {
      threadSearchIndexPromise = buildThreadSearchIndex(appServer)
        .then((index) => {
          threadSearchIndex = index
          return index
        })
        .finally(() => {
          threadSearchIndexPromise = null
        })
    }
    return threadSearchIndexPromise
  }
  // round-76：先把 app-server spawn + initialize 做完，首屏那 ~20 个启动请求就不必
  // 排在冷启动队尾（实测首屏 thread/list 934ms 冷 / 63ms 热）。失败不影响正常流程。
  void appServer.warmUp()
  // round-77：预热 provider 目录（见 warmProviderModelCatalog），让首次点击线程
  // 不必排在一次外部 provider 网络往返后面。
  warmProviderModelCatalog()
  void initializeSkillsSyncOnStartup(appServer)
  void readTelegramBridgeConfig()
    .then((config) => {
      if (!config.botToken) return
      telegramBridge.configureToken(config.botToken)
      telegramBridge.configureAllowedUserIds(config.allowedUserIds)
      telegramBridge.start()
    })
    .catch(() => {})

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const requestStartNs = process.hrtime.bigint()
    const rawUrl = req.url ?? ''
    const parsedRequestUrl = rawUrl ? new URL(rawUrl, 'http://localhost') : null
    const requestPath = parsedRequestUrl?.pathname ?? ''
    const requestMethod = req.method ?? 'UNKNOWN'
    const rawContentLength = Array.isArray(req.headers['content-length'])
      ? req.headers['content-length'][0]
      : req.headers['content-length']
    const parsedContentLength = rawContentLength ? Number.parseInt(rawContentLength, 10) : NaN
    let requestBodyBytes: number | null = Number.isFinite(parsedContentLength) && parsedContentLength >= 0
      ? parsedContentLength
      : null
    let responseBodyBytes = 0
    let rpcMethod: string | null = null
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalWrite(chunk as never, encoding as never, cb as never)
    }) as typeof res.write
    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
      const resolvedEncoding = typeof encoding === 'string' ? encoding as BufferEncoding : undefined
      responseBodyBytes += getChunkByteLength(chunk, resolvedEncoding)
      return originalEnd(chunk as never, encoding as never, cb as never)
    }) as typeof res.end
    let didLog = false
    const logApiRequestDuration = () => {
      if (!API_PERF_LOGGING_ENABLED || didLog || !requestPath.startsWith('/codex-api/')) return
      const durationMs = Number((process.hrtime.bigint() - requestStartNs) / 1_000_000n)
      const requestBytes = requestBodyBytes ?? 0
      const bodyMbValue = (requestBytes + responseBodyBytes) / MB_DIVISOR
      const shouldLog = durationMs > API_PERF_MS_THRESHOLD || bodyMbValue > API_PERF_BODY_MB_THRESHOLD
      if (!shouldLog) return
      didLog = true
      const rpcPart = rpcMethod ? `, rpcMethod=${rpcMethod}` : ''
      console.info(`[codex-api-perf] ${requestMethod} ${requestPath} -> ${res.statusCode} (${durationMs}ms, bodyMB=${bodyMbValue.toFixed(1)}${rpcPart})`)
    }
    res.once('finish', logApiRequestDuration)
    res.once('close', logApiRequestDuration)

    try {
      if (!req.url) {
        next()
        return
      }

      const url = new URL(req.url, 'http://localhost')
      if (!url.pathname.startsWith('/codex-api/')) {
        next()
        return
      }

      // round-122：遗留 `custom` 兼容占位 provider 的 base_url 指到这里
      // （freeMode.getProviderCompatibilityConfigArgs）。它只用于**读取**旧 rollout；
      // 在这类线程里发送没有真实端点可去，于是明确回一个 4xx——旧的哨兵值
      // 127.0.0.1:9 必然连接失败，CLI 会陷入 `Reconnecting... waiting for network`
      // 无限重试（真实 codex exec 实测 25s 仍不退出），而 4xx 在 ~5s 内带着这条
      // 消息失败，用户至少知道「这里发不出去、去哪改」。
      if (req.method === 'POST' && url.pathname === `${LEGACY_CUSTOM_COMPAT_PATH}/responses`) {
        setJson(res, 400, {
          error: {
            type: 'invalid_request_error',
            message: 'This thread uses a legacy compatibility provider that has no endpoint. Start a new thread, or define [model_providers.custom] in your config.toml to send from here.',
          },
        })
        return
      }

      if (url.pathname === '/codex-api/zen-proxy/v1/responses' && req.method === 'POST') {
        if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
          setJson(res, 403, { error: 'Zen proxy is only available from localhost' })
          return
        }
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'responses'
        try {
          const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
          bearerToken = state?.apiKey ?? ''
          if (state) {
            wireApi = state.wireApi === 'responses' ? 'responses' : 'chat'
          }
        } catch { /* use empty */ }
        handleZenProxyRequest(req, res, bearerToken, wireApi)
        return
      }

      if (url.pathname === '/codex-api/openrouter-proxy/v1/responses' && req.method === 'POST') {
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'responses'
        try {
          const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
          bearerToken = state?.apiKey ?? ''
          wireApi = state?.wireApi === 'chat' ? 'chat' : 'responses'
        } catch { /* use empty */ }
        handleOpenRouterProxyRequest(req, res, bearerToken, wireApi)
        return
      }

      if (url.pathname === '/codex-api/custom-proxy/v1/responses' && req.method === 'POST') {
        const statePath = join(getCodexHomeDir(), FREE_MODE_STATE_FILE)
        let bearerToken = ''
        let wireApi: 'responses' | 'chat' = 'responses'
        let baseUrl = ''
        try {
          const state = ensureDefaultFreeModeStateForMissingAuthSync(statePath)
          bearerToken = state?.apiKey ?? ''
          wireApi = state?.wireApi === 'chat' ? 'chat' : 'responses'
          baseUrl = state?.customBaseUrl ?? ''
        } catch { /* use empty */ }
        handleCustomEndpointProxyRequest(req, res, { baseUrl, bearerToken, wireApi })
        return
      }

      // Free-mode HTTP route family (toggle/status/rotate-key/custom-key/custom-provider), 迁入 bridge/freeModeRoutes.ts.
      if (await handleFreeModeHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        appServer,
        next,
        writeFreeModeStateFile,
        ensureDefaultFreeModeStateForMissingAuthSync,
        hasUsableCodexAuthSync,
      })) return

      if (await handleAccountRoutes(req, res, url, { appServer })) {
        return
      }

      if (await handleSkillsRoutes(req, res, url, { appServer, readJsonBody })) {
        return
      }

      if (await handleReviewRoutes(req, res, url, { readJsonBody })) {
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal/status') {
        setJson(res, 200, terminalManager.getAvailability())
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal/quick-commands') {
        const cwd = url.searchParams.get('cwd')?.trim() ?? ''
        if (!cwd) {
          setJson(res, 400, { error: 'Missing cwd' })
          return
        }
        try {
          setJson(res, 200, { commands: await listTerminalQuickCommands(cwd) })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to load terminal quick commands') })
        }
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/attach') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const threadId = readNonEmptyString(body?.threadId)
        const cwd = readNonEmptyString(body?.cwd)
        if (!threadId || !cwd) {
          setJson(res, 400, { error: 'Missing threadId or cwd' })
          return
        }
        const session = terminalManager.attach({
          threadId,
          cwd,
          sessionId: readNonEmptyString(body?.sessionId) || undefined,
          cols: typeof body?.cols === 'number' ? body.cols : undefined,
          rows: typeof body?.rows === 'number' ? body.rows : undefined,
          newSession: body?.newSession === true,
        })
        setJson(res, 200, { session })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/input') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        const data = typeof body?.data === 'string' ? body.data : ''
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.write(sessionId, data)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/resize') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.resize(sessionId, body?.cols, body?.rows)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/thread-terminal/close') {
        const availability = terminalManager.getAvailability()
        if (!availability.available) {
          setJson(res, 503, { error: availability.reason || 'Integrated terminal is unavailable on this host' })
          return
        }
        const body = asRecord(await readJsonBody(req))
        const sessionId = readNonEmptyString(body?.sessionId)
        if (!sessionId) {
          setJson(res, 400, { error: 'Missing sessionId' })
          return
        }
        terminalManager.close(sessionId)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-terminal-snapshot') {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return
        }
        setJson(res, 200, { session: terminalManager.getSnapshotForThread(threadId) })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/upload-file') {
        handleFileUpload(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/rpc') {
        const payload = await readJsonBody(req)
        const body = asRecord(payload) as RpcProxyRequest | null
        if (payload !== null && payload !== undefined) {
          requestBodyBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        }
        rpcMethod = body?.method && typeof body.method === 'string' ? body.method : null

	        if (!body || typeof body.method !== 'string' || body.method.length === 0) {
	          setJson(res, 400, { error: 'Invalid body: expected { method, params? }' })
	          return
	        }

	        if (body.method === 'generate-thread-title') {
	          setJson(res, 200, { result: { title: '' } })
	          return
	        }

	        if (body.method === 'account/rateLimits/read' && !(await hasUsableCodexAuth())) {
	          setJson(res, 200, { result: null })
	          return
	        }

        // round-76：thread/read 命中缓存就直接返回，跳过 app-server 调用与整条
        // 响应管道（10 轮裁剪、会话日志命令合并、载荷瘦身）。
        const cacheableThreadReadId = body.method === 'thread/read'
          ? readNonEmptyString(asRecord(body.params)?.threadId)
          : ''
        if (cacheableThreadReadId) {
          const cachedThreadRead = appServer.getCachedThreadReadResult(cacheableThreadReadId, body.params ?? null)
          if (cachedThreadRead !== null) {
            setJson(res, 200, { result: cachedThreadRead })
            return
          }
        }

        let rpcResult: unknown
        try {
          // round-84：打开会话不再让 app-server 全量水合历史再被裁剪。resume 改发
          // {excludeTurns,initialTurnsPage}，桥把返回的那一页提升为 thread.turns 并补
          // threadTurnStartIndex；管道与前端归一化都不需要改。app-server 若忽略
          // initialTurnsPage（旧版本）则回落到原来的请求重放。
          // round-110：thread/read 同样有界化。ThreadReadParams 没有
          // excludeTurns/initialTurnsPage，故走「元数据读 + thread/turns/list 一页」
          // （bridge/threadReadTurnPage.ts）；回落路径与改动前逐字一致。
          rpcResult = body.method === 'thread/resume'
            ? await resumeThreadWithTurnPage({
              rpc: (method, params) => appServer.rpc(method, params),
              sendResume: (params) => callRpcWithArchiveRecovery(appServer, 'thread/resume', params),
              // round-86：把这一页的边界交给上翻路由的游标链，使第一次上翻就能
              // 直接用游标取页，而不必从最新处逐页走。
              onTurnPageBoundary: (threadId, oldestTurnId, olderCursor) => {
                appServer.recordThreadTurnPageBoundary(threadId, oldestTurnId, olderCursor)
              },
            }, body.params ?? null)
            : body.method === 'thread/read'
              ? await readThreadWithTurnPage({
                rpc: (method, params) => appServer.rpc(method, params),
                sendRead: (params) => callRpcWithArchiveRecovery(appServer, 'thread/read', params),
                // round-132：thread/read 的有界页也把它的 nextCursor 交给游标链。
                // 此前唯一种子是 resume 的 initialTurnsPage.nextCursor，于是经
                // thread/read 打开的线程链为空 —— 首次上翻必未命中并回落全量读
                // （同窗口同锚点实测 7202ms vs 命中链的 969ms）。多播一个边界
                // 只可能减少回落：路由在拿不到游标时才回落。
                onTurnPageBoundary: (threadId, oldestTurnId, olderCursor) => {
                  appServer.recordThreadTurnPageBoundary(threadId, oldestTurnId, olderCursor)
                },
              }, body.params ?? null)
              : await callRpcWithArchiveRecovery(appServer, body.method, body.params ?? null)
        } catch (error) {
	          if (body.method === 'account/rateLimits/read' && isUnauthenticatedRateLimitError(error)) {
	            setJson(res, 200, { result: null })
	            return
	          }
		          if (body.method === 'thread/read' && isEmptyThreadReadError(error)) {
		            const params = asRecord(body.params)
		            const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
		            const snapshot = threadId ? appServer.getLastThreadReadSnapshot(threadId) : null
		            if (snapshot) {
		              setJson(res, 200, { result: snapshot })
		              return
		            }
		          }
          // round-135：未 materialize 的线程连 thread/turns/list 都不支持 ——
          // app-server 对 thread/read {includeTurns:true} 与 thread/resume 都答
          // `list_turns is not supported yet`（0.160.1/0.161.0 实测），两条兜底
          // 谓词都不匹配 ⇒ 桥直接 throw、客户端吃到一个 502。它与
          // materialization-pending 是同一处「线程存在但没有可渲染内容」，回同一种
          // 诚实载荷（buildPendingMaterializationThreadReadResult，不带 status）。
          if (
            (body.method === 'thread/read' && isThreadMaterializationPendingError(error))
            || ((body.method === 'thread/read' || body.method === 'thread/resume') && isThreadTurnsNotListableError(error))
          ) {
            const params = asRecord(body.params)
            const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
            if (threadId) {
              // round-134：兜底不再写 status:{type:'inProgress'}（见
              // buildPendingMaterializationThreadReadResult 的注释）——那一行会让
              // 同一个响应既答「没有轮次」又把前端置成 Thinking，正是 round-132
              // §10.4 第 1 条记录的「空列表 + 浮层」同源通道。
              setJson(res, 200, { result: buildPendingMaterializationThreadReadResult(threadId) })
              return
            }
          }
		          throw error
		        }
        const pipelineResult = await runRpcResponsePipeline({
          appServer,
          externalSessionTracker: {
            getExternalSession: (threadId) => externalSessionTracker.getExternalSession(threadId),
            getUserFacingSubagentThreadIds: () => new Set(externalSessionTracker.getUserFacingSubagentThreadIds()),
          },
          sanitizeThreadTurnsInlinePayloads: async (method: string, result: unknown) => resolveThreadReadFileIdImages(
            appServer,
            await sanitizeThreadTurnsInlinePayloads(method, result),
          ),
          mergeImportedThreadsIntoThreadListResult,
        }, body.method, rpcResult)

        if (cacheableThreadReadId) {
          appServer.cacheThreadReadResult(cacheableThreadReadId, body.params ?? null, pipelineResult)
        }

        setJson(res, 200, { result: pipelineResult })
        return
      }

      // Thread read / SSE route family (non-SSE), 迁入 bridge/threadRoutes.ts.
      if (await handleThreadHttpRequest(req, res, url, {
        setJson,
        appServer,
        externalSessionTracker,
        sanitizeThreadTurnsInlinePayloads: async (method: string, result: unknown) => resolveThreadReadFileIdImages(
          appServer,
          await sanitizeThreadTurnsInlinePayloads(method, result),
        ),
        isThreadMaterializationPendingError,
      })) return

      if (req.method === 'POST' && url.pathname === '/codex-api/thread/rollback-files') {
        try {
          const body = asRecord(await readJsonBody(req))
          const threadId = readNonEmptyString(body?.threadId)
          const turnId = readNonEmptyString(body?.turnId)
          const cwd = readNonEmptyString(body?.cwd)
          const action = readNonEmptyString(body?.action) === 'redo' ? 'redo' : 'undo'
          const scope = readNonEmptyString(body?.scope) === 'single_turn' ? 'single_turn' : 'turn_and_later'
          const patchIds = Array.isArray(body?.patchIds)
            ? new Set(body.patchIds.filter((value): value is string => typeof value === 'string' && value.length > 0))
            : undefined
          const filePaths = Array.isArray(body?.filePaths)
            ? new Set(body.filePaths
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
                .map((value) => (isAbsolute(value) ? value : join(cwd, value))))
            : undefined
          if (!threadId || !turnId || !cwd) {
            setJson(res, 400, { error: 'Missing threadId, turnId, or cwd' })
            return
          }

          // round-113：原来这里发全量 `thread/read {includeTurns:true}`，只为拿 session
          // log 路径和「目标轮及其后」的轮次 id —— 水合出来的轮次没有别的用途。两者都
          // 能廉价取得（元数据读 + `notLoaded` id 链），任何一半不可信才回落到全量读
          // （等价对照见 readRollbackTurnContext 头部）。
          const context = await readRollbackTurnContext(appServer, threadId)
          let sessionPath = ''
          let turnIds: string[] = []
          if (context) {
            sessionPath = context.sessionPath
            turnIds = context.turnIds
          } else {
            const threadReadResult = await appServer.rpc('thread/read', { threadId, includeTurns: true })
            const thread = asRecord(asRecord(threadReadResult)?.thread)
            sessionPath = readNonEmptyString(thread?.path)
            const turns = Array.isArray(thread?.turns) ? thread.turns : []
            turnIds = turns.map((turn) => readNonEmptyString(asRecord(turn)?.id) ?? '')
          }

          if (!sessionPath || !isAbsolute(sessionPath)) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No session log available' })
            return
          }

          let foundTurnIndex = -1
          const turnIdsToRevert = new Set<string>()
          for (let i = 0; i < turnIds.length; i++) {
            const id = turnIds[i]
            if (id === turnId) {
              foundTurnIndex = i
            }
            if (foundTurnIndex >= 0 && id) {
              turnIdsToRevert.add(id)
              if (scope === 'single_turn') break
            }
          }

          if (turnIdsToRevert.size === 0) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No turns to revert' })
            return
          }

          let sessionLogRaw: string
          try {
            sessionLogRaw = await readFile(sessionPath, 'utf8')
          } catch {
            setJson(res, 200, { reverted: 0, errors: ['Could not read session log'], message: 'Session log unreadable' })
            return
          }

          const turnInfos = collectFileChangesForTurns(sessionLogRaw, turnIdsToRevert, cwd)
          if (turnInfos.size === 0) {
            setJson(res, 200, { changed: 0, errors: [], message: action === 'redo' ? 'No file changes to redo' : 'No file changes to revert' })
            return
          }

          if (action === 'redo') {
            const result = await applyTurnFileChanges(cwd, turnInfos, patchIds, filePaths)
            setJson(res, 200, { ...result, changed: result.applied, message: `Reapplied ${result.applied} file change(s)` })
            return
          }

          const result = await revertTurnFileChanges(cwd, turnInfos, patchIds, filePaths)
          setJson(res, 200, { ...result, changed: result.reverted, message: `Reverted ${result.reverted} file change(s)` })
        } catch (error) {
          setJson(res, 500, { error: getErrorMessage(error, 'Failed to revert file changes') })
        }
        return
      }

      // Composio HTTP route family (status/connectors/connector/link/login/install), 迁入 bridge/composioRoutes.ts.
      if (await handleComposioHttpRequest(req, res, url, { setJson, readJsonBody })) return

      // ChatGPT upstream proxy route family (transcribe/connector-logo), 迁入 bridge/chatgptUpstreamRoutes.ts.
      if (await handleChatgptUpstreamHttpRequest(req, res, url, {
        setJson,
        readBody: readRawBody,
        getCodexAuthPath,
      })) return

      if (req.method === 'POST' && url.pathname === '/codex-api/server-requests/respond') {
        const payload = await readJsonBody(req)
        await appServer.respondToServerRequest(payload)
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/server-requests/pending') {
        setJson(res, 200, { data: appServer.listPendingServerRequests() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/methods') {
        const methods = await methodCatalog.listMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/meta/notifications') {
        const methods = await methodCatalog.listNotificationMethods()
        setJson(res, 200, { data: methods })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/provider-models') {
        try {
          const requestedProvider = url.searchParams.get('provider')?.trim() ?? ''
          if (requestedProvider) {
            // The frontend normalizes provider ids to dash form (custom_endpoint
            // -> custom-endpoint); match both spellings when resolving free-mode
            // providers so the model picker gets the full list (round-41).
            const normalizedRequestedProvider = requestedProvider.replace(/_/g, '-')
            const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
            if (fmState?.enabled && normalizedRequestedProvider === CUSTOM_RUNTIME_PROVIDER_ID.replace(/_/g, '-') && fmState.provider === 'custom' && fmState.customBaseUrl) {
              // The provider catalog resolves custom_endpoint against the local
              // custom-proxy base URL, which has no /models route, so resolve the
              // requested provider against the real endpoint when free-mode custom
              // is active (round-41).
              setJson(res, 200, {
                data: await fetchCustomEndpointModelIds(fmState.customBaseUrl, fmState.apiKey ?? ''),
                exclusive: true,
                source: 'custom',
              })
              return
            }
            if (fmState?.enabled && normalizedRequestedProvider === OPENCODE_ZEN_RUNTIME_PROVIDER_ID.replace(/_/g, '-') && fmState.provider === 'opencode-zen') {
              setJson(res, 200, {
                data: filterOpenCodeZenModelsForAuthState(
                  sortOpenCodeZenModelIds(await fetchOpenCodeZenModelIds(fmState.apiKey)),
                  fmState.apiKey,
                ),
                exclusive: true,
                source: 'opencode-zen',
              })
              return
            }
            if (fmState?.enabled && normalizedRequestedProvider === FREE_MODE_RUNTIME_PROVIDER_ID.replace(/_/g, '-') && fmState.provider === 'openrouter') {
              setJson(res, 200, { data: await getFreeModels(), exclusive: true, source: 'openrouter' })
              return
            }
            setJson(res, 200, {
              ...(await readProviderModelIdsForProvider(appServer, requestedProvider)),
              exclusive: true,
            })
            return
          }
          const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
          if (fmState?.enabled) {
            if (fmState.provider === 'opencode-zen') {
              try {
                const modelIds = filterOpenCodeZenModelsForAuthState(
                  sortOpenCodeZenModelIds(await fetchOpenCodeZenModelIds(fmState.apiKey)),
                  fmState.apiKey,
                )
                if (modelIds.length > 0) {
                  setJson(res, 200, { data: modelIds, exclusive: true, source: 'opencode-zen' })
                  return
                }
              } catch {
                // OpenCode Zen model fetch failed
              }
              // round-123：与 bridge/models.ts、bridge/freeModeRoutes.ts 三处同步。
              setJson(res, 200, { data: ['big-pickle', 'mimo-v2.6-flash-free', 'space-bunny-free', 'ling-3.1-flash-free', 'nemotron-3-ultra-free'], exclusive: true, source: 'opencode-zen' })
              return
            }
            if (fmState.provider === 'custom' && fmState.customBaseUrl) {
              const ids = await fetchCustomEndpointModelIds(fmState.customBaseUrl, fmState.apiKey ?? '')
              const currentModel = fmState.model?.trim() ?? ''
              const orderedIds = currentModel && ids.includes(currentModel)
                ? [currentModel, ...ids.filter((id) => id !== currentModel)]
                : ids
              setJson(res, 200, { data: orderedIds, exclusive: true, source: 'custom' })
              return
            }
            const freeModels = await getFreeModels()
            setJson(res, 200, { data: freeModels, exclusive: true })
            return
          }
        } catch {
          // No free-mode state — proceed normally
        }
        const data = await readProviderBackedModelIds(appServer)
        setJson(res, 200, data)
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/workspace-roots-state') {
        const state = await readWorkspaceRootsState()
        setJson(res, 200, { data: state })
        return
      }

      if (req.method === 'GET' && url.pathname === '/codex-api/thread-queue-state') {
        const state = await readThreadQueueState()
        setJson(res, 200, { data: state })
        return
      }

      // Git / worktree route family (分支/worktree/reset 等), 迁入 bridge/routes.ts.
      if (await handleGitWorktreeHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        persistWorkspaceRoot,
        rollbackCreatedWorktree,
      })) return

      // File / project HTTP route family, 迁入 bridge/projectRoutes.ts.
      if (await handleProjectHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        readRawBody,
        persistWorkspaceRoot,
        collectProjectChatZipEntries,
        importProjectZip,
      })) return

      if (req.method === 'PUT' && url.pathname === '/codex-api/workspace-roots-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await updateWorkspaceRootsState((existingState) => ({
          order: normalizeStringArray(record.order),
          labels: normalizeStringRecord(record.labels),
          active: normalizeStringArray(record.active),
          projectOrder: Array.isArray(record.projectOrder)
            ? normalizeStringArray(record.projectOrder)
            : existingState.projectOrder,
          remoteProjects: existingState.remoteProjects,
        }))
        setJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'PUT' && url.pathname === '/codex-api/thread-queue-state') {
        const payload = await readJsonBody(req)
        const record = asRecord(payload)
        if (!record) {
          setJson(res, 400, { error: 'Invalid body: expected object' })
          return
        }
        await writeThreadQueueState(normalizeThreadQueueState(record))
        void backendQueueProcessor.scheduleAllQueuedThreads()
        setJson(res, 200, { ok: true })
        return
      }

      // Thread search / title / pins / reasoning / first-launch-plugins-card route
      // family, 迁入 bridge/threadPreferencesRoutes.ts.
      if (await handleThreadPreferencesHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        appServer: {
          rpc: appServer.rpc.bind(appServer),
        },
        getThreadSearchIndex,
      })) return

      // Heartbeat / cron automation HTTP route family, 迁入 bridge/automationsRoutes.ts.
      if (await handleAutomationsHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        appendThreadQueuedMessage,
        scheduleThreadQueueDrain: backendQueueProcessor.scheduleThreadQueueDrain.bind(backendQueueProcessor),
      })) return

      // Telegram bridge route family, 迁入 bridge/telegramRoutes.ts.
      if (await handleTelegramHttpRequest(req, res, url, {
        setJson,
        readJsonBody,
        telegramBridge,
      })) return

      if (req.method === 'GET' && url.pathname === '/codex-api/approval-policy') {
        setJson(res, 200, { data: { policy: await resolveEffectiveApprovalPolicy() } })
        return
      }

      if (req.method === 'POST' && url.pathname === '/codex-api/approval-policy') {
        const payload = asRecord(await readJsonBody(req))
        const rawPolicy = typeof payload?.policy === 'string' ? payload.policy.trim() : ''
        const policy = parseApprovalPolicy(rawPolicy)
        if (!policy) {
          setJson(res, 400, { error: 'Invalid approval policy. Expected one of: untrusted, on-failure, on-request, never.' })
          return
        }
        await writeApprovalPolicyToConfigFile(policy)
        setJson(res, 200, { ok: true, data: { policy } })
        return
      }

      // /codex-api/events SSE route, 迁入 bridge/eventsRoutes.ts.
      if (await handleEventsHttpRequest(req, res, {
        subscribeNotifications: middleware.subscribeNotifications.bind(middleware),
      })) return

      next()
    } catch (error) {
      const message = getErrorMessage(error, 'Unknown bridge error')
      setJson(res, 502, { error: message })
    }
  }

  middleware.dispose = () => {
    threadSearchIndex = null
    telegramBridge.stop()
    terminalManager.dispose()
    backendQueueProcessor.dispose()
    externalSessionTracker.stop()
    appServer.dispose()
  }
  middleware.subscribeNotifications = (
    listener: (value: { method: string; params: unknown; atIso: string }) => void,
  ) => {
    const unsubscribeAppServer = appServer.onNotification((notification: { method: string; params: unknown }) => {
      // round-116: `command/exec/outputDelta` frames belong to the integrated
      // terminal's exec channel. They are consumed by bridge/execPtyChannel.ts
      // and re-emitted as `terminal-data`; letting the raw base64 frames through
      // would leak terminal bytes into the UI notification stream.
      if (notification.method === 'command/exec/outputDelta') return
      listener({
        ...notification,
        atIso: new Date().toISOString(),
      })
    })
    const unsubscribeTerminal = terminalManager.subscribe((notification) => {
      listener({
        ...notification,
        atIso: new Date().toISOString(),
      })
    })
    const unsubscribeExternalSession = externalSessionTracker.subscribe((event) => {
      if (event.params.threadId) {
        appServer.invalidateLiveStateCache(event.params.threadId)
      }
      listener({
        method: event.method,
        params: event.params,
        atIso: event.atIso,
      })
    })
    return () => {
      unsubscribeAppServer()
      unsubscribeTerminal()
      unsubscribeExternalSession()
    }
  }

  return middleware
}

