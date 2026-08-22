import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, mkdir, stat, cp, lstat, readlink, symlink, realpath, utimes } from 'node:fs/promises'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'
import { handleAccountRoutes } from './accountRoutes.js'
import { buildAppServerArgs, parseApprovalPolicy, type CodexApprovalPolicy } from './appServerRuntimeConfig.js'
import { callRpcWithRateLimitDecodeRecovery } from './rateLimitDecodeRecovery.js'
import { handleReviewRoutes } from './reviewGit.js'
import { handleSkillsRoutes, initializeSkillsSyncOnStartup } from './skillsRoutes.js'
import { TelegramThreadBridge } from './telegramThreadBridge.js'
import { createExternalSessionTracker } from './externalSessionTracker.js'
import { listWorkspaceFiles } from './localBrowseUi.js'
import {
  FREE_MODE_DEFAULT_MODEL,
  getFreeModels,
  FREE_MODE_STATE_FILE,
  FREE_MODE_RUNTIME_PROVIDER_ID,
  OPENCODE_ZEN_DEFAULT_MODEL,
  OPENCODE_ZEN_RUNTIME_PROVIDER_ID,
  CUSTOM_RUNTIME_PROVIDER_ID,
  createDefaultOpenCodeZenFreeModeState,
  filterOpenCodeZenModelsForAuthState,
  getFreeModeConfigArgs,
  getFreeModeEnvVars,
  getProviderCompatibilityConfigArgs,
  shouldCreateDefaultFreeModeStateForMissingAuth,
  shouldSuppressCommunityFreeModeForCodexAuth,
  type FreeModeState,
} from './freeMode.js'
import { handleOpenRouterProxyRequest } from './openRouterProxy.js'
import { handleZenProxyRequest } from './zenProxy.js'
import { handleCustomEndpointProxyRequest } from './customEndpointProxy.js'
import { ThreadTerminalManager } from './terminalManager.js'
import { getSpawnInvocation } from '../utils/commandInvocation.js'
import {
  resolveCodexCommand,
  resolveRipgrepCommand,
} from '../commandResolution.js'
import { isReasoningEffort, type CollaborationModeKind, type ReasoningEffort } from '../types/codex.js'
import {
  asRecord,
  getCodexHomeDir,
  getErrorMessage,
  getCodexGlobalStatePath,
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
import {
  handleTelegramHttpRequest,
  readTelegramBridgeConfig,
  writeTelegramBridgeConfig,
} from './bridge/telegramRoutes.js'
import {
  handleThreadPreferencesHttpRequest,
  readMergedThreadTitleCache,
  readThreadTitleCache,
  updateThreadTitleCache,
  writeThreadTitleCache,
} from './bridge/threadPreferencesRoutes.js'
import { handleEventsHttpRequest } from './bridge/eventsRoutes.js'
import {
  canonicalizeThreadListResponseForRead,
  persistWorkspaceRoot,
  readWorkspaceRootsState,
  rollbackCreatedWorktree,
  updateWorkspaceRootsState,
} from './bridge/workspaceRoots.js'
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
  parseStoredProjectZip,
  resolveAllowedProjectZipCwd,
  setProjectZipHeaders,
  streamProjectZip,
  toProjectZipFileName,
  type ProjectZipVirtualEntry,
} from './bridge/zip.js'
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
  mergeSessionSkillInputsIntoTurns,
  pathSetMatchesChange,
  revertTurnFileChanges,
} from './bridge/session.js'
// Provider 模型发现切片（F 批）：纯磁盘/网络工具迁入 bridge/models.ts，
// 供 middleware 复用；normalizeProviderModelsData / normalizeCustomEndpointBaseUrl
// 此前是公共导出（有测试），保持从本模块导入。
import {
  buildProviderModelsUrl,
  fetchCustomEndpointDefaultModel,
  fetchCustomEndpointModelIds,
  fetchOpenCodeZenModelIds,
  isTimeoutError,
  logProviderModelDiscoveryWarning,
  normalizeCustomEndpointBaseUrl,
  normalizeHeaderValue,
  normalizeProviderModelsData,
  sortOpenCodeZenModelIds,
  PROVIDER_MODELS_FETCH_TIMEOUT_MS,
  type ProviderModelsResponse,
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

type RpcExecutor = {
  rpc: (method: string, params: unknown) => Promise<unknown>
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

type ChatgptAuthTokensRefreshParams = {
  reason?: string
  previousAccountId?: string | null
}

type ChatgptAuthTokensRefreshResponse = {
  accessToken: string
  chatgptAccountId: string
  chatgptPlanType: string | null
}

type ThreadSearchDocument = {
  id: string
  title: string
  preview: string
  messageText: string
  searchableText: string
}

type ThreadSearchIndex = {
  docsById: Map<string, ThreadSearchDocument>
}

const THREAD_TURN_PAGE_READ_CACHE_TTL_MS = 30_000
const THREAD_METHODS_WITH_TURNS = new Set(['thread/read', 'thread/resume', 'thread/fork', 'thread/rollback'])
const THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT = 100
const API_PERF_LOGGING_ENV_KEY = 'CODEXUI_API_PERF_LOGGING'
const API_PERF_MS_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_MS_THRESHOLD'
const API_PERF_BODY_MB_THRESHOLD_ENV_KEY = 'CODEXUI_API_PERF_BODY_MB_THRESHOLD'
const DEFAULT_API_PERF_MS_THRESHOLD = 300
const DEFAULT_API_PERF_BODY_MB_THRESHOLD = 1
const MB_DIVISOR = 1024 * 1024

function readEnvValueFromFile(filePath: string, key: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8')
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.+)\\s*$`, 'm'))
    if (!match) return null
    const rawValue = match[1]?.trim() ?? ''
    if (!rawValue) return null
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith('\'') && rawValue.endsWith('\''))) {
      return rawValue.slice(1, -1).trim()
    }
    return rawValue
  } catch {
    return null
  }
}

function parseBooleanEnvFlag(value: string | null | undefined): boolean | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

function resolveApiPerfLoggingEnabled(): boolean {
  const explicitValue = parseBooleanEnvFlag(process.env[API_PERF_LOGGING_ENV_KEY])
  if (explicitValue !== null) return explicitValue

  const fromEnvLocal = parseBooleanEnvFlag(readEnvValueFromFile('.env.local', API_PERF_LOGGING_ENV_KEY))
  if (fromEnvLocal !== null) return fromEnvLocal

  const fromEnv = parseBooleanEnvFlag(readEnvValueFromFile('.env', API_PERF_LOGGING_ENV_KEY))
  if (fromEnv !== null) return fromEnv

  return false
}

const API_PERF_LOGGING_ENABLED = resolveApiPerfLoggingEnabled()

function parseNumberEnvFlag(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function resolveNumericEnvConfig(envKey: string, fallback: number): number {
  const fromProcess = parseNumberEnvFlag(process.env[envKey])
  if (fromProcess !== null) return fromProcess

  const fromEnvLocal = parseNumberEnvFlag(readEnvValueFromFile('.env.local', envKey))
  if (fromEnvLocal !== null) return fromEnvLocal

  const fromEnv = parseNumberEnvFlag(readEnvValueFromFile('.env', envKey))
  if (fromEnv !== null) return fromEnv

  return fallback
}

const API_PERF_MS_THRESHOLD = resolveNumericEnvConfig(API_PERF_MS_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_MS_THRESHOLD)
const API_PERF_BODY_MB_THRESHOLD = resolveNumericEnvConfig(API_PERF_BODY_MB_THRESHOLD_ENV_KEY, DEFAULT_API_PERF_BODY_MB_THRESHOLD)

function getChunkByteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding)
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength
  }
  if (ArrayBuffer.isView(chunk)) {
    return chunk.byteLength
  }
  if (chunk instanceof ArrayBuffer) {
    return chunk.byteLength
  }
  return 0
}

function isInlineDataUrl(value: string): boolean {
  return /^data:/iu.test(value.trim())
}

function inferImageMimeTypeFromBytes(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (bytes.length >= 8 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'ftyp') {
    return 'video/mp4'
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm'
  }
  return null
}

function inferImageMimeTypeFromBase64(value: string): string | null {
  const compact = value.trim().replace(/\s+/gu, '')
  if (compact.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return null
  try {
    return inferImageMimeTypeFromBytes(Buffer.from(compact.slice(0, 64), 'base64'))
  } catch {
    return null
  }
}

function normalizeBase64ImageDataUrl(value: string, mimeType: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isInlineDataUrl(trimmed)) {
    return /^data:(image|video)\//iu.test(trimmed) ? trimmed : null
  }
  const compact = trimmed.replace(/\s+/gu, '')
  const inferredMimeType = inferImageMimeTypeFromBase64(compact)
  if (!inferredMimeType) return null
  const normalizedMimeType = mimeType.trim().toLowerCase()
  const finalMimeType = normalizedMimeType.startsWith('image/') && normalizedMimeType !== 'image/*'
    ? normalizedMimeType
    : inferredMimeType
  return `data:${finalMimeType};base64,${compact}`
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/svg+xml') return '.svg'
  if (normalized === 'application/pdf') return '.pdf'
  if (normalized === 'video/mp4') return '.mp4'
  if (normalized === 'video/webm') return '.webm'
  if (normalized === 'video/quicktime') return '.mov'
  if (normalized === 'video/x-matroska') return '.mkv'
  if (normalized === 'video/ogg') return '.ogv'
  if (normalized === 'video/mpeg') return '.mpeg'
  if (normalized === 'video/x-msvideo') return '.avi'
  return ''
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAttachmentLinkTarget(block: Record<string, unknown>, fallback: string): string {
  const candidate = asNonEmptyString(block.path)
    ?? asNonEmptyString(block.file_path)
    ?? asNonEmptyString(block.filename)
    ?? asNonEmptyString(block.file_id)
    ?? fallback
  if (candidate.startsWith('file://')) return candidate
  if (candidate.startsWith('/')) return `file://${candidate}`
  return `attachment://${candidate}`
}

async function persistInlineDataUrlToLocalFile(dataUrl: string, baseName: string): Promise<string | null> {
  const trimmed = dataUrl.trim()
  const match = /^data:([^;,]*)(;base64)?,(.*)$/isu.exec(trimmed)
  if (!match) return null
  const mimeType = (match[1] ?? '').trim().toLowerCase()
  const encodedPayload = match[3] ?? ''
  let bytes: Buffer
  try {
    bytes = match[2]
      ? Buffer.from(encodedPayload, 'base64')
      : Buffer.from(decodeURIComponent(encodedPayload), 'utf8')
  } catch {
    return null
  }
  if (bytes.length === 0) return null

  const hash = createHash('sha1').update(bytes).digest('hex')
  const ext = extensionFromMimeType(mimeType)
  const mediaDir = join(tmpdir(), 'codex-web-inline-media')
  await mkdir(mediaDir, { recursive: true })
  const fileName = `${baseName}-${hash}${ext}`
  const filePath = join(mediaDir, fileName)
  try {
    await stat(filePath)
  } catch {
    await writeFile(filePath, bytes)
  }
  return filePath
}

function toLocalImageProxyUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

const INLINE_IMAGE_FIELD_NAMES = new Set([
  'b64_json',
  'image',
  'image_url',
  'images',
  'result',
  'url',
])

type InlinePayloadSanitizeContext = {
  turnId: string
  itemId: string
  blockIndex: number
  fieldName?: string
}

function isPotentialInlineImageField(fieldName: string | undefined): boolean {
  return typeof fieldName === 'string' && INLINE_IMAGE_FIELD_NAMES.has(fieldName)
}

async function sanitizeInlineImageString(
  value: string,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: string; changed: boolean }> {
  if (!isPotentialInlineImageField(context.fieldName)) {
    return { value, changed: false }
  }

  const dataUrl = normalizeBase64ImageDataUrl(value, 'image/*')
  if (!dataUrl) return { value, changed: false }

  const localUrl = await persistInlineDataUrlToLocalFile(
    dataUrl,
    `inline-image-${context.turnId}-${context.itemId}-${context.fieldName}-${String(context.blockIndex)}`,
  )
  if (!localUrl) return { value, changed: false }

  return { value: toLocalImageProxyUrl(localUrl), changed: true }
}

async function sanitizeInlineUserContentBlock(
  block: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<unknown> {
  const record = asRecord(block)
  if (!record) return block

  const type = asNonEmptyString(record.type) ?? ''
  const imageUrl = asNonEmptyString(record.url) ?? asNonEmptyString(record.image_url)
  if (imageUrl && isInlineDataUrl(imageUrl)) {
    const localUrl = await persistInlineDataUrlToLocalFile(imageUrl, `inline-image-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      const nextRecord = { ...record }
      if (typeof record.url === 'string') {
        nextRecord.url = toLocalImageProxyUrl(localUrl)
      }
      if (typeof record.image_url === 'string') {
        nextRecord.image_url = toLocalImageProxyUrl(localUrl)
      }
      return {
        ...nextRecord,
        type: 'image',
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-image/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `Image attachment: ${target}`,
    }
  }

  if (type === 'imageGeneration' || type === 'image_generation') {
    const rawResult = asNonEmptyString(record.result)
      ?? asNonEmptyString(record.b64_json)
      ?? asNonEmptyString(record.image)
    const mimeType = asNonEmptyString(record.mime_type)
      ?? asNonEmptyString(record.mimeType)
      ?? 'image/png'
    const dataUrl = rawResult ? normalizeBase64ImageDataUrl(rawResult, mimeType) : null
    if (dataUrl) {
      const localUrl = await persistInlineDataUrlToLocalFile(dataUrl, `generated-image-${context.turnId}-${context.itemId}`)
      if (localUrl) {
        return {
          ...record,
          type: 'imageView',
          path: localUrl,
        }
      }
    }
  }

  const inlineFileData = asNonEmptyString(record.file_data)
    ?? asNonEmptyString(record.data)
    ?? asNonEmptyString(record.base64)
  if ((type.includes('file') || type === 'input_file' || type === 'file') && inlineFileData) {
    const mimeType = asNonEmptyString(record.mime_type) ?? 'application/octet-stream'
    const fileDataUrl = `data:${mimeType};base64,${inlineFileData}`
    const localUrl = await persistInlineDataUrlToLocalFile(fileDataUrl, `inline-file-${context.turnId}-${context.itemId}-${String(context.blockIndex)}`)
    if (localUrl) {
      return {
        type: 'text',
        text: `File attachment: ${localUrl}`,
      }
    }
    const target = toAttachmentLinkTarget(record, `inline-file/${context.turnId}/${context.itemId}/${String(context.blockIndex)}`)
    return {
      type: 'text',
      text: `File attachment: ${target}`,
    }
  }

  return block
}

async function sanitizeInlinePayloadDeep(
  value: unknown,
  context: InlinePayloadSanitizeContext,
): Promise<{ value: unknown; changed: boolean }> {
  const maybeBlock = await sanitizeInlineUserContentBlock(value, context)
  if (maybeBlock !== value) {
    return { value: maybeBlock, changed: true }
  }

  if (typeof value === 'string') {
    return sanitizeInlineImageString(value, context)
  }

  if (Array.isArray(value)) {
    let changed = false
    const nextArray: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const nested = await sanitizeInlinePayloadDeep(value[index], {
        turnId: context.turnId,
        itemId: context.itemId,
        blockIndex: index,
        fieldName: context.fieldName,
      })
      if (nested.changed) changed = true
      nextArray.push(nested.value)
    }
    return changed ? { value: nextArray, changed: true } : { value, changed: false }
  }

  const record = asRecord(value)
  if (!record) return { value, changed: false }

  let changed = false
  const nextRecord: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(record)) {
    const nested = await sanitizeInlinePayloadDeep(nestedValue, {
      turnId: context.turnId,
      itemId: context.itemId,
      blockIndex: context.blockIndex,
      fieldName: key,
    })
    if (nested.changed) changed = true
    nextRecord[key] = nested.value
  }

  return changed ? { value: nextRecord, changed: true } : { value, changed: false }
}

export async function sanitizeThreadTurnsInlinePayloads(method: string, result: unknown): Promise<unknown> {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length === 0) return result

  let changed = false
  const nextTurns: unknown[] = []
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex]
    const turnRecord = asRecord(turn)
    const turnId = asNonEmptyString(turnRecord?.id) ?? 'turn'
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !items) {
      nextTurns.push(turn)
      continue
    }

    let itemChanged = false
    const nextItems: unknown[] = []
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]
      const itemRecord = asRecord(item)
      const itemId = asNonEmptyString(itemRecord?.id) ?? 'item'
      if (!itemRecord) {
        nextItems.push(item)
        continue
      }
      const sanitizedItem = await sanitizeInlinePayloadDeep(item, {
        turnId,
        itemId,
        blockIndex: itemIndex + turnIndex,
      })
      if (!sanitizedItem.changed) {
        nextItems.push(item)
        continue
      }
      itemChanged = true
      nextItems.push(sanitizedItem.value)
    }

    if (!itemChanged) {
      nextTurns.push(turn)
      continue
    }
    changed = true
    nextTurns.push({
      ...turnRecord,
      items: nextItems,
    })
  }

  if (!changed) return result
  return {
    ...record,
    thread: {
      ...thread,
      turns: nextTurns,
    },
  }
}

export function isUnauthenticatedRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('authentication required') && message.includes('rate limits')
}

export function isEmptyThreadReadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('failed to read thread') && message.includes('rollout') && message.includes('is empty')
}

export function isThreadMaterializationPendingError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not materialized yet') && message.includes('includeturns is unavailable before first user message')
}

export function isThreadNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('thread not found') || message.includes('no rollout found for thread id')
}

const warnedCodexAuthReadFailures = new Set<string>()

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : null
}

function getCodexAuthReadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : String(error)
}

function warnCodexAuthReadFailure(authPath: string, error: unknown): void {
  const message = getCodexAuthReadErrorMessage(error)
  const warningKey = `${authPath}:${message}`
  if (warnedCodexAuthReadFailures.has(warningKey)) return
  warnedCodexAuthReadFailures.add(warningKey)
  console.warn('[codex-auth] Unable to read Codex auth state', { path: authPath, error: message })
}

export async function hasUsableCodexAuth(): Promise<boolean> {
  const authPath = getCodexAuthPath()
  try {
    const raw = await readFile(authPath, 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    return Boolean(auth.tokens?.access_token?.trim() || auth.tokens?.refresh_token?.trim())
  } catch (error) {
    if (getErrorCode(error) !== 'ENOENT') {
      warnCodexAuthReadFailure(authPath, error)
    }
    return false
  }
}

function setJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}


type ImportedSessionRecord = {
  id: string
  path: string
  cwd: string
  title: string
  createdAtMs: number
  updatedAtMs: number
  model: string
  modelProvider: string
  cliVersion: string
  firstUserMessage: string
}

type ExportedThreadMetadata = {
  title: string
  updatedAtMs: number
}


async function* walkFiles(root: string, current = root): AsyncGenerator<string> {
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const absolutePath = join(current, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(root, absolutePath)
    } else if (entry.isFile()) {
      yield absolutePath
    }
  }
}

function readSessionMetaCwd(raw: string): string {
  const firstLine = raw.split(/\r?\n/u, 1)[0]?.trim()
  if (!firstLine) return ''
  try {
    const parsed = JSON.parse(firstLine) as unknown
    const record = asRecord(parsed)
    const payload = asRecord(record?.payload)
    return readNonEmptyString(payload?.cwd)
  } catch {
    return ''
  }
}

function readSessionMetaId(raw: string): string {
  const firstLine = raw.split(/\r?\n/u, 1)[0]?.trim()
  if (!firstLine) return ''
  try {
    const parsed = JSON.parse(firstLine) as unknown
    const record = asRecord(parsed)
    const payload = asRecord(record?.payload)
    return readNonEmptyString(payload?.id)
  } catch {
    return ''
  }
}

function getCurrentImportedSessionModelDefaults(): { model: string; modelProvider: string } | null {
  const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
  if (!fmState?.enabled) return null
  if (fmState.provider === 'opencode-zen') {
    return {
      model: fmState.model?.trim() || OPENCODE_ZEN_DEFAULT_MODEL,
      modelProvider: 'opencode_zen',
    }
  }
  if (fmState.provider === 'custom' && fmState.customBaseUrl?.trim()) {
    return {
      model: fmState.model?.trim() || '',
      modelProvider: 'custom_endpoint',
    }
  }
  if (fmState.apiKey?.trim()) {
    return {
      model: fmState.model?.trim() || FREE_MODE_DEFAULT_MODEL,
      modelProvider: 'openrouter_free',
    }
  }
  return null
}

function rewriteImportedSession(raw: string, importedCwd: string, importedThreadId: string): string {
  const lines: string[] = []
  let hasUserMessageEvent = false
  const modelDefaults = getCurrentImportedSessionModelDefaults()
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as unknown
      const record = asRecord(parsed)
      const payload = asRecord(record?.payload)
      if (record?.type === 'event_msg' && readNonEmptyString(payload?.type) === 'user_message') {
        hasUserMessageEvent = true
      }
      if (payload && typeof payload.cwd === 'string') {
        payload.cwd = importedCwd
      }
      if (record?.type === 'session_meta' && payload) {
        payload.id = importedThreadId
        payload.source = 'cli'
        payload.imported = true
        if (!readNonEmptyString(payload.originator)) {
          payload.originator = 'codex_cli_rs'
        }
        if (modelDefaults) {
          payload.model = modelDefaults.model
          payload.model_provider = modelDefaults.modelProvider
        }
      }
      lines.push(JSON.stringify(parsed))
      if (!hasUserMessageEvent && payload && record?.type === 'response_item' && readNonEmptyString(payload.role) === 'user') {
        const content = Array.isArray(payload.content) ? payload.content : []
        const text = content
          .map((item) => readNonEmptyString(asRecord(item)?.text))
          .find((value) => value.length > 0)
        if (text) {
          lines.push(JSON.stringify({
            timestamp: readNonEmptyString(record.timestamp) || new Date().toISOString(),
            type: 'event_msg',
            payload: { type: 'user_message', message: text, images: [] },
          }))
          hasUserMessageEvent = true
        }
      }
    } catch {
      lines.push(line)
    }
  }
  return `${lines.join('\n')}\n`
}

function readImportedSessionRecord(raw: string, path: string, cwd: string, fallbackId: string, importedTitle = ''): ImportedSessionRecord {
  let id = fallbackId
  let createdAtMs = Date.now()
  let updatedAtMs = 0
  let model = ''
  let modelProvider = 'openai'
  let cliVersion = ''
  let firstUserMessage = ''
  const title = importedTitle.trim()

  for (const line of raw.split(/\r?\n/u)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as unknown
      const record = asRecord(parsed)
      const payload = asRecord(record?.payload)
      const timestamp = readNonEmptyString(record?.timestamp) || readNonEmptyString(payload?.timestamp)
      const timeMs = timestamp ? Date.parse(timestamp) : NaN
      if (Number.isFinite(timeMs)) {
        updatedAtMs = Math.max(updatedAtMs, timeMs)
      }
      if (record?.type === 'session_meta' && payload) {
        id = readNonEmptyString(payload.id) || id
        const metaTime = readNonEmptyString(payload.timestamp)
        const metaMs = metaTime ? Date.parse(metaTime) : NaN
        if (Number.isFinite(metaMs)) createdAtMs = metaMs
        model = readNonEmptyString(payload.model) || model
        modelProvider = readNonEmptyString(payload.model_provider) || modelProvider
        cliVersion = readNonEmptyString(payload.cli_version) || cliVersion
      }
      if (!firstUserMessage && record?.type === 'event_msg' && readNonEmptyString(payload?.type) === 'user_message') {
        firstUserMessage = readNonEmptyString(payload?.message)
      }
      if (!firstUserMessage && record?.type === 'response_item') {
        const role = readNonEmptyString(payload?.role)
        if (role === 'user') {
          const content = Array.isArray(payload?.content) ? payload.content : []
          for (const item of content) {
            const itemRecord = asRecord(item)
            const text = readNonEmptyString(itemRecord?.text)
            if (text) {
              firstUserMessage = text
              break
            }
          }
        }
      }
    } catch {
      continue
    }
  }

  const now = Date.now()
  createdAtMs = Math.min(createdAtMs, now)
  if (updatedAtMs <= 0) updatedAtMs = createdAtMs
  updatedAtMs = Math.min(Math.max(updatedAtMs, createdAtMs), now)
  return { id, path, cwd, title, createdAtMs, updatedAtMs, model, modelProvider, cliVersion, firstUserMessage }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function ensureImportedThreadsStateDbTable(stateDbPath: string): boolean {
  const sql = `
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  source TEXT,
  model TEXT,
  model_provider TEXT,
  cwd TEXT,
  title TEXT,
  sandbox_policy TEXT,
  approval_mode TEXT,
  tokens_used INTEGER,
  has_user_event INTEGER,
  archived INTEGER,
  archived_at INTEGER,
  git_sha TEXT,
  git_branch TEXT,
  git_origin_url TEXT,
  cli_version TEXT,
  first_user_message TEXT,
  created_at_ms INTEGER,
  updated_at_ms INTEGER,
  thread_source TEXT,
  preview TEXT
);`
  const result = spawnSync('sqlite3', [stateDbPath, sql], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.warn('[project-import] failed to initialize state database', result.stderr || result.stdout)
    return false
  }
  return true
}

function buildImportedSessionStateDbValues(session: ImportedSessionRecord): Record<string, string> {
  const title = session.title || session.firstUserMessage || 'Imported chat'
  const createdAt = Math.floor(session.createdAtMs / 1000)
  const updatedAt = Math.floor(session.updatedAtMs / 1000)
  const sandboxPolicy = JSON.stringify({ type: 'workspace-write', network_access: true })
  return {
    id: sqlString(session.id),
    rollout_path: sqlString(session.path),
    created_at: String(createdAt),
    updated_at: String(updatedAt),
    source: "'cli'",
    model: sqlString(session.model),
    model_provider: sqlString(session.modelProvider),
    cwd: sqlString(session.cwd),
    title: sqlString(title),
    sandbox_policy: sqlString(sandboxPolicy),
    approval_mode: "'on-request'",
    tokens_used: '0',
    has_user_event: '1',
    archived: '0',
    archived_at: 'NULL',
    git_sha: 'NULL',
    git_branch: 'NULL',
    git_origin_url: 'NULL',
    cli_version: sqlString(session.cliVersion),
    first_user_message: sqlString(session.firstUserMessage),
    created_at_ms: String(Math.trunc(session.createdAtMs)),
    updated_at_ms: String(Math.trunc(session.updatedAtMs)),
    thread_source: "'user'",
    preview: sqlString(title),
  }
}

function registerImportedSessionsInStateDb(sessions: ImportedSessionRecord[]): void {
  if (sessions.length === 0) return
  const stateDbPath = join(getCodexHomeDir(), 'state_5.sqlite')
  if (!ensureImportedThreadsStateDbTable(stateDbPath)) return
  const columnsResult = spawnSync('sqlite3', [stateDbPath, 'PRAGMA table_info(threads);'], { encoding: 'utf8' })
  if (columnsResult.status !== 0) {
    console.warn('[project-import] failed to inspect state database', columnsResult.stderr || columnsResult.stdout)
    return
  }
  const availableColumns = new Set(columnsResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.split('|')[1])
    .filter((value): value is string => Boolean(value)))
  const values = buildImportedSessionStateDbValues(sessions[0])
  const columns = Object.keys(values).filter((column) => availableColumns.has(column))
  const inserts = sessions.map((session) => {
    const sessionValues = buildImportedSessionStateDbValues(session)
    return `INSERT OR REPLACE INTO threads (${columns.join(', ')}) VALUES (${columns.map((column) => sessionValues[column]).join(', ')});`
  })
  const sql = ['BEGIN;', ...inserts, 'COMMIT;'].join('\n')
  const result = spawnSync('sqlite3', [stateDbPath, sql], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.warn('[project-import] failed to register imported sessions in state database', result.stderr || result.stdout)
  }
}

function listImportedThreadsFromStateDb(): Array<Record<string, unknown>> {
  const stateDbPath = join(getCodexHomeDir(), 'state_5.sqlite')
  if (!existsSync(stateDbPath)) return []
  const sql = `
SELECT id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
       cli_version, first_user_message, archived
FROM threads
WHERE archived = 0 AND replace(rollout_path, '\\', '/') LIKE '%/sessions/%' AND id IN (
  SELECT id FROM threads WHERE first_user_message != '' OR title != ''
)
ORDER BY updated_at DESC
LIMIT 200;
`
  const result = spawnSync('sqlite3', ['-json', stateDbPath, sql], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.trim()) return []
  try {
    const rows = JSON.parse(result.stdout) as unknown
    if (!Array.isArray(rows)) return []
    return rows.flatMap((row) => {
      const record = asRecord(row)
      const id = readNonEmptyString(record?.id)
      const path = readNonEmptyString(record?.rollout_path)
      const cwd = readNonEmptyString(record?.cwd)
      if (!id || !path || !cwd) return []
      const title = readNonEmptyString(record?.title) || readNonEmptyString(record?.first_user_message) || 'Imported chat'
      const createdAt = typeof record?.created_at === 'number' ? record.created_at : Math.floor(Date.now() / 1000)
      const updatedAt = typeof record?.updated_at === 'number' ? record.updated_at : createdAt
      return [{
        id,
        preview: title,
        modelProvider: readNonEmptyString(record?.model_provider) || 'openai',
        createdAt,
        updatedAt,
        path,
        cwd,
        cliVersion: readNonEmptyString(record?.cli_version),
        source: 'cli',
        gitInfo: null,
        turns: [],
      }]
    })
  } catch {
    return []
  }
}

function readStateDbThreadExportMetadata(): Map<string, ExportedThreadMetadata> {
  const stateDbPath = join(getCodexHomeDir(), 'state_5.sqlite')
  if (!existsSync(stateDbPath)) return new Map()
  const columnsResult = spawnSync('sqlite3', [stateDbPath, 'PRAGMA table_info(threads);'], { encoding: 'utf8' })
  if (columnsResult.status !== 0) return new Map()
  const availableColumns = new Set(columnsResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.split('|')[1])
    .filter((value): value is string => Boolean(value)))
  if (!availableColumns.has('id')) return new Map()
  const selectColumns = [
    'id',
    availableColumns.has('title') ? 'title' : "'' AS title",
    availableColumns.has('preview') ? 'preview' : "'' AS preview",
    availableColumns.has('updated_at') ? 'updated_at' : '0 AS updated_at',
    availableColumns.has('updated_at_ms') ? 'updated_at_ms' : '0 AS updated_at_ms',
  ]
  const archivedPredicate = availableColumns.has('archived') ? 'WHERE archived = 0' : ''
  const sql = `
SELECT ${selectColumns.join(', ')}
FROM threads
${archivedPredicate};
`
  const result = spawnSync('sqlite3', ['-json', stateDbPath, sql], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.trim()) return new Map()
  try {
    const rows = JSON.parse(result.stdout) as unknown
    if (!Array.isArray(rows)) return new Map()
    const metadata = new Map<string, ExportedThreadMetadata>()
    for (const row of rows) {
      const record = asRecord(row)
      const id = readNonEmptyString(record?.id)
      if (!id) continue
      const title = readNonEmptyString(record?.title) || readNonEmptyString(record?.preview)
      const updatedAtMs =
        typeof record?.updated_at_ms === 'number' && Number.isFinite(record.updated_at_ms)
          ? Math.trunc(record.updated_at_ms)
          : typeof record?.updated_at === 'number' && Number.isFinite(record.updated_at)
            ? Math.trunc(record.updated_at * 1000)
            : 0
      if (!title && updatedAtMs <= 0) continue
      metadata.set(id, { title, updatedAtMs })
    }
    return metadata
  } catch {
    return new Map()
  }
}

function mergeImportedThreadsIntoThreadListResult(result: unknown): unknown {
  const record = asRecord(result)
  const data = Array.isArray(record?.data) ? record.data : null
  if (!record || !data) return result
  const importedById = new Map<string, Record<string, unknown>>()
  for (const thread of listImportedThreadsFromStateDb()) {
    const id = readNonEmptyString(thread.id)
    if (id) importedById.set(id, thread)
  }
  if (importedById.size === 0) return result
  const mergedData: unknown[] = []
  for (const item of data) {
    const id = readNonEmptyString(asRecord(item)?.id)
    const imported = id ? importedById.get(id) : undefined
    if (imported) {
      mergedData.push({ ...asRecord(item), ...imported })
      importedById.delete(id)
    } else {
      mergedData.push(item)
    }
  }
  mergedData.push(...importedById.values())
  return {
    ...record,
    data: mergedData.sort((a, b) => {
      const aUpdated = typeof asRecord(a)?.updatedAt === 'number' ? asRecord(a)?.updatedAt as number : 0
      const bUpdated = typeof asRecord(b)?.updatedAt === 'number' ? asRecord(b)?.updatedAt as number : 0
      return bUpdated - aUpdated
    }),
  }
}

/**
 * Drop thread-list rows whose id is in `threadIdsToExclude` (e.g. subagent
 * sessions, which the app-server materializes with an interactive source and
 * therefore shows in `thread/list`). Returns the input unchanged when nothing
 * is excluded.
 */
export function filterThreadListByIds(result: unknown, threadIdsToExclude: ReadonlySet<string>): unknown {
  const record = asRecord(result)
  const data = Array.isArray(record?.data) ? record.data : null
  if (!record || !data || threadIdsToExclude.size === 0) return result
  const filtered = data.filter((row) => {
    const id = readNonEmptyString(asRecord(row)?.id)
    return !(id.length > 0 && threadIdsToExclude.has(id))
  })
  return filtered.length === data.length ? result : { ...record, data: filtered }
}

async function collectProjectChatZipEntries(projectRoot: string): Promise<ProjectZipVirtualEntry[]> {
  const canonicalProjectRoot = await realpath(projectRoot)
  const codexHome = getCodexHomeDir()
  const threadTitles = await readMergedThreadTitleCache()
  const stateDbThreadMetadata = readStateDbThreadExportMetadata()
  const exportedTitles: Record<string, string> = {}
  const exportedThreads: Record<string, ExportedThreadMetadata> = {}
  const roots = [
    { disk: join(codexHome, 'sessions'), zip: '.codex-project/chats/sessions' },
    { disk: join(codexHome, 'archived_sessions'), zip: '.codex-project/chats/archived_sessions' },
  ]
  const entries: ProjectZipVirtualEntry[] = [{
    path: '.codex-project/manifest.json',
    data: Buffer.from(JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      projectName: basename(canonicalProjectRoot) || 'project',
    }, null, 2)),
    mtime: new Date(),
  }]

  for (const root of roots) {
    for await (const sessionPath of walkFiles(root.disk)) {
      if (extname(sessionPath) !== '.jsonl') continue
      let raw = ''
      try {
        raw = await readFile(sessionPath, 'utf8')
      } catch {
        continue
      }
      const sessionCwd = readSessionMetaCwd(raw)
      if (!sessionCwd) continue
      let canonicalSessionCwd = ''
      try {
        canonicalSessionCwd = await realpath(sessionCwd)
      } catch {
        canonicalSessionCwd = isAbsolute(sessionCwd) ? resolve(sessionCwd) : resolve(sessionCwd)
      }
      if (!isSameOrDescendantPath(canonicalSessionCwd, canonicalProjectRoot)) continue
      const rel = relative(root.disk, sessionPath).split(sep).join('/')
      const zipPath = `${root.zip}/${rel}`
      const sessionId = readSessionMetaId(raw)
      const stateMetadata = sessionId ? stateDbThreadMetadata.get(sessionId) : undefined
      const title = readNonEmptyString(stateMetadata?.title) || (sessionId ? readNonEmptyString(threadTitles.titles[sessionId]) : '')
      if (title) exportedTitles[zipPath] = title
      if (title || (stateMetadata?.updatedAtMs ?? 0) > 0) {
        exportedThreads[zipPath] = {
          title,
          updatedAtMs: stateMetadata?.updatedAtMs ?? 0,
        }
      }
      entries.push({
        path: zipPath,
        filePath: sessionPath,
        mtime: new Date(),
      })
    }
  }
  if (Object.keys(exportedTitles).length > 0 || Object.keys(exportedThreads).length > 0) {
    entries.push({
      path: '.codex-project/chats/thread-titles.json',
      data: Buffer.from(JSON.stringify({ version: 2, titles: exportedTitles, threads: exportedThreads }, null, 2)),
      mtime: new Date(),
    })
  }
  return entries
}


async function importProjectZip(buffer: Buffer, destinationParent: string): Promise<{ projectPath: string; importedSessions: number }> {
  const entries = parseStoredProjectZip(buffer)
  const manifestEntry = entries.find((entry) => entry.path === '.codex-project/manifest.json' && !entry.isDirectory)
  let projectName = 'imported-project'
  if (manifestEntry) {
    try {
      const manifest = asRecord(JSON.parse(manifestEntry.data.toString('utf8')) as unknown)
      projectName = readNonEmptyString(manifest?.projectName) || projectName
    } catch {
      projectName = 'imported-project'
    }
  }
  projectName = projectName.replace(/[\\/]+/g, '-').replace(/[\u0000-\u001f]+/g, '').trim() || 'imported-project'
  const titleEntry = entries.find((entry) => entry.path === '.codex-project/chats/thread-titles.json' && !entry.isDirectory)
  const importedThreadMetadata = new Map<string, ExportedThreadMetadata>()
  if (titleEntry) {
    try {
      const payload = asRecord(JSON.parse(titleEntry.data.toString('utf8')) as unknown)
      const titles = asRecord(payload?.titles)
      if (titles) {
        for (const [key, value] of Object.entries(titles)) {
          const title = readNonEmptyString(value)
          if (key && title) importedThreadMetadata.set(key, { title, updatedAtMs: 0 })
        }
      }
      const threads = asRecord(payload?.threads)
      if (threads) {
        for (const [key, value] of Object.entries(threads)) {
          const record = asRecord(value)
          const title = readNonEmptyString(record?.title) || importedThreadMetadata.get(key)?.title || ''
          const updatedAtMs = typeof record?.updatedAtMs === 'number' && Number.isFinite(record.updatedAtMs)
            ? Math.trunc(record.updatedAtMs)
            : 0
          if (key && (title || updatedAtMs > 0)) importedThreadMetadata.set(key, { title, updatedAtMs })
        }
      }
    } catch {
      // Ignore malformed optional title metadata; imported chats still fall back to first user messages.
    }
  }

  const parent = await realpath(destinationParent)
  let projectPath = join(parent, projectName)
  for (let index = 2; existsSync(projectPath); index += 1) {
    projectPath = join(parent, `${projectName}-${index}`)
  }
  await mkdir(projectPath, { recursive: true })

  let importedSessions = 0
  const importedSessionRecords: ImportedSessionRecord[] = []
  const importedSessionsRoot = join(getCodexHomeDir(), 'sessions')
  const chatEntries = entries
    .filter((entry) => entry.path.startsWith('.codex-project/chats/') && !entry.isDirectory && extname(entry.path) === '.jsonl')
    .map((entry) => {
      const importedMetadata = importedThreadMetadata.get(entry.path)
      const sourceSessionRaw = entry.data.toString('utf8')
      const sourceRecord = readImportedSessionRecord(sourceSessionRaw, entry.path, projectPath, readSessionMetaId(sourceSessionRaw) || randomUUID(), importedMetadata?.title ?? '')
      const updatedAtMs = (importedMetadata?.updatedAtMs ?? 0) > 0 ? importedMetadata?.updatedAtMs ?? 0 : sourceRecord.updatedAtMs
      return { entry, importedMetadata, sourceSessionRaw, sourceRecord, updatedAtMs }
    })
    .sort((first, second) => second.updatedAtMs - first.updatedAtMs)

  for (const [index, chatEntry] of chatEntries.entries()) {
    const importedThreadId = randomUUID()
    const target = join(importedSessionsRoot, 'imported', `${String(index + 1).padStart(6, '0')}-${importedThreadId}.jsonl`)
    await mkdir(dirname(target), { recursive: true })
    const importedSessionRaw = rewriteImportedSession(chatEntry.sourceSessionRaw, projectPath, importedThreadId)
    await writeFile(target, importedSessionRaw, 'utf8')
    const importedRecord = readImportedSessionRecord(importedSessionRaw, target, projectPath, importedThreadId, chatEntry.importedMetadata?.title ?? '')
    if (chatEntry.updatedAtMs > 0) {
      importedRecord.updatedAtMs = chatEntry.updatedAtMs
      importedRecord.createdAtMs = Math.min(chatEntry.sourceRecord.createdAtMs, importedRecord.updatedAtMs)
      const updatedAtDate = new Date(chatEntry.updatedAtMs)
      await utimes(target, updatedAtDate, updatedAtDate).catch(() => {})
    }
    importedSessionRecords.push(importedRecord)
    if (importedRecord.title) {
      const cache = await readThreadTitleCache()
      await writeThreadTitleCache(updateThreadTitleCache(cache, importedThreadId, importedRecord.title))
    }
    importedSessions += 1
  }
  registerImportedSessionsInStateDb(importedSessionRecords)

  for (const entry of entries) {
    if (entry.path.startsWith('.codex-project/chats/')) {
      continue
    }
    const target = join(projectPath, entry.path)
    if (!isSameOrDescendantPath(target, projectPath)) throw new Error('Project ZIP contains an unsafe path')
    if (entry.isDirectory) {
      await mkdir(target, { recursive: true })
    } else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, entry.data)
    }
  }

  await persistWorkspaceRoot(projectPath, projectName)
  return { projectPath, importedSessions }
}

// File / project HTTP route family (projectless / github-clone / file-search /
// prompts) migrated to bridge/projectRoutes.ts; helpers moved with the family.

async function readProviderBackedModelIds(appServer: AppServerProcess): Promise<ProviderModelsResponse> {
  const configPayload = asRecord(await appServer.rpc('config/read', {}))
  const config = asRecord(configPayload?.config)
  const providerId = readNonEmptyString(config?.model_provider)
  if (!providerId) {
    return { data: [], providerId: '', source: 'provider' }
  }

  const providers = asRecord(config?.model_providers)
  const provider = asRecord(providers?.[providerId])
  if (!provider) {
    logProviderModelDiscoveryWarning('configured provider is missing from model_providers', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const wireApi = readNonEmptyString(provider.wire_api)
  if (wireApi !== 'responses') {
    return { data: [], providerId, source: 'provider' }
  }

  const baseUrl = readNonEmptyString(provider.base_url)
  if (!baseUrl) {
    logProviderModelDiscoveryWarning('responses provider is missing base_url', { providerId })
    return { data: [], providerId, source: 'provider' }
  }

  const headers = new Headers()
  const configuredHeaders = asRecord(provider.http_headers)
  if (configuredHeaders) {
    for (const [key, rawValue] of Object.entries(configuredHeaders)) {
      const normalized = normalizeHeaderValue(rawValue)
      if (!normalized) continue
      headers.set(key, normalized)
    }
  }

  const bearerToken = readNonEmptyString(provider.experimental_bearer_token)
  if (bearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearerToken}`)
  }

  const envKey = readNonEmptyString(provider.env_key)
  const envHttpHeaders = asRecord(provider.env_http_headers)
  if (envKey || envHttpHeaders) {
    logProviderModelDiscoveryWarning('provider discovery skipped env-backed auth/header expansion', {
      providerId,
      hasEnvKey: Boolean(envKey),
      hasEnvHttpHeaders: Boolean(envHttpHeaders),
    })
  }

  let requestUrl: URL
  try {
    requestUrl = buildProviderModelsUrl(baseUrl, provider.query_params)
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models URL was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid url'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(PROVIDER_MODELS_FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models request failed', {
      providerId,
      error: isTimeoutError(error) ? `request timed out after ${PROVIDER_MODELS_FETCH_TIMEOUT_MS}ms` : getErrorMessage(error, 'network error'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models response was not valid JSON', {
      providerId,
      status: response.status,
      error: getErrorMessage(error, 'invalid json'),
    })
    return { data: [], providerId, source: 'provider' }
  }

  if (!response.ok) {
    logProviderModelDiscoveryWarning('provider /models request returned non-2xx', {
      providerId,
      status: response.status,
      statusText: response.statusText,
    })
    return { data: [], providerId, source: 'provider' }
  }

  try {
    return {
      data: normalizeProviderModelsData(payload),
      providerId,
      source: 'provider',
    }
  } catch (error) {
    logProviderModelDiscoveryWarning('provider /models payload was invalid', {
      providerId,
      error: getErrorMessage(error, 'invalid payload'),
    })
    return { data: [], providerId, source: 'provider' }
  }
}

async function readProviderModelIdsForProvider(
  appServer: AppServerProcess,
  providerId: string,
): Promise<ProviderModelsResponse> {
  const normalizedProviderId = providerId.trim().toLowerCase().replace(/_/g, '-')
  if (!normalizedProviderId || normalizedProviderId === 'codex' || normalizedProviderId === 'openai') {
    return { data: [], providerId: '', source: 'provider' }
  }

  const fmState = ensureDefaultFreeModeStateForMissingAuthSync(join(getCodexHomeDir(), FREE_MODE_STATE_FILE))
  if (normalizedProviderId === 'opencode-zen') {
    try {
      const modelIds = filterOpenCodeZenModelsForAuthState(
        sortOpenCodeZenModelIds(await fetchOpenCodeZenModelIds(fmState?.provider === 'opencode-zen' ? fmState.apiKey : null)),
        fmState?.provider === 'opencode-zen' ? fmState.apiKey : null,
      )
      if (modelIds.length > 0) {
        return { data: modelIds, providerId: 'opencode-zen', source: 'provider' }
      }
    } catch {
      // Fall through to the offline Zen defaults.
    }
    return {
      data: ['big-pickle', 'minimax-m2.5-free', 'nemotron-3-super-free', 'trinity-large-preview-free'],
      providerId: 'opencode-zen',
      source: 'provider',
    }
  }

  if (normalizedProviderId === 'openrouter-free' || normalizedProviderId === 'openrouter') {
    return {
      data: await getFreeModels(),
      providerId: 'openrouter-free',
      source: 'provider',
    }
  }

  return readProviderBackedModelIds(appServer)
}

function extractThreadMessageText(threadReadPayload: unknown): string {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const parts: string[] = []

  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : []
    for (const item of items) {
      const itemRecord = asRecord(item)
      const type = typeof itemRecord?.type === 'string' ? itemRecord.type : ''
      if (type === 'agentMessage' && typeof itemRecord?.text === 'string' && itemRecord.text.trim().length > 0) {
        parts.push(itemRecord.text.trim())
        continue
      }
      if (type === 'userMessage') {
        const content = Array.isArray(itemRecord?.content) ? itemRecord.content : []
        for (const block of content) {
          const blockRecord = asRecord(block)
          if (blockRecord?.type === 'text' && typeof blockRecord.text === 'string' && blockRecord.text.trim().length > 0) {
            parts.push(blockRecord.text.trim())
          }
        }
        continue
      }
      if (type === 'commandExecution') {
        const command = typeof itemRecord?.command === 'string' ? itemRecord.command.trim() : ''
        const output = typeof itemRecord?.aggregatedOutput === 'string' ? itemRecord.aggregatedOutput.trim() : ''
        if (command) parts.push(command)
        if (output) parts.push(output)
      }
    }
  }

  return parts.join('\n').trim()
}

