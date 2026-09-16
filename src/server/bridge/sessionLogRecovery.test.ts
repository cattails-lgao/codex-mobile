import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeSessionCommandsIntoTurns, mergeSessionCommandsIntoTurnsFromPath } from './session.js'

// The command recovery in `buildSessionItemOrder` was written against a rollout
// that records commands as `function_call` / `function_call_output` named
// `exec_command` or `shell_command`. Current CLI versions write them as
// `custom_tool_call` / `custom_tool_call_output` named `exec` instead, so the
// recovery finds no command slot for a new session at all. What is left is the
// agent-message slots, and interleaving those alone reorders a correct
// app-server feed into "user, agents, then every command" — these tests pin the
// two halves of the fix: the merge must leave such a turn alone, and a log that
// can never contribute must not be read again.

type TestItem = { id: string; type: string }
type TestTurn = { id: string; items: TestItem[] }

const turnWithCommandAfterReply: TestTurn[] = [
  {
    id: 'turn-1',
    items: [
      { id: 'item-1', type: 'userMessage' },
      { id: 'rs-1', type: 'reasoning' },
      { id: 'msg-1', type: 'agentMessage' },
      { id: 'exec-1', type: 'commandExecution' },
      { id: 'exec-2', type: 'commandExecution' },
      { id: 'rs-2', type: 'reasoning' },
      { id: 'msg-2', type: 'agentMessage' },
      { id: 'exec-3', type: 'commandExecution' },
    ],
  },
]

const currentShapeLog = [
  JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', id: 'item-1' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', id: 'rs-1' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-1', content: [{ type: 'output_text', text: 'first reply' }] } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'call_1', input: '{"cmd":"ls"}', status: 'completed' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call_1', output: 'a.txt' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', id: 'rs-2' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', id: 'msg-2', content: [{ type: 'output_text', text: 'second reply' }] } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'call_2', input: '{"cmd":"pwd"}', status: 'completed' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call_2', output: '/tmp' } }),
].join('\n')

const retiredShapeLog = [
  JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', id: 'item-1' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_1', arguments: '{"cmd":"ls"}' } }),
  JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_1', output: 'Chunk ID: 1\nWall time: 0.1s\nProcess exited with code 0\nOutput:\na.txt' } }),
].join('\n')

