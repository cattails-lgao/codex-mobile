// round-113：文件回退路由的有界上下文读取契约。
//
// `/codex-api/thread/rollback-files` 只需要 session log 路径 + 目标轮及其后的轮次
// id，却一直发全量 `thread/read {includeTurns:true}`（12.12MB 线程实测 2634ms）。
// 现在由元数据读（拿 path）+ `notLoaded` id 链（拿 id）拼出同样的事实；任何一半不
// 可信就返回 null，调用方回落全量读（= 改动前的行为）。
import { describe, expect, it, vi } from 'vitest'
import { readRollbackTurnContext } from './rollbackTurnContext.js'

const META = {
  thread: {
    id: 'thread-1',
    path: '/tmp/rollout.jsonl',
    model: 'gpt-test',
    turns: [],
  },
}

type Call = { method: string; params: Record<string, unknown> }

function turn(id: string): Record<string, unknown> {
  return { id, items: [] }
}

function harness(options: {
  meta?: unknown
  idPages?: unknown[]
}) {
  const calls: Call[] = []
  let pageIndex = 0
  const rpc = vi.fn(async (method: string, params: unknown) => {
    const p = (params ?? {}) as Record<string, unknown>
    calls.push({ method, params: p })
    if (method === 'thread/read') {
      if (options.meta instanceof Error) throw options.meta
      return options.meta
    }
    if (method !== 'thread/turns/list') throw new Error(`unexpected method ${method}`)
    const seq = options.idPages ?? [{ data: [], nextCursor: null }]
    const value = seq[Math.min(pageIndex++, seq.length - 1)]
    if (value instanceof Error) throw value
    return value
  })
  return { appServer: { rpc }, rpc, calls }
}

describe('readRollbackTurnContext', () => {
  it('collects the path and the full id chain as metadata + one notLoaded page', async () => {
    const h = harness({ meta: META, idPages: [{ data: [turn('t3'), turn('t2'), turn('t1')], nextCursor: null }] })

    const context = await readRollbackTurnContext(h.appServer, 'thread-1')

    // metadata read carries no turns; the ids come from the free listing
    expect(h.calls).toEqual([
      { method: 'thread/read', params: { threadId: 'thread-1', includeTurns: false } },
      { method: 'thread/turns/list', params: { threadId: 'thread-1', limit: 10000, sortDirection: 'desc', itemsView: 'notLoaded' } },
    ])
    expect(context).toEqual({ sessionPath: '/tmp/rollout.jsonl', turnIds: ['t1', 't2', 't3'] })
  })

  it('walks the cursor chain and returns the ids oldest-first', async () => {
    const h = harness({
      meta: META,
      idPages: [
        { data: [turn('t5'), turn('t4')], nextCursor: 'cursor-back' },
        { data: [turn('t3'), turn('t2')], nextCursor: 'cursor-back-2' },
        { data: [turn('t1')], nextCursor: null },
      ],
    })

    const context = await readRollbackTurnContext(h.appServer, 'thread-1')

    expect(context?.turnIds).toEqual(['t1', 't2', 't3', 't4', 't5'])
    const pageCalls = h.calls.filter((c) => c.method === 'thread/turns/list')
    expect(pageCalls).toHaveLength(3)
    // only the follow-up pages carry a cursor
    expect(pageCalls[0].params.cursor).toBeUndefined()
    expect(pageCalls[1].params.cursor).toBe('cursor-back')
    expect(pageCalls[2].params.cursor).toBe('cursor-back-2')
  })

  it('answers "no session log" without listing ids when the metadata read has no path', async () => {
    const h = harness({ meta: { thread: { id: 'thread-1' } } })

    const context = await readRollbackTurnContext(h.appServer, 'thread-1')

    expect(context).toEqual({ sessionPath: '', turnIds: [] })
    expect(h.calls).toEqual([{ method: 'thread/read', params: { threadId: 'thread-1', includeTurns: false } }])
  })

  it('returns null when the metadata read fails, so the caller hydrates', async () => {
    const h = harness({ meta: new Error('thread/read failed') })

    expect(await readRollbackTurnContext(h.appServer, 'thread-1')).toBeNull()
    expect(h.calls).toHaveLength(1)
  })

  it('returns null when thread/turns/list is unsupported (older builds)', async () => {
    const h = harness({
      meta: META,
      idPages: [new Error('-32601: list_turns is not supported yet')],
    })

    expect(await readRollbackTurnContext(h.appServer, 'thread-1')).toBeNull()
  })

  it('returns null when the id listing cannot be trusted (id-less turn)', async () => {
    const h = harness({ meta: META, idPages: [{ data: [{ items: [] }], nextCursor: null }] })

    expect(await readRollbackTurnContext(h.appServer, 'thread-1')).toBeNull()
  })

  it('returns null when the listing shape is unexpected', async () => {
    const h = harness({ meta: META, idPages: [{ nope: true }] })

    expect(await readRollbackTurnContext(h.appServer, 'thread-1')).toBeNull()
  })

  it('does nothing without a thread id', async () => {
    const h = harness({ meta: META })

    expect(await readRollbackTurnContext(h.appServer, '')).toBeNull()
    expect(h.rpc).not.toHaveBeenCalled()
  })
})
