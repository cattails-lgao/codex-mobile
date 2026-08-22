// git 领域切片（B 批）。从 codexAppServerBridge.ts 原 4424-4831 区的 git
// worktree/分支/回滚/untracked 保留工具集群平移而来（命令执行器划归 ./core.js）。
// 仅供 bridge 内的 middleware 复用，不参与对外 RPC 面；依赖共享 getErrorMessage。
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { getErrorMessage, runCommand, runCommandCapture, runCommandCaptureRaw } from './core.js'

export function isMissingHeadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return (
    message.includes("not a valid object name: 'head'") ||
    message.includes('not a valid object name: head') ||
    message.includes('invalid reference: head')
  )
}

export function isNotGitRepositoryError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not a git repository') || message.includes('fatal: not a git repository')
}

export async function ensureRepoHasInitialCommit(repoRoot: string): Promise<void> {
  const agentsPath = join(repoRoot, 'AGENTS.md')
  try {
    await stat(agentsPath)
  } catch {
    await writeFile(agentsPath, '', 'utf8')
  }

  await runCommand('git', ['add', 'AGENTS.md'], { cwd: repoRoot })
  await runCommand(
    'git',
    ['-c', 'user.name=Codex', '-c', 'user.email=codex@local', 'commit', '-m', 'Initialize repository for worktree support'],
    { cwd: repoRoot },
  )
}

export function normalizeBranchRefName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('refs/heads/')) return trimmed.slice('refs/heads/'.length)
  if (trimmed.startsWith('refs/remotes/')) return trimmed.slice('refs/remotes/'.length)
  return trimmed
}

export function toHeaderGitResetHistoryRef(branchName: string, commitSha: string): string {
  return `refs/codex/header-git-reset-history/${branchName}/${commitSha}`
}

export const HEADER_GIT_RESET_HISTORY_REF_LIMIT = 25
const HEADER_GIT_UNTRACKED_BACKUP_DIR = '.codex/untracked-backups'

export async function assertLocalGitBranch(repoRoot: string, branchName: string): Promise<void> {
  await runCommandCapture('git', ['show-ref', '--verify', `refs/heads/${branchName}`], { cwd: repoRoot })
}

export function splitGitPathList(raw: string): string[] {
  return raw
    .split('\0')
    .filter((entry) => entry.length > 0)
}

export function isSafeGitRelativePath(filePath: string): boolean {
  return Boolean(filePath) && !isAbsolute(filePath) && !filePath.split('/').includes('..')
}

export function resolveGitRelativePath(repoRoot: string, filePath: string): string {
  return join(repoRoot, ...filePath.split('/'))
}

export type PreservedUntrackedFile = {
  filePath: string
  sourcePath: string
  backupPath: string
}