async function withTempLog(contents: string, run: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'codexapp-session-recovery-'))
  const path = join(dir, 'rollout-test.jsonl')
  try {
    await writeFile(path, contents, 'utf8')
    await run(path)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('mergeSessionCommandsIntoTurns with a current-shape session log', () => {
  it('returns the turn untouched when the log only carries custom_tool_call exec rows', () => {
    const turns = turnWithCommandAfterReply

    const result = mergeSessionCommandsIntoTurns(turns, currentShapeLog)

    // Same array, same item order: the app-server's own interleaving is the
    // best available answer and the recovery must not touch it.
    expect(result).toBe(turns)
    expect(turns[0]!.items.map((item) => item.type)).toEqual([
      'userMessage',
      'reasoning',
      'agentMessage',
      'commandExecution',
      'commandExecution',
      'reasoning',
      'agentMessage',
      'commandExecution',
    ])
  })

  it('is not fooled by a current-shape log whose output text mentions exec_command', () => {
    // These names show up inside command output in real rollouts (a `grep
    // exec_command`, a printed help text), so the shape probe has to read row
    // types rather than scan the raw text for them.
    const noisyLog = [
      currentShapeLog,
      JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'call_3', input: '{"cmd":"grep -r exec_command ."}', status: 'completed' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call_3', output: 'src/session.ts: function_call exec_command shell_command apply_patch' } }),
    ].join('\n')
    const turns = turnWithCommandAfterReply

    expect(mergeSessionCommandsIntoTurns(turns, noisyLog)).toBe(turns)
  })

  it('still interleaves a retired-shape log, so legacy sessions keep their recovery', () => {
    const materialized: TestTurn[] = [
      {
        id: 'turn-1',
        items: [
          { id: 'item-1', type: 'userMessage' },
          { id: 'exec-1', type: 'commandExecution' },
          { id: 'msg-1', type: 'agentMessage' },
        ],
      },
    ]

    const result = mergeSessionCommandsIntoTurns(materialized, retiredShapeLog) as TestTurn[]

    expect(result).not.toBe(materialized)
    expect(result[0]!.items.map((item) => item.type)).toEqual([
      'userMessage',
      'commandExecution',
      'agentMessage',
    ])
  })
})

describe('mergeSessionCommandsIntoTurnsFromPath', () => {
  it('applies the recovery to a retired-shape log', async () => {
    await withTempLog(retiredShapeLog, async (path) => {
      const turns: TestTurn[] = [
        {
          id: 'turn-1',
          items: [
            { id: 'item-1', type: 'userMessage' },
            { id: 'exec-1', type: 'commandExecution' },
            { id: 'msg-1', type: 'agentMessage' },
          ],
        },
      ]

      const result = await mergeSessionCommandsIntoTurnsFromPath(turns, path)

      expect(result).not.toBe(turns)
      expect((result as TestTurn[])[0]!.items.map((item) => item.type)).toEqual([
        'userMessage',
        'commandExecution',
        'agentMessage',
      ])
    })
  })

  it('does not read a log again once it is known that nothing can be recovered', async () => {
    await withTempLog(currentShapeLog, async (path) => {
      // Pin the timestamp to a whole second so the value the cache keys on can
      // be reproduced exactly (Windows mtime carries sub-millisecond digits).
      const pinnedTime = new Date(Math.floor(Date.now() / 1000) * 1000)
      await utimes(path, pinnedTime, pinnedTime)

      const turns = turnWithCommandAfterReply
      expect(await mergeSessionCommandsIntoTurnsFromPath(turns, path)).toBe(turns)

      const before = await stat(path)
      // Swap in a retired-shape log of the same length, then put the original
      // timestamps back. Size and mtime are all the cache keys on, so a second
      // call that reads the file would start interleaving — proving it did not
      // read is exactly what this pins down.
      const recoverableRows = [
        JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: 'call_9', arguments: '{"cmd":"ls"}' } }),
      ].join('\n')
      expect(recoverableRows.length).toBeLessThan(before.size)
      await writeFile(path, recoverableRows.padEnd(before.size, ' '), 'utf8')
      await utimes(path, pinnedTime, pinnedTime)
      const after = await stat(path)
      expect(after.size).toBe(before.size)
      expect(after.mtimeMs).toBe(before.mtimeMs)

      expect(await mergeSessionCommandsIntoTurnsFromPath(turns, path)).toBe(turns)
    })
  })

  it('re-reads once the log grows past the version it was judged on', async () => {
    await withTempLog(currentShapeLog, async (path) => {
      const turns = turnWithCommandAfterReply
      expect(await mergeSessionCommandsIntoTurnsFromPath(turns, path)).toBe(turns)

      await writeFile(path, `${currentShapeLog}\n${retiredShapeLog}`, 'utf8')

      const result = await mergeSessionCommandsIntoTurnsFromPath(turns, path)
      expect(result).not.toBe(turns)
      const items = (result as TestTurn[])[0]!.items
      expect(items.map((item) => item.type)).toContain('commandExecution')
      expect(items.filter((item) => item.id.startsWith('session-cmd-'))).toHaveLength(1)
    })
  })

  it('returns the input when the session log is missing', async () => {
    const turns = turnWithCommandAfterReply
    const missing = join(tmpdir(), 'codexapp-session-recovery-does-not-exist', 'rollout.jsonl')

    expect(await mergeSessionCommandsIntoTurnsFromPath(turns, missing)).toBe(turns)
  })

  it('returns the input when no turn carries an id', async () => {
    await withTempLog(retiredShapeLog, async (path) => {
      const turns = [{ items: [{ id: 'item-1', type: 'userMessage' }] }]

      expect(await mergeSessionCommandsIntoTurnsFromPath(turns, path)).toBe(turns)
    })
  })
})
