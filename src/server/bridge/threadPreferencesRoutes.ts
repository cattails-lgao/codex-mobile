// Thread search / title / pins / reasoning / first-launch-plugins-card route
// family, sliced out of createCodexBridgeMiddleware. This is the thread
// 搜索/状态/偏好 domain: routing + the cross-browser persisted caches it reads
// and writes. The HTTP-shell-only pieces (setJson / readJsonBody / the narrow
// appServer rpc facade / the closure-owned thread-search index) are injected via
// ThreadPrefsRoutesDeps; shared global-state persistence helpers
// (getCodexGlobalStatePath / normalizeStringArray) and asRecord come from
// bridge/core.ts. The four title-cache helpers reused by the project family
// (readMergedThreadTitleCache / readThreadTitleCache / writeThreadTitleCache /
// updateThreadTitleCache) are re-exported for the bridge shell to import.
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { asRecord, getCodexGlobalStatePath, getCodexHomeDir, normalizeStringArray } from './core.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>

// --- thread-preference persisted caches (cross-browser shared) ---

const MAX_THREAD_TITLES = 500
const MAX_REASONING_MESSAGES_PER_THREAD = 20
const PINNED_THREAD_IDS_KEY = 'pinned-thread-ids'
const THREAD_REASONING_KEY = 'thread-reasoning'
const FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY = 'first-launch-plugins-card-dismissed'

type ThreadTitleCache = { titles: Record<string, string>; order: string[] }
const EMPTY_THREAD_TITLE_CACHE: ThreadTitleCache = { titles: {}, order: [] }
type ThreadReasoningArchive = Record<string, unknown[]>

type StoredThreadTitle = {
  id: string
  title: string
  updatedAtMs: number
}

type SessionIndexThreadTitleCacheState = {
  fileSignature: string | null
  cache: ThreadTitleCache
}

let sessionIndexThreadTitleCacheState: SessionIndexThreadTitleCacheState = {
  fileSignature: null,
  cache: EMPTY_THREAD_TITLE_CACHE,
}

function getCodexSessionIndexPath(): string {
  return join(getCodexHomeDir(), 'session_index.jsonl')
}

function normalizeThreadTitleCache(value: unknown): ThreadTitleCache {
  const record = asRecord(value)
  if (!record) return EMPTY_THREAD_TITLE_CACHE
  const rawTitles = asRecord(record.titles)
  const titles: Record<string, string> = {}
  if (rawTitles) {
    for (const [k, v] of Object.entries(rawTitles)) {
      if (typeof v === 'string' && v.length > 0) titles[k] = v
    }
  }
  const order = normalizeStringArray(record.order)
  return { titles, order }
}

function normalizeThreadReasoningArchive(value: unknown): ThreadReasoningArchive {
  const record = asRecord(value)
  if (!record) return {}
  const next: ThreadReasoningArchive = {}
  for (const [threadId, rows] of Object.entries(record)) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    const sanitized = rows
      .filter((row) => asRecord(row) !== null)
      .slice(-MAX_REASONING_MESSAGES_PER_THREAD)
    if (sanitized.length > 0) next[threadId] = sanitized
  }
  return next
}

function normalizePinnedThreadIds(value: unknown): string[] {
  return normalizeStringArray(value)
}

function normalizeStoredThreadTitle(value: unknown): StoredThreadTitle | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const title = typeof record.thread_name === 'string' ? record.thread_name.trim() : ''
  const updatedAtIso = typeof record.updated_at === 'string' ? record.updated_at.trim() : ''
  const updatedAtMs = updatedAtIso ? Date.parse(updatedAtIso) : Number.NaN

  if (!id || !title) return null
  return {
    id,
    title,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
  }
}

export function updateThreadTitleCache(cache: ThreadTitleCache, id: string, title: string): ThreadTitleCache {
  const titles = { ...cache.titles, [id]: title }
  const order = [id, ...cache.order.filter((o) => o !== id)]
  while (order.length > MAX_THREAD_TITLES) {
    const removed = order.pop()
    if (removed) delete titles[removed]
  }
  return { titles, order }
}

function removeFromThreadTitleCache(cache: ThreadTitleCache, id: string): ThreadTitleCache {
  const { [id]: _, ...titles } = cache.titles
  return { titles, order: cache.order.filter((o) => o !== id) }
}

function trimThreadTitleCache(cache: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...cache.titles }
  const order = cache.order.filter((id) => {
    if (!titles[id]) return false
    return true
  }).slice(0, MAX_THREAD_TITLES)

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      delete titles[id]
    }
  }

  return { titles, order }
}

