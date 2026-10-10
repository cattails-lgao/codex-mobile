import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  Turn,
  UserInput,
} from '../appServerDtos'
import type {
  CommandExecutionData,
  UiFileAttachment,
  UiFileChange,
  UiFileChangeStatus,
  UiExternalSession,
  UiMessage,
  UiPlanData,
  UiPlanStep,
  UiProjectGroup,
  UiThread,
} from '../../types/codex'
import { normalizePathForComparison, normalizePathForUi, toProjectName } from '../../pathUtils.js'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

// round-106：turn 载荷的时间戳（startedAt）历史上有秒/毫秒两种口径，>1e11 视为毫秒。
function toIsoFromTurnTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const ms = value > 1e11 ? value : value * 1000
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readTurnErrorText(turn: Turn): string {
  const error = turn.error as { message?: unknown } | null
  return typeof error?.message === 'string' ? error.message.trim() : ''
}

const FILE_ATTACHMENT_LINE = /^##\s+(.+?):\s+(.+?)\s*$/
const FILES_MENTIONED_MARKER = /^#\s*files mentioned by the user\s*:?\s*$/i
const ASSISTANT_FILE_CHANGE_HEADING = /^(?:#{1,6}\s*)?(?:本次修改文件(?:和操作)?(?:如下)?|修改文件和操作)\s*[:：]?\s*$/u

function extractFileAttachments(value: string): UiFileAttachment[] {
  const markerIdx = value.split('\n').findIndex((line) => FILES_MENTIONED_MARKER.test(line.trim()))
  if (markerIdx < 0) return []
  const lines = value.split('\n').slice(markerIdx + 1)
  const attachments: UiFileAttachment[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(FILE_ATTACHMENT_LINE)
    if (!m) break
    const label = m[1]?.trim()
    const path = m[2]?.trim().replace(/\s+\((?:lines?\s+\d+(?:-\d+)?)\)\s*$/, '')
    if (label && path) attachments.push({ label, path })
  }
  return attachments
}

function extractCodexUserRequestText(value: string): string {
  const markerRegex = /(?:^|\n)\s{0,3}#{0,6}\s*my request for codex\s*:?\s*/giu
  const matches = Array.from(value.matchAll(markerRegex))
  if (matches.length === 0) {
    return value.trim()
  }

  const lastMatch = matches.at(-1)
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return value.trim()
  }

  const markerOffset = lastMatch.index + lastMatch[0].length
  return value.slice(markerOffset).trim()
}

/**
 * round-138：UserInput 联合里**已有可见面**的变体；其余落进 rawBlocks 兜底。
 * 用集合而非 `block.type !== '…'` 长链，是因为把 8 个变体全排掉后 TS 会把联合收窄成
 * `never`（报 `Property 'type' does not exist on type 'never'`）。
 */
const HANDLED_USER_INPUT_TYPES = new Set<string>([
  'text', 'image', 'localImage', 'audio', 'localAudio', 'skill', 'mention',
])

function toLocalImageUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

// round-138：localAudio 的播放源走既有 /codex-local-file 代理（无扩展名白名单，
// 与服务端「直接打开本地文件」同一条通道）。
function toLocalFileUrl(path: string): string {
  return `/codex-local-file?path=${encodeURIComponent(path)}`
}

function toImageGenerationUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/codex-local-image?')
  ) {
    return trimmed
  }
  const compact = trimmed.replace(/\s+/gu, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return ''
  return `data:image/png;base64,${compact}`
}

// round-76：桥层把超长命令输出截到 16KB 并把溢出落盘，这里读回截断备注，
// 供命令块渲染「已省略 N」提示与「查看完整输出」入口。
function readCommandOutputSpill(raw: Record<string, unknown>): CommandExecutionData['outputSpill'] {
  const spill = raw.aggregatedOutputSpill
  if (!spill || typeof spill !== 'object' || Array.isArray(spill)) return undefined
  const record = spill as Record<string, unknown>
  const ref = typeof record.ref === 'string' ? record.ref.trim() : ''
  const readCount = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
  const totalBytes = readCount(record.totalBytes)
  const omittedBytes = readCount(record.omittedBytes)
  if (omittedBytes <= 0) return undefined
  return { ref, totalBytes, omittedBytes }
}