function readThreadArchiveFallbackName(threadReadResult: unknown): string {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  return (
    readNonEmptyString(thread?.name)
    || readNonEmptyString(thread?.title)
    || readNonEmptyString(thread?.preview)
    || 'Untitled thread'
  )
}

function isArchivedThreadReadResult(threadReadResult: unknown): boolean {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  const sessionPath = readNonEmptyString(thread?.path)
  return sessionPath.split(/[\\/]+/u).includes('archived_sessions')
}

export async function callRpcWithArchiveRecovery(
  appServer: RpcExecutor,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    const result = await callRpcWithRateLimitDecodeRecovery(appServer, method, params)
    return method === 'thread/list'
      ? await canonicalizeThreadListResponseForRead(result)
      : result
  } catch (error) {
    const paramsRecord = asRecord(params)
    const threadId = readNonEmptyString(paramsRecord?.threadId)

    if (method === 'turn/start' && threadId && isThreadNotFoundError(error)) {
      await appServer.rpc('thread/resume', { threadId })
      return appServer.rpc(method, params ?? null)
    }

    if (method !== 'thread/archive') {
      throw error
    }

    const errorMessage = getErrorMessage(error, '')
    if (!threadId || !errorMessage.includes('no rollout found')) {
      throw error
    }

    let threadReadResult: unknown = null
    try {
      threadReadResult = await appServer.rpc('thread/read', {
        threadId,
        includeTurns: false,
      })
      if (isArchivedThreadReadResult(threadReadResult)) {
        return null
      }
    } catch {
      // If metadata cannot be read, still try materializing a title before retrying archive.
    }

    await appServer.rpc('thread/name/set', {
      threadId,
      name: readThreadArchiveFallbackName(threadReadResult),
    })
    return appServer.rpc(method, params ?? null)
  }
}

