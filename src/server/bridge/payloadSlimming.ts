// Thread-turn payload slimming slice (round-76 performance work).
//
// Measured baseline before this slice: a single `thread/read` for the heaviest
// local thread returned 13.55MB / 19 turns, and ~92% of every thread payload
// was large text that the UI never renders in full:
//
//   - `commandExecution.aggregatedOutput`  74% of bytes (one block: 803KB,
//     while command blocks render collapsed by default)
//   - `mcpToolCall.result`                 18% of bytes, and the frontend never
//     reads the field at all (see api/normalizers/v2.ts — the mcpToolCall branch
//     only reads server/tool/status/error/durationMs)
//
// The upstream Codex TUI already collapses and middle-truncates command output
// (`truncate_lines_middle` + `TOOL_CALL_MAX_LINES`), and Claude Code keeps only
// a ~30K character inline window before spilling the rest to a session file and
// returning a path. This slice copies that consensus shape: keep a bounded
// inline window, spill the overflow to disk, and let the client ask for it back
// through /codex-api/command-output.
//
// Runs as the first pass of sanitizeThreadTurnsInlinePayloads so every reader of
// thread turns (rpc pipeline, thread-turn-page, thread-live-state) is covered by
// a single call site.
import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asRecord, THREAD_METHODS_WITH_TURNS } from './core.js'

// Inline window kept for a single command block. Sized to the same order of
// magnitude as Claude Code's 30K-character bash window while staying small
// enough that ten turns of logs stay well under a megabyte.
export const COMMAND_OUTPUT_INLINE_LIMIT_BYTES = 16 * 1024

// Above this the overflow is truncated but deliberately not written to disk, so
// a pathological command cannot fill the temp directory.
export const COMMAND_OUTPUT_SPILL_MAX_BYTES = 8 * 1024 * 1024

const COMMAND_OUTPUT_SPILL_DIR_NAME = 'codex-web-command-output'
const SPILL_REF_PATTERN = /^[0-9a-f]{40}$/u

// Fraction of the inline window kept from the head of the output. The tail share
// (the remainder) is what usually carries the error or the summary, so both ends
// survive truncation — matching how the terminal tools behave.
const HEAD_BYTES_RATIO = 0.6

export type CommandOutputSpill = {
  // Opaque sha1 handle for /codex-api/command-output. Empty when the output
  // exceeded COMMAND_OUTPUT_SPILL_MAX_BYTES and was not persisted.
  ref: string
  totalBytes: number
  omittedBytes: number
}

export function getCommandOutputSpillDir(): string {
  return join(tmpdir(), COMMAND_OUTPUT_SPILL_DIR_NAME)
}

/**
 * Map an opaque spill handle back to its file path. Returns null for anything
 * that is not a bare sha1 digest, so the read-back route cannot be walked into
 * an arbitrary path.
 */
export function resolveCommandOutputSpillPath(ref: string): string | null {
  const normalized = ref.trim().toLowerCase()
  if (!SPILL_REF_PATTERN.test(normalized)) return null
  return join(getCommandOutputSpillDir(), `${normalized}.txt`)
}

function truncateUtf8Middle(text: string, limitBytes: number): { text: string; omittedBytes: number } {
  const buffer = Buffer.from(text, 'utf8')
  const headBytes = Math.floor(limitBytes * HEAD_BYTES_RATIO)
  const tailBytes = Math.max(0, limitBytes - headBytes)
  // A byte slice can cut a multi-byte code point in half; UTF-8 decoding turns
  // that into U+FFFD, so drop the replacement characters at each seam.
  const head = buffer.subarray(0, headBytes).toString('utf8').replace(/\uFFFD+$/u, '')
  const tail = buffer.subarray(Math.max(0, buffer.length - tailBytes)).toString('utf8').replace(/^\uFFFD+/u, '')
  const keptBytes = Buffer.byteLength(head, 'utf8') + Buffer.byteLength(tail, 'utf8')
  return {
    text: `${head}\n…\n${tail}`,
    omittedBytes: Math.max(0, buffer.length - keptBytes),
  }
}

async function spillCommandOutputToDisk(text: string): Promise<string> {
  try {
    const ref = createHash('sha1').update(text, 'utf8').digest('hex')
    const spillDir = getCommandOutputSpillDir()
    await mkdir(spillDir, { recursive: true })
    const filePath = join(spillDir, `${ref}.txt`)
    try {
      await stat(filePath)
    } catch {
      await writeFile(filePath, text, 'utf8')
    }
    return ref
  } catch {
    // A failed spill must never fail the thread read; the caller still gets the
    // truncated output plus the omitted-byte count.
    return ''
  }
}

function slimMcpToolCallItem(item: Record<string, unknown>): Record<string, unknown> | null {
  if (!('result' in item)) return null
  const next = { ...item }
  delete next.result
  return next
}

async function slimCommandExecutionItem(item: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const output = item.aggregatedOutput
  if (typeof output !== 'string' || output.length === 0) return null

  const totalBytes = Buffer.byteLength(output, 'utf8')
  if (totalBytes <= COMMAND_OUTPUT_INLINE_LIMIT_BYTES) return null

  const { text, omittedBytes } = truncateUtf8Middle(output, COMMAND_OUTPUT_INLINE_LIMIT_BYTES)
  const ref = totalBytes <= COMMAND_OUTPUT_SPILL_MAX_BYTES ? await spillCommandOutputToDisk(output) : ''

  return {
    ...item,
    aggregatedOutput: text,
    aggregatedOutputSpill: { ref, totalBytes, omittedBytes } satisfies CommandOutputSpill,
  }
}

/**
 * Drop unread MCP tool results and cap oversized command output. Returns the
 * input unchanged when nothing needed slimming (so callers can cheaply detect
 * a no-op).
 */
export async function slimThreadTurnsPayload(method: string, result: unknown): Promise<unknown> {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length === 0) return result

  let changed = false
  const nextTurns: unknown[] = []
  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : null
    if (!turnRecord || !items) {
      nextTurns.push(turn)
      continue
    }

    let itemChanged = false
    const nextItems: unknown[] = []
    for (const item of items) {
      const itemRecord = asRecord(item)
      if (!itemRecord) {
        nextItems.push(item)
        continue
      }

      const itemType = itemRecord.type
      const slimmedItem = itemType === 'mcpToolCall'
        ? slimMcpToolCallItem(itemRecord)
        : itemType === 'commandExecution'
          ? await slimCommandExecutionItem(itemRecord)
          : null

      if (!slimmedItem) {
        nextItems.push(item)
        continue
      }
      itemChanged = true
      nextItems.push(slimmedItem)
    }

    if (!itemChanged) {
      nextTurns.push(turn)
      continue
    }
    changed = true
    nextTurns.push({ ...turnRecord, items: nextItems })
  }

  if (!changed) return result
  return {
    ...record,
    thread: {
      ...thread,
      turns: nextTurns,
    },
  }
}
