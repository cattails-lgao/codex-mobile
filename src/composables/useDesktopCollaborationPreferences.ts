import { ref, type Ref } from 'vue'
import { getAvailableCollaborationModes } from '../api/codexGateway'
import type { CollaborationModeKind, CollaborationModeOption } from '../types/codex'
import {
  pruneThreadContextStateMap,
  readSelectedCollaborationMode,
  toThreadContextId,
  writeSelectedCollaborationModeForContext,
} from './useDesktopStateContext'
import {
  loadSelectedCollaborationModeMap,
  saveSelectedCollaborationModeMap,
} from './useDesktopStatePersistence'

export function createDesktopCollaborationPreferences(selectedThreadId: Ref<string>) {
  const availableCollaborationModes = ref<CollaborationModeOption[]>([
    { value: 'default', label: 'Default' },
    { value: 'plan', label: 'Plan' },
  ])
  const selectedCollaborationModeByContext = ref<Record<string, CollaborationModeKind>>(
    loadSelectedCollaborationModeMap(),
  )
  const selectedCollaborationMode = ref<CollaborationModeKind>(
    readSelectedCollaborationMode(selectedCollaborationModeByContext.value, selectedThreadId.value),
  )

  function setSelectedCollaborationMode(mode: CollaborationModeKind): void {
    const nextMode: CollaborationModeKind = mode === 'plan' ? 'plan' : 'default'
    const contextId = toThreadContextId(selectedThreadId.value)
    const currentMode = readSelectedCollaborationMode(selectedCollaborationModeByContext.value, selectedThreadId.value)
    if (currentMode === nextMode && selectedCollaborationMode.value === nextMode) return
    selectedCollaborationMode.value = nextMode
    selectedCollaborationModeByContext.value = writeSelectedCollaborationModeForContext(
      selectedCollaborationModeByContext.value,
      contextId,
      nextMode,
    )
    saveSelectedCollaborationModeMap(selectedCollaborationModeByContext.value)
  }

  function setSelectedCollaborationModeForThread(threadId: string, mode: CollaborationModeKind): void {
    const nextMode = mode === 'plan' ? 'plan' : 'default'
    selectedCollaborationModeByContext.value = writeSelectedCollaborationModeForContext(
      selectedCollaborationModeByContext.value,
      threadId,
      nextMode,
    )
    if (threadId.trim() === selectedThreadId.value) {
      selectedCollaborationMode.value = nextMode
    }
    saveSelectedCollaborationModeMap(selectedCollaborationModeByContext.value)
  }

  function syncSelectedThreadCollaborationMode(threadId: string): void {
    selectedCollaborationMode.value = readSelectedCollaborationMode(
      selectedCollaborationModeByContext.value,
      threadId,
    )
  }

  function pruneThreadCollaborationState(activeThreadIds: Set<string>): void {
    const nextMap = pruneThreadContextStateMap(selectedCollaborationModeByContext.value, activeThreadIds)
    if (nextMap === selectedCollaborationModeByContext.value) return
    selectedCollaborationModeByContext.value = nextMap
    syncSelectedThreadCollaborationMode(selectedThreadId.value)
    saveSelectedCollaborationModeMap(nextMap)
  }

  async function refreshCollaborationModes(): Promise<void> {
    try {
      const modes = await getAvailableCollaborationModes()
      availableCollaborationModes.value = modes
      if (!modes.some((mode) => mode.value === selectedCollaborationMode.value)) {
        setSelectedCollaborationMode('default')
      }
    } catch {
      // Keep the last known collaboration mode choices on transient failures.
    }
  }

  return {
    availableCollaborationModes,
    selectedCollaborationMode,
    pruneThreadCollaborationState,
    refreshCollaborationModes,
    setSelectedCollaborationMode,
    setSelectedCollaborationModeForThread,
    syncSelectedThreadCollaborationMode,
  }
}
