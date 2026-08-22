// Git / worktree HTTP route handlers, sliced out of createCodexBridgeMiddleware.
//
// These handlers are stateless: they depend only on module-level helpers
// (bridge/git.ts, bridge/core.ts) and Node builtins. The few infra helpers that
// are defined on the monolithic bridge shell (setJson, readJsonBody,
// persistWorkspaceRoot, rollbackCreatedWorktree) are injected by
// createCodexBridgeMiddleware to avoid a circular import back into the shell.
import { randomBytes } from 'node:crypto'
import { stat, mkdir, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import {
  assertLocalGitBranch,
  assertNoTrackedGitChanges,
  allocatePermanentWorktreeBranchName,
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
} from './git.js'
import {
  asRecord,
  getCodexHomeDir,
  getErrorMessage,
  readNonEmptyString,
  runCommand,
  runCommandCapture,
  runCommandCaptureRaw,
} from './core.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>
type PersistWorkspaceRoot = (workspaceRoot: string, label?: string) => Promise<void>
type RollbackCreatedWorktree = (
  gitRoot: string,
  worktreeCwd: string,
  cleanupDirectory?: string,
  branchName?: string,
) => Promise<void>

export type GitWorktreeRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
  persistWorkspaceRoot: PersistWorkspaceRoot
  rollbackCreatedWorktree: RollbackCreatedWorktree
}

