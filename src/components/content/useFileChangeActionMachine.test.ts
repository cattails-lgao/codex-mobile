import { describe, expect, it, vi } from 'vitest'
import type { UiFileChange } from '../../types/codex'
import type { TurnFileChangeSummary } from '../../utils/conversationFileChanges'
import { createFileChangeActionMachine, type FileChangeActionMachineDeps } from './useFileChangeActionMachine'

function summary(turnId: string): TurnFileChangeSummary {
  return { turnId, source: 'assistant', sourceMessageIds: ['m1'], changes: [] as UiFileChange[] }
}

type UpdateResult = {
  changed: number
  errors: string[]
  message?: string
  revertedPatchIds?: string[]
  appliedPatchIds?: string[]
}

type UpdateFn = (
  threadId: string,
  turnId: string,
  cwd: string,
  action: 'undo' | 'redo',
  patchIds?: string[],
  scope?: string,
  filePaths?: string[],
) => Promise<UpdateResult>

function buildDeps(overrides: Partial<{ threadId: string; cwd: string; update: UpdateFn; appliedIds?: string[]; revertedIds?: string[] }> = {}) {
  const threadId = overrides.threadId ?? 'thread-1'
  const cwd = overrides.cwd ?? '/repo'
  const onFileChangesChanged = vi.fn()

  const update: UpdateFn = overrides.update
    ? overrides.update
    : vi.fn<UpdateFn>(async (_tid, _turn, _cwd, action) => {
        return {
          changed: 1,
          errors: [],
          revertedPatchIds: action === 'undo' ? (overrides.revertedIds ?? ['p1', 'p2']) : undefined,
          appliedPatchIds: action === 'redo' ? (overrides.appliedIds ?? ['p1', 'p2']) : undefined,
        }
      })

  const deps: FileChangeActionMachineDeps = {
    getActiveThreadId: () => threadId,
    getCwd: () => cwd,
    onFileChangesChanged,
    updateThreadFileChanges: update,
    t: (key) => `【${key}】`,
  }

  return {
    machine: createFileChangeActionMachine(deps),
    onFileChangesChanged,
    update,
  }
}

describe('useFileChangeActionMachine', () => {
  it('computes a stable action key from active thread and turn', () => {
    const { machine } = buildDeps()
    expect(machine.fileChangeActionKey(summary('t1'))).toBe('thread:thread-1:turn:t1')
    expect(machine.isFileChangeActionable(summary('t1'))).toBe(true)
    expect(machine.isFileChangeActionable(null)).toBe(false)
  })

  it('is idle by default and falls back to idle for null summary', () => {
    const { machine } = buildDeps()
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('idle')
    expect(machine.fileChangeActionStatus(null)).toBe('idle')
    expect(machine.fileChangeNextAction(summary('t1'))).toBe('undo')
    expect(machine.fileChangeActionLabel(summary('t1'))).toBe('【Undo】')
  })

  it('runs undo and records reverted patch ids', async () => {
    const { machine, onFileChangesChanged, update } = buildDeps()
    await machine.runFileChangeAction(summary('t1'), 'undo')
    expect(update).toHaveBeenCalledWith('thread-1', 't1', '/repo', 'undo', undefined, 'single_turn', undefined)
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('undone')
    expect(machine.fileChangeRedoPatchIds.value).toEqual({ 'thread:thread-1:turn:t1': ['p1', 'p2'] })
    expect(onFileChangesChanged).toHaveBeenCalledTimes(1)
  })

  it('runs redo and feeds cached patch ids back to the server', async () => {
    const { machine, update } = buildDeps()
    await machine.runFileChangeAction(summary('t1'), 'undo')
    await machine.runFileChangeAction(summary('t1'), 'redo')

    // The redo call should pass the cached redo patch ids captured after the undo.
    const redoCall = (update as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(redoCall[1]).toBe('t1')
    expect(redoCall[3]).toBe('redo')
    expect(redoCall[4]).toEqual(['p1', 'p2'])
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('redone')
  })

  it('exposes pending labels while an action is in flight', async () => {
    let resolveRun: (r: UpdateResult) => void
    const gate = new Promise<UpdateResult>((resolve) => {
      resolveRun = resolve
    })
    const { machine } = buildDeps({
      update: (_t, _tr, _c, action) => action === 'undo' ? gate : Promise.resolve({ changed: 1, errors: [], revertedPatchIds: ['p'] }),
    })

    const running = machine.runFileChangeAction(summary('t1'), 'undo')
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('undoing')
    expect(machine.fileChangeActionLabel(summary('t1'))).toBe('【Undoing】')

    resolveRun!({ changed: 1, errors: [], revertedPatchIds: ['p'] })
    await running
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('undone')
  })

  it('surfaces server errors and keeps a partial undo redoable', async () => {
    const { machine } = buildDeps({
      update: () => Promise.resolve({ changed: 0, errors: ['disk conflict'], message: 'conflict', revertedPatchIds: ['p1'] }),
    })
    await machine.runFileChangeAction(summary('t1'), 'undo')
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('undone')
    expect(machine.fileChangeActionErrorText(summary('t1'))).toBe('disk conflict')
  })

  it('reverts to previous state when nothing changed and no message is returned', async () => {
    const { machine } = buildDeps({
      update: () => Promise.resolve({ changed: 0, errors: [], message: undefined }),
    })
    await machine.runFileChangeAction(summary('t1'), 'undo')
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('idle')
    expect(machine.fileChangeActionErrorText(summary('t1'))).toBe('【No file changes to undo.】')
  })

  it('prefers the server message when nothing changed', async () => {
    const { machine } = buildDeps({
      update: () => Promise.resolve({ changed: 0, errors: [], message: 'already reverted' }),
    })
    await machine.runFileChangeAction(summary('t1'), 'undo')
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('idle')
    expect(machine.fileChangeActionErrorText(summary('t1'))).toBe('already reverted')
  })

  it('reverts to previous state and records error when update throws', async () => {
    const { machine } = buildDeps({
      update: () => Promise.reject(new Error('network down')),
    })
    await machine.runFileChangeAction(summary('t1'), 'undo')
    expect(machine.fileChangeActionStatus(summary('t1'))).toBe('idle')
    expect(machine.fileChangeActionErrorText(summary('t1'))).toBe('network down')
  })

  it('is a no-op when there is no summary, thread or cwd', async () => {
    const { machine, update } = buildDeps()
    await machine.runFileChangeAction(null, 'undo')
    expect(update).not.toHaveBeenCalled()

    const emptyThread = buildDeps({ threadId: '' })
    await emptyThread.machine.runFileChangeAction(summary('t1'), 'undo')
    expect(emptyThread.update).not.toHaveBeenCalled()

    const emptyCwd = buildDeps({ cwd: '' })
    await emptyCwd.machine.runFileChangeAction(summary('t1'), 'undo')
    expect(emptyCwd.update).not.toHaveBeenCalled()
  })

  it('clears all state on reset', async () => {
    const { machine } = buildDeps()
    await machine.runFileChangeAction(summary('t1'), 'undo')
    machine.resetFileChangeActions()
    expect(machine.fileChangeActionState.value).toEqual({})
    expect(machine.fileChangeActionError.value).toEqual({})
    expect(machine.fileChangeRedoPatchIds.value).toEqual({})
  })
})