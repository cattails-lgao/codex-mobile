// round-136：上翻游标链的持久化 sidecar，以及链自身的 hydrate/snapshot。
//
// 链是「上翻一页 969ms」与「回落全量读 7202ms」的差别（round-132 §3.1），而它
// 原本只活在进程内存里 —— 每次桥重启（打包版每次启动、dev 每次热重载）都会丢掉，
// 于是每个会话的第一次上翻都走慢路径。这里钉住：落盘位置在 CODEX_HOME 下、
// 读回来与写出去同形、容量上限在两侧都生效、坏文件等同空链。
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThreadTurnPageCursorChain } from './threadTurnPage'
import {
  capThreadTurnPageCursors,
  getThreadTurnPageCursorsPath,
  normalizeThreadTurnPageCursors,
  readThreadTurnPageCursors,
  THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS,
  THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS,
  writeThreadTurnPageCursors,
} from './threadTurnPageCursorStore'

const originalCodexHome = process.env.CODEX_HOME
let home = ''

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-turn-page-cursors-'))
  process.env.CODEX_HOME = home
})

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
  if (home) await rm(home, { recursive: true, force: true })
  home = ''
})

describe('normalizeThreadTurnPageCursors', () => {
  it('keeps only thread -> turn -> non-empty cursor strings', () => {
    expect(normalizeThreadTurnPageCursors({
      a: { t0: 'c0', t1: '', '  ': 'c1' },
      '  ': { t0: 'c0' },
      b: 'nope',
      c: { t2: 42 },
      d: { t3: '   ' },
    })).toEqual({ a: { t0: 'c0' } })
    expect(normalizeThreadTurnPageCursors(null)).toEqual({})
    expect(normalizeThreadTurnPageCursors([])).toEqual({})
    expect(normalizeThreadTurnPageCursors('nope')).toEqual({})
  })
})

describe('capThreadTurnPageCursors', () => {
  it('keeps the most recently recorded threads and anchors, not the first ones', () => {
    const state: Record<string, Record<string, string>> = {}
    for (let t = 0; t < THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS + 3; t += 1) {
      const turns: Record<string, string> = {}
      for (let n = 0; n < THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS + 2; n += 1) turns[`t${n}`] = `c${t}-${n}`
      state[`th${t}`] = turns
    }

    const capped = capThreadTurnPageCursors(state)

    expect(Object.keys(capped)).toHaveLength(THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS)
    expect(Object.keys(capped)).not.toContain('th0')
    expect(Object.keys(capped)).toContain(`th${THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS + 2}`)
    const anchors = Object.keys(capped[`th${THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_THREADS + 2}`])
    expect(anchors).toHaveLength(THREAD_TURN_PAGE_CURSOR_PERSIST_MAX_TURNS)
    expect(anchors).not.toContain('t0')
  })
})

describe('readThreadTurnPageCursors / writeThreadTurnPageCursors', () => {
  it('lives under $CODEX_HOME and round-trips', async () => {
    await writeThreadTurnPageCursors({ 'thread-1': { t6: 'cursor-6' } })

    expect(getThreadTurnPageCursorsPath().startsWith(home)).toBe(true)
    expect(JSON.parse(await readFile(getThreadTurnPageCursorsPath(), 'utf8'))).toEqual({ 'thread-1': { t6: 'cursor-6' } })
    expect(await readThreadTurnPageCursors()).toEqual({ 'thread-1': { t6: 'cursor-6' } })
  })

  it('is an empty chain when the file is absent, corrupt, or holds junk', async () => {
    expect(await readThreadTurnPageCursors()).toEqual({})

    await writeFile(getThreadTurnPageCursorsPath(), 'not json at all', 'utf8')
    expect(await readThreadTurnPageCursors()).toEqual({})

    await writeFile(getThreadTurnPageCursorsPath(), JSON.stringify({ a: { t0: 1 }, b: 2 }), 'utf8')
    expect(await readThreadTurnPageCursors()).toEqual({})
  })

  it('normalizes on the way out, so junk never reaches the file', async () => {
    await writeThreadTurnPageCursors({ 'thread-1': { t0: 'c0', t1: '' }, '  ': { t0: 'c0' } })

    expect(JSON.parse(await readFile(getThreadTurnPageCursorsPath(), 'utf8'))).toEqual({ 'thread-1': { t0: 'c0' } })
  })
})

describe('ThreadTurnPageCursorChain hydrate/snapshot', () => {
  it('round-trips a snapshot', () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', 'cursor-6')
    chain.record('thread-2', 't1', 'cursor-1')

    expect(chain.snapshot()).toEqual({ 'thread-1': { t6: 'cursor-6' }, 'thread-2': { t1: 'cursor-1' } })

    const restored = new ThreadTurnPageCursorChain()
    restored.hydrate(chain.snapshot())
    expect(restored.lookup('thread-1', 't6')).toBe('cursor-6')
    expect(restored.lookup('thread-2', 't1')).toBe('cursor-1')
  })

  it('applies the caps while hydrating, and tolerates a missing snapshot', () => {
    const chain = new ThreadTurnPageCursorChain({ maxTurnsPerThread: 2 })
    chain.hydrate({ 'thread-1': { t0: 'c0', t1: 'c1', t2: 'c2' }, 'thread-2': { t3: '' } })

    expect(chain.lookup('thread-1', 't0')).toBeNull()
    expect(chain.lookup('thread-1', 't2')).toBe('c2')
    expect(chain.lookup('thread-2', 't3')).toBeNull()
    expect(chain.snapshot()).toEqual({ 'thread-1': { t1: 'c1', t2: 'c2' } })

    chain.hydrate(null)
    chain.hydrate(undefined)
    expect(chain.lookup('thread-1', 't2')).toBe('c2')
  })

  it('survives a restart: snapshot -> file -> a fresh chain', async () => {
    const chain = new ThreadTurnPageCursorChain()
    chain.record('thread-1', 't6', 'cursor-6')
    await writeThreadTurnPageCursors(chain.snapshot())

    const revived = new ThreadTurnPageCursorChain()
    revived.hydrate(await readThreadTurnPageCursors())
    expect(revived.lookup('thread-1', 't6')).toBe('cursor-6')
  })
})
