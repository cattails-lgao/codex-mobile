// Thread-queue state slice, extracted from createCodexBridgeMiddleware.
// Persists the queued backend turns per thread under the 'thread-queue-state'
// key of .codex-global-state.json, canonicalizing entries on read/write with a
// module-level serialized mutation chain. Pure module-level helpers only; the
// per-instance BackendQueueProcessor shell state stays in the bridge shell,
// which consumes readThreadQueueState / withThreadQueueStateUpdate.
import { readFile, writeFile } from 'node:fs/promises'
import { asRecord, getCodexGlobalStatePath, normalizeStringArray } from './core.js'

const THREAD_QUEUE_STATE_KEY = 'thread-queue-state'

export type StoredQueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

export type ThreadQueueState = Record<string, StoredQueuedMessage[]>

export type BackendQueuedTurn = {
  threadId: string
  message: StoredQueuedMessage
}

type ThreadQueueStateUpdate<T> = {
  nextState: ThreadQueueState
  result: T
}

function normalizeStoredQueuedMessage(value: unknown): StoredQueuedMessage | null {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null

  const normalizeNamedPathItems = (items: unknown): Array<{ name: string; path: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const name = typeof itemRecord.name === 'string' ? itemRecord.name.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      return name && path ? [{ name, path }] : []
    })
  }

  const normalizeFileAttachments = (items: unknown): Array<{ label: string; path: string; fsPath: string }> => {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      const itemRecord = asRecord(item)
      if (!itemRecord) return []
      const label = typeof itemRecord.label === 'string' ? itemRecord.label.trim() : ''
      const path = typeof itemRecord.path === 'string' ? itemRecord.path.trim() : ''
      const fsPath = typeof itemRecord.fsPath === 'string' ? itemRecord.fsPath.trim() : ''
      return label && path && fsPath ? [{ label, path, fsPath }] : []
    })
  }

  return {
    id,
    text: typeof record.text === 'string' ? record.text : '',
    imageUrls: normalizeStringArray(record.imageUrls),
    skills: normalizeNamedPathItems(record.skills),
    fileAttachments: normalizeFileAttachments(record.fileAttachments),
    collaborationMode: record.collaborationMode === 'plan' ? 'plan' : 'default',
  }
}

export function normalizeThreadQueueState(value: unknown): ThreadQueueState {
  const record = asRecord(value)
  if (!record) return {}

  const state: ThreadQueueState = {}
  for (const [threadId, rawMessages] of Object.entries(record)) {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId || !Array.isArray(rawMessages)) continue
    const messages = rawMessages.flatMap((item) => {
      const message = normalizeStoredQueuedMessage(item)
      return message ? [message] : []
    })
    if (messages.length > 0) {
      state[normalizedThreadId] = messages
    }
  }
  return state
}

let threadQueueMutationChain: Promise<unknown> = Promise.resolve()

export async function readThreadQueueState(): Promise<ThreadQueueState> {
  const statePath = getCodexGlobalStatePath()
  try {
    const raw = await readFile(statePath, 'utf8')
    const payload = asRecord(JSON.parse(raw)) ?? {}
    return normalizeThreadQueueState(payload[THREAD_QUEUE_STATE_KEY])
  } catch {
    return {}
  }
}

async function writeThreadQueueStateUnlocked(nextState: ThreadQueueState): Promise<void> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }
  const normalized = normalizeThreadQueueState(nextState)
  if (Object.keys(normalized).length > 0) {
    payload[THREAD_QUEUE_STATE_KEY] = normalized
  } else {
    delete payload[THREAD_QUEUE_STATE_KEY]
  }
  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

export async function withThreadQueueStateUpdate<T>(
  update: (state: ThreadQueueState) => ThreadQueueStateUpdate<T> | Promise<ThreadQueueStateUpdate<T>>,
): Promise<T> {
  const run = threadQueueMutationChain.then(async () => {
    const currentState = await readThreadQueueState()
    const { nextState, result } = await update(currentState)
    await writeThreadQueueStateUnlocked(nextState)
    return result
  })
  threadQueueMutationChain = run.catch(() => {})
  return run
}

export async function writeThreadQueueState(nextState: ThreadQueueState): Promise<void> {
  await withThreadQueueStateUpdate(() => ({
    nextState: normalizeThreadQueueState(nextState),
    result: undefined,
  }))
}

export async function appendThreadQueuedMessage(threadId: string, message: StoredQueuedMessage): Promise<void> {
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) throw new Error('threadId is required')
  await withThreadQueueStateUpdate((state) => ({
    nextState: {
      ...state,
      [normalizedThreadId]: [...(state[normalizedThreadId] ?? []), message],
    },
    result: undefined,
  }))
}