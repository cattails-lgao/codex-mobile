import {
  asRecord,
  callRpc,
  getErrorMessageFromPayload,
  readBoolean,
  readNumber,
  readString,
} from './core'
import type { ThreadReadResponse } from '../appServerDtos'
import type {
  UiReviewAction,
  UiReviewActionLevel,
  UiReviewFile,
  UiReviewFinding,
  UiReviewHunk,
  UiReviewLine,
  UiReviewResult,
  UiReviewScope,
  UiReviewSnapshot,
  UiReviewSummary,
  UiReviewWorkspaceView,
} from '../../types/codex'

function normalizeReviewLine(value: unknown): UiReviewLine | null {
  const record = asRecord(value)
  if (!record) return null

  const key = readString(record.key)
  const text = typeof record.text === 'string' ? record.text : ''
  const kind = readString(record.kind)
  if (!key || !kind) return null
  if (kind !== 'meta' && kind !== 'hunk' && kind !== 'add' && kind !== 'remove' && kind !== 'context') {
    return null
  }

  return {
    key,
    kind,
    text,
    oldLine: readNumber(record.oldLine),
    newLine: readNumber(record.newLine),
  }
}

function normalizeReviewHunk(value: unknown): UiReviewHunk | null {
  const record = asRecord(value)
  if (!record) return null

  const id = readString(record.id)
  const header = typeof record.header === 'string' ? record.header : ''
  const patch = typeof record.patch === 'string' ? record.patch : ''
  if (!id) return null

  return {
    id,
    header,
    patch,
    addedLineCount: readNumber(record.addedLineCount) ?? 0,
    removedLineCount: readNumber(record.removedLineCount) ?? 0,
    oldStart: readNumber(record.oldStart),
    oldLineCount: readNumber(record.oldLineCount) ?? 0,
    newStart: readNumber(record.newStart),
    newLineCount: readNumber(record.newLineCount) ?? 0,
    lines: Array.isArray(record.lines)
      ? record.lines
        .map((entry) => normalizeReviewLine(entry))
        .filter((entry): entry is UiReviewLine => entry !== null)
      : [],
  }
}

function normalizeReviewFile(value: unknown): UiReviewFile | null {
  const record = asRecord(value)
  if (!record) return null

  const id = readString(record.id)
  const path = readString(record.path)
  const absolutePath = readString(record.absolutePath)
  const operation = readString(record.operation)
  if (!id || !path || !absolutePath || !operation) return null
  if (operation !== 'add' && operation !== 'delete' && operation !== 'update' && operation !== 'rename') {
    return null
  }

  return {
    id,
    path,
    absolutePath,
    previousPath: readString(record.previousPath),
    previousAbsolutePath: readString(record.previousAbsolutePath),
    operation,
    addedLineCount: readNumber(record.addedLineCount) ?? 0,
    removedLineCount: readNumber(record.removedLineCount) ?? 0,
    diff: typeof record.diff === 'string' ? record.diff : '',
    hunks: Array.isArray(record.hunks)
      ? record.hunks
        .map((entry) => normalizeReviewHunk(entry))
        .filter((entry): entry is UiReviewHunk => entry !== null)
      : [],
  }
}

function normalizeReviewSnapshot(payload: unknown): UiReviewSnapshot {
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  const summaryRecord = asRecord(data?.summary)
  const rawScope = readString(data?.scope)
  const scope = rawScope === 'baseBranch' || rawScope === 'commit' ? rawScope : 'workspace'
  const workspaceView = readString(data?.workspaceView) === 'staged' ? 'staged' : 'unstaged'

  return {
    cwd: readString(data?.cwd) ?? '',
    gitRoot: readString(data?.gitRoot),
    isGitRepo: readBoolean(data?.isGitRepo) ?? false,
    scope,
    workspaceView,
    baseBranch: readString(data?.baseBranch),
    baseBranchOptions: Array.isArray(data?.baseBranchOptions)
      ? data.baseBranchOptions
        .map((entry) => readString(entry))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [],
    commitSha: readString(data?.commitSha),
    headBranch: readString(data?.headBranch),
    mergeBaseSha: readString(data?.mergeBaseSha),
    generatedAtIso: readString(data?.generatedAtIso) ?? '',
    summary: {
      fileCount: readNumber(summaryRecord?.fileCount) ?? 0,
      addedLineCount: readNumber(summaryRecord?.addedLineCount) ?? 0,
      removedLineCount: readNumber(summaryRecord?.removedLineCount) ?? 0,
    },
    files: Array.isArray(data?.files)
      ? data.files
        .map((entry) => normalizeReviewFile(entry))
        .filter((entry): entry is UiReviewFile => entry !== null)
      : [],
  }
}