function getCodexConfigPath(): string {
  return join(getCodexHomeDir(), 'config.toml')
}

const APPROVAL_POLICY_KEY = 'approval_policy'

async function resolveEffectiveApprovalPolicy(): Promise<CodexApprovalPolicy> {
  // The runtime env var is authoritative (it is what the app-server is
  // actually launched with), then the config file, then the default.
  const envPolicy = parseApprovalPolicy(process.env.CODEXUI_APPROVAL_POLICY ?? '')
  if (envPolicy) return envPolicy
  const filePolicy = readApprovalPolicyFromConfigFile()
  return filePolicy ?? 'never'
}

function readApprovalPolicyFromConfigFile(): CodexApprovalPolicy | null {
  try {
    if (!existsSync(getCodexConfigPath())) return null
    const raw = readFileSync(getCodexConfigPath(), 'utf8')
    const lines = raw.split(/\r?\n/u)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
      const match = /^approval_policy\s*=\s*"([^"]+)"/u.exec(trimmed)
      if (!match) continue
      const policy = parseApprovalPolicy(match[1] ?? '')
      if (policy) return policy
    }
    return null
  } catch {
    return null
  }
}

const APPROVAL_POLICY_ASSIGNMENT = /^approval_policy\s*=/u

async function writeApprovalPolicyToConfigFile(policy: CodexApprovalPolicy): Promise<void> {
  const configPath = getCodexConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  const policyLine = `approval_policy = "${policy}"`
  if (!existsSync(configPath)) {
    await writeFile(configPath, `${policyLine}\n`, 'utf8')
    return
  }
  const raw = await readFile(configPath, 'utf8')
  // Drop every existing approval_policy assignment regardless of whitespace
  // around "=" (the previous writer only matched `approval_policy=` with no
  // spaces, so repeated saves appended duplicate keys and broke the TOML file).
  const kept = raw.split(/\r?\n/u).filter((line) => !APPROVAL_POLICY_ASSIGNMENT.test(line.trim()))
  // The key must stay top-level: any bare key written after a [table] header
  // would land inside that table, so put it at the very top of the file.
  const body = kept
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd()
  const nextContent = body.length > 0 ? `${policyLine}\n\n${body}\n` : `${policyLine}\n`
  await writeFile(configPath, nextContent, 'utf8')
}