export async function handleGitWorktreeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: GitWorktreeRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody, persistWorkspaceRoot, rollbackCreatedWorktree } = deps

  if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create') {
    const payload = asRecord(await readJsonBody(req))
    const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
    const baseBranch = typeof payload?.baseBranch === 'string' ? payload.baseBranch.trim() : ''
    if (!rawSourceCwd) {
      setJson(res, 400, { error: 'Missing sourceCwd' })
      return true
    }

    const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
    try {
      const sourceInfo = await stat(sourceCwd)
      if (!sourceInfo.isDirectory()) {
        setJson(res, 400, { error: 'sourceCwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'sourceCwd does not exist' })
      return true
    }

    try {
      let gitRoot = ''
      try {
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
      } catch (error) {
        if (!isNotGitRepositoryError(error)) throw error
        await runCommand('git', ['init'], { cwd: sourceCwd })
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
      }
      const repoName = basename(gitRoot) || 'repo'
      const worktreesRoot = join(getCodexHomeDir(), 'worktrees')
      await mkdir(worktreesRoot, { recursive: true })

      // Match Codex desktop layout so project grouping resolves to repo name:
      // ~/.codex/worktrees/<id>/<repoName>
      let worktreeId = ''
      let worktreeParent = ''
      let worktreeCwd = ''
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = randomBytes(2).toString('hex')
        const parent = join(worktreesRoot, candidate)
        try {
          await stat(parent)
          continue
        } catch {
          worktreeId = candidate
          worktreeParent = parent
          worktreeCwd = join(parent, repoName)
          break
        }
      }
      if (!worktreeId || !worktreeParent || !worktreeCwd) {
        throw new Error('Failed to allocate a unique worktree id')
      }
      const startPoint = baseBranch || 'HEAD'

      await mkdir(worktreeParent, { recursive: true })
      try {
        await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
      } catch (error) {
        if (!isMissingHeadError(error)) throw error
        await ensureRepoHasInitialCommit(gitRoot)
        await runCommand('git', ['worktree', 'add', '--detach', worktreeCwd, startPoint], { cwd: gitRoot })
      }
      try {
        await persistWorkspaceRoot(worktreeCwd)
      } catch (error) {
        await rollbackCreatedWorktree(gitRoot, worktreeCwd, worktreeParent)
        throw error
      }

      setJson(res, 200, {
        data: {
          cwd: worktreeCwd,
          branch: null,
          gitRoot,
        },
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/worktree/create-permanent') {
    const payload = asRecord(await readJsonBody(req))
    const rawSourceCwd = typeof payload?.sourceCwd === 'string' ? payload.sourceCwd.trim() : ''
    const rawWorktreeName = typeof payload?.worktreeName === 'string' ? payload.worktreeName.trim() : ''
    if (!rawSourceCwd) {
      setJson(res, 400, { error: 'Missing sourceCwd' })
      return true
    }
    if (!rawWorktreeName) {
      setJson(res, 400, { error: 'Missing worktreeName' })
      return true
    }
    if (rawWorktreeName.includes('/') || rawWorktreeName.includes('\\') || rawWorktreeName === '.' || rawWorktreeName === '..') {
      setJson(res, 400, { error: 'Worktree name must be a single folder name' })
      return true
    }

    const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
    try {
      const sourceInfo = await stat(sourceCwd)
      if (!sourceInfo.isDirectory()) {
        setJson(res, 400, { error: 'sourceCwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'sourceCwd does not exist' })
      return true
    }

    try {
      let gitRoot = ''
      try {
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
      } catch (error) {
        if (!isNotGitRepositoryError(error)) throw error
        await runCommand('git', ['init'], { cwd: sourceCwd })
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
      }
      const worktreeCwd = join(dirname(gitRoot), rawWorktreeName)
      try {
        await stat(worktreeCwd)
        setJson(res, 409, { error: 'Worktree folder already exists' })
        return true
      } catch {
        // Expected for a new worktree path.
      }

      const branchName = await allocatePermanentWorktreeBranchName(gitRoot, rawWorktreeName)
      try {
        await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
      } catch (error) {
        if (!isMissingHeadError(error)) throw error
        await ensureRepoHasInitialCommit(gitRoot)
        await runCommand('git', ['worktree', 'add', '-b', branchName, worktreeCwd, 'HEAD'], { cwd: gitRoot })
      }
      try {
        await persistWorkspaceRoot(worktreeCwd)
      } catch (error) {
        await rollbackCreatedWorktree(gitRoot, worktreeCwd, undefined, branchName)
        throw error
      }

      setJson(res, 200, {
        data: {
          cwd: worktreeCwd,
          branch: branchName,
          gitRoot,
        },
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to create worktree') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/worktree/branches') {
    const rawSourceCwd = (url.searchParams.get('sourceCwd') ?? '').trim()
    if (!rawSourceCwd) {
      setJson(res, 400, { error: 'Missing sourceCwd' })
      return true
    }
    const sourceCwd = isAbsolute(rawSourceCwd) ? rawSourceCwd : resolve(rawSourceCwd)
    try {
      const sourceInfo = await stat(sourceCwd)
      if (!sourceInfo.isDirectory()) {
        setJson(res, 400, { error: 'sourceCwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'sourceCwd does not exist' })
      return true
    }

    try {
      let gitRoot = ''
      try {
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd: sourceCwd })
      } catch (error) {
        if (!isNotGitRepositoryError(error)) throw error
        setJson(res, 200, { data: [] })
        return true
      }
      const output = await runCommandCapture(
        'git',
        ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)', 'refs/heads', 'refs/remotes'],
        { cwd: gitRoot },
      )
      const branchActivityByName = new Map<string, number>()
      for (const line of output.split('\n')) {
        const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
        const normalized = normalizeBranchRefName(rawRefName)
        if (!normalized || normalized === 'origin/HEAD') continue
        const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
        const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
        const current = branchActivityByName.get(normalized) ?? Number.MIN_SAFE_INTEGER
        if (timestamp > current) {
          branchActivityByName.set(normalized, timestamp)
        }
      }

      const branches = Array.from(branchActivityByName.entries())
        .map(([value]) => ({ value, label: value }))
        .sort((a, b) => {
          const aActivity = branchActivityByName.get(a.value) ?? 0
          const bActivity = branchActivityByName.get(b.value) ?? 0
          if (bActivity !== aActivity) return bActivity - aActivity
          return a.value.localeCompare(b.value)
        })
      setJson(res, 200, { data: branches })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to list branches') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/git/branches') {
    const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const cwdInfo = await stat(cwd)
      if (!cwdInfo.isDirectory()) {
        setJson(res, 400, { error: 'cwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'cwd does not exist' })
      return true
    }

    try {
      let gitRoot = ''
      try {
        gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      } catch (error) {
        if (!isNotGitRepositoryError(error)) throw error
        setJson(res, 200, {
          data: {
            currentBranch: null,
            options: [],
          },
        })
        return true
      }

      const state = await readGitHeaderState(gitRoot)
      const currentBranch = state.currentBranch
      const output = await runCommandCapture(
        'git',
        ['for-each-ref', '--format=%(committerdate:unix)\t%(refname)\t%(objectname)', 'refs/heads', 'refs/remotes'],
        { cwd: gitRoot },
      )
      const branchActivityByName = new Map<string, { timestamp: number; isRemote: boolean }>()
      for (const line of output.split('\n')) {
        const [rawTimestamp = '', rawRefName = ''] = line.split('\t')
        const normalized = normalizeBranchRefName(rawRefName)
        if (!normalized || normalized === 'origin/HEAD') continue
        const parsedTimestamp = Number.parseInt(rawTimestamp.trim(), 10)
        const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
        const isRemote = rawRefName.trim().startsWith('refs/remotes/')
        const current = branchActivityByName.get(normalized)
        if (!current || timestamp > current.timestamp) {
          branchActivityByName.set(normalized, { timestamp, isRemote })
        }
      }
      if (currentBranch && !branchActivityByName.has(currentBranch)) {
        branchActivityByName.set(currentBranch, { timestamp: Number.MAX_SAFE_INTEGER, isRemote: false })
      }
      const options = Array.from(branchActivityByName.entries())
        .map(([value, metadata]) => ({
          value,
          label: value,
          isCurrent: value === currentBranch,
          isRemote: metadata.isRemote,
        }))
        .sort((a, b) => {
          const aActivity = branchActivityByName.get(a.value)?.timestamp ?? 0
          const bActivity = branchActivityByName.get(b.value)?.timestamp ?? 0
          if (bActivity !== aActivity) return bActivity - aActivity
          return a.value.localeCompare(b.value)
        })
      setJson(res, 200, {
        data: {
          ...state,
          options,
        },
      })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git branches') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/git/repository-status') {
    const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const cwdInfo = await stat(cwd)
      if (!cwdInfo.isDirectory()) {
        setJson(res, 400, { error: 'cwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'cwd does not exist' })
      return true
    }

    try {
      const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      setJson(res, 200, {
        data: {
          isGitRepo: true,
          gitRoot,
        },
      })
    } catch (error) {
      if (!isNotGitRepositoryError(error)) {
        setJson(res, 500, { error: getErrorMessage(error, 'Failed to read Git repository status') })
        return true
      }
      setJson(res, 200, {
        data: {
          isGitRepo: false,
          gitRoot: '',
        },
      })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/git/checkout') {
    const payload = await readJsonBody(req)
    const record = asRecord(payload)
    if (!record) {
      setJson(res, 400, { error: 'Invalid body: expected object' })
      return true
    }
    const rawCwd = readNonEmptyString(record.cwd)
    const targetBranch = readNonEmptyString(record.branch)
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    if (!targetBranch) {
      setJson(res, 400, { error: 'Missing branch' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const cwdInfo = await stat(cwd)
      if (!cwdInfo.isDirectory()) {
        setJson(res, 400, { error: 'cwd is not a directory' })
        return true
      }
    } catch {
      setJson(res, 404, { error: 'cwd does not exist' })
      return true
    }
    try {
      const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      await assertNoTrackedGitChanges(gitRoot)
      await assertLocalGitBranch(gitRoot, targetBranch)
      await checkoutGitBranchWithWorktreeRecovery(gitRoot, targetBranch)
      setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to switch branch') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/git/branch-commits') {
    const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
    const branch = (url.searchParams.get('branch') ?? '').trim()
    const includeResetHistory = url.searchParams.get('includeResetHistory') !== 'false'
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    if (!branch) {
      setJson(res, 400, { error: 'Missing branch' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      await runCommandCapture('git', ['rev-parse', '--verify', `${branch}^{commit}`], { cwd: gitRoot })
      let resetHistoryRefs: string[] = []
      if (includeResetHistory) {
        const resetHistoryRefPrefix = `refs/codex/header-git-reset-history/${branch}/`
        const resetHistoryRefsRaw = await runCommandCapture(
          'git',
          ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', resetHistoryRefPrefix],
          { cwd: gitRoot },
        ).catch(() => '')
        resetHistoryRefs = resetHistoryRefsRaw
          .split('\n')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, HEADER_GIT_RESET_HISTORY_REF_LIMIT)
      }
      const output = await runCommandCapture(
        'git',
        ['log', '-n', '50', '--date=short', '--format=%H%x09%h%x09%cd%x09%s', branch, ...resetHistoryRefs],
        { cwd: gitRoot },
      )
      const commits = output.split('\n').flatMap((line) => {
        const [sha = '', shortSha = '', date = '', ...subjectParts] = line.split('\t')
        const subject = subjectParts.join('\t').trim()
        return sha.trim() && shortSha.trim()
          ? [{ sha: sha.trim(), shortSha: shortSha.trim(), date: date.trim(), subject: subject || shortSha.trim() }]
          : []
      })
      setJson(res, 200, { data: commits })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to load branch commits') })
    }
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/git/commit-files') {
    const rawCwd = (url.searchParams.get('cwd') ?? '').trim()
    const sha = (url.searchParams.get('sha') ?? '').trim()
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    if (!sha) {
      setJson(res, 400, { error: 'Missing sha' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      await runCommandCapture('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: gitRoot })
      const output = await runCommandCaptureRaw(
        'git',
        ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-z', sha],
        { cwd: gitRoot },
      )
      const numstatOutput = await runCommandCaptureRaw(
        'git',
        ['diff-tree', '--root', '--no-commit-id', '--numstat', '-r', '-M', '-z', sha],
        { cwd: gitRoot },
      )
      const splitNumstatRecord = (record: string): { addedRaw: string; removedRaw: string; path: string } | null => {
        const firstTab = record.indexOf('\t')
        if (firstTab < 0) return null
        const secondTab = record.indexOf('\t', firstTab + 1)
        if (secondTab < 0) return null
        return {
          addedRaw: record.slice(0, firstTab),
          removedRaw: record.slice(firstTab + 1, secondTab),
          path: record.slice(secondTab + 1),
        }
      }
      const lineCountsByPath = new Map<string, { addedLineCount: number | null; removedLineCount: number | null }>()
      const numstatRecords = splitGitPathList(numstatOutput)
      for (let index = 0; index < numstatRecords.length; index += 1) {
        const record = splitNumstatRecord(numstatRecords[index] ?? '')
        if (!record) continue
        const { addedRaw, removedRaw } = record
        const path = record.path || numstatRecords[index + 2] || numstatRecords[index + 1] || ''
        if (!record.path) index += 2
        if (!path) continue
        const addedLineCount = /^\d+$/.test(addedRaw) ? Number(addedRaw) : null
        const removedLineCount = /^\d+$/.test(removedRaw) ? Number(removedRaw) : null
        lineCountsByPath.set(path, { addedLineCount, removedLineCount })
      }
      const nameStatusRecords = splitGitPathList(output)
      const files: Array<{
        path: string
        previousPath: string | null
        status: string
        label: string
        addedLineCount: number | null
        removedLineCount: number | null
      }> = []
      for (let index = 0; index < nameStatusRecords.length; index += 1) {
        const status = nameStatusRecords[index] ?? ''
        if (!status) continue
        const statusKind = status.charAt(0)
        const isRenameOrCopy = statusKind === 'R' || statusKind === 'C'
        const previousPath = isRenameOrCopy ? nameStatusRecords[index + 1] || null : null
        const path = isRenameOrCopy ? nameStatusRecords[index + 2] || '' : nameStatusRecords[index + 1] || ''
        index += isRenameOrCopy ? 2 : 1
        if (!path) continue
        const label = statusKind === 'A'
          ? 'Added'
          : statusKind === 'D'
            ? 'Deleted'
            : statusKind === 'R'
              ? 'Renamed'
              : statusKind === 'C'
                ? 'Copied'
                : statusKind === 'M'
                  ? 'Modified'
                  : status
        const lineCounts = lineCountsByPath.get(path) ?? { addedLineCount: null, removedLineCount: null }
        files.push({ path, previousPath, status, label, ...lineCounts })
      }
      setJson(res, 200, { data: files })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to load commit files') })
    }
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/git/reset-to-commit') {
    const payload = await readJsonBody(req)
    const record = asRecord(payload)
    if (!record) {
      setJson(res, 400, { error: 'Invalid body: expected object' })
      return true
    }
    const rawCwd = readNonEmptyString(record.cwd)
    const branch = readNonEmptyString(record.branch)
    const sha = readNonEmptyString(record.sha)
    if (!rawCwd) {
      setJson(res, 400, { error: 'Missing cwd' })
      return true
    }
    if (!branch) {
      setJson(res, 400, { error: 'Missing branch' })
      return true
    }
    if (!sha) {
      setJson(res, 400, { error: 'Missing commit' })
      return true
    }
    const cwd = isAbsolute(rawCwd) ? rawCwd : resolve(rawCwd)
    try {
      const gitRoot = await runCommandCapture('git', ['rev-parse', '--show-toplevel'], { cwd })
      await assertNoTrackedGitChanges(gitRoot)
      await assertLocalGitBranch(gitRoot, branch)
      const currentBranch = (await runCommandCapture('git', ['branch', '--show-current'], { cwd: gitRoot })).trim()
      if (currentBranch && currentBranch !== branch) {
        await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
      } else if (!currentBranch) {
        await checkoutGitBranchWithWorktreeRecovery(gitRoot, branch)
      }
      const previousTip = await runCommandCapture('git', ['rev-parse', 'HEAD'], { cwd: gitRoot })
      const targetSha = await runCommandCapture('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: gitRoot })
      await runCommand('git', ['update-ref', toHeaderGitResetHistoryRef(branch, previousTip.trim()), previousTip.trim()], { cwd: gitRoot })
      await pruneHeaderGitResetHistoryRefs(gitRoot, branch)
      await withPreservedUntrackedFilesForGitTarget(gitRoot, targetSha.trim(), async () => {
        await runCommand('git', ['reset', '--hard', targetSha.trim()], { cwd: gitRoot })
      })
      setJson(res, 200, { data: await readGitHeaderState(gitRoot) })
    } catch (error) {
      setJson(res, 500, { error: getErrorMessage(error, 'Failed to reset branch to commit') })
    }
    return true
  }

  return false
}