export function gitPathsConflict(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

export async function removeEmptyGitRelativeParents(repoRoot: string, filePath: string): Promise<void> {
  let current = dirname(resolveGitRelativePath(repoRoot, filePath))
  while (current !== repoRoot && current.startsWith(`${repoRoot}/`)) {
    try {
      await rm(current, { recursive: false })
    } catch {
      return
    }
    current = dirname(current)
  }
}

export async function rollbackPreservedUntrackedFiles(entries: PreservedUntrackedFile[]): Promise<void> {
  for (const entry of entries.slice().reverse()) {
    try {
      if (existsSync(entry.backupPath) && !existsSync(entry.sourcePath)) {
        await mkdir(dirname(entry.sourcePath), { recursive: true })
        await rename(entry.backupPath, entry.sourcePath)
      }
    } catch {
      // Preserve the original git failure; best-effort rollback avoids masking it.
    }
  }
}

export async function preserveUntrackedFilesForGitTarget(repoRoot: string, targetRef: string): Promise<PreservedUntrackedFile[]> {
  const [untrackedRaw, targetTreeRaw] = await Promise.all([
    runCommandCaptureRaw('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repoRoot }),
    runCommandCaptureRaw('git', ['ls-tree', '-r', '--name-only', '-z', `${targetRef}^{tree}`], { cwd: repoRoot }),
  ])
  const targetPaths = splitGitPathList(targetTreeRaw)
  const conflictingUntrackedPaths = splitGitPathList(untrackedRaw)
    .filter((filePath) => isSafeGitRelativePath(filePath) && targetPaths.some((targetPath) => gitPathsConflict(filePath, targetPath)))
  if (conflictingUntrackedPaths.length === 0) return []

  const backupRoot = join(repoRoot, HEADER_GIT_UNTRACKED_BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'))
  const movedFiles: PreservedUntrackedFile[] = []
  for (const filePath of conflictingUntrackedPaths) {
    const sourcePath = resolveGitRelativePath(repoRoot, filePath)
    const backupPath = join(backupRoot, ...filePath.split('/'))
    await mkdir(dirname(backupPath), { recursive: true })
    await rename(sourcePath, backupPath)
    movedFiles.push({ filePath, sourcePath, backupPath })
    await removeEmptyGitRelativeParents(repoRoot, filePath)
  }
  return movedFiles
}

export async function withPreservedUntrackedFilesForGitTarget(repoRoot: string, targetRef: string, operation: () => Promise<void>): Promise<void> {
  const movedFiles = await preserveUntrackedFilesForGitTarget(repoRoot, targetRef)
  try {
    await operation()
  } catch (error) {
    await rollbackPreservedUntrackedFiles(movedFiles)
    throw error
  }
}

export async function checkoutGitBranchWithWorktreeRecovery(repoRoot: string, branchName: string): Promise<void> {
  await withPreservedUntrackedFilesForGitTarget(repoRoot, branchName, async () => {
    try {
      await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
    } catch (checkoutError) {
      const blockingWorktreePath = extractBranchLockedWorktreePath(checkoutError, branchName)
      if (!blockingWorktreePath) {
        throw checkoutError
      }
      await runCommand('git', ['checkout', '--detach'], { cwd: blockingWorktreePath })
      await runCommand('git', ['checkout', branchName], { cwd: repoRoot })
    }
  })
}

export async function pruneHeaderGitResetHistoryRefs(repoRoot: string, branchName: string): Promise<void> {
  const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branchName}/`
  const refsRaw = await runCommandCapture(
    'git',
    ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
    { cwd: repoRoot },
  ).catch(() => '')
  const refs = refsRaw
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const staleRefs = refs.slice(HEADER_GIT_RESET_HISTORY_REF_LIMIT)
  for (const refName of staleRefs) {
    await runCommand('git', ['update-ref', '-d', refName], { cwd: repoRoot })
  }
}

export async function readGitHeaderState(cwd: string): Promise<{
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  gitRoot: string
  changedFiles: Array<{
    path: string
    previousPath: string | null
    status: string
    label: string
    addedLineCount: number | null
    removedLineCount: number | null
  }>
}> {
  const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
  const currentBranchRaw = await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })
  const currentBranch = currentBranchRaw.trim() || null
  const headShaRaw = await runCommandCapture('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: gitRoot })
  const headCommitRaw = await runCommandCapture('git', ['show', '-s', '--date=short', '--format=%cd%x09%s', 'HEAD'], { cwd: gitRoot })
  const [headDate = '', ...headSubjectParts] = headCommitRaw.split('\t')
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: gitRoot })
  return {
    currentBranch,
    headSha: headShaRaw.trim() || null,
    headSubject: headSubjectParts.join('\t').trim() || null,
    headDate: headDate.trim() || null,
    detached: !currentBranch,
    dirty: statusRaw.trim().length > 0,
    gitRoot,
    changedFiles: parsePorcelainChangedFiles(statusRaw),
  }
}

export function parsePorcelainChangedFiles(statusRaw: string): Array<{
  path: string
  previousPath: string | null
  status: string
  label: string
  addedLineCount: number | null
  removedLineCount: number | null
}> {
  const files: Array<{
    path: string
    previousPath: string | null
    status: string
    label: string
    addedLineCount: number | null
    removedLineCount: number | null
  }> = []
  for (const line of statusRaw.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed || trimmed.length < 3) continue
    const xy = trimmed.slice(0, 2)
    let pathPart = trimmed.slice(3)
    let previousPath: string | null = null
    const arrowIndex = pathPart.indexOf(' -> ')
    if (arrowIndex >= 0) {
      previousPath = pathPart.slice(0, arrowIndex)
      pathPart = pathPart.slice(arrowIndex + 4)
    }
    const path = pathPart.trim()
    if (!path) continue
    const worktreeStatus = xy.charAt(1)
    const indexStatus = xy.charAt(0)
    const statusKind = worktreeStatus !== ' ' ? worktreeStatus : indexStatus
    const status = worktreeStatus !== ' ' ? `${indexStatus}${worktreeStatus}` : indexStatus
    let label: string
    if (status === '??') {
      label = 'Untracked'
    } else if (statusKind === 'A') {
      label = 'Added'
    } else if (statusKind === 'D') {
      label = 'Deleted'
    } else if (statusKind === 'R') {
      label = 'Renamed'
    } else if (statusKind === 'C') {
      label = 'Copied'
    } else if (statusKind === 'U') {
      label = 'Unmerged'
    } else {
      label = 'Modified'
    }
    files.push({ path, previousPath, status, label, addedLineCount: null, removedLineCount: null })
  }
  return files
}

export async function assertNoTrackedGitChanges(repoRoot: string): Promise<void> {
  const statusRaw = await runCommandCapture('git', ['status', '--porcelain'], { cwd: repoRoot })
  const trackedChanges = statusRaw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('?? '))
  if (trackedChanges.length > 0) {
    throw new Error('Cannot switch branches or reset with tracked uncommitted changes. Commit, stash, or discard tracked changes first. Untracked files are allowed unless Git would overwrite them.')
  }
}

export function extractBranchLockedWorktreePath(error: unknown, branchName: string): string {
  const message = getErrorMessage(error, '')
  if (!message || !branchName) return ''
  const escapedBranch = branchName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`'${escapedBranch}' is already checked out at '([^']+)'`, 'u')
  const match = pattern.exec(message)
  return match?.[1]?.trim() ?? ''
}

export function toPermanentWorktreeBranchNameDraft(worktreeName: string): string {
  const sanitized = worktreeName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/\.+/gu, '.')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
  return sanitized || 'worktree'
}

export async function isValidGitBranchName(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['check-ref-format', '--branch', branchName], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

export async function doesLocalGitBranchExist(gitRoot: string, branchName: string): Promise<boolean> {
  try {
    await runCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: gitRoot })
    return true
  } catch {
    return false
  }
}

export async function allocatePermanentWorktreeBranchName(gitRoot: string, worktreeName: string): Promise<string> {
  const base = toPermanentWorktreeBranchNameDraft(worktreeName)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!await isValidGitBranchName(gitRoot, candidate)) continue
    if (!await doesLocalGitBranchExist(gitRoot, candidate)) return candidate
  }
  throw new Error('Failed to allocate a unique branch name for worktree')
}