function getSkillsInstallDir(): string {
  return join(getCodexHomeDir(), 'skills')
}

function getCodexAuthPath(): string {
  return join(getCodexHomeDir(), 'auth.json')
}

type CodexAuth = {
  auth_mode?: string
  last_refresh?: number
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
}

const CODEX_CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_CODEX_REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return asRecord(parsed)
  } catch {
    return null
  }
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  return decodeBase64UrlJson(parts[1] ?? '')
}

function extractChatgptTokenMetadata(accessToken: string | undefined): {
  chatgptAccountId: string | null
  chatgptPlanType: string | null
} {
  const payload = decodeJwtPayload(accessToken)
  const auth = asRecord(payload?.['https://api.openai.com/auth'])
  return {
    chatgptAccountId: readNonEmptyString(auth?.chatgpt_account_id) || null,
    chatgptPlanType: readNonEmptyString(auth?.chatgpt_plan_type) || null,
  }
}

function readTokenErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload)
  const message = readNonEmptyString(record?.message)
  if (message) return message
  const error = record?.error
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  const nestedError = asRecord(error)
  return readNonEmptyString(nestedError?.message)
    || readNonEmptyString(nestedError?.error_description)
    || readNonEmptyString(record?.error_description)
    || fallback
}

function readTokenResponseString(payload: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!payload) return null
  for (const key of keys) {
    const value = readNonEmptyString(payload[key])
    if (value) return value
  }
  return null
}