function decodeHeartbeatXmlText(value: string): string {
  return value
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&amp;/giu, '&')
}

function readHeartbeatField(value: string, field: string): string {
  const match = new RegExp(`<${field}>\\s*([\\s\\S]*?)\\s*</${field}>`, 'iu').exec(value)
  return match?.[1] ? decodeHeartbeatXmlText(match[1].trim()) : ''
}

function parseHeartbeatEnvelope(value: string): { automationId: string; currentTimeIso: string; instructions: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('<heartbeat>') || !trimmed.endsWith('</heartbeat>')) return null
  const currentTimeIso = readHeartbeatField(trimmed, 'current_time_iso')
  const instructions = readHeartbeatField(trimmed, 'instructions')
  if (!currentTimeIso || !instructions) return null
  return {
    automationId: readHeartbeatField(trimmed, 'automation_id'),
    currentTimeIso,
    instructions,
  }
}

function parseUserMessageContent(
  itemId: string,
  content: UserInput[] | undefined,
): {
  text: string
  images: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: UiFileAttachment[]
  imageAttachmentIds: string[]
  audioSources: string[]
  mentions: Array<{ name: string; path: string }>
  rawBlocks: UiMessage[]
  isAutomationRun: boolean
  automationDisplayName: string | null
} {
  if (!Array.isArray(content)) {
    return { text: '', images: [], skills: [], fileAttachments: [], imageAttachmentIds: [], audioSources: [], mentions: [], rawBlocks: [], isAutomationRun: false, automationDisplayName: null }
  }

  const textChunks: string[] = []
  const images: string[] = []
  const imageAttachmentIds: string[] = []
  const audioSources: string[] = []
  const mentions: Array<{ name: string; path: string }> = []
  const skills: Array<{ name: string; path: string }> = []
  const rawBlocks: UiMessage[] = []

  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      textChunks.push(block.text)
    }
    // round-130：0.160.1 的 image 变体是 `{ url } | { fileId }`（附件引用）。带 url 的走
    // 图片预览；**只有 fileId、无内联 url 的**——round-137 起不再静默丢弃，收进
    // imageAttachmentIds 交由 UI 渲染成「不可预览」的可见占位。
    //
    // 为什么不做完整的 fileId -> 字节/URL 解析：0.161.0 协议上不可行——附件面只有
    // thread/attachment/{add,list,remove}，list 返回的 ThreadAttachment.payload 是 opaque
    // JsonValue（无 url/path 语义），且**没有内容取回端点**。属独立的协议侧设计题。
    if (block.type === 'image' && 'url' in block && typeof block.url === 'string' && block.url.trim().length > 0) {
      images.push(block.url.trim())
    }
    if (block.type === 'image' && !('url' in block) && 'fileId' in block && typeof block.fileId === 'string' && block.fileId.trim().length > 0) {
      imageAttachmentIds.push(block.fileId.trim())
    }
    if (block.type === 'localImage' && typeof block.path === 'string' && block.path.trim().length > 0) {
      images.push(toLocalImageUrl(block.path.trim()))
    }
    if (block.type === 'skill') {
      const name = typeof block.name === 'string' ? block.name.trim() : ''
      const path = typeof block.path === 'string' ? block.path.trim() : ''
      if (name && path) {
        skills.push({ name, path })
      }
    }
    // round-138：audio / localAudio / mention 此前**没有**可见面 —— 它们落进 rawBlocks，
    // 而 rawBlocks 在 UI 上没有渲染分支、空正文又被 shouldOmitEmptyGenericMessage 省略
    // ⇒ 在历史里静默消失（与 round-137 的 fileId 图片同因）。本轮补齐：
    //   · audio      → 内联/远程 URL，交给 <audio controls>
    //   · localAudio → 换成本仓既有的 /codex-local-file 代理 URL
    //   · mention    → @name chip（path 只作 title 提示）
    if (block.type === 'audio' && typeof block.url === 'string' && block.url.trim().length > 0) {
      audioSources.push(block.url.trim())
    }
    if (block.type === 'localAudio' && typeof block.path === 'string' && block.path.trim().length > 0) {
      audioSources.push(toLocalFileUrl(block.path.trim()))
    }
    if (block.type === 'mention') {
      const name = typeof block.name === 'string' ? block.name.trim() : ''
      const path = typeof block.path === 'string' ? block.path.trim() : ''
      if (name) {
        mentions.push({ name, path })
      }
    }

    // round-138：UserInput 联合的 8 个变体至此**全部**有可见面（text / image(url|fileId) /
    // localImage / audio / localAudio / skill / mention）。这里保留 rawBlocks 兜底：将来协议
    // 新增变体不会静默丢数据，但 UI 目前没有 rawBlocks 渲染分支 ⇒ 新增变体仍须显式接入
    // （由 v2.test.ts 的「全变体可见」用例钉住）。
    // 注意：用「先加宽再查集合」而不是长 `!==` 链——后者会把联合类型收窄成 never。
    const blockType: string = block.type
    if (!HANDLED_USER_INPUT_TYPES.has(blockType)) {
      rawBlocks.push({
        id: `${itemId}:user-content:${index}`,
        role: 'user',
        text: '',
        messageType: `userContent.${blockType}`,
        rawPayload: toRawPayload(block),
        isUnhandled: true,
      })
    }
  }

  const fullText = textChunks.join('\n')
  const fileAttachments = extractFileAttachments(fullText)
  const heartbeat = parseHeartbeatEnvelope(fullText)

  return {
    text: heartbeat?.instructions ?? extractCodexUserRequestText(fullText),
    images,
    skills,
    fileAttachments,
    imageAttachmentIds,
    audioSources,
    mentions,
    rawBlocks,
    isAutomationRun: heartbeat !== null,
    automationDisplayName: heartbeat?.automationId || null,
  }
}

