import { getErrorMessageFromPayload, readJsonResponse } from './core'
import { normalizePathForUi } from '../../pathUtils.js'
import { invalidateWorkspaceRootsStateCache } from './git'

export type LocalDirectoryEntry = {
  name: string
  path: string
}

export type LocalDirectoryListing = {
  path: string
  parentPath: string
  entries: LocalDirectoryEntry[]
}

export type WorkspaceFileEntry = {
  path: string
  relativePath: string
  isDirectory: boolean
}

export type LocalFilePreview = {
  path: string
  name: string
  size: number
  isText: boolean
  isImage: boolean
  content?: string
  truncated: boolean
}

export async function getHomeDirectory(): Promise<string> {
  const response = await fetch('/codex-api/home-directory')
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error('Failed to load home directory')
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  return typeof data.path === 'string' ? data.path.trim() : ''
}

export async function listLocalDirectories(path: string, options?: { showHidden?: boolean }): Promise<LocalDirectoryListing> {
  const query = new URLSearchParams({ path })
  if (options?.showHidden === true) {
    query.set('showHidden', '1')
  }
  const response = await fetch(`/codex-local-directories?${query.toString()}`)
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to load local directories')
    throw new Error(message)
  }

  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  const entriesRaw = Array.isArray(data.entries) ? data.entries : []

  return {
    path: typeof data.path === 'string' ? normalizePathForUi(data.path) : '',
    parentPath: typeof data.parentPath === 'string' ? normalizePathForUi(data.parentPath) : '',
    entries: entriesRaw.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      const entryPath = typeof record.path === 'string' ? normalizePathForUi(record.path) : ''
      return name && entryPath ? [{ name, path: entryPath }] : []
    }),
  }
}

export async function listWorkspaceFiles(cwd: string): Promise<WorkspaceFileEntry[]> {
  const query = new URLSearchParams({ path: cwd })
  const response = await fetch(`/codex-local-files?${query.toString()}`)
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to load workspace files')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data = record.data
  const entriesRaw = Array.isArray(data) ? data : []
  return entriesRaw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const path = typeof record.path === 'string' ? normalizePathForUi(record.path) : ''
    const relativePath = typeof record.relativePath === 'string' ? record.relativePath.trim() : ''
    if (!path || !relativePath) return []
    return [{
      path,
      relativePath,
      isDirectory: record.isDirectory === true,
    }]
  })
}

export async function previewLocalFile(filePath: string): Promise<LocalFilePreview> {
  const query = new URLSearchParams({ path: filePath })
  const response = await fetch(`/codex-local-preview?${query.toString()}`)
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to preview file')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data = record.data
  const preview =
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  return {
    path: typeof preview.path === 'string' ? preview.path : filePath,
    name: typeof preview.name === 'string' ? preview.name : '',
    size: typeof preview.size === 'number' ? preview.size : 0,
    isText: preview.isText === true,
    isImage: preview.isImage === true,
    content: typeof preview.content === 'string' ? preview.content : undefined,
    truncated: preview.truncated === true,
  }
}

export async function createLocalDirectory(path: string): Promise<string> {
  const response = await fetch('/codex-api/local-directory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to create local directory')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  const normalizedPath = typeof data.path === 'string' ? normalizePathForUi(data.path) : ''
  if (normalizedPath) {
    invalidateWorkspaceRootsStateCache()
  }
  return normalizedPath
}

export async function cloneGithubRepository(url: string, basePath: string): Promise<string> {
  const response = await fetch('/codex-api/github-clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, basePath }),
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to clone GitHub repository')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  return typeof data.path === 'string' ? normalizePathForUi(data.path) : ''
}

export async function createProjectlessThreadDirectory(prompt?: string): Promise<{ cwd: string; outputDirectory: string; workspaceRoot: string }> {
  const response = await fetch('/codex-api/projectless-thread-cwd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt ?? null }),
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to create new chat folder')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  const cwd = typeof data.cwd === 'string' ? normalizePathForUi(data.cwd) : ''
  if (!cwd) {
    throw new Error('Failed to create new chat folder')
  }
  return {
    cwd,
    outputDirectory: typeof data.outputDirectory === 'string' ? normalizePathForUi(data.outputDirectory) : cwd,
    workspaceRoot: typeof data.workspaceRoot === 'string' ? normalizePathForUi(data.workspaceRoot) : '',
  }
}

export async function getProjectRootSuggestion(basePath: string): Promise<{ name: string; path: string }> {
  const query = new URLSearchParams({ basePath })
  const response = await fetch(`/codex-api/project-root-suggestion?${query.toString()}`)
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to suggest project name')
    throw new Error(message)
  }
  const record =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const data =
    record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {}
  return {
    name: typeof data.name === 'string' ? data.name.trim() : '',
    path: typeof data.path === 'string' ? normalizePathForUi(data.path) : '',
  }
}