import { getErrorMessageFromPayload, readJsonResponse } from './core'
import { normalizePathForUi } from '../../pathUtils.js'

export type WorkspaceRootsState = {
  order: string[]
  labels: Record<string, string>
  active: string[]
  projectOrder: string[]
  remoteProjects?: Array<{
    id: string
    hostId: string
    remotePath: string
    label: string
  }>
}

let workspaceRootsStatePromise: Promise<WorkspaceRootsState> | null = null
let cachedWorkspaceRootsState: WorkspaceRootsState | null = null

export type WorktreeCreateResult = {
  cwd: string
  branch: string | null
  gitRoot: string
}

export type WorktreeBranchOption = {
  value: string
  label: string
  isCurrent?: boolean
  isRemote?: boolean
}

export type GitBranchState = {
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  gitRoot: string
  options: WorktreeBranchOption[]
  changedFiles: GitCommitFileChange[]
}

export type GitCommitOption = {
  sha: string
  shortSha: string
  subject: string
  date: string
}

export type GitCommitFileChange = {
  path: string
  previousPath: string | null
  status: string
  label: string
  addedLineCount: number | null
  removedLineCount: number | null
}

export type GitRepositoryStatus = {
  isGitRepo: boolean
  gitRoot: string
}

function normalizeWorkspaceRootsState(payload: unknown): WorkspaceRootsState {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}

  const normalizeArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    const next: string[] = []
    for (const item of value) {
      if (typeof item === 'string' && item.length > 0 && !next.includes(item)) {
        next.push(item)
      }
    }
    return next
  }

  const labelsRaw = record.labels
  const labels: Record<string, string> = {}
  if (labelsRaw && typeof labelsRaw === 'object' && !Array.isArray(labelsRaw)) {
    for (const [key, value] of Object.entries(labelsRaw as Record<string, unknown>)) {
      const normalizedKey = typeof key === 'string' ? normalizePathForUi(key) : ''
      if (normalizedKey.length > 0 && typeof value === 'string') {
        labels[normalizedKey] = value
      }
    }
  }

  return {
    order: normalizeArray(record.order).map((value) => normalizePathForUi(value)),
    labels,
    active: normalizeArray(record.active).map((value) => normalizePathForUi(value)),
    projectOrder: normalizeArray(record.projectOrder).map((value) => normalizePathForUi(value)),
    remoteProjects: Array.isArray(record.remoteProjects)
      ? record.remoteProjects.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const remote = item as Record<string, unknown>
        const id = typeof remote.id === 'string' ? remote.id.trim() : ''
        if (!id) return []
        return [{
          id,
          hostId: typeof remote.hostId === 'string' ? remote.hostId.trim() : '',
          remotePath: typeof remote.remotePath === 'string' ? normalizePathForUi(remote.remotePath) : '',
          label: typeof remote.label === 'string' ? remote.label.trim() : '',
        }]
      })
      : [],
  }
}

export async function getWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  if (cachedWorkspaceRootsState) {
    return cloneWorkspaceRootsState(cachedWorkspaceRootsState)
  }
  if (!workspaceRootsStatePromise) {
    workspaceRootsStatePromise = fetchWorkspaceRootsState()
      .then((state) => {
        cachedWorkspaceRootsState = state
        return state
      })
      .finally(() => {
        workspaceRootsStatePromise = null
      })
  }
  return cloneWorkspaceRootsState(await workspaceRootsStatePromise)
}

async function fetchWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  const response = await fetch('/codex-api/workspace-roots-state')
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error('Failed to load workspace roots state')
  }
  const envelope =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  return normalizeWorkspaceRootsState(envelope.data)
}

function cloneWorkspaceRootsState(state: WorkspaceRootsState): WorkspaceRootsState {
  return {
    order: [...state.order],
    labels: { ...state.labels },
    active: [...state.active],
    projectOrder: [...state.projectOrder],
    remoteProjects: state.remoteProjects?.map((item) => ({ ...item })) ?? [],
  }
}

