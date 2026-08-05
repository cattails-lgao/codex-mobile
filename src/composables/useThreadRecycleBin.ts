import { ref } from 'vue'
import { unarchiveThread } from '../api/codexGateway'

export type ArchivedThreadRecord = {
  id: string
  title: string
  cwd: string
  projectName: string
  archivedAtIso: string
}

const STORAGE_KEY = 'codex-web-local.recycle-bin.v1'

function readStore(): ArchivedThreadRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is ArchivedThreadRecord =>
        !!entry && typeof entry.id === 'string' && typeof entry.title === 'string',
    )
  } catch {
    return []
  }
}

function writeStore(records: ArchivedThreadRecord[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // localStorage can be unavailable (private mode / quota); the in-memory
    // list still works for this session.
  }
}

const records = ref<ArchivedThreadRecord[]>(readStore())

export function useThreadRecycleBin() {
  function loadRecords(): void {
    records.value = readStore()
  }

  function recordArchivedThread(entry: Omit<ArchivedThreadRecord, 'archivedAtIso'>): void {
    records.value = [
      { ...entry, archivedAtIso: new Date().toISOString() },
      ...records.value.filter((record) => record.id !== entry.id),
    ]
    writeStore(records.value)
  }

  function removeArchivedRecord(threadId: string): void {
    records.value = records.value.filter((record) => record.id !== threadId)
    writeStore(records.value)
  }

  async function restoreArchivedThread(
    threadId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!records.value.some((record) => record.id === threadId)) {
      return { ok: false, error: 'Thread is not in the recycle bin' }
    }
    try {
      await unarchiveThread(threadId)
      removeArchivedRecord(threadId)
      return { ok: true }
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Failed to restore thread'
      return { ok: false, error: message }
    }
  }

  return {
    records,
    loadRecords,
    recordArchivedThread,
    removeArchivedRecord,
    restoreArchivedThread,
  }
}
