import { asRecord, readBoolean, readString } from './core'
import { extractErrorMessage } from '../codexErrors'

export type ThreadTerminalSession = {
  id: string
  threadId: string
  cwd: string
  shell: string
  buffer: string
  truncated: boolean
}

export type ThreadTerminalAttachInput = {
  threadId: string
  cwd: string
  sessionId?: string
  cols?: number
  rows?: number
  newSession?: boolean
}

export type ThreadTerminalQuickCommand = {
  label: string
  value: string
  source: 'package' | 'script' | 'make'
}

function normalizeThreadTerminalSession(value: unknown): ThreadTerminalSession | null {
  const record = asRecord(value)
  if (!record) return null
  const id = readString(record.id)
  const threadId = readString(record.threadId)
  const cwd = readString(record.cwd)
  const shell = readString(record.shell)
  if (!id || !threadId || !cwd || !shell) return null
  return {
    id,
    threadId,
    cwd,
    shell,
    buffer: typeof record.buffer === 'string' ? record.buffer : '',
    truncated: readBoolean(record.truncated) ?? false,
  }
}

async function fetchTerminalJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, `Terminal request failed with HTTP ${response.status}`))
  }
  return payload
}

export async function attachThreadTerminal(input: ThreadTerminalAttachInput): Promise<ThreadTerminalSession> {
  const payload = await fetchTerminalJson('/codex-api/thread-terminal/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const session = normalizeThreadTerminalSession(asRecord(payload)?.session)
  if (!session) throw new Error('Terminal attach response was malformed')
  return session
}

export async function getThreadTerminalStatus(): Promise<{ available: boolean, reason: string | null }> {
  const payload = await fetchTerminalJson('/codex-api/thread-terminal/status')
  const record = asRecord(payload)
  return {
    available: readBoolean(record?.available) ?? false,
    reason: readString(record?.reason) || null,
  }
}

export async function getThreadTerminalQuickCommands(cwd: string): Promise<ThreadTerminalQuickCommand[]> {
  const payload = await fetchTerminalJson(`/codex-api/thread-terminal/quick-commands?cwd=${encodeURIComponent(cwd)}`)
  const payloadRecord = asRecord(payload)
  const rows: unknown[] = Array.isArray(payloadRecord?.commands) ? payloadRecord.commands : []
  return rows.flatMap((row: unknown) => {
    const record = asRecord(row)
    const label = readString(record?.label)
    const value = readString(record?.value)
    const source = readString(record?.source)
    if (!label || !value || (source !== 'package' && source !== 'script' && source !== 'make')) return []
    return [{ label, value, source }]
  })
}

export async function sendThreadTerminalInput(sessionId: string, data: string): Promise<void> {
  await fetchTerminalJson('/codex-api/thread-terminal/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, data }),
  })
}

export async function resizeThreadTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
  await fetchTerminalJson('/codex-api/thread-terminal/resize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, cols, rows }),
  })
}

export async function closeThreadTerminal(sessionId: string): Promise<void> {
  await fetchTerminalJson('/codex-api/thread-terminal/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
}

export async function getThreadTerminalSnapshot(threadId: string): Promise<ThreadTerminalSession | null> {
  const payload = await fetchTerminalJson(`/codex-api/thread-terminal-snapshot?threadId=${encodeURIComponent(threadId)}`)
  return normalizeThreadTerminalSession(asRecord(payload)?.session)
}