// invalidateWorkspaceRootsStateCache is cross-domain shared and exported here so
// the files-domain methods (previewLocalFile/createLocalDirectory/cloneGithubRepository)
// can invalidate the single shared cache instance defined in this module.
export function invalidateWorkspaceRootsStateCache(): void {
  cachedWorkspaceRootsState = null
}

export async function createWorktree(sourceCwd: string, baseBranch?: string): Promise<WorktreeCreateResult> {
  const normalizedBaseBranch = (baseBranch ?? '').trim()
  const response = await fetch('/codex-api/worktree/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceCwd,
      baseBranch: normalizedBaseBranch || undefined,
    }),
  })
  const payload = (await response.json()) as { data?: WorktreeCreateResult; error?: string }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error || 'Failed to create worktree')
  }
  return {
    ...payload.data,
    cwd: normalizePathForUi(payload.data.cwd),
    gitRoot: normalizePathForUi(payload.data.gitRoot),
  }
}

export async function createPermanentWorktree(sourceCwd: string, worktreeName: string): Promise<WorktreeCreateResult> {
  const response = await fetch('/codex-api/worktree/create-permanent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceCwd,
      worktreeName,
    }),
  })
  const payload = (await response.json()) as { data?: WorktreeCreateResult; error?: string }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error || 'Failed to create worktree')
  }
  return {
    ...payload.data,
    cwd: normalizePathForUi(payload.data.cwd),
    gitRoot: normalizePathForUi(payload.data.gitRoot),
  }
}

export async function getWorktreeBranchOptions(sourceCwd: string): Promise<WorktreeBranchOption[]> {
  const normalizedSourceCwd = sourceCwd.trim()
  if (!normalizedSourceCwd) return []
  const query = new URLSearchParams({ sourceCwd: normalizedSourceCwd })
  const response = await fetch(`/codex-api/worktree/branches?${query.toString()}`)
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load branches')
  }
  const rawList = Array.isArray(payload.data) ? payload.data : []
  const options: WorktreeBranchOption[] = []
  const seen = new Set<string>()
  for (const item of rawList) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const value = typeof record.value === 'string' ? record.value.trim() : ''
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: label || value,
    })
  }
  return options
}

export async function getGitBranchState(cwd: string): Promise<GitBranchState> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) {
    return { currentBranch: null, headSha: null, headSubject: null, headDate: null, detached: false, dirty: false, gitRoot: '', options: [], changedFiles: [] }
  }
  const query = new URLSearchParams({ cwd: normalizedCwd })
  const response = await fetch(`/codex-api/git/branches?${query.toString()}`)
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load Git branch state')
  }
  const record = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {}
  const currentBranchRaw = record.currentBranch
  const currentBranch = typeof currentBranchRaw === 'string' && currentBranchRaw.trim()
    ? currentBranchRaw.trim()
    : null
  const rawList = Array.isArray(record.options) ? record.options : []
  const options: WorktreeBranchOption[] = []
  const seen = new Set<string>()
  for (const item of rawList) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const option = item as Record<string, unknown>
    const value = typeof option.value === 'string' ? option.value.trim() : ''
    const label = typeof option.label === 'string' ? option.label.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({
      value,
      label: label || value,
      isCurrent: option.isCurrent === true,
      isRemote: option.isRemote === true,
    })
  }
  if (currentBranch && !seen.has(currentBranch)) {
    options.unshift({ value: currentBranch, label: currentBranch, isCurrent: true })
  }
  const headShaRaw = record.headSha
  const headSubjectRaw = record.headSubject
  const headDateRaw = record.headDate
  const gitRootRaw = record.gitRoot
  const changedFiles = normalizeGitChangedFiles(record.changedFiles)
  return {
    currentBranch,
    headSha: typeof headShaRaw === 'string' && headShaRaw.trim() ? headShaRaw.trim() : null,
    headSubject: typeof headSubjectRaw === 'string' && headSubjectRaw.trim() ? headSubjectRaw.trim() : null,
    headDate: typeof headDateRaw === 'string' && headDateRaw.trim() ? headDateRaw.trim() : null,
    detached: record.detached === true,
    dirty: record.dirty === true,
    gitRoot: typeof gitRootRaw === 'string' ? normalizePathForUi(gitRootRaw) : '',
    options,
    changedFiles,
  }
}

