import type { CommandExecutionData, UiToolSummary, UiToolSummaryCount } from '../types/codex'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function basename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts.at(-1) ?? normalized
}

export function buildCommandToolSummary(
  status: CommandExecutionData['status'],
  command: string,
): UiToolSummary {
  const label =
    status === 'inProgress'
      ? 'Terminal running'
      : status === 'failed'
        ? 'Terminal failed'
        : status === 'declined'
          ? 'Terminal declined'
          : status === 'interrupted'
            ? 'Terminal interrupted'
            : 'Terminal completed'

  return {
    kind: 'command',
    label,
    status,
    code: command.trim(),
  }
}

export function buildCommandActivitySummary(commandActions: unknown): UiToolSummary | null {
  if (!Array.isArray(commandActions)) return null

  let browseCount = 0
  let searchCount = 0

  for (const action of commandActions) {
    const record = asRecord(action)
    const type = readString(record?.type)
    if (type === 'read' || type === 'listFiles') {
      browseCount += 1
      continue
    }
    if (type === 'search') {
      searchCount += 1
    }
  }

  if (browseCount <= 0 && searchCount <= 0) {
    return null
  }

  const counts: UiToolSummaryCount[] = []
  if (browseCount > 0) {
    counts.push({ label: browseCount === 1 ? 'file' : 'files', value: browseCount })
  }
  if (searchCount > 0) {
    counts.push({ label: searchCount === 1 ? 'search' : 'searches', value: searchCount })
  }

  return {
    kind: 'activity',
    label: browseCount > 0 ? 'Browsed' : 'Searched',
    counts,
  }
}

export function countDiffStats(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0

  for (const line of diff.split(/\r?\n/u)) {
    if (!line) continue
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) {
      added += 1
      continue
    }
    if (line.startsWith('-')) {
      removed += 1
    }
  }

  return { added, removed }
}

export function buildFileChangeToolSummary(change: unknown): UiToolSummary | null {
  const record = asRecord(change)
  if (!record) return null

  const path = readString(record.path)
  if (!path) return null

  const kind = asRecord(record.kind)
  const kindType = readString(kind?.type)
  const movePath = readString(kind?.move_path)
  const diff = typeof record.diff === 'string' ? record.diff : ''
  const stats = countDiffStats(diff)

  const label =
    kindType === 'add'
      ? 'Created'
      : kindType === 'delete'
        ? 'Deleted'
        : movePath
          ? 'Moved'
          : 'Edited'

  return {
    kind: 'fileChange',
    label,
    path: movePath || path,
    added: stats.added,
    removed: stats.removed,
  }
}