export async function refreshChatgptAuthTokensForExternalAuth(
  params: ChatgptAuthTokensRefreshParams = {},
): Promise<ChatgptAuthTokensRefreshResponse> {
  const authPath = getCodexAuthPath()
  const raw = await readFile(authPath, 'utf8')
  const auth = JSON.parse(raw) as CodexAuth
  const currentRefreshToken = auth.tokens?.refresh_token?.trim() ?? ''
  if (!currentRefreshToken) {
    throw new Error('No ChatGPT refresh token is available. Please sign in again.')
  }

  const refreshUrl = process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE?.trim() || DEFAULT_CODEX_REFRESH_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
    client_id: CODEX_CHATGPT_CLIENT_ID,
  })

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(25_000),
  })

  const text = await response.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = asRecord(JSON.parse(text))
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(readTokenErrorMessage(payload, `ChatGPT token refresh failed with HTTP ${String(response.status)}`))
  }

  const accessToken = readTokenResponseString(payload, 'access_token', 'accessToken')
  if (!accessToken) {
    throw new Error('ChatGPT token refresh response did not include an access token.')
  }

  const nextRefreshToken = readTokenResponseString(payload, 'refresh_token', 'refreshToken') ?? currentRefreshToken
  const nextIdToken = readTokenResponseString(payload, 'id_token', 'idToken') ?? auth.tokens?.id_token
  const metadata = extractChatgptTokenMetadata(accessToken)
  const chatgptAccountId =
    metadata.chatgptAccountId
    || readTokenResponseString(payload, 'chatgpt_account_id', 'chatgptAccountId')
    || readNonEmptyString(params.previousAccountId)
    || readNonEmptyString(auth.tokens?.account_id)
  if (!chatgptAccountId) {
    throw new Error('ChatGPT token refresh response did not include account metadata.')
  }

  const nextAuth: CodexAuth = {
    ...auth,
    auth_mode: auth.auth_mode || 'chatgpt',
    last_refresh: Date.now(),
    tokens: {
      ...auth.tokens,
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      account_id: chatgptAccountId,
      ...(nextIdToken ? { id_token: nextIdToken } : {}),
    },
  }
  await writeFile(authPath, JSON.stringify(nextAuth, null, 2), { encoding: 'utf8', mode: 0o600 })

  return {
    accessToken,
    chatgptAccountId,
    chatgptPlanType: metadata.chatgptPlanType,
  }
}

