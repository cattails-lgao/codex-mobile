import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMAND_OUTPUT_INLINE_LIMIT_BYTES,
  getCommandOutputSpillDir,
  resolveCommandOutputSpillPath,
  slimThreadTurnsPayload,
} from './payloadSlimming'
import { sanitizeThreadTurnsInlinePayloads } from '../codexAppServerBridge'

// Spill files land in the real OS temp directory (os.tmpdir() is cached by
// libuv, so a per-test TMPDIR override would not take effect). Track them and
// delete them afterwards instead.
const createdSpillRefs = new Set<string>()

afterEach(async () => {
  for (const ref of createdSpillRefs) {
    const spillPath = resolveCommandOutputSpillPath(ref)
    if (!spillPath) continue
    try {
      await unlink(spillPath)
    } catch {
      // already gone
    }
  }
  createdSpillRefs.clear()
})

function threadWithItems(items: unknown[]): Record<string, unknown> {
  return {
    thread: {
      id: 'thread-1',
      turns: [{ id: 'turn-1', items }],
    },
  }
}

function readItems(result: unknown): Array<Record<string, unknown>> {
  const thread = (result as { thread: { turns: Array<{ items: Array<Record<string, unknown>> }> } }).thread
  return thread.turns[0]?.items ?? []
}

let uniqueSalt = 0
function uniqueBody(prefix: string, chars: number): string {
  uniqueSalt += 1
  return `${prefix}-${String(uniqueSalt)}-${'a'.repeat(chars)}`
}

describe('resolveCommandOutputSpillPath', () => {
  it('maps a sha1 handle to a file inside the spill directory', () => {
    const ref = 'a'.repeat(40)
    expect(resolveCommandOutputSpillPath(ref)).toBe(join(getCommandOutputSpillDir(), `${ref}.txt`))
  })

  it('rejects anything that is not a bare sha1 digest', () => {
    for (const ref of ['', '   ', '../../etc/passwd', 'a'.repeat(39), 'z'.repeat(40), `${'a'.repeat(40)}/../x`]) {
      expect(resolveCommandOutputSpillPath(ref)).toBeNull()
    }
  })
})

describe('slimThreadTurnsPayload — mcpToolCall.result', () => {
  it('drops the unread result field and keeps everything the UI reads', async () => {
    const result = threadWithItems([
      { id: 'mcp-1', type: 'mcpToolCall', server: 'srv', tool: 'search', status: 'completed', durationMs: 12, result: 'x'.repeat(5000) },
    ])

    const items = readItems(await slimThreadTurnsPayload('thread/read', result))

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 'mcp-1', type: 'mcpToolCall', server: 'srv', tool: 'search', status: 'completed', durationMs: 12 })
    expect('result' in items[0]).toBe(false)
  })

  it('returns the input untouched when there is no result field', async () => {
    const result = threadWithItems([{ id: 'mcp-1', type: 'mcpToolCall', tool: 'noop' }])
    expect(await slimThreadTurnsPayload('thread/read', result)).toBe(result)
  })
})

describe('slimThreadTurnsPayload — command output', () => {
  it('keeps head and tail, records the spill, and leaves the full text on disk', async () => {
    const fullOutput = `${uniqueBody('HEAD', 60_000)}-TAIL`
    const result = threadWithItems([
      { id: 'cmd-1', type: 'commandExecution', command: 'run', aggregatedOutput: fullOutput },
    ])

    const item = readItems(await slimThreadTurnsPayload('thread/read', result))[0]
    const truncated = item.aggregatedOutput as string
    const spill = item.aggregatedOutputSpill as { ref: string; totalBytes: number; omittedBytes: number }
    createdSpillRefs.add(spill.ref)

    const totalBytes = Buffer.byteLength(fullOutput, 'utf8')
    expect(spill.totalBytes).toBe(totalBytes)
    expect(spill.omittedBytes).toBeGreaterThan(0)
    expect(spill.totalBytes - spill.omittedBytes).toBeLessThanOrEqual(COMMAND_OUTPUT_INLINE_LIMIT_BYTES)
    expect(truncated).toContain('…')
    expect(truncated.startsWith('HEAD-')).toBe(true)
    expect(truncated.endsWith('-TAIL')).toBe(true)
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThan(totalBytes)

    expect(spill.ref).toMatch(/^[0-9a-f]{40}$/u)
    const spillPath = resolveCommandOutputSpillPath(spill.ref)
    expect(spillPath).not.toBeNull()
    await expect(readFile(spillPath as string, 'utf8')).resolves.toBe(fullOutput)
  })

  it('does not cut a multi-byte code point in half', async () => {
    const fullOutput = '中'.repeat(20_000)
    const result = threadWithItems([{ id: 'cmd-1', type: 'commandExecution', aggregatedOutput: fullOutput }])

    const item = readItems(await slimThreadTurnsPayload('thread/read', result))[0]
    createdSpillRefs.add((item.aggregatedOutputSpill as { ref: string }).ref)
    expect(String(item.aggregatedOutput)).not.toContain('\uFFFD')
  })

  it('leaves an output at or under the inline window alone', async () => {
    const result = threadWithItems([
      { id: 'cmd-1', type: 'commandExecution', aggregatedOutput: 'x'.repeat(COMMAND_OUTPUT_INLINE_LIMIT_BYTES) },
    ])
    expect(await slimThreadTurnsPayload('thread/read', result)).toBe(result)
  })
})

describe('slimThreadTurnsPayload — scope', () => {
  it('ignores methods that do not carry turns', async () => {
    const result = threadWithItems([{ id: 'mcp-1', type: 'mcpToolCall', result: 'x' }])
    expect(await slimThreadTurnsPayload('thread/list', result)).toBe(result)
    expect(await slimThreadTurnsPayload('account/rateLimits/read', result)).toBe(result)
  })

  it('tolerates a payload without turns', async () => {
    const result = { thread: { id: 'thread-1' } }
    expect(await slimThreadTurnsPayload('thread/read', result)).toBe(result)
  })
})

describe('sanitizeThreadTurnsInlinePayloads wiring', () => {
  it('applies slimming before the inline-media walk', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', threadWithItems([
      { id: 'mcp-1', type: 'mcpToolCall', server: 'srv', tool: 'search', result: 'x'.repeat(2048) },
      { id: 'cmd-1', type: 'commandExecution', command: 'run', aggregatedOutput: 'y'.repeat(40_000) },
    ]))

    const items = readItems(result)
    expect('result' in items[0]).toBe(false)
    expect(items[1].aggregatedOutputSpill).toBeTruthy()
    createdSpillRefs.add((items[1].aggregatedOutputSpill as { ref: string }).ref)
  })
})
