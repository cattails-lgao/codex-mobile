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
@reference "../../style.css";

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

/* 「谁在干活」用 --model（紫）标示：它不是状态，所以不占用 live/ok/alert 三色，
   但必须一眼区别于右侧那三个中性配置芯片——这是本方案允许出现的第四个强调色。
   这也是审计第②条缺陷的正面修法：四个下拉原本长得一模一样，只靠位置猜。 */
.thread-composer-model-control :deep(.composer-dropdown-trigger--pill) {
  @apply border-model/40 bg-model/12 text-model hover:border-model/70 hover:text-model;
}

/* disabled 与 enabled 是同权重的两条规则（都在 --pill 上），谁赢取决于样式表顺序——不能靠这个。
   显式写出来：不可用时退回中性墨色，跟其余三个芯片一致（颜色只表示状态，什么都不在跑就没有颜色）。 */
.thread-composer-model-control :deep(.composer-dropdown-trigger--pill:disabled) {
  @apply border-line-1 bg-transparent text-ink-4;
}

/* 模型名前的点：颜色取 currentColor，于是自动就是 --model，不需要再写一遍色值。 */
.thread-composer-model-control :deep(.composer-dropdown-trigger--pill)::before {
  content: "";
  @apply h-1.5 w-1.5 shrink-0 rounded-full bg-current;
}

.thread-composer-thinking-control :deep(.composer-dropdown-options) {
  @apply max-h-64;
}

@media (max-width: 767px) {
  .thread-composer-model-control {
    @apply max-w-32;
  }

  .thread-composer-control :deep(.composer-dropdown-trigger--pill) {
    @apply h-7 px-2 text-micro;
  }

  .thread-composer-control :deep(.composer-dropdown-chevron) {
    @apply h-3 w-3;
  }
}
</style>