function mergeThreadTitleCaches(base: ThreadTitleCache, overlay: ThreadTitleCache): ThreadTitleCache {
  const titles = { ...base.titles, ...overlay.titles }
  const order: string[] = []

  for (const id of [...overlay.order, ...base.order]) {
    if (!titles[id] || order.includes(id)) continue
    order.push(id)
  }

  for (const id of Object.keys(titles)) {
    if (!order.includes(id)) {
      order.push(id)
    }
  }

  return trimThreadTitleCache({ titles, order })
}

export async function readThreadTitleCache(): Promise<ThreadTitleCache> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadTitleCache(payload['thread-titles'])
  } catch {
    return EMPTY_THREAD_TITLE_CACHE
  }
}

export async function writeThreadTitleCache(cache: ThreadTitleCache): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  payload['thread-titles'] = cache
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function readPinnedThreadIds(): Promise<string[]> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizePinnedThreadIds(payload[PINNED_THREAD_IDS_KEY])
  } catch {
    return []
  }
}

async function writePinnedThreadIds(threadIds: string[]): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload[PINNED_THREAD_IDS_KEY] = normalizePinnedThreadIds(threadIds)
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

// round-23：跨浏览器共享的思考存档。app-server 不把 reasoning 持久化到
// thread/read（只有流式通知），前端存档只写 localStorage 时换浏览器即丢失；
// 这里把存档镜像一份到桥接层的全局状态文件（与 thread-titles/pins 同源），
// 供同一台机器上的其他浏览器/会话加载。
async function readThreadReasoningArchive(): Promise<ThreadReasoningArchive> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadReasoningArchive(payload[THREAD_REASONING_KEY])
  } catch {
    return {}
  }
}

async function writeThreadReasoningArchive(archive: ThreadReasoningArchive): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  const normalized = normalizeThreadReasoningArchive(archive)
  if (Object.keys(normalized).length > 0) {
    payload[THREAD_REASONING_KEY] = normalized
  } else {
    delete payload[THREAD_REASONING_KEY]
  }
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

async function mergeThreadReasoningArchive(threadId: string, messages: unknown[]): Promise<void> {
  const archive = await readThreadReasoningArchive()
  const rows = Array.isArray(messages) ? messages.filter((row) => asRecord(row) !== null) : []
  if (rows.length > 0) {
    archive[threadId] = rows.slice(-MAX_REASONING_MESSAGES_PER_THREAD)
  } else {
    delete archive[threadId]
  }
  await writeThreadReasoningArchive(archive)
}

async function readFirstLaunchPluginsCardDismissed(): Promise<boolean> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return payload[FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY] === true
  } catch {
    return false
  }
}

async function writeFirstLaunchPluginsCardDismissed(dismissed: boolean): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  payload[FIRST_LAUNCH_PLUGINS_CARD_DISMISSED_KEY] = dismissed === true
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

function getSessionIndexFileSignature(stats: { mtimeMs: number; size: number }): string {
  return `${String(stats.mtimeMs)}:${String(stats.size)}`
}

async function parseThreadTitlesFromSessionIndex(sessionIndexPath: string): Promise<ThreadTitleCache> {
  const latestById = new Map<string, StoredThreadTitle>()
  const input = createReadStream(sessionIndexPath, { encoding: 'utf8' })
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const entry = normalizeStoredThreadTitle(JSON.parse(trimmed) as unknown)
        if (!entry) continue

        const previous = latestById.get(entry.id)
        if (!previous || entry.updatedAtMs >= previous.updatedAtMs) {
          latestById.set(entry.id, entry)
        }
      } catch {
        // Skip malformed lines and keep scanning the rest of the index.
      }
    }
  } finally {
    lines.close()
    input.close()
  }

  const entries = Array.from(latestById.values()).sort((first, second) => second.updatedAtMs - first.updatedAtMs)
  const titles: Record<string, string> = {}
  const order: string[] = []
  for (const entry of entries) {
    titles[entry.id] = entry.title
    order.push(entry.id)
  }

  return trimThreadTitleCache({ titles, order })
}

async function readThreadTitlesFromSessionIndex(): Promise<ThreadTitleCache> {
  const sessionIndexPath = getCodexSessionIndexPath()

  try {
    const stats = await stat(sessionIndexPath)
    const fileSignature = getSessionIndexFileSignature(stats)
    if (sessionIndexThreadTitleCacheState.fileSignature === fileSignature) {
      return sessionIndexThreadTitleCacheState.cache
    }

    const cache = await parseThreadTitlesFromSessionIndex(sessionIndexPath)
    sessionIndexThreadTitleCacheState = { fileSignature, cache }
    return cache
  } catch {
    sessionIndexThreadTitleCacheState = {
      fileSignature: 'missing',
      cache: EMPTY_THREAD_TITLE_CACHE,
    }
    return sessionIndexThreadTitleCacheState.cache
  }
}

