// round-138：`{ type:'image', fileId }` 图片的**机会性解析**（服务端一趟）。
//
// 背景（round-137 遗留的「待办 1」）：0.161.0 的 UserInput.image 变体是
// `{ url } | { fileId }`；只有 fileId 时 UI 上曾静默消失，round-137 已让它渲染成
// 「不可预览」的虚线占位。本轮把它从「永远占位」推进到「能解析就出图」。
//
// 为什么可以解析（而不是 round-137 判定的「协议上不可行」）——本轮取证后修正：
// 附件面确实只有 thread/attachment/{add,list,remove}，payload 是 opaque JsonValue、
// 没有内容取回端点；**但正因如此，任何客户端想让这张图有意义，就只能把可解析的内容
// 放进 payload**（否则附件对谁都没用）。实测 `state_5.sqlite` 的 `thread_attachments`
// 表结构 = (id, thread_id, attachment_type, identity_key, payload, created_at)，即
// 纯「客户端写的 KV」。
//
// 因此本模块**不猜字段名**，只按「值的形态」识别：payload 里任意字符串若是
//   ① `data:image/*` / `data:video/*` 的内联数据 URL，或
//   ② 指向存在性无关的**绝对路径**且扩展名在本仓 `/codex-local-image` 白名单内，
// 就认定可渲染。命中即把该 block 重写成 `{ type:'image', url }`，交给既有渲染分支；
// 未命中则**原样返回**，UI 继续走 round-137 的占位 ⇒ 行为严格单调变好。
import { asRecord } from './core.js'

/** 一次 thread/attachment/list 最多取多少条（与 turn 页钳位同一量级）。 */
export const THREAD_ATTACHMENT_LOOKUP_LIMIT = 200

/** `/codex-local-image` 的扩展名白名单（与 httpServer.ts 的 IMAGE_CONTENT_TYPES 对齐）。 */
const LOCAL_IMAGE_EXTENSIONS = new Set([
  '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp',
  '.mp4', '.m4v', '.webm', '.mov', '.mkv', '.ogv', '.mpeg', '.avi',
])

/** 遍历上限：payload 结构未知，必须有界。 */
const MAX_PAYLOAD_NODES = 200
const MAX_PAYLOAD_DEPTH = 6

function toLocalImageProxyUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

function extensionOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

function isAbsoluteLocalPath(value: string): boolean {
  if (value.startsWith('\\\\')) return true // UNC
  if (/^[A-Za-z]:[\\/]/u.test(value)) return true // Windows 盘符
  return value.startsWith('/')
}

function stripFileUrl(value: string): string | null {
  if (!/^file:\/\//iu.test(value)) return null
  try {
    const parsed = new URL(value)
    const decoded = decodeURIComponent(parsed.pathname)
    if (/^\/[A-Za-z]:\//u.test(decoded)) return decoded.slice(1)
    return decoded
  } catch {
    return null
  }
}

/**
 * 从**值的形态**上判断某个字符串能否当图片/视频源用。不依赖任何字段名。
 * 返回 `<img src>` 可直接使用的值，或 null。
 */
export function toRenderableMediaSource(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  if (/^data:(image|video)\//iu.test(trimmed)) return trimmed
  if (/^https?:\/\//iu.test(trimmed)) return trimmed

  const fromFileUrl = stripFileUrl(trimmed)
  const candidate = fromFileUrl ?? trimmed
  if (!isAbsoluteLocalPath(candidate)) return null
  if (!LOCAL_IMAGE_EXTENSIONS.has(extensionOf(candidate))) return null
  return toLocalImageProxyUrl(candidate)
}

/** 在 payload 里按值的形态找第一个可渲染的媒体源；找不到返回 null。 */
export function extractRenderableAttachmentSource(payload: unknown): string | null {
  let visited = 0
  const stack: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }]

  while (stack.length > 0 && visited < MAX_PAYLOAD_NODES) {
    const next = stack.shift()
    if (!next) break
    visited += 1
    const { value, depth } = next

    if (typeof value === 'string') {
      const source = toRenderableMediaSource(value)
      if (source) return source
      continue
    }
    if (depth >= MAX_PAYLOAD_DEPTH) continue

    if (Array.isArray(value)) {
      for (const entry of value) stack.push({ value: entry, depth: depth + 1 })
      continue
    }
    const record = asRecord(value)
    if (!record) continue
    for (const entry of Object.values(record)) stack.push({ value: entry, depth: depth + 1 })
  }

  return null
}

/** attachment.id 优先、identityKey 次之（两者都可能是 block 里的 fileId）。 */
function buildFileIdSourceMap(attachments: unknown): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(attachments)) return map
  for (const entry of attachments) {
    const record = asRecord(entry)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const identityKey = typeof record.identityKey === 'string' ? record.identityKey.trim() : ''
    if (!id && !identityKey) continue
    const source = extractRenderableAttachmentSource(record.payload)
    if (!source) continue
    if (id && !map.has(id)) map.set(id, source)
    if (identityKey && !map.has(identityKey)) map.set(identityKey, source)
  }
  return map
}

type FileIdImageBlock = { record: Record<string, unknown> }

/** 收集所有 `{ type:'image', fileId }`（无 url）的 block，供替换时定位。 */
function collectFileIdImageBlocks(value: unknown): FileIdImageBlock[] {
  const found: FileIdImageBlock[] = []
  let visited = 0
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]

  while (stack.length > 0 && visited < 5000) {
    const next = stack.shift()
    if (!next) break
    visited += 1
    const { value: node, depth } = next
    if (typeof node === 'string' || node === null || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      for (const entry of node) stack.push({ value: entry, depth: depth + 1 })
      continue
    }
    const record = asRecord(node)
    if (!record) continue
    const type = typeof record.type === 'string' ? record.type : ''
    const fileId = typeof record.fileId === 'string' ? record.fileId.trim() : ''
    if (type === 'image' && fileId.length > 0 && record.url === undefined) {
      found.push({ record })
      continue
    }
    if (depth >= 12) continue
    for (const entry of Object.values(record)) stack.push({ value: entry, depth: depth + 1 })
  }
  return found
}

/**
 * 主入口：线程读结果里若有 `{ type:'image', fileId }`，则查一次该线程的附件表，
 * 命中可渲染内容就把 block 重写为 `{ type:'image', url }`；否则**原样返回**。
 *
 * 无 fileId ⇒ 一次 RPC 都不发。`listAttachments` 抛错一律吞掉（best-effort）。
 * 重写是**幂等**的：已重写的 block 不再带 fileId，第二趟直接返回原对象。
 */
export async function resolveFileIdImageBlocksInThreadResult(
  result: unknown,
  listAttachments: (threadId: string) => Promise<unknown>,
): Promise<unknown> {
  const blocks = collectFileIdImageBlocks(result)
  if (blocks.length === 0) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const threadId = typeof thread?.id === 'string' ? thread.id.trim() : ''
  if (!threadId) return result

  let attachments: unknown = null
  try {
    attachments = await listAttachments(threadId)
  } catch {
    return result
  }

  const sourceByFileId = buildFileIdSourceMap(attachments)
  if (sourceByFileId.size === 0) return result

  for (const { record: block } of blocks) {
    const fileId = typeof block.fileId === 'string' ? block.fileId.trim() : ''
    const source = sourceByFileId.get(fileId)
    if (!source) continue
    delete block.fileId
    block.type = 'image'
    block.url = source
  }
  return result
}