function parsePlanText(value: string): UiPlanData | null {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const lines = normalized.split('\n')
  const steps: UiPlanStep[] = []
  const explanationLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (steps.length === 0) explanationLines.push('')
      continue
    }

    const match = trimmed.match(/^[-*]\s+\[([ xX~>|-])\]\s+(.+)$/)
    if (match) {
      const marker = (match[1] ?? ' ').toLowerCase()
      const step = match[2]?.trim()
      if (!step) continue
      let status: UiPlanStep['status'] = 'pending'
      if (marker === 'x') status = 'completed'
      if (marker === '~' || marker === '>' || marker === '-') status = 'inProgress'
      steps.push({ step, status })
      continue
    }

    explanationLines.push(trimmed)
  }

  if (steps.length === 0) return null

  return {
    explanation: explanationLines.join('\n').trim() || undefined,
    steps,
  }
}

function inferAssistantFileChangeOperation(detailLines: string[]): UiFileChange['operation'] {
  const detailText = detailLines.join(' ').toLowerCase()
  if (
    detailText.includes('重命名') ||
    detailText.includes('移动') ||
    detailText.includes('rename') ||
    detailText.includes('renamed') ||
    detailText.includes('move') ||
    detailText.includes('moved')
  ) {
    return 'update'
  }
  if (
    detailText.includes('删除') ||
    detailText.includes('移除') ||
    detailText.includes('delete') ||
    detailText.includes('deleted') ||
    detailText.includes('remove') ||
    detailText.includes('removed')
  ) {
    return 'delete'
  }
  if (
    detailText.includes('新增') ||
    detailText.includes('添加') ||
    detailText.includes('增加') ||
    detailText.includes('add') ||
    detailText.includes('added') ||
    detailText.includes('create') ||
    detailText.includes('created')
  ) {
    return 'add'
  }
  return 'update'
}