export async function readMergedThreadTitleCache(): Promise<ThreadTitleCache> {
  const [sessionIndexCache, persistedCache] = await Promise.all([
    readThreadTitlesFromSessionIndex(),
    readThreadTitleCache(),
  ])
  return mergeThreadTitleCaches(persistedCache, sessionIndexCache)
}

// --- thread search ---

type ThreadPrefsSearchDocument = {
  title: string
  preview: string
  messageText: string
}

type ThreadPrefsSearchIndex = {
  docsById: Map<string, ThreadPrefsSearchDocument>
}

function isExactPhraseMatch(query: string, doc: ThreadPrefsSearchDocument): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return (
    doc.title.toLowerCase().includes(q) ||
    doc.preview.toLowerCase().includes(q) ||
    doc.messageText.toLowerCase().includes(q)
  )
}

// --- routes ---

export type ThreadPreferencesRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
  appServer: {
    rpc: (method: string, params: unknown) => Promise<unknown>
  }
  getThreadSearchIndex: () => Promise<ThreadPrefsSearchIndex>
}

export async function handleThreadPreferencesHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: ThreadPreferencesRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody, appServer, getThreadSearchIndex } = deps

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-titles') {
    const cache = await readMergedThreadTitleCache()
    setJson(res, 200, { data: cache })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/thread-titles') {
    const payload = asRecord(await readJsonBody(req))
    const id = typeof payload?.id === 'string' ? payload.id : ''
    const title = typeof payload?.title === 'string' ? payload.title : ''
    if (!id) {
      setJson(res, 400, { error: 'Missing id' })
      return true
    }
    const cache = await readThreadTitleCache()
    const next = title ? updateThreadTitleCache(cache, id, title) : removeFromThreadTitleCache(cache, id)
    await writeThreadTitleCache(next)
    setJson(res, 200, { ok: true })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-pins') {
    const threadIds = await readPinnedThreadIds()
    setJson(res, 200, { data: { threadIds } })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/thread-pins') {
    const payload = asRecord(await readJsonBody(req))
    const threadIds = normalizePinnedThreadIds(payload?.threadIds)
    await writePinnedThreadIds(threadIds)
    setJson(res, 200, { ok: true })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-reasoning') {
    const archive = await readThreadReasoningArchive()
    setJson(res, 200, { data: archive })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/thread-reasoning') {
    const payload = asRecord(await readJsonBody(req))
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
    if (!threadId) {
      setJson(res, 400, { error: 'Missing threadId' })
      return true
    }
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    await mergeThreadReasoningArchive(threadId, messages)
    setJson(res, 200, { ok: true })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/preferences/first-launch-plugins-card') {
    const dismissed = await readFirstLaunchPluginsCardDismissed()
    setJson(res, 200, { data: { dismissed } })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/preferences/first-launch-plugins-card') {
    const payload = asRecord(await readJsonBody(req))
    const dismissed = payload?.dismissed === true
    await writeFirstLaunchPluginsCardDismissed(dismissed)
    setJson(res, 200, { ok: true })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/thread-search') {
    const payload = asRecord(await readJsonBody(req))
    const query = typeof payload?.query === 'string' ? payload.query.trim() : ''
    const limitRaw = typeof payload?.limit === 'number' ? payload.limit : 200
    const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)))
    if (!query) {
      setJson(res, 200, { data: { threadIds: [], indexedThreadCount: 0 } })
      return true
    }

    // Prefer the official thread/search RPC; fall back to the local index
    // when the app-server does not expose it (older Codex CLI versions).
    let matchedIds: string[]
    let indexedThreadCount: number
    try {
      const searchResult = asRecord(await appServer.rpc('thread/search', {
        searchTerm: query,
        limit,
      }))
      const data = Array.isArray(searchResult?.data) ? searchResult.data : []
      matchedIds = data
        .map((item) => {
          const thread = asRecord(asRecord(item)?.thread)
          return typeof thread?.id === 'string' ? thread.id : ''
        })
        .filter((id) => id.length > 0)
      // The official RPC does not expose an indexed count; keep the field for
      // shape compatibility with the local-index fallback.
      indexedThreadCount = 0
    } catch {
      const index = await getThreadSearchIndex()
      matchedIds = Array.from(index.docsById.entries())
        .filter(([, doc]) => isExactPhraseMatch(query, doc))
        .slice(0, limit)
        .map(([id]) => id)
      indexedThreadCount = index.docsById.size
    }

    setJson(res, 200, { data: { threadIds: matchedIds, indexedThreadCount } })
    return true
  }

  return false
}