function normalizeReviewSummary(payload: unknown): UiReviewSummary {
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  return {
    fileCount: readNumber(data?.fileCount) ?? 0,
    addedLineCount: readNumber(data?.addedLineCount) ?? 0,
    removedLineCount: readNumber(data?.removedLineCount) ?? 0,
  }
}

function parseReviewLocation(value: string): {
  absolutePath: string | null
  startLine: number | null
  endLine: number | null
} {
  const trimmed = value.trim()
  if (!trimmed) {
    return { absolutePath: null, startLine: null, endLine: null }
  }

  const match = trimmed.match(/^(.*?):(\d+)-(\d+)$/u)
  if (!match) {
    return { absolutePath: trimmed || null, startLine: null, endLine: null }
  }

  return {
    absolutePath: match[1]?.trim() || null,
    startLine: Number(match[2]),
    endLine: Number(match[3]),
  }
}

function parseReviewText(reviewText: string): UiReviewResult {
  const normalized = reviewText.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { reviewText: '', summary: '', findings: [] }
  }

  const markerIndex = normalized.search(/\n(?:Full review comments|Review comment):\n/iu)
  const summary = markerIndex >= 0 ? normalized.slice(0, markerIndex).trim() : normalized
  const findingsSection = markerIndex >= 0 ? normalized.slice(markerIndex).trim() : ''
  const findings: UiReviewFinding[] = []

  if (findingsSection) {
    const body = findingsSection
      .replace(/^(?:Full review comments|Review comment):\n*/iu, '')
      .trim()
    const matches = body.matchAll(/^- (.+?) — (.+)\n?((?:  .*(?:\n|$))*)/gmu)
    let index = 0
    for (const match of matches) {
      const title = match[1]?.trim() ?? ''
      const location = parseReviewLocation(match[2] ?? '')
      const block = (match[0] ?? '').trim()
      const findingBody = (match[3] ?? '')
        .split('\n')
        .map((line) => line.replace(/^  /u, ''))
        .join('\n')
        .trim()

      findings.push({
        id: `finding:${index}`,
        title: title || `Finding ${index + 1}`,
        body: findingBody,
        path: location.absolutePath ? location.absolutePath.split('/').filter(Boolean).slice(-1)[0] ?? location.absolutePath : null,
        absolutePath: location.absolutePath,
        startLine: location.startLine,
        endLine: location.endLine,
        rawText: block,
      })
      index += 1
    }
  }

  return {
    reviewText: normalized,
    summary,
    findings,
  }
}

function readLatestReviewItem(payload: ThreadReadResponse, type: 'enteredReviewMode' | 'exitedReviewMode'): string | null {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex]
    const items = Array.isArray(turn?.items) ? turn.items : []
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex]
      if (item?.type !== type) continue
      const review = typeof item.review === 'string' ? item.review.trim() : ''
      if (review) return review
    }
  }
  return null
}

export async function getThreadReviewResult(threadId: string): Promise<{
  enteredReviewLabel: string | null
  result: UiReviewResult | null
}> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })

  const exitedReview = readLatestReviewItem(payload, 'exitedReviewMode')
  return {
    enteredReviewLabel: readLatestReviewItem(payload, 'enteredReviewMode'),
    result: exitedReview ? parseReviewText(exitedReview) : null,
  }
}

