import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// round-77：轮耗时镜像改为「只发增量」。此前每次保存都会把全部线程的每一轮逐条
// PUT，启动合并服务端存档后还会把服务端已有数据原样回写（写放大，实测 27 个 PUT、
// thread/resume 平均 224ms → 84ms）。这里锁住三条不变量：从服务端种子化后不回写、
// 只上行变化的那一轮、重复保存不再发。
const persistCalls: Array<{ threadId: string; turnId: string; durationMs: number }> = []

vi.mock('../api/codexGateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/codexGateway')>()
  return {
    ...actual,
    persistThreadTurnDuration: vi.fn(async (threadId: string, turnId: string, durationMs: number) => {
      persistCalls.push({ threadId, turnId, durationMs })
    }),
  }
})

const { savePersistedTurnDurationMap, seedMirroredTurnDurations } = await import('./useDesktopStatePersistence')

function stubWindow(): void {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  }
}

describe('savePersistedTurnDurationMap incremental mirroring (round-77)', () => {
  beforeEach(() => {
    persistCalls.length = 0
    stubWindow()
  })

  afterEach(() => {
    seedMirroredTurnDurations({})
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('does not re-PUT entries that were seeded from the server archive', () => {
    const archive = { t1: { turn1: 1000, turn2: 2000 }, t2: { turn1: 500 } }
    seedMirroredTurnDurations(archive)
    savePersistedTurnDurationMap(archive)
    expect(persistCalls).toHaveLength(0)
  })

  it('PUTs only the newly added/changed turn', () => {
    seedMirroredTurnDurations({ t1: { turn1: 1000, turn2: 2000 } })
    savePersistedTurnDurationMap({ t1: { turn1: 1000, turn2: 2000, turn3: 3000 } })
    expect(persistCalls).toEqual([{ threadId: 't1', turnId: 'turn3', durationMs: 3000 }])
  })

  it('skips unchanged values on repeat saves', () => {
    const state = { t1: { turn1: 1000 } }
    savePersistedTurnDurationMap(state)
    expect(persistCalls).toHaveLength(1)
    savePersistedTurnDurationMap(state)
    expect(persistCalls).toHaveLength(1)
  })
})