function extractAssistantFilePath(value: string): string {
  const backtickMatch = value.match(/`([^`]+)`/u)
  if (backtickMatch?.[1]) {
    return backtickMatch[1].trim()
  }
  return value.replace(/^[-*]\s+/u, '').trim()
}

function looksLikeAssistantFilePath(value: string): boolean {
  return /[\\/]/u.test(value) || /[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+$/u.test(value)
}

function extractAssistantFileChanges(value: string): UiFileChange[] {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  const headingIndex = lines.findIndex((line) => ASSISTANT_FILE_CHANGE_HEADING.test(line.trim()))
  if (headingIndex < 0) return []

  const collected: Array<{ path: string; details: string[] }> = []
  let current: { path: string; details: string[] } | null = null

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      if (current) {
        collected.push(current)
        current = null
      }
      break
    }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/u)
    if (!bulletMatch) {
      if (current) {
        collected.push(current)
        current = null
      }
      break
    }

    const indent = bulletMatch[1]?.length ?? 0
    const bulletText = bulletMatch[2]?.trim() ?? ''
    if (indent <= 1) {
      if (current) {
        collected.push(current)
      }
      const path = extractAssistantFilePath(bulletText)
      current = looksLikeAssistantFilePath(path)
        ? { path, details: [] }
        : null
      continue
    }

    if (current && bulletText) {
      current.details.push(bulletText)
    }
  }

  if (current) {
    collected.push(current)
  }

  return collected.map((entry) => ({
    path: entry.path,
    operation: inferAssistantFileChangeOperation(entry.details),
    movedToPath: null,
    diff: '',
    addedLineCount: 0,
    removedLineCount: 0,
  }))
}

function countContentLines(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function countUnifiedDiffLines(value: string): { addedLineCount: number; removedLineCount: number } {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of value.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      addedLineCount += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLineCount += 1
    }
  }

  return { addedLineCount, removedLineCount }
}

export function normalizeFileChangeStatus(value: unknown): UiFileChangeStatus {
  if (value === 'failed' || value === 'declined' || value === 'completed') return value
  return 'inProgress'
}

export function toUiFileChanges(changes: unknown): UiFileChange[] {
  const rows = Array.isArray(changes) ? changes : []
  const normalized: UiFileChange[] = []

  for (const row of rows) {
    const change = row as Record<string, unknown>
    const path = typeof change.path === 'string' ? change.path : ''
    const diff = typeof change.diff === 'string' ? change.diff : ''
    const kind = change.kind as Record<string, unknown> | undefined
    const operationType = kind?.type
    if (!path || (operationType !== 'add' && operationType !== 'delete' && operationType !== 'update')) {
      continue
    }

    const movedToPath =
      operationType === 'update' && typeof kind?.move_path === 'string'
        ? kind.move_path
        : null

    const counts = operationType === 'update'
      ? countUnifiedDiffLines(diff)
      : operationType === 'add'
        ? { addedLineCount: countContentLines(diff), removedLineCount: 0 }
        : { addedLineCount: 0, removedLineCount: countContentLines(diff) }

    normalized.push({
      path,
      operation: operationType,
      movedToPath,
      diff,
      ...counts,
    })
  }

  return normalized
}

function toUiMessages(item: ThreadItem): UiMessage[] {
  if (item.type === 'agentMessage') {
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'userMessage') {
    const parsed = parseUserMessageContent(item.id, item.content as UserInput[] | undefined)
    const messages: UiMessage[] = []
    // round-138：audio / localAudio（音频源）与 mention（@提及）也要计入「有可渲染内容」，
    // 否则「只发了一条语音」或「只 @了一个文件」的用户消息会被整条丢掉。
    const hasRenderableUserContent = parsed.text.length > 0
      || parsed.images.length > 0
      || parsed.fileAttachments.length > 0
      || parsed.skills.length > 0
      || parsed.imageAttachmentIds.length > 0
      || parsed.audioSources.length > 0
      || parsed.mentions.length > 0

    if (hasRenderableUserContent) {
      messages.push({
        id: item.id,
        role: 'user',
        text: parsed.text,
        images: parsed.images,
        skills: parsed.skills.length > 0 ? parsed.skills : undefined,
        fileAttachments: parsed.fileAttachments.length > 0 ? parsed.fileAttachments : undefined,
        imageAttachmentIds: parsed.imageAttachmentIds.length > 0 ? parsed.imageAttachmentIds : undefined,
        audioSources: parsed.audioSources.length > 0 ? parsed.audioSources : undefined,
        mentions: parsed.mentions.length > 0 ? parsed.mentions : undefined,
        messageType: item.type,
        // round-140：把服务端回写的 clientId 带到 UI 层——判别「谁发的」的唯一依据。
        clientId: typeof item.clientId === 'string' && item.clientId.length > 0 ? item.clientId : null,
        isAutomationRun: parsed.isAutomationRun,
        automationDisplayName: parsed.automationDisplayName,
      })
    }

    messages.push(...parsed.rawBlocks)
    if (messages.length === 0) {
      return []
    }

    return messages
  }

  if (item.type === 'imageView') {
    const path = typeof item.path === 'string' ? item.path.trim() : ''
    if (!path) return []
    return [
      {
        id: item.id,
        role: 'assistant',
        text: '',
        images: [toLocalImageUrl(path)],
        messageType: 'imageView',
      },
    ]
  }

  {
    const rawItem = item as unknown as Record<string, unknown>
    if (rawItem.type === 'imageGeneration' || rawItem.type === 'image_generation') {
      const result = typeof rawItem.result === 'string' ? toImageGenerationUrl(rawItem.result) : ''
      if (!result) return []
      return [
        {
          id: item.id,
          role: 'assistant',
          text: '',
          images: [result],
          messageType: 'imageView',
        },
      ]
    }
  }

  if (item.type === 'reasoning') {
    const raw = item as unknown as Record<string, unknown>
    const summary = Array.isArray(raw.summary) ? raw.summary.filter((entry): entry is string => typeof entry === 'string') : []
    const content = Array.isArray(raw.content) ? raw.content.filter((entry): entry is string => typeof entry === 'string') : []
    const summaryText = summary.join('\n').trim()
    const contentText = content.join('\n').trim()
    const text = contentText || summaryText
    if (!text) return []
    return [
      {
        id: item.id,
        role: 'assistant',
        text,
        messageType: 'reasoning',
        reasoning: { summary, content },
      },
    ]
  }

  if (item.type === 'mcpToolCall') {
    const raw = item as unknown as Record<string, unknown>
    const server = typeof raw.server === 'string' ? raw.server : ''
    const tool = typeof raw.tool === 'string' ? raw.tool : ''
    if (!server && !tool) return []
    const rawStatus = raw.status as Record<string, unknown> | string | undefined
    let status: 'inProgress' | 'completed' | 'failed' = 'completed'
    const statusType = typeof rawStatus === 'string' ? rawStatus : rawStatus?.type
    if (statusType === 'inProgress' || statusType === 'in_progress') status = 'inProgress'
    if (statusType === 'failed' || statusType === 'error') status = 'failed'
    const error =
      typeof raw.error === 'object' && raw.error !== null
        ? String((raw.error as Record<string, unknown>).message ?? '')
        : ''
    const durationMs = typeof raw.durationMs === 'number' ? raw.durationMs : null
    return [
      {
        id: item.id,
        role: 'system' as const,
        text: tool,
        messageType: 'toolCall',
        toolCall: { server, tool, status, error, durationMs },
      },
    ]
  }


  if (item.type === 'plan') {
    const text = typeof item.text === 'string' ? item.text : ''
    return [
      {
        id: item.id,
        role: 'assistant',
        text,
        messageType: 'plan',
        plan: parsePlanText(text) ?? undefined,
      },
    ]
  }

  if (item.type === 'commandExecution') {
    const raw = item as Record<string, unknown>
    const status = normalizeCommandStatus(raw.status)
    const cmd = typeof raw.command === 'string' ? raw.command : ''
    const cwd = typeof raw.cwd === 'string' ? raw.cwd : null
    const aggregatedOutput = typeof raw.aggregatedOutput === 'string' ? raw.aggregatedOutput : ''
    const exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : null
    return [
      {
        id: item.id,
        role: 'system' as const,
        text: cmd,
        messageType: 'commandExecution',
        commandExecution: { command: cmd, cwd, status, aggregatedOutput, exitCode, outputSpill: readCommandOutputSpill(raw) },
      },
    ]
  }

  if (item.type === 'fileChange') {
    const fileChanges = toUiFileChanges(item.changes)
    const fileChangeStatus = normalizeFileChangeStatus(item.status)
    if (fileChanges.length === 0 || fileChangeStatus !== 'completed') {
      return []
    }
    return [
      {
        id: item.id,
        role: 'system',
        text: '',
        messageType: 'fileChange',
        fileChangeStatus,
        fileChanges,
      },
    ]
  }

  // Modern codex app-servers surface context compaction as a ContextCompaction
  // turn item instead of the deprecated `thread/compacted` notification. Map it
  // to the same done message used by the in-feed compaction indicator so the
  // spinner is cleared as soon as the compaction lands in persisted messages.
  if (item.type === 'contextCompaction') {
    return [
      {
        id: item.id,
        role: 'system',
        text: '',
        messageType: 'compaction.done',
      },
    ]
  }

  return []
}

function normalizeCommandStatus(value: unknown): CommandExecutionData['status'] {
  if (value === 'completed' || value === 'failed' || value === 'declined' || value === 'interrupted') return value
  if (value === 'inProgress' || value === 'in_progress') return 'inProgress'
  return 'completed'
}

function pickThreadName(summary: Thread): string {
  const rawSummary = summary as Record<string, unknown>
  const direct = [
    rawSummary.name,
    rawSummary.title,
    summary.preview,
  ]
  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}

function toThreadTitle(summary: Thread): string {
  const named = pickThreadName(summary)
  return named.length > 0 ? named : 'Untitled thread'
}

function isTurnInProgress(turn: Turn | null | undefined): boolean {
  return turn?.status === 'inProgress'
}

export function readExternalSessionFromThread(summary: Thread): UiExternalSession | null {
  const rawSummary = summary as Record<string, unknown>
  const raw = rawSummary.externalSession
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const origin = typeof record.origin === 'string' && record.origin.trim().length > 0 ? record.origin.trim() : ''
  if (!origin) return null
  return {
    origin,
    active: record.active === true,
    lastWriteAt: typeof record.lastWriteAt === 'string' ? record.lastWriteAt : null,
  }
}

function isExternalSessionActive(summary: Thread): boolean {
  return readExternalSessionFromThread(summary)?.active === true
}

function readThreadInProgress(summary: Thread): boolean {
  const rawSummary = summary as Record<string, unknown>
  if (rawSummary.inProgress === true) return true
  if (rawSummary.status === 'inProgress' || rawSummary.turnStatus === 'inProgress') return true
  const status = rawSummary.status
  if (status && typeof status === 'object') {
    const statusType = (status as Record<string, unknown>).type
    if (statusType === 'active' || statusType === 'inProgress') return true
  }

  const turns = Array.isArray(summary.turns) ? summary.turns : []
  const lastTurn = turns.at(-1)
  return isTurnInProgress(lastTurn) || isExternalSessionActive(summary)
}

function toUiThread(summary: Thread): UiThread {
  const rawSummary = summary as Record<string, unknown>
  const cwd = normalizePathForUi(typeof rawSummary.cwd === 'string' ? rawSummary.cwd : summary.cwd)
  const comparableCwd = normalizePathForComparison(cwd)
  const hasWorktree =
    rawSummary.isWorktree === true ||
    rawSummary.worktree === true ||
    rawSummary.worktreeId !== undefined ||
    rawSummary.worktreePath !== undefined ||
    comparableCwd.includes('/.codex/worktrees/') ||
    comparableCwd.includes('/.git/worktrees/')

  return {
    id: summary.id,
    title: toThreadTitle(summary),
    projectName: toProjectName(cwd),
    cwd,
    hasWorktree,
    createdAtIso: toIso(summary.createdAt),
    updatedAtIso: toIso(summary.updatedAt),
    preview: summary.preview,
    // round-106：0.156 起服务端已移除 thread/rollback（#44915），historyMode 不再影响
    // 回退分发；缺省按 'paginated' 处理（0.148+ 服务端默认，legacy 仅剩理论值）。
    historyMode: rawSummary.historyMode === 'legacy' ? 'legacy' : 'paginated',
    // round-106：线程创建者身份（0.157 #47113，落 rollout 与 SQLite）。
    originator: typeof rawSummary.originator === 'string' && rawSummary.originator.trim().length > 0
      ? rawSummary.originator.trim()
      : null,
    unread: false,
    inProgress: readThreadInProgress(summary),
    externalSession: readExternalSessionFromThread(summary),
  }
}

export function normalizeThreadSummaryV2(payload: ThreadReadResponse): UiThread {
  return toUiThread(payload.thread)
}

function groupThreadsByProject(threads: UiThread[]): UiProjectGroup[] {
  const grouped = new Map<string, UiThread[]>()
  for (const thread of threads) {
    const rows = grouped.get(thread.projectName)
    if (rows) rows.push(thread)
    else grouped.set(thread.projectName, [thread])
  }

  return Array.from(grouped.entries())
    .map(([projectName, projectThreads]) => ({
      projectName,
      threads: projectThreads.sort(
        (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.threads[0]?.updatedAtIso ?? 0).getTime()
      const bLast = new Date(b.threads[0]?.updatedAtIso ?? 0).getTime()
      return bLast - aLast
    })
}

export function normalizeThreadGroupsV2(payload: ThreadListResponse): UiProjectGroup[] {
  const uiThreads = payload.data.map(toUiThread)
  return groupThreadsByProject(uiThreads)
}

/** round-140：被判为「非用户发出」的 user 消息正文前缀（服务端固定包裹形态）。 */
const AGENT_NOTE_TEXT_PREFIXES = ['<subagent_notification>', '<environment_context>']

/**
 * round-140：判定某条 user 消息是否**不是用户本人发出的**。三条判据任一成立即算，
 * 全部经 0.161.0 实测 + 线上库/rollout 取证：
 *
 * 1. `轮内非首条 && clientId == null` —— codex 的多代理通信
 *    （`collabAgentToolCall{tool:'sendInput', receiverThreadIds:[本会话]}`）会被 app-server
 *    **以 userMessage 条目写进接收会话正在运行的那个 turn**，且不经任何客户端
 *    （线上全库 705 例，clientId 全为 null）。用户本人提交的消息带 `clientUserMessageId`
 *    → clientId 非空，故不会误判；同一 turn 内出现第 2 条 userMessage 本身是**正常**形态
 *    —— `turn/steer` 也会造成，实测它同样把 clientUserMessageId 回写成 clientId。
 * 2. 正文以 `<subagent_notification>` 开头 —— 子代理回报。
 * 3. 正文以 `<environment_context>` 开头 —— 环境注入。
 *
 * 轮内首条**永不**判为注入：即使老数据 / 别的客户端没写 clientId，首条就是用户提问。
 */
function isInjectedUserMessage(message: UiMessage, indexAmongUserMessages: number): boolean {
  const text = message.text.trimStart()
  if (AGENT_NOTE_TEXT_PREFIXES.some((prefix) => text.startsWith(prefix))) return true
  if (indexAmongUserMessages <= 0) return false
  return (message.clientId ?? null) === null
}

export function normalizeThreadMessagesV2(payload: ThreadReadResponse, baseTurnIndex = 0): UiMessage[] {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const messages: UiMessage[] = []
  for (let turnOffset = 0; turnOffset < turns.length; turnOffset++) {
    const turnIndex = baseTurnIndex + turnOffset
    const turn = turns[turnOffset]
    const rawTurnId = typeof turn?.id === 'string' ? turn.id.trim() : ''
    const turnId = rawTurnId.length > 0 ? rawTurnId : undefined
    const items = Array.isArray(turn.items) ? turn.items : []
    // round-106：turn.startedAt（0.157 #47114 生命周期时间戳）供消息行展示时点。
    const turnStartedAtIso = toIsoFromTurnTimestamp(
      (turn as Record<string, unknown> | null | undefined)?.startedAt,
    )
    const turnMessages: UiMessage[] = []
    for (const item of items) {
      for (const msg of toUiMessages(item)) {
        turnMessages.push({ ...msg, turnId, turnIndex, turnStartedAtIso: turnStartedAtIso ?? undefined })
      }
    }
    // round-140：标记「不是用户发的」user 消息。计数只认真正的用户消息条目——
    // rawBlocks（未知 UserInput 变体的兜底）不是独立消息，不参与轮内序号。
    let userMessageOrdinal = 0
    for (const message of turnMessages) {
      if (message.role !== 'user' || message.isUnhandled === true) continue
      if (isInjectedUserMessage(message, userMessageOrdinal)) message.isAgentNote = true
      userMessageOrdinal += 1
    }
    const errorText = readTurnErrorText(turn)
    if (turn.status === 'failed' && errorText) {
      const errorIdBase = turnId ?? `turn-${turnIndex}`
      turnMessages.push({
        id: `${errorIdBase}-error`,
        role: 'system',
        text: errorText,
        messageType: 'turnError',
        turnId,
        turnIndex,
        turnStartedAtIso: turnStartedAtIso ?? undefined,
      })
    }
    // Keep the server-provided item order: the app-server (and the bridge's
    // session-log recovery) already persists a turn chronologically, so
    // assistant text and tool/command items interleave naturally. Re-grouping
    // them here stacks all work items together, which reads as disconnected.
    messages.push(...turnMessages)
  }
  // A thread accumulates one ContextCompaction item per compaction run. Keep
  // only the most recent one in the feed so repeated compactions do not stack
  // up rows of "Context compacted"; older summaries are superseded.
  // round-30：服务端把 contextCompaction 固定在 turn items 末尾，刷新后压缩块
  // 会跑到对话最后（与压缩实际发生时点不符）。归一化后把它移到该轮第一条
  // 用户消息之后——压缩是 turn 边界动作，语义上属于轮首，刷新前后位置一致。
  return repositionCompactionAfterUserMessage(collapseCompactionDoneMessages(messages))
}

function collapseCompactionDoneMessages(messages: UiMessage[]): UiMessage[] {
  let lastCompactionIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.messageType === 'compaction.done') {
      lastCompactionIndex = index
      break
    }
  }
  if (lastCompactionIndex < 0) return messages
  return messages.filter((message, index) => (
    message.messageType !== 'compaction.done' || index === lastCompactionIndex
  ))
}

// round-30：把保留的 compaction.done 移到其所属轮次第一条用户消息之后。
// 服务端把 ContextCompaction item 追加在 turn items 末尾，若直接按服务端顺序
// 渲染，刷新后「Context compacted」会出现在整个对话的最后。压缩在 turn 边界
// 发生，把它归位到该轮用户消息之后，刷新前（live 注入位置）与刷新后一致。
function repositionCompactionAfterUserMessage(messages: UiMessage[]): UiMessage[] {
  let compactionIndex = -1
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.messageType === 'compaction.done') {
      compactionIndex = index
      break
    }
  }
  if (compactionIndex < 0) return messages
  const compaction = messages[compactionIndex]
  const turnIndex = compaction.turnIndex
  let userMessageIndex = -1
  for (let index = 0; index < messages.length; index += 1) {
    const candidate = messages[index]
    if (
      candidate?.turnIndex === turnIndex
      && candidate?.role === 'user'
      && candidate?.isAgentNote !== true
    ) {
      userMessageIndex = index
      break
    }
  }
  // 无同轮用户消息（异常数据）或压缩块已在用户消息之后 → 保持原顺序。
  if (userMessageIndex < 0 || compactionIndex <= userMessageIndex) return messages
  const next = messages.filter((_, index) => index !== compactionIndex)
  next.splice(userMessageIndex + 1, 0, compaction)
  return next
}

export function readThreadInProgressFromResponse(payload: ThreadReadResponse): boolean {
  if (readThreadInProgress(payload.thread)) return true
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  return isTurnInProgress(turns.at(-1))
}

export function readExternalSessionFromResponse(payload: ThreadReadResponse): UiExternalSession | null {
  return readExternalSessionFromThread(payload.thread)
}

export function readActiveTurnIdFromResponse(payload: ThreadReadResponse): string {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (isTurnInProgress(turn) && typeof turn.id === 'string' && turn.id.trim().length > 0) {
      return turn.id.trim()
    }
  }
  return ''
}