export async function getReviewSnapshot(
  cwd: string,
  scope: UiReviewScope,
  workspaceView: UiReviewWorkspaceView,
  baseBranch?: string | null,
  commitSha?: string | null,
): Promise<UiReviewSnapshot> {
  const query = new URLSearchParams({ cwd, scope, workspaceView })
  if (baseBranch && baseBranch.trim()) {
    query.set('baseBranch', baseBranch.trim())
  }
  if (commitSha && commitSha.trim()) {
    query.set('commitSha', commitSha.trim())
  }
  const response = await fetch(`/codex-api/review/snapshot?${query.toString()}`)
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to load review snapshot'))
  }
  return normalizeReviewSnapshot(payload)
}

export async function getReviewSummary(
  cwd: string,
  workspaceView: UiReviewWorkspaceView,
): Promise<UiReviewSummary> {
  const query = new URLSearchParams({ cwd, workspaceView })
  const response = await fetch(`/codex-api/review/summary?${query.toString()}`)
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to load review summary'))
  }
  return normalizeReviewSummary(payload)
}

export async function applyReviewAction(payload: {
  cwd: string
  scope: UiReviewScope
  workspaceView: UiReviewWorkspaceView
  action: UiReviewAction
  level: UiReviewActionLevel
  path?: string
  previousPath?: string | null
  patch?: string
}): Promise<UiReviewSnapshot> {
  const response = await fetch('/codex-api/review/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(data, 'Failed to apply review action'))
  }
  return normalizeReviewSnapshot(data)
}

export async function initializeReviewGit(cwd: string): Promise<void> {
  const response = await fetch('/codex-api/review/git/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd }),
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(getErrorMessageFromPayload(payload, 'Failed to initialize Git'))
  }
}

export async function startThreadReview(
  threadId: string,
  scope: UiReviewScope,
  workspaceView: UiReviewWorkspaceView,
  baseBranch?: string | null,
): Promise<void> {
  const target = scope === 'baseBranch'
    ? { type: 'baseBranch' as const, branch: (baseBranch ?? '').trim() }
    : { type: 'uncommittedChanges' as const }
  if (target.type === 'baseBranch' && !target.branch) {
    throw new Error('Base branch is unavailable')
  }
  await callRpc('review/start', {
    threadId,
    target,
    delivery: 'inline',
  })
}

export async function updateThreadFileChanges(
  threadId: string,
  turnId: string,
  cwd: string,
  action: 'undo' | 'redo',
  patchIds?: string[],
  scope?: 'single_turn' | 'turn_and_later',
  filePaths?: string[],
): Promise<{ changed: number; errors: string[]; message?: string; revertedPatchIds?: string[]; appliedPatchIds?: string[] }> {
  try {
    const response = await fetch('/codex-api/thread/rollback-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, turnId, cwd, action, patchIds, scope, filePaths }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      changed?: number
      reverted?: number
      applied?: number
      errors?: string[]
      message?: string
      error?: string
      revertedPatchIds?: string[]
      appliedPatchIds?: string[]
    }
    if (!response.ok) {
      const message = typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : typeof payload.error === 'string' && payload.error.trim()
          ? payload.error.trim()
          : 'Server error'
      return {
        changed: 0,
        errors: Array.isArray(payload.errors) && payload.errors.length > 0 ? payload.errors : [message],
        message: payload.message,
      }
    }
    return {
      changed: payload.changed ?? payload.reverted ?? payload.applied ?? 0,
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      message: payload.message,
      revertedPatchIds: Array.isArray(payload.revertedPatchIds) ? payload.revertedPatchIds : [],
      appliedPatchIds: Array.isArray(payload.appliedPatchIds) ? payload.appliedPatchIds : [],
    }
  } catch (error) {
    return { changed: 0, errors: [error instanceof Error ? error.message : 'Network error'] }
  }
}

export async function revertThreadFileChanges(threadId: string, turnId: string, cwd: string): Promise<{ reverted: number; errors: string[] }> {
  const result = await updateThreadFileChanges(threadId, turnId, cwd, 'undo')
  return { reverted: result.changed, errors: result.errors }
}