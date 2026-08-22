import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { UiFileChange, UiMessage } from '../types/codex'
import {
  rememberLastPlan,
  removeLiveCommandsPersistedIn,
  removeLiveFileChangesPersistedIn,
  upsertLiveAgentMessage,
  upsertLiveCommand,
  upsertLiveFileChangePatch,
  upsertLivePlanMessage,
  upsertTurnDiff,
  type LiveWriteDeps,
} from './useDesktopStateLiveWrites'

function msg(id: string, fields: Partial<UiMessage> = {}): UiMessage {
  return { id, role: 'system', text: '', messageType: 'tool' as const, ...fields }
}

function change(path: string, diff = ''): UiFileChange {
  return { path, operation: 'update', diff, addedLineCount: 1, removedLineCount: 1 }
}

function makeDeps(): LiveWriteDeps {
  return {
    liveCommandsByThreadId: ref<Record<string, UiMessage[]>>({}),
    liveFileChangeMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
    liveAgentMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
    livePlanMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
    lastPlanByThreadId: ref<Record<string, UiMessage>>({}),
  }
}

describe('useDesktopStateLiveWrites commands', () => {
  it('upsertLiveCommand appends and dedupes by id', () => {
    const deps = makeDeps()
    upsertLiveCommand(deps, 't1', msg('c1'))
    upsertLiveCommand(deps, 't1', msg('c2'))
    upsertLiveCommand(deps, 't1', msg('c1'))
    expect(deps.liveCommandsByThreadId.value.t1.map((m) => m.id)).toEqual(['c1', 'c2'])
  })

  it('removeLiveCommandsPersistedIn drops persisted ids and clears empty key', () => {
    const deps = makeDeps()
    upsertLiveCommand(deps, 't1', msg('c1'))
    upsertLiveCommand(deps, 't1', msg('c2'))
    removeLiveCommandsPersistedIn(deps, 't1', [msg('c1')])
    expect(deps.liveCommandsByThreadId.value.t1.map((m) => m.id)).toEqual(['c2'])
    removeLiveCommandsPersistedIn(deps, 't1', [msg('c2')])
    expect(deps.liveCommandsByThreadId.value.t1).toBeUndefined()
  })
})

describe('useDesktopStateLiveWrites file changes', () => {
  it('upsertLiveFileChangePatch patches matching message by id', () => {
    const deps = makeDeps()
    deps.liveFileChangeMessagesByThreadId.value = {
      t1: [{ id: 'fc1', role: 'system', text: '', messageType: 'fileChange', fileChanges: [change('a.ts', 'old')] }],
    }
    upsertLiveFileChangePatch(deps, 't1', 'fc1', [change('a.ts', 'new')])
    expect(deps.liveFileChangeMessagesByThreadId.value.t1[0].fileChanges?.[0].diff).toBe('new')
  })

  it('upsertTurnDiff applies diff to every change of matching turn', () => {
    const deps = makeDeps()
    deps.liveFileChangeMessagesByThreadId.value = {
      t1: [{ id: 'fc1', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn1', fileChanges: [change('a.ts')] }],
    }
    upsertTurnDiff(deps, 't1', 'turn1', 'DIFF')
    const [patched] = deps.liveFileChangeMessagesByThreadId.value.t1[0].fileChanges ?? []
    expect(patched.diff).toBe('DIFF')
  })

  it('removeLiveFileChangesPersistedIn also prunes by turnId/turnIndex match', () => {
    const deps = makeDeps()
    deps.liveFileChangeMessagesByThreadId.value = {
      t1: [
        { id: 'liveA', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn1', turnIndex: 1, fileChanges: [] },
        { id: 'liveB', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn2', turnIndex: 2, fileChanges: [] },
      ],
    }
    removeLiveFileChangesPersistedIn(deps, 't1', [
      { id: 'persistedTurn1', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn1', turnIndex: 1, fileChanges: [] },
    ])
    const remaining = deps.liveFileChangeMessagesByThreadId.value.t1.map((m) => m.id)
    expect(remaining).toEqual(['liveB'])
  })
})

describe('useDesktopStateLiveWrites plan + agent', () => {
  it('upsertLivePlanMessage appends plan and remembers last plan', () => {
    const deps = makeDeps()
    const plan = msg('plan1')
    upsertLivePlanMessage(deps, 't1', plan)
    expect(deps.livePlanMessagesByThreadId.value.t1.map((m) => m.id)).toEqual(['plan1'])
    expect(deps.lastPlanByThreadId.value.t1).toEqual(plan)
  })

  it('upsertLiveAgentMessage dedupes assistant text across ids', () => {
    const deps = makeDeps()
    upsertLiveAgentMessage(deps, 't1', msg('a1', { role: 'assistant', text: 'hello' }))
    upsertLiveAgentMessage(deps, 't1', msg('a2', { role: 'assistant', text: 'hello' }))
    expect(deps.liveAgentMessagesByThreadId.value.t1.map((m) => m.id)).toEqual(['a2'])
  })

  it('rememberLastPlan writes and persists through saveLastPlanMap', async () => {
    const deps = makeDeps()
    const spy = vi.spyOn(await import('./useDesktopStatePersistence'), 'saveLastPlanMap')
    rememberLastPlan(deps, 't1', msg('plan1'))
    expect(deps.lastPlanByThreadId.value.t1.id).toBe('plan1')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})