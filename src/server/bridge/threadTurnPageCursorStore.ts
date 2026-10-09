// Persistence for the older-turn cursor chain (round-136).
//
// The chain (`ThreadTurnPageCursorChain`) is what lets a scroll up the history
// reach an older page with one `thread/turns/list` instead of a full-history
// `thread/read` -- 969ms against 7202ms for the same anchor on the same thread
// (round-132 §3.1). It lives in process memory, so every bridge restart threw
// it away and the first scroll after each restart walked the slow path; a
// restart also happens on every packaged-app launch and every dev-server reload.
//
// Where this is stored, and why not `.codex-global-state.json`: that file is
// shared with the queue/workspace/thread-preference slices and is read-modify-
// written as a whole, and the app-server itself may be writing it. This payload
// is a pure high-churn cache (one registration per scroll step) that can hold
// thousands of opaque cursors, so a sidecar keeps every other writer's file
// small and avoids racing them. The caps below are what keep the sidecar small
// in turn.
//
// Nothing here is authoritative. A cursor can outlive the turns it points at (a
// revert, a rollback, an app-server restart renumbering the rollout), so the
// reader verifies every fetched page against a fresh id listing and treats a
// mismatch as a fallback -- never as a wrong answer (threadTurnPage.ts). A
// missing, unreadable, or corrupt file is simply an empty chain: the next
// registry entry is rebuilt from one cheap id listing.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { asRecord, getCodexHomeDir, readNonEmptyString } from './core.js'

export type ThreadTurnPageCursors = Record<string, Record<string, string>>

/**
 * Persisted size cap. The in-memory chain holds 64 threads x 256 anchors per
 * thread; what has to survive a restart is only the threads someone is actually
 * scrolling, and the whole point of the file is that rewriting it on a debounce
 * is free. The most recently recorded entries win -- insertion order is the
 * chain's own LRU order, so the same rule applies before and after a restart.
 */
export const THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS = 8
export const THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS = 64

export function getThreadTurnPageCursorsPath(): string {
  return join(getCodexHomeDir(), 'codex-mobile-turn-page-cursors.json')
}

export function normalizeThreadTurnPageCursors(value: unknown): ThreadTurnPageCursors {
  const record = asRecord(value)
  if (!record) return {}

  const normalized: ThreadTurnPageCursors = {}
  for (const [threadId, rawTurns] of Object.entries(record)) {
    const normalizedThreadId = threadId.trim()
    const turns = asRecord(rawTurns)
    if (!normalizedThreadId || !turns) continue

    const perThread: Record<string, string> = {}
    for (const [turnId, rawCursor] of Object.entries(turns)) {
      const normalizedTurnId = turnId.trim()
      const cursor = readNonEmptyString(rawCursor)
      if (normalizedTurnId && cursor) perThread[normalizedTurnId] = cursor
    }
    if (Object.keys(perThread).length > 0) normalized[normalizedThreadId] = perThread
  }
  return normalized
}

export function capThreadTurnPageCursors(state: ThreadTurnPageCursors): ThreadTurnPageCursors {
  const capped: ThreadTurnPageCursors = {}
  const keptThreadIds = Object.keys(state).slice(-THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS)
  for (const threadId of keptThreadIds) {
    const entries = Object.entries(state[threadId])
    capped[threadId] = Object.fromEntries(entries.slice(-THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS))
  }
  return capped
}

/** Best-effort read: absent, unreadable, or corrupt all mean an empty chain. */
export async function readThreadTurnPageCursors(): Promise<ThreadTurnPageCursors> {
  try {
    const raw = await readFile(getThreadTurnPageCursorsPath(), 'utf8')
    return normalizeThreadTurnPageCursors(JSON.parse(raw))
  } catch {
    return {}
  }
}

let writeChain: Promise<unknown> = Promise.resolve()

/**
 * Serialized writes: the bridge debounces, but a restart-flush and a debounce
 * firing can still overlap, and this file is rewritten whole.
 */
export async function writeThreadTurnPageCursors(state: ThreadTurnPageCursors): Promise<void> {
  const run = writeChain.then(async () => {
    const capped = capThreadTurnPageCursors(normalizeThreadTurnPageCursors(state))
    await writeFile(getThreadTurnPageCursorsPath(), JSON.stringify(capped), 'utf8')
  })
  writeChain = run.catch(() => {})
  return run
}
