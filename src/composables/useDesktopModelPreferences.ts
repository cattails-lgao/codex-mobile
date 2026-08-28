import { ref, type Ref } from 'vue'
import {
  getAvailableModels,
  getCurrentModelConfig,
  setCodexSpeedMode,
  type AvailableModel,
} from '../api/codexGateway'
import { REASONING_EFFORTS } from '../types/codex'
import type { CollaborationModeKind, ReasoningEffort, SpeedMode } from '../types/codex'
import {
  cloneStringKeyedRecord,
  NEW_THREAD_COLLABORATION_MODE_CONTEXT,
  normalizeProviderContextId,
  normalizeStoredModelId,
  omitStringKeyedRecordKey,
  pruneThreadContextStateMap,
  readSelectedModel,
  toProviderModelContextId,
  toThreadContextId,
} from './useDesktopStateContext'
import {
  areStringArraysEqual,
  isCodexCliMissingError,
  omitKey,
  pruneThreadStateMap,
} from './useDesktopStateUtils'
import {
  loadSelectedModelMap,
  saveSelectedModelMap,
} from './useDesktopStatePersistence'

export const MODEL_FALLBACK_ID = 'gpt-5.4-mini'
export const CODEX_CLI_MISSING_MESSAGE = 'Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'

const OPENCODE_ZEN_DEFAULT_MODEL = 'big-pickle'
const REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = REASONING_EFFORTS

export interface DesktopModelPreferencesDeps {
  selectedThreadId: Ref<string>
  error: Ref<string>
}

