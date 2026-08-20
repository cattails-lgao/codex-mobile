<template>
  <ComposerDropdown
    class="thread-composer-control thread-composer-model-control"
    :model-value="selectedModel"
    :options="modelOptions"
    :selected-prefix-icon="showFastModeModelIcon ? IconTablerBolt : null"
    :placeholder="t('Model')"
    open-direction="up"
    variant="pill"
    :disabled="isComposerConfigDisabled || models.length === 0"
    enable-search
    :search-placeholder="t('Search models...')"
    @update:model-value="onModelSelect"
  />

  <ComposerDropdown
    class="thread-composer-control thread-composer-thinking-control"
    :model-value="selectedReasoningEffort"
    :options="reasoningOptions"
    :placeholder="t('Thinking')"
    open-direction="up"
    variant="pill"
    :disabled="isComposerConfigDisabled || reasoningOptions.length === 0"
    @update:model-value="onReasoningEffortSelect"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningEffort, SpeedMode } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerBolt from '../icons/IconTablerBolt.vue'
import ComposerDropdown from './ComposerDropdown.vue'

const props = defineProps<{
  models: string[]
  selectedModel: string
  modelReasoningEfforts?: Record<string, ReasoningEffort[]>
  selectedReasoningEffort: ReasoningEffort | ''
  selectedSpeedMode: SpeedMode
  disabled?: boolean
  activeThreadId?: string
}>()

const emit = defineEmits<{
  'update:selected-model': [value: string]
  'update:selected-reasoning-effort': [value: ReasoningEffort | '']
}>()

const { t } = useUiLanguage()

const reasoningOptionCatalog: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]
const reasoningOptions = computed(() => {
  const supportedEfforts = props.modelReasoningEfforts?.[props.selectedModel]
  if (supportedEfforts === undefined) return reasoningOptionCatalog
  const supportedSet = new Set(supportedEfforts)
  return reasoningOptionCatalog.filter((option) => supportedSet.has(option.value))
})
function formatModelLabel(modelId: string): string {
  return modelId.trim().replace(/^gpt/i, 'GPT')
}

const modelOptions = computed(() =>
  props.models.map((modelId) => ({ value: modelId, label: formatModelLabel(modelId) })),
)

const isComposerConfigDisabled = computed(() => props.disabled || !props.activeThreadId)
const isFastModeSupported = computed(() => /^gpt-5\.(?:4|5)(?:$|-)/.test(props.selectedModel.trim()))
const showFastModeModelIcon = computed(() =>
  props.selectedSpeedMode === 'fast' && isFastModeSupported.value,
)

function onModelSelect(value: string): void {
  emit('update:selected-model', value)
}

function onReasoningEffortSelect(value: string): void {
  emit('update:selected-reasoning-effort', value as ReasoningEffort)
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer-control {
  @apply shrink-1 min-w-0;
}

.thread-composer-control :deep(.composer-dropdown-value) {
  @apply truncate;
}

.thread-composer-model-control {
  /* 宽度随模型名自适应（短名不留空白块），上限沿用 round-14 的 160px/128px 档 */
  @apply w-fit max-w-40 min-w-0;
}

.thread-composer-model-control :deep(.composer-dropdown-trigger) {
  @apply w-full;
}

.thread-composer-thinking-control :deep(.composer-dropdown-options) {
  @apply max-h-64;
}

@media (max-width: 767px) {
  .thread-composer-model-control {
    @apply max-w-32;
  }

  .thread-composer-control :deep(.composer-dropdown-trigger--pill) {
    @apply h-7 px-2 text-[11px];
  }

  .thread-composer-control :deep(.composer-dropdown-chevron) {
    @apply h-3 w-3;
  }
}
</style>