function hasUsableCodexAuthSync(): boolean {
  try {
    const raw = readFileSync(getCodexAuthPath(), 'utf8')
    const auth = JSON.parse(raw) as CodexAuth
    return Boolean(auth.tokens?.access_token?.trim())
  } catch {
    return false
  }
}

function readFreeModeStateSync(statePath: string): FreeModeState | null {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as FreeModeState
  } catch {
    return null
  }
}

type TomlScanState = {
  inMultilineBasicString: boolean
  inMultilineLiteralString: boolean
}

function stripTomlComment(line: string, state: TomlScanState): string {
  let content = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    if (state.inMultilineBasicString) {
      const end = line.indexOf('"""', i)
      if (end === -1) return content
      state.inMultilineBasicString = false
      i = end + 2
      continue
    }
    if (state.inMultilineLiteralString) {
      const end = line.indexOf("'''", i)
      if (end === -1) return content
      state.inMultilineLiteralString = false
      i = end + 2
      continue
    }
    const ch = line[i]
    if (inDoubleQuote && escaped) {
      escaped = false
      content += ch
      continue
    }
    if (inDoubleQuote && ch === '\\') {
      escaped = true
      content += ch
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && line.startsWith('"""', i)) {
      state.inMultilineBasicString = true
      i += 2
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && line.startsWith("'''", i)) {
      state.inMultilineLiteralString = true
      i += 2
      continue
    }
    if (!inDoubleQuote && ch === "'") {
      inSingleQuote = !inSingleQuote
      content += ch
      continue
    }
    if (!inSingleQuote && ch === '"') {
      inDoubleQuote = !inDoubleQuote
      content += ch
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && ch === '#') {
      return content
    }
    content += ch
  }
  return content
}

