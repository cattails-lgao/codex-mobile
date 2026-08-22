import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../types/codex'
import {
  inferNextTurnIndex,
  rebindLiveFileChangeTurnIndices,
  replaceTurnIndexLookupForThread,
  resolveThreadTurnIndex,
  setTurnIndexForThread,
  type TurnIndexDeps,
} from './useDesktopStateTurnIndex'

function makeDeps(): TurnIndexDeps {
  return {
    turnIndexByTurnIdByThreadId: ref<Record<string, Record<string, number>>>({}),
    persistedMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
    liveFileChangeMessagesByThreadId: ref<Record<string, UiMessage[]>>({}),
  }
}

describe('useDesktopStateTurnIndex', () => {
  it('inferNextTurnIndex returns max persisted turnIndex + 1', () => {
    const deps = makeDeps()
    deps.persistedMessagesByThreadId.value = {
      t1: [
        { id: 'a', role: 'system', text: '', turnIndex: 0 } as UiMessage,
        { id: 'b', role: 'system', text: '', turnIndex: 3 } as UiMessage,
      ],
    }
    expect(inferNextTurnIndex(deps, 't1')).toBe(4)
  })

  it('setTurnIndexForThread sets and refuses invalid input', () => {
    const deps = makeDeps()
    setTurnIndexForThread(deps, 't1', 'turn1', 2)
    expect(deps.turnIndexByTurnIdByThreadId.value.t1.turn1).toBe(2)
    setTurnIndexForThread(deps, 't1', 'turn1', 2)
    expect(deps.turnIndexByTurnIdByThreadId.value.t1.turn1).toBe(2)
    setTurnIndexForThread(deps, 't1', 'turn2', -1)
    expect(deps.turnIndexByTurnIdByThreadId.value.t1.turn2).toBeUndefined()
  })

  it('replaceTurnIndexLookupForThread replaces the whole lookup', () => {
    const deps = makeDeps()
    replaceTurnIndexLookupForThread(deps, 't1', { turnA: 0 })
    replaceTurnIndexLookupForThread(deps, 't1', { turnA: 0 })
    replaceTurnIndexLookupForThread(deps, 't1', { turnA: 0, turnB: 1 })
    expect(deps.turnIndexByTurnIdByThreadId.value.t1).toEqual({ turnA: 0, turnB: 1 })
  })

  it('resolveThreadTurnIndex reads known turn index and undefined for missing', () => {
    const deps = makeDeps()
    setTurnIndexForThread(deps, 't1', 'turn1', 2)
    expect(resolveThreadTurnIndex(deps, 't1', 'turn1')).toBe(2)
    expect(resolveThreadTurnIndex(deps, 't1', 'nope')).toBeUndefined()
    expect(resolveThreadTurnIndex(deps, '', 'turn1')).toBeUndefined()
  })

  it('rebindLiveFileChangeTurnIndices fills missing turnIndex from lookup', () => {
    const deps = makeDeps()
    setTurnIndexForThread(deps, 't1', 'turn1', 2)
    deps.liveFileChangeMessagesByThreadId.value = {
      t1: [
        { id: 'fc1', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn1' } as UiMessage,
        { id: 'fc2', role: 'system', text: '', messageType: 'fileChange', turnId: 'turn1', turnIndex: 9 } as UiMessage,
      ],
    }
    rebindLiveFileChangeTurnIndices(deps, 't1')
    const messages = deps.liveFileChangeMessagesByThreadId.value.t1
    expect(messages[0].turnIndex).toBe(2)
    expect(messages[1].turnIndex).toBe(9)
  })
})