function normalizeGitChangedFiles(value: unknown): GitCommitFileChange[] {
  const rows = Array.isArray(value) ? value : []
  const files: GitCommitFileChange[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    const rawPath = record.path
    const path = typeof rawPath === 'string' ? normalizePathForUi(rawPath.trim()) : ''
    if (!path) continue
    const rawStatus = record.status
    const status = typeof rawStatus === 'string' ? rawStatus.trim() : ''
    const rawLabel = record.label
    const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : status
    files.push({
      path,
      previousPath: typeof record.previousPath === 'string' && record.previousPath.trim() ? normalizePathForUi(record.previousPath.trim()) : null,
      status,
      label,
      addedLineCount: typeof record.addedLineCount === 'number' ? record.addedLineCount : null,
      removedLineCount: typeof record.removedLineCount === 'number' ? record.removedLineCount : null,
    })
  }
  return files
}

export async function getGitRepositoryStatus(cwd: string): Promise<GitRepositoryStatus> {
  const normalizedCwd = cwd.trim()
  if (!normalizedCwd) {
    return { isGitRepo: false, gitRoot: '' }
  }
  const query = new URLSearchParams({ cwd: normalizedCwd })
  const response = await fetch(`/codex-api/git/repository-status?${query.toString()}`)
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to read Git repository status')
  }
  const record = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {}
  return {
    isGitRepo: record.isGitRepo === true,
    gitRoot: typeof record.gitRoot === 'string' ? normalizePathForUi(record.gitRoot) : '',
  }
}

export async function checkoutGitBranch(cwd: string, branch: string): Promise<string | null> {
  const response = await fetch('/codex-api/git/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cwd: cwd.trim(),
      branch: branch.trim(),
    }),
  })
  const payload = (await response.json()) as { data?: { currentBranch?: string | null }; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to switch branch')
  }
  const branchName = payload.data?.currentBranch
  return typeof branchName === 'string' && branchName.trim() ? branchName.trim() : null
}

export async function getGitBranchCommits(cwd: string, branch: string, options: { includeResetHistory?: boolean } = {}): Promise<GitCommitOption[]> {
  const normalizedCwd = cwd.trim()
  const normalizedBranch = branch.trim()
  if (!normalizedCwd || !normalizedBranch) return []
  const query = new URLSearchParams({
    cwd: normalizedCwd,
    branch: normalizedBranch,
    includeResetHistory: options.includeResetHistory === false ? 'false' : 'true',
  })
  const response = await fetch(`/codex-api/git/branch-commits?${query.toString()}`)
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load branch commits')
  }
  const rawList = Array.isArray(payload.data) ? payload.data : []
  return rawList.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const sha = typeof record.sha === 'string' ? record.sha.trim() : ''
    const shortSha = typeof record.shortSha === 'string' ? record.shortSha.trim() : ''
    const subject = typeof record.subject === 'string' ? record.subject.trim() : ''
    const date = typeof record.date === 'string' ? record.date.trim() : ''
    if (!sha || !shortSha) return []
    return [{ sha, shortSha, subject: subject || shortSha, date }]
  })
}

export async function getGitCommitFiles(cwd: string, sha: string): Promise<GitCommitFileChange[]> {
  const normalizedCwd = cwd.trim()
  const normalizedSha = sha.trim()
  if (!normalizedCwd || !normalizedSha) return []
  const query = new URLSearchParams({
    cwd: normalizedCwd,
    sha: normalizedSha,
  })
  const response = await fetch(`/codex-api/git/commit-files?${query.toString()}`)
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load commit files')
  }
  const rawList = Array.isArray(payload.data) ? payload.data : []
  return rawList.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path : ''
    const previousPath = typeof record.previousPath === 'string' && record.previousPath.length > 0 ? record.previousPath : null
    const status = typeof record.status === 'string' ? record.status.trim() : ''
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const addedLineCount = typeof record.addedLineCount === 'number' && Number.isFinite(record.addedLineCount) ? record.addedLineCount : null
    const removedLineCount = typeof record.removedLineCount === 'number' && Number.isFinite(record.removedLineCount) ? record.removedLineCount : null
    if (!path || !status) return []
    return [{ path, previousPath, status, label: label || status, addedLineCount, removedLineCount }]
  })
}