function isModelProviderAssignment(content: string): boolean {
  return /^(?:model_provider|"model_provider"|'model_provider')\s*=/.test(content)
}

let explicitCodexModelProviderConfigCache: {
  path: string
  mtimeMs: number | null
  size: number | null
  value: boolean
} | null = null

function hasExplicitCodexModelProviderConfigSync(): boolean {
  const configPath = join(getCodexHomeDir(), 'config.toml')
  let info: ReturnType<typeof statSync> | null = null
  try {
    info = statSync(configPath)
  } catch {
    explicitCodexModelProviderConfigCache = {
      path: configPath,
      mtimeMs: null,
      size: null,
      value: false,
    }
    return false
  }
  if (
    explicitCodexModelProviderConfigCache?.path === configPath
    && explicitCodexModelProviderConfigCache.mtimeMs === info.mtimeMs
    && explicitCodexModelProviderConfigCache.size === info.size
  ) {
    return explicitCodexModelProviderConfigCache.value
  }

  let value = false
  try {
    const raw = readFileSync(configPath, 'utf8')
    let inTopLevelTable = true
    const scanState: TomlScanState = {
      inMultilineBasicString: false,
      inMultilineLiteralString: false,
    }
    for (const line of raw.split(/\r?\n/)) {
      const content = stripTomlComment(line, scanState).trim()
      if (!content) continue
      if (/^\[\[?[^\]]+\]?\]$/.test(content)) {
        inTopLevelTable = false
        continue
      }
      if (!inTopLevelTable) continue
      if (isModelProviderAssignment(content)) {
        value = true
        break
      }
    }
  } catch {
    value = false
  }
  explicitCodexModelProviderConfigCache = {
    path: configPath,
    mtimeMs: info.mtimeMs,
    size: info.size,
    value,
  }
  return value
}

export async function writeFreeModeStateFile(statePath: string, state: FreeModeState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true })
  await writeFile(statePath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
}

export function ensureDefaultFreeModeStateForMissingAuthSync(statePath: string): FreeModeState | null {
  const current = readFreeModeStateSync(statePath)
  const hasUsableCodexAuth = hasUsableCodexAuthSync()
  if (shouldSuppressCommunityFreeModeForCodexAuth(current, hasUsableCodexAuth)) {
    return null
  }
  const shouldCreateDefault = shouldCreateDefaultFreeModeStateForMissingAuth(current, hasUsableCodexAuth)
  const hasExplicitModelProviderConfig = shouldCreateDefault && hasExplicitCodexModelProviderConfigSync()
  if (hasExplicitModelProviderConfig || !shouldCreateDefault) {
    return current
  }

  return createDefaultOpenCodeZenFreeModeState()
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  const normalized = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress
  return normalized === '127.0.0.1' || normalized === '::1'
}

const THREAD_QUEUE_STATE_KEY = 'thread-queue-state'

type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

type ThreadQueueState = Record<string, StoredQueuedMessage[]>

type BackendQueuedTurn = {
  threadId: string
  message: StoredQueuedMessage
}

type ThreadQueueStateUpdate<T> = {
  nextState: ThreadQueueState
  result: T
}

type ResolvedCollaborationModeSettings = {
  model: string
  reasoningEffort: ReasoningEffort | null
}

function normalizeStoredQueuedMessage(value: unknown): StoredQueuedMessage | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null

  const normalizeNamedPathItems = (items: unknown): Array<{ name: string; path: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const name = typeof itemRecord.name === 'string' ? itemRecord.name.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      return name && path ? [{ name, path }] : []
    })
  }

  const normalizeFileAttachments = (items: unknown): Array<{ label: string; path: string; fsPath: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const label = typeof itemRecord.label === 'string' ? itemRecord.label.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      const fsPath = typeof itemRecord.fsPath === 'string' ? itemRecord.fsPath.trim() : ''
      return label && path && fsPath ? [{ label, path, fsPath }] : []
    })
  }

  return {
    id,
    text: typeof record.text === 'string' ? record.text : '',
    imageUrls: normalizeStringArray(record.imageUrls),
    skills: normalizeNamedPathItems(record.skills),
    fileAttachments: normalizeFileAttachments(record.fileAttachments),
    collaborationMode: record.collaborationMode === 'plan' ? 'plan' : 'default',
  }
}

function normalizeThreadQueueState(value: unknown): ThreadQueueState {
  const record = asRecord(value)
  if (!record) return {}

  const state: ThreadQueueState = {}
  for (const [threadId, rawMessages] of Object.entries(record)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Array.isArray(rawMessages)) continue
    const messages = rawMessages.flatMap((item) => {
      const message = normalizeStoredQueuedMessage(item)
      return message ? [message] : []
    })
    if (messages.length > 0) {
      state[normalizedThreadId] = messages
    }
  }
  return state
}

let threadQueueMutationChain: Promise<unknown> = Promise.resolve()

async function readThreadQueueState(): Promise<ThreadQueueState> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadQueueState(payload[THREAD_QUEUE_STATE_KEY])
  } catch {
    return {}
  }
}

async function writeThreadQueueStateUnlocked(nextState: ThreadQueueState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  const normalized = normalizeThreadQueueState(nextState)
  if (Object.keys(normalized).length > 0) {
    payload[THREAD_QUEUE_STATE_KEY] = normalized
  } else {
    delete payload[THREAD_QUEUE_STATE_KEY]
  }
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function withThreadQueueStateUpdate<T>(
  update: (state: ThreadQueueState) => ThreadQueueStateUpdate<T> | Promise<ThreadQueueStateUpdate<T>>,
): Promise<T> {
  const run = threadQueueMutationChain.then(async () => {
    const currentState = await readThreadQueueState()
    const { nextState, result } = await update(currentState)
    await writeThreadQueueStateUnlocked(nextState)
    return result
  })
  threadQueueMutationChain = run.catch(() => {})
  return run
}

async function writeThreadQueueState(nextState: ThreadQueueState): Promise<void> {
  await withThreadQueueStateUpdate(() => ({
    nextState: normalizeThreadQueueState(nextState),
    result: undefined,
  }))
}

async function appendThreadQueuedMessage(threadId: string, message: StoredQueuedMessage): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) throw new Error('threadId is required')
  await withThreadQueueStateUpdate((state) => ({
    nextState: {
      ...state,
      [normalizedThreadId]: [...(state[normalizedThreadId] ?? []), message],
    },
    result: undefined,
  }))
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  return isReasoningEffort(value) ? value : ''
}