export function createDesktopModelPreferences(deps: DesktopModelPreferencesDeps) {
  const availableModelIds = ref<string[]>([])
  const availableModelReasoningEfforts = ref<Record<string, ReasoningEffort[]>>({})
  const availableModelDefaultReasoningEfforts = ref<Record<string, ReasoningEffort>>({})
  const selectedModelIdByContext = ref<Record<string, string>>(loadSelectedModelMap())
  const selectedModelId = ref(readSelectedModel(selectedModelIdByContext.value, deps.selectedThreadId.value))
  const selectedReasoningEffort = ref<ReasoningEffort | ''>('medium')
  const selectedSpeedMode = ref<SpeedMode>('standard')
  const activeProviderId = ref('')
  const codexCliMissingError = ref('')
  const isUpdatingSpeedMode = ref(false)
  const threadModelProviderByThreadId = ref<Record<string, string>>({})
  let hasSelectedReasoningEffortOverride = false

  function readModelIdForThread(threadId: string): string {
    const contextId = toThreadContextId(threadId)
    if (contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT) {
      const normalizedProviderId = normalizeProviderContextId(activeProviderId.value)
      const providerContextId = toProviderModelContextId(normalizedProviderId)
      const providerModelId = providerContextId
        ? normalizeStoredModelId(selectedModelIdByContext.value[providerContextId])
        : ''
      if (providerModelId) return providerModelId
    }
    return readSelectedModel(selectedModelIdByContext.value, threadId).trim()
  }

  function readProviderIdForThread(threadId: string): string {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return normalizeProviderContextId(activeProviderId.value)
    return normalizeProviderContextId(threadModelProviderByThreadId.value[normalizedThreadId] ?? activeProviderId.value)
  }

  function readSupportedReasoningEffortsForModel(modelId: string): readonly ReasoningEffort[] {
    return availableModelReasoningEfforts.value[modelId.trim()] ?? REASONING_EFFORT_OPTIONS
  }

  function pickReasoningEffortForModel(
    modelId: string,
    preferredEffort: ReasoningEffort | '' = selectedReasoningEffort.value,
  ): ReasoningEffort | '' {
    const normalizedModelId = modelId.trim()
    const supportedEfforts = readSupportedReasoningEffortsForModel(normalizedModelId)
    if (preferredEffort && supportedEfforts.includes(preferredEffort)) return preferredEffort
    if (supportedEfforts.includes('medium')) return 'medium'
    const defaultEffort = availableModelDefaultReasoningEfforts.value[normalizedModelId]
    if (defaultEffort && supportedEfforts.includes(defaultEffort)) return defaultEffort
    return supportedEfforts[0] ?? ''
  }

  function ensureReasoningEffortSupportedForModel(modelId: string): void {
    selectedReasoningEffort.value = pickReasoningEffortForModel(modelId)
  }

  function setAvailableModelMetadata(models: AvailableModel[]): void {
    const reasoningEfforts: Record<string, ReasoningEffort[]> = {}
    const defaultReasoningEfforts: Record<string, ReasoningEffort> = {}
    for (const model of models) {
      if (model.supportedReasoningEfforts !== null) {
        reasoningEfforts[model.id] = [...model.supportedReasoningEfforts]
      }
      if (model.defaultReasoningEffort) {
        defaultReasoningEfforts[model.id] = model.defaultReasoningEffort
      }
    }
    availableModelReasoningEfforts.value = reasoningEfforts
    availableModelDefaultReasoningEfforts.value = defaultReasoningEfforts
  }

  function ensureAvailableModelIds(...modelIds: string[]): void {
    const nextModelIds = [...availableModelIds.value]
    for (const modelId of modelIds) {
      const normalizedModelId = modelId.trim()
      if (normalizedModelId && !nextModelIds.includes(normalizedModelId)) {
        nextModelIds.push(normalizedModelId)
      }
    }
    if (!areStringArraysEqual(availableModelIds.value, nextModelIds)) {
      availableModelIds.value = nextModelIds
    }
  }

  function readProviderCompatibleSelectedModel(modelId: string): string {
    const normalizedModelId = modelId.trim()
    if (availableModelIds.value.length === 0) return normalizedModelId
    if (normalizedModelId && availableModelIds.value.includes(normalizedModelId)) return normalizedModelId
    return availableModelIds.value[0] ?? ''
  }

  function setSelectedModelIdForThread(threadId: string, modelId: string): void {
    const normalizedModelId = modelId.trim()
    const contextId = toThreadContextId(threadId)
    const normalizedProviderId = normalizeProviderContextId(activeProviderId.value)
    const providerContextId =
      contextId === NEW_THREAD_COLLABORATION_MODE_CONTEXT
        ? toProviderModelContextId(normalizedProviderId)
        : ''
    const selectedContextId = providerContextId || contextId
    if (normalizedModelId) {
      const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
      nextModelMap[selectedContextId] = normalizedModelId
      if (providerContextId) {
        delete nextModelMap[contextId]
      }
      selectedModelIdByContext.value = nextModelMap
    } else {
      let nextModelMap = omitStringKeyedRecordKey(selectedModelIdByContext.value, selectedContextId)
      if (providerContextId) {
        nextModelMap = omitStringKeyedRecordKey(nextModelMap, contextId)
      }
      selectedModelIdByContext.value = nextModelMap
    }
    if (contextId === toThreadContextId(deps.selectedThreadId.value)) {
      selectedModelId.value = readModelIdForThread(deps.selectedThreadId.value)
      ensureAvailableModelIds(selectedModelId.value)
      ensureReasoningEffortSupportedForModel(selectedModelId.value)
    } else {
      ensureAvailableModelIds(normalizedModelId)
    }
    saveSelectedModelMap(selectedModelIdByContext.value)
  }

  function setSelectedModelId(modelId: string): void {
    setSelectedModelIdForThread(deps.selectedThreadId.value, modelId)
  }

  function setThreadModelId(threadId: string, modelId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    const normalizedModelId = modelId.trim()
    if (normalizedModelId) {
      const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
      nextModelMap[normalizedThreadId] = normalizedModelId
      selectedModelIdByContext.value = nextModelMap
    } else {
      selectedModelIdByContext.value = omitStringKeyedRecordKey(selectedModelIdByContext.value, normalizedThreadId)
    }
    ensureAvailableModelIds(normalizedModelId)
    if (deps.selectedThreadId.value === normalizedThreadId) {
      selectedModelId.value = readModelIdForThread(deps.selectedThreadId.value)
      ensureReasoningEffortSupportedForModel(selectedModelId.value)
    }
    saveSelectedModelMap(selectedModelIdByContext.value)
  }

  function setThreadModelProviderId(threadId: string, providerId: string): void {
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) return

    const normalizedProviderId = normalizeProviderContextId(providerId)
    if (normalizedProviderId) {
      threadModelProviderByThreadId.value = {
        ...threadModelProviderByThreadId.value,
        [normalizedThreadId]: normalizedProviderId,
      }
    } else if (threadModelProviderByThreadId.value[normalizedThreadId]) {
      threadModelProviderByThreadId.value = omitKey(threadModelProviderByThreadId.value, normalizedThreadId)
    }
  }

  function resolveThreadModelForProvider(threadId: string, modelId: string, providerId: string): string {
    const normalizedModelId = modelId.trim()
    const normalizedProviderId = normalizeProviderContextId(providerId)
    if (normalizedProviderId !== 'opencode-zen') {
      return normalizedModelId
    }

    const previousThreadModel = readModelIdForThread(threadId).trim()
    if (previousThreadModel && !/^gpt-/i.test(previousThreadModel)) {
      return previousThreadModel
    }
    if (normalizedModelId && !/^gpt-/i.test(normalizedModelId)) {
      return normalizedModelId
    }
    return OPENCODE_ZEN_DEFAULT_MODEL
  }

  async function applyFallbackModelSelection(threadId: string = deps.selectedThreadId.value): Promise<void> {
    if (threadId.trim()) {
      setThreadModelId(threadId, MODEL_FALLBACK_ID)
    } else {
      setSelectedModelId(MODEL_FALLBACK_ID)
    }
    ensureAvailableModelIds(MODEL_FALLBACK_ID)
  }

  function setSelectedReasoningEffort(effort: ReasoningEffort | ''): void {
    if (effort && !readSupportedReasoningEffortsForModel(selectedModelId.value).includes(effort)) {
      return
    }
    hasSelectedReasoningEffortOverride = true
    selectedReasoningEffort.value = effort
  }

  async function updateSelectedSpeedMode(mode: SpeedMode): Promise<void> {
    const nextMode: SpeedMode = mode === 'fast' ? 'fast' : 'standard'
    if (isUpdatingSpeedMode.value || selectedSpeedMode.value === nextMode) {
      return
    }

    const previousMode = selectedSpeedMode.value
    selectedSpeedMode.value = nextMode
    isUpdatingSpeedMode.value = true
    deps.error.value = ''

    try {
      await setCodexSpeedMode(nextMode)
    } catch (unknownError) {
      selectedSpeedMode.value = previousMode
      deps.error.value = unknownError instanceof Error ? unknownError.message : 'Failed to update Fast mode'
    } finally {
      isUpdatingSpeedMode.value = false
    }
  }

  function buildPendingTurnDetails(
    modelId: string,
    effort: ReasoningEffort | '',
    collaborationMode: CollaborationModeKind,
  ): string[] {
    const modelLabel = modelId.trim() || 'default'
    const effortLabel = effort || 'default'
    const modeLabel = collaborationMode === 'plan' ? 'Plan' : 'Default'
    const speedLabel = selectedSpeedMode.value === 'fast' ? 'Fast' : 'Standard'
    return [`Mode: ${modeLabel}`, `Model: ${modelLabel}`, `Thinking: ${effortLabel}`, `Speed: ${speedLabel}`]
  }

  async function refreshModelPreferences(options?: { providerChanged?: boolean; includeProviderModels?: boolean }): Promise<void> {
    codexCliMissingError.value = ''
    try {
      const currentConfig = await getCurrentModelConfig()
      const normalizedConfiguredModelId = currentConfig.model.trim()
      const normalizedProviderId = normalizeProviderContextId(currentConfig.providerId)
      activeProviderId.value = normalizedProviderId
      const targetProviderId = readProviderIdForThread(deps.selectedThreadId.value)
      const isProviderBacked = targetProviderId !== 'codex' && targetProviderId !== 'custom'
      const normalizedSelectedModelId = readModelIdForThread(deps.selectedThreadId.value)
      const models = await getAvailableModels({
        includeProviderModels: isProviderBacked || options?.includeProviderModels !== false,
        requireProviderModels: isProviderBacked,
        providerId: isProviderBacked ? targetProviderId : undefined,
      })
      const modelIds = models.map((model) => model.id)
      setAvailableModelMetadata(models)
      const providerModelContextId = toProviderModelContextId(targetProviderId)
      const providerScopedModelId = providerModelContextId
        ? normalizeStoredModelId(selectedModelIdByContext.value[providerModelContextId])
        : ''
      const nextModelIds = [...modelIds]
      if (
        !options?.providerChanged
        && isProviderBacked
        && targetProviderId === normalizedProviderId
        && normalizedConfiguredModelId
        && !nextModelIds.includes(normalizedConfiguredModelId)
      ) {
        nextModelIds.push(normalizedConfiguredModelId)
      }
      availableModelIds.value = nextModelIds

      const currentModelInNewList = normalizedSelectedModelId && modelIds.includes(normalizedSelectedModelId)
      if (!normalizedSelectedModelId || !currentModelInNewList || options?.providerChanged) {
        if (options?.providerChanged && nextModelIds.length > 0) {
          if (providerScopedModelId && modelIds.includes(providerScopedModelId)) {
            setSelectedModelId(providerScopedModelId)
          } else if (targetProviderId === normalizedProviderId && normalizedConfiguredModelId && nextModelIds.includes(normalizedConfiguredModelId)) {
            setSelectedModelId(normalizedConfiguredModelId)
          } else {
            setSelectedModelId(nextModelIds[0])
          }
        } else if (targetProviderId === normalizedProviderId && normalizedConfiguredModelId && nextModelIds.includes(normalizedConfiguredModelId)) {
          setSelectedModelId(currentConfig.model)
        } else if (nextModelIds.length > 0) {
          setSelectedModelId(nextModelIds[0])
        } else {
          setSelectedModelId('')
        }
      } else if (selectedModelId.value.trim() !== normalizedSelectedModelId) {
        setSelectedModelId(normalizedSelectedModelId)
      }
      if (providerModelContextId && selectedModelId.value.trim().length > 0) {
        const nextModelMap = cloneStringKeyedRecord(selectedModelIdByContext.value)
        nextModelMap[providerModelContextId] = selectedModelId.value.trim()
        const activeProviderModelContextId = toProviderModelContextId(normalizedProviderId)
        if (
          activeProviderModelContextId
          && activeProviderModelContextId !== providerModelContextId
          && normalizedConfiguredModelId
        ) {
          nextModelMap[activeProviderModelContextId] = normalizedConfiguredModelId
        }
        selectedModelIdByContext.value = nextModelMap
        saveSelectedModelMap(selectedModelIdByContext.value)
      }

      selectedReasoningEffort.value = pickReasoningEffortForModel(
        selectedModelId.value,
        hasSelectedReasoningEffortOverride ? selectedReasoningEffort.value : currentConfig.reasoningEffort,
      )
      selectedSpeedMode.value = currentConfig.speedMode
    } catch (unknownError) {
      codexCliMissingError.value = isCodexCliMissingError(unknownError) ? CODEX_CLI_MISSING_MESSAGE : ''
    }
  }

  function syncSelectedThreadModel(threadId: string): void {
    selectedModelId.value = readProviderCompatibleSelectedModel(readModelIdForThread(threadId))
    ensureReasoningEffortSupportedForModel(selectedModelId.value)
  }

  function pruneThreadModelState(activeThreadIds: Set<string>): void {
    const nextSelectedModelMap = pruneThreadContextStateMap(selectedModelIdByContext.value, activeThreadIds)
    if (nextSelectedModelMap !== selectedModelIdByContext.value) {
      selectedModelIdByContext.value = nextSelectedModelMap
      syncSelectedThreadModel(deps.selectedThreadId.value)
      saveSelectedModelMap(nextSelectedModelMap)
    }
    threadModelProviderByThreadId.value = pruneThreadStateMap(threadModelProviderByThreadId.value, activeThreadIds)
  }

  return {
    activeProviderId,
    availableModelIds,
    availableModelReasoningEfforts,
    codexCliMissingError,
    isUpdatingSpeedMode,
    selectedModelId,
    selectedReasoningEffort,
    selectedSpeedMode,
    applyFallbackModelSelection,
    buildPendingTurnDetails,
    pruneThreadModelState,
    readModelIdForThread,
    refreshModelPreferences,
    resolveThreadModelForProvider,
    setSelectedModelId,
    setSelectedModelIdForThread,
    setSelectedReasoningEffort,
    setThreadModelId,
    setThreadModelProviderId,
    syncSelectedThreadModel,
    updateSelectedSpeedMode,
  }
}