export async function resetGitBranchToCommit(cwd: string, branch: string, sha: string): Promise<GitBranchState> {
  const response = await fetch('/codex-api/git/reset-to-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cwd: cwd.trim(),
      branch: branch.trim(),
      sha: sha.trim(),
    }),
  })
  const payload = (await response.json()) as { data?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to reset branch to commit')
  }
  const record = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {}
  return {
    currentBranch: typeof record.currentBranch === 'string' && record.currentBranch.trim() ? record.currentBranch.trim() : null,
    headSha: typeof record.headSha === 'string' && record.headSha.trim() ? record.headSha.trim() : null,
    headSubject: typeof record.headSubject === 'string' && record.headSubject.trim() ? record.headSubject.trim() : null,
    headDate: typeof record.headDate === 'string' && record.headDate.trim() ? record.headDate.trim() : null,
    detached: record.detached === true,
    dirty: record.dirty === true,
    gitRoot: typeof record.gitRoot === 'string' ? normalizePathForUi(record.gitRoot) : '',
    options: [],
    changedFiles: normalizeGitChangedFiles(record.changedFiles),
  }
}

export async function setWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
  const response = await fetch('/codex-api/workspace-roots-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextState),
  })
  if (!response.ok) {
    throw new Error('Failed to save workspace roots state')
  }
  cachedWorkspaceRootsState = cloneWorkspaceRootsState(nextState)
}

export async function openProjectRoot(path: string, options?: { createIfMissing?: boolean; label?: string }): Promise<string> {
  const response = await fetch('/codex-api/project-root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      createIfMissing: options?.createIfMissing === true,
      label: options?.label ?? '',
    }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to open project root')
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
  invalidateWorkspaceRootsStateCache()
  return normalizedPath
}

export function getProjectZipDownloadUrl(cwd: string): string {
  const query = new URLSearchParams({ cwd })
  return `/codex-api/project-zip?${query.toString()}`
}

function readDownloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/iu)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }
  const plainMatch = disposition.match(/filename="?([^";]+)"?/iu)
  return plainMatch?.[1]?.trim() || fallback
}

export async function downloadProjectZip(
  cwd: string,
  onProgress?: (progress: { loaded: number; total: number | null }) => void,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(getProjectZipDownloadUrl(cwd))
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const fallback = 'Failed to export project'
    const payloadMessage = getErrorMessageFromPayload(payload, fallback)
    const statusLabel = [response.status ? String(response.status) : '', response.statusText].filter(Boolean).join(' ')
    const message = payloadMessage !== fallback
      ? payloadMessage
      : statusLabel ? `Failed to export project: ${statusLabel}` : fallback
    throw new Error(message)
  }

  const totalHeader = Number(response.headers.get('content-length') ?? '')
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null
  const fileName = readDownloadFileName(response, 'project.zip')
  const reader = response.body?.getReader()
  if (!reader) {
    const blob = await response.blob()
    onProgress?.({ loaded: blob.size, total: blob.size || total })
    return { blob, fileName }
  }

  const chunks: Uint8Array[] = []
  let loaded = 0
  onProgress?.({ loaded, total })
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(new Uint8Array(value))
    loaded += value.byteLength
    onProgress?.({ loaded, total })
  }

  const blobParts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength)
    copy.set(chunk)
    return copy.buffer
  })
  return { blob: new Blob(blobParts, { type: response.headers.get('content-type') ?? 'application/zip' }), fileName }
}

export async function importProjectZip(file: Blob, parent: string): Promise<{ path: string; importedSessions: number }> {
  const query = new URLSearchParams({ parent })
  const response = await fetch(`/codex-api/project-import?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file,
  })
  const payload = await readJsonResponse(response)
  if (!response.ok) {
    const message = getErrorMessageFromPayload(payload, 'Failed to import project')
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
  return {
    path: normalizedPath,
    importedSessions: typeof data.importedSessions === 'number' ? data.importedSessions : 0,
  }
}