function normalizeCollaborationModeReasoningEffort(value: ReasoningEffort | '' | null | undefined): ReasoningEffort | null {
  return value && value.length > 0 ? value : null
}

function extractLocalImagePathFromUrl(value: string): string | null {
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

function buildTextWithAttachments(prompt: string, files: StoredQueuedMessage['fileAttachments']): string {
  if (files.length === 0) return prompt
  let prefix = '# Files mentioned by the user:\n'
  for (const f of files) {
    prefix += `\n## ${f.label}: ${f.path}\n`
  }
  return `${prefix}\n## My request for Codex:\n\n${prompt}\n`
}

function fileNameFromPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? normalized
}

function extractThreadIdFromNotificationParams(params: unknown): string {
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

function isTurnCompletedNotification(notification: { method: string; params: unknown }): boolean {
  return notification.method === 'turn/completed'
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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return null
  const text = raw.toString('utf8').trim()
  if (text.length === 0) return null
  return JSON.parse(text) as unknown
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

function bufferIndexOf(buf: Buffer, needle: Buffer, start = 0): number {
  for (let i = start; i <= buf.length - needle.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { match = false; break }
    }
    if (match) return i
  }
  return -1
}

function handleFileUpload(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const contentType = req.headers['content-type'] ?? ''
      const boundaryMatch = contentType.match(/boundary=(.+)/i)
      if (!boundaryMatch) { setJson(res, 400, { error: 'Missing multipart boundary' }); return }
      const boundary = boundaryMatch[1]
      const boundaryBuf = Buffer.from(`--${boundary}`)
      const parts: Buffer[] = []
      let searchStart = 0
      while (searchStart < body.length) {
        const idx = body.indexOf(boundaryBuf, searchStart)
        if (idx < 0) break
        if (searchStart > 0) parts.push(body.subarray(searchStart, idx))
        searchStart = idx + boundaryBuf.length
        if (body[searchStart] === 0x0d && body[searchStart + 1] === 0x0a) searchStart += 2
      }
      let fileName = 'uploaded-file'
      let fileData: Buffer | null = null
      const headerSep = Buffer.from('\r\n\r\n')
      for (const part of parts) {
        const headerEnd = bufferIndexOf(part, headerSep)
        if (headerEnd < 0) continue
        const headers = part.subarray(0, headerEnd).toString('utf8')
        const fnMatch = headers.match(/filename="([^"]+)"/i)
        if (!fnMatch) continue
        fileName = fnMatch[1].replace(/[/\\]/g, '_')
        let end = part.length
        if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) end -= 2
        fileData = part.subarray(headerEnd + 4, end)
        break
      }
      if (!fileData) { setJson(res, 400, { error: 'No file in request' }); return }
      const uploadDir = join(tmpdir(), 'codex-web-uploads')
      await mkdir(uploadDir, { recursive: true })
      const destDir = await mkdtemp(join(uploadDir, 'f-'))
      const destPath = join(destDir, fileName)
      await writeFile(destPath, fileData)
      setJson(res, 200, { path: destPath })
    } catch (err) {
      setJson(res, 500, { error: getErrorMessage(err, 'Upload failed') })
    }
  })
  req.on('error', (err: Error) => {
    setJson(res, 500, { error: getErrorMessage(err, 'Upload stream error') })
  })
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
    args.push(...getProviderCompatibilityConfigArgs(serverPort))
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
      this.threadTurnPageReadCacheByThreadId.delete(nThreadId)
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
    this.threadTurnPageReadCacheByThreadId.delete(threadId)
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

  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void {
    this.liveStateCache.set(threadId, { data, turnCount, sessionSize })
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
    await this.ensureInitialized()
    return this.call(method, params)
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
    const response = asRecord(await this.appServer.rpc('thread/read', { threadId, includeTurns: true }))
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
      text: buildTextWithAttachments(turn.message.text, dedupedFileAttachments),
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
    await this.appServer.rpc('thread/resume', { threadId: turn.threadId })
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
const SHARED_BRIDGE_VERSION = 'experimental-api-v2'

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
  const terminalManager = new ThreadTerminalManager()
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

async function loadAllThreadsForSearch(appServer: AppServerProcess): Promise<ThreadSearchDocument[]> {
  const threads: Array<{ id: string; title: string; preview: string }> = []
  let cursor: string | null = null

  do {
    const response = asRecord(await appServer.rpc('thread/list', {
      archived: false,
      limit: 100,
      sortKey: 'updated_at',
      modelProviders: [],
      cursor,
    }))
    const data = Array.isArray(response?.data) ? response.data : []
    for (const row of data) {
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id : ''
      if (!id) continue
      const title = typeof record?.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : (typeof record?.preview === 'string' && record.preview.trim().length > 0 ? record.preview.trim() : 'Untitled thread')
      const preview = typeof record?.preview === 'string' ? record.preview : ''
      threads.push({ id, title, preview })
    }
    cursor = typeof response?.nextCursor === 'string' && response.nextCursor.length > 0 ? response.nextCursor : null
  } while (cursor)

  const docs: ThreadSearchDocument[] = threads.map((thread) => {
    const searchableText = [thread.title, thread.preview].filter(Boolean).join('\n')
    return {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      messageText: '',
      searchableText,
    } satisfies ThreadSearchDocument
  })

  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  const fullTextThreads = threads.slice(0, THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT)
  const concurrency = 4
  for (let offset = 0; offset < fullTextThreads.length; offset += concurrency) {
    const batch = fullTextThreads.slice(offset, offset + concurrency)
    const loaded = await Promise.all(batch.map(async (thread) => {
      try {
        const readResponse = await appServer.rpc('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        })
        const messageText = extractThreadMessageText(readResponse)
        const searchableText = [thread.title, thread.preview, messageText].filter(Boolean).join('\n')
        return [thread.id, {
          id: thread.id,
          title: thread.title,
          preview: thread.preview,
          messageText,
          searchableText,
        } satisfies ThreadSearchDocument] as const
      } catch {
        return null
      }
    }))
    for (const row of loaded) {
      if (!row) continue
      docsById.set(row[0], row[1])
    }
  }

  return Array.from(docsById.values())
}

async function buildThreadSearchIndex(appServer: AppServerProcess): Promise<ThreadSearchIndex> {
  const docs = await loadAllThreadsForSearch(appServer)
  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  return { docsById }
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

        let rpcResult: unknown
        try {
          rpcResult = await callRpcWithArchiveRecovery(appServer, body.method, body.params ?? null)
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
          if (body.method === 'thread/read' && isThreadMaterializationPendingError(error)) {
            const params = asRecord(body.params)
            const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
            if (threadId) {
              setJson(res, 200, {
                result: {
                  thread: {
                    id: threadId,
                    turns: [],
                    status: { type: 'inProgress' },
                  },
                },
              })
              return
            }
          }
		          throw error
		        }
        const pipelineResult = await runRpcResponsePipeline({
          appServer,
          externalSessionTracker: {
            getExternalSession: (threadId) => externalSessionTracker.getExternalSession(threadId),
            tick: () => externalSessionTracker.tick(),
            getUserFacingSubagentThreadIds: () => new Set(externalSessionTracker.getUserFacingSubagentThreadIds()),
          },
          sanitizeThreadTurnsInlinePayloads,
          mergeImportedThreadsIntoThreadListResult,
        }, body.method, rpcResult)

        setJson(res, 200, { result: pipelineResult })
        return
      }

      // Thread read / SSE route family (non-SSE), 迁入 bridge/threadRoutes.ts.
      if (await handleThreadHttpRequest(req, res, url, {
        setJson,
        appServer,
        externalSessionTracker,
        sanitizeThreadTurnsInlinePayloads,
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

          const threadReadResult = await appServer.rpc('thread/read', { threadId, includeTurns: true })
          const record = asRecord(threadReadResult)
          const thread = asRecord(record?.thread)
          const turns = Array.isArray(thread?.turns) ? thread.turns : []
          const sessionPath = readNonEmptyString(thread?.path)

          if (!sessionPath || !isAbsolute(sessionPath)) {
            setJson(res, 200, { reverted: 0, errors: [], message: 'No session log available' })
            return
          }

          let foundTurnIndex = -1
          const turnIdsToRevert = new Set<string>()
          for (let i = 0; i < turns.length; i++) {
            const turnRecord = asRecord(turns[i])
            const id = readNonEmptyString(turnRecord?.id)
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
              setJson(res, 200, { data: ['big-pickle', 'minimax-m2.5-free', 'nemotron-3-super-free', 'trinity-large-preview-free'], exclusive: true, source: 'opencode-zen' })
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

