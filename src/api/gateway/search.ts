import { callRpc, getErrorMessageFromPayload } from './core'

export type ComposerFileSuggestion = {
  path: string
}

export type FuzzyFileSearchSession = {
  sessionId: string
  query: string
  files: ComposerFileSuggestion[]
}

const IGNORED_FILE_SEARCH_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '__pycache__', '.cache', '.turbo', 'target', '.venv',
  'venv', '.idea', '.vscode', 'output',
])

/**
 * Returns true when a candidate file path contains an ignored directory
 * segment (hidden dirs, VCS internals, dependency/generated folders).
 * The app-server fuzzy file search session does not exclude these, so the
 * @ file mention list would otherwise surface e.g. `.git/refs/heads`.
 */
export function isIgnoredFileSearchPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/')
  return normalized
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.startsWith('.') || IGNORED_FILE_SEARCH_DIRS.has(segment))
}

export function normalizeFuzzyFileSearchResults(payload: unknown): ComposerFileSuggestion[] {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
  const files = Array.isArray(record.files) ? record.files : []
  const suggestions: ComposerFileSuggestion[] = []
  for (const item of files) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const rawPath = row.path
    const value = typeof rawPath === 'string' ? rawPath.trim() : ''
    if (!value || isIgnoredFileSearchPath(value)) continue
    suggestions.push({ path: value })
  }
  return suggestions
}

export async function startFuzzyFileSearchSession(roots: string[], sessionId: string): Promise<void> {
  await callRpc('fuzzyFileSearch/sessionStart', {
    sessionId,
    roots,
  })
}

export async function updateFuzzyFileSearchSession(sessionId: string, query: string): Promise<void> {
  await callRpc('fuzzyFileSearch/sessionUpdate', {
    sessionId,
    query,
  })
}

export async function stopFuzzyFileSearchSession(sessionId: string): Promise<void> {
  await callRpc('fuzzyFileSearch/sessionStop', { sessionId }).catch(() => undefined)
}

export async function searchComposerFiles(cwd: string, query: string, limit = 20): Promise<ComposerFileSuggestion[]> {
  const trimmedCwd = cwd.trim()
  if (!trimmedCwd) return []
  const response = await fetch('/codex-api/composer-file-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cwd: trimmedCwd,
      query: query.trim(),
      limit,
    }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to search files')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data = Array.isArray(record.data) ? record.data : []
  const suggestions: ComposerFileSuggestion[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const rawPath = row.path
    const value = typeof rawPath === 'string' ? rawPath.trim() : ''
    if (!value || isIgnoredFileSearchPath(value)) continue
    suggestions.push({ path: value })
  }
  return suggestions
}

export type ThreadSearchResult = {
  threadIds: string[]
  indexedThreadCount: number
}

export async function searchThreads(
  query: string,
  limit = 200,
): Promise<ThreadSearchResult> {
  const response = await fetch('/codex-api/thread-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  })
  const payload = (await response.json()) as { data?: ThreadSearchResult; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to search threads')
  }
  return payload.data ?? { threadIds: [], indexedThreadCount: 0 }
}