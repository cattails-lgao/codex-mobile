import { ref } from 'vue'
import type { TurnFileChangeSummary } from '../../utils/conversationFileChanges'

export type FileChangeActionStatus = 'idle' | 'undoing' | 'redoing' | 'undone' | 'redone'

type UpdateThreadFileChangesFn = (
  threadId: string,
  turnId: string,
  cwd: string,
  action: 'undo' | 'redo',
  patchIds?: string[],
  scope?: 'single_turn' | 'turn_and_later',
  filePaths?: string[],
) => Promise<{ changed: number; errors: string[]; message?: string; revertedPatchIds?: string[]; appliedPatchIds?: string[] }>

export interface FileChangeActionMachineDeps {
  getActiveThreadId: () => string
  getCwd: () => string
  onFileChangesChanged: () => void
  updateThreadFileChanges: UpdateThreadFileChangesFn
  t: (key: string) => string
}

export function createFileChangeActionMachine(deps: FileChangeActionMachineDeps) {
  const { getActiveThreadId, getCwd, onFileChangesChanged, updateThreadFileChanges, t } = deps

  const fileChangeActionState = ref<Record<string, FileChangeActionStatus>>({})
  const fileChangeActionError = ref<Record<string, string>>({})
  const fileChangeRedoPatchIds = ref<Record<string, string[]>>({})

  function fileChangeActionKey(summary: TurnFileChangeSummary | null): string {
    const threadId = getActiveThreadId()
    return summary?.turnId && threadId ? `thread:${threadId}:turn:${summary.turnId}` : ''
  }

  function isFileChangeActionable(summary: TurnFileChangeSummary | null): boolean {
    return fileChangeActionKey(summary).length > 0
  }

  function fileChangeActionStatus(summary: TurnFileChangeSummary | null): FileChangeActionStatus {
    const key = fileChangeActionKey(summary)
    return key ? fileChangeActionState.value[key] ?? 'idle' : 'idle'
  }

  function fileChangeActionErrorText(summary: TurnFileChangeSummary | null): string {
    const key = fileChangeActionKey(summary)
    return key ? fileChangeActionError.value[key] ?? '' : ''
  }

  function fileChangeNextAction(summary: TurnFileChangeSummary | null): 'undo' | 'redo' {
    const status = fileChangeActionStatus(summary)
    return status === 'undone' || status === 'redoing' ? 'redo' : 'undo'
  }

  function fileChangeActionLabel(summary: TurnFileChangeSummary | null): string {
    const status = fileChangeActionStatus(summary)
    if (status === 'undoing') return t('Undoing')
    if (status === 'redoing') return t('Redoing')
    return fileChangeNextAction(summary) === 'redo' ? t('Redo') : t('Undo')
  }

  async function runFileChangeAction(
    summary: TurnFileChangeSummary | null,
    action: 'undo' | 'redo',
    filePaths?: string[],
  ): Promise<void> {
    const key = fileChangeActionKey(summary)
    const threadId = getActiveThreadId()
    const cwd = getCwd()
    if (!summary || !key || !threadId || !cwd) return
    const previousState = fileChangeActionStatus(summary)
    const pendingState = action === 'undo' ? 'undoing' : 'redoing'
    fileChangeActionState.value = { ...fileChangeActionState.value, [key]: pendingState }
    fileChangeActionError.value = { ...fileChangeActionError.value, [key]: '' }

    let result: Awaited<ReturnType<UpdateThreadFileChangesFn>>
    try {
      const patchIds = fileChangeRedoPatchIds.value[key] ?? []
      result = await updateThreadFileChanges(
        threadId,
        summary.turnId,
        cwd,
        action,
        patchIds.length > 0 ? patchIds : undefined,
        'single_turn',
        filePaths,
      )
    } catch (error) {
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: previousState }
      fileChangeActionError.value = {
        ...fileChangeActionError.value,
        [key]: error instanceof Error ? error.message : t('Failed to update file changes.'),
      }
      return
    }

    if (result.errors.length > 0) {
      if (action === 'undo') {
        fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.revertedPatchIds ?? [] }
        fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
      } else {
        if ((result.appliedPatchIds ?? []).length > 0) {
          fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.appliedPatchIds ?? [] }
        }
        fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
      }
      fileChangeActionError.value = { ...fileChangeActionError.value, [key]: result.errors.join('; ') }
      return
    }

    if ((result.changed ?? 0) <= 0) {
      // Nothing was actually reverted/reapplied (e.g. another client already ran
      // this action). Keep the previous state and surface the server message
      // instead of assuming a local undone/redone that the disk does not reflect.
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: previousState }
      fileChangeActionError.value = {
        ...fileChangeActionError.value,
        [key]: result.message || (action === 'undo' ? t('No file changes to undo.') : t('No file changes to redo.')),
      }
      return
    }

    if (action === 'undo') {
      fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.revertedPatchIds ?? [] }
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
    } else {
      fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.appliedPatchIds ?? [] }
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'redone' }
    }
    // Re-read the thread's file-change state so the UI reflects the disk state
    // (covers multi-client sync and refresh consistency).
    onFileChangesChanged()
  }

  function resetFileChangeActions(): void {
    fileChangeActionState.value = {}
    fileChangeActionError.value = {}
    fileChangeRedoPatchIds.value = {}
  }

  return {
    fileChangeActionState,
    fileChangeActionError,
    fileChangeRedoPatchIds,
    fileChangeActionKey,
    isFileChangeActionable,
    fileChangeActionStatus,
    fileChangeActionErrorText,
    fileChangeNextAction,
    fileChangeActionLabel,
    runFileChangeAction,
    resetFileChangeActions,
  }
}