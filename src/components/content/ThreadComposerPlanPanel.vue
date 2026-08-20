<template>
  <div
    class="thread-composer-plan-panel"
    :data-streaming="planPanel.streaming"
  >
    <ComposerPopover
      :open="isPlanDetailOpen"
      align="center"
      width="lg"
      panel-class="thread-composer-plan-panel-popover"
      :aria-label="t('Plan')"
      @update:open="isPlanDetailOpen = $event"
    >
      <template #trigger>
        <button
          type="button"
          class="thread-composer-plan-panel-header"
          :aria-expanded="isPlanDetailOpen"
          @click="isPlanDetailOpen = !isPlanDetailOpen"
        >
          <span class="thread-composer-plan-panel-icon" aria-hidden="true">🗒</span>
          <span class="thread-composer-plan-panel-title">{{ t('Plan') }}</span>
          <span v-if="planPanel.streaming" class="thread-composer-plan-panel-badge">{{ t('Updating') }}</span>
          <span class="thread-composer-plan-panel-progress">
            {{ completedPlanStepCount }}/{{ planPanel.steps.length }}
          </span>
          <span class="thread-composer-plan-panel-latest" :title="latestPlanStep?.step ?? ''">
            <span v-if="latestPlanStep" class="thread-composer-plan-panel-latest-status" :data-status="latestPlanStep.status">
              {{ planStepStatusIcon(latestPlanStep.status) }}
            </span>
            <span class="thread-composer-plan-panel-latest-text">{{ latestPlanStep?.step ?? '' }}</span>
          </span>
          <IconTablerChevronDown class="thread-composer-plan-panel-chevron" />
        </button>
      </template>
      <div class="thread-composer-plan-panel-popover-content">
        <div class="thread-composer-plan-panel-popover-scroll">
          <header class="thread-composer-plan-panel-popover-head">
            <span class="thread-composer-plan-panel-icon" aria-hidden="true">🗒</span>
            <span class="thread-composer-plan-panel-title">{{ t('Plan') }}</span>
            <span class="thread-composer-plan-panel-progress">
              {{ completedPlanStepCount }}/{{ planPanel.steps.length }}
            </span>
          </header>
          <section v-if="planPanel.explanation" class="thread-composer-plan-panel-popover-section">
            <p class="thread-composer-plan-panel-section-label">{{ t('Summary') }}</p>
            <p class="thread-composer-plan-panel-explanation" :title="planPanel.explanation">
              {{ planSummaryText }}
            </p>
          </section>
          <section class="thread-composer-plan-panel-popover-section">
            <p class="thread-composer-plan-panel-section-label">{{ t('Steps') }} ({{ planPanel.steps.length }})</p>
            <ol class="thread-composer-plan-panel-steps">
              <li
                v-for="(step, index) in planPanel.steps"
                :key="`composer-plan-${planPanel.id}-${index}`"
                class="thread-composer-plan-panel-step"
                :data-status="step.status"
              >
                <span class="thread-composer-plan-panel-step-status" :data-status="step.status">
                  {{ planStepStatusIcon(step.status) }}
                </span>
                <span class="thread-composer-plan-panel-step-text" :title="step.step">{{ step.step }}</span>
              </li>
            </ol>
          </section>
        </div>
        <footer class="thread-composer-plan-panel-popover-footer">
          <button
            type="button"
            class="thread-composer-plan-panel-implement"
            :disabled="planPanel.streaming || planPanel.implemented"
            :data-state="planPanel.implemented ? 'done' : planPanel.streaming ? 'running' : 'idle'"
            @click="onPlanPanelImplement"
          >
            {{ planPanel.implemented ? t('Plan executed') : planPanel.streaming ? t('Implementing…') : t('Implement plan') }}
          </button>
        </footer>
      </div>
    </ComposerPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import ComposerPopover from './ComposerPopover.vue'

export type ComposerPlanPanelData = {
  id: string
  streaming: boolean
  explanation: string
  steps: Array<{ step: string; status: 'pending' | 'inProgress' | 'completed' }>
  implemented: boolean
}

const props = defineProps<{
  planPanel: ComposerPlanPanelData
}>()

const emit = defineEmits<{
  'implement-plan': []
}>()

const { t } = useUiLanguage()

const isPlanDetailOpen = ref(false)

const completedPlanStepCount = computed(() => {
  const steps = props.planPanel?.steps ?? []
  return steps.filter((step) => step.status === 'completed').length
})
const latestPlanStep = computed(() => {
  const steps = props.planPanel?.steps ?? []
  if (steps.length === 0) return null
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]
    if (step.status === 'inProgress') return step
  }
  return steps[steps.length - 1]
})
// round-23：摘要改为一句话（按中英文句末标点/换行截取第一句，超长截断加省略号）
const planSummaryText = computed(() => {
  const explanation = props.planPanel?.explanation?.trim() ?? ''
  if (!explanation) return ''
  const firstSentence = explanation.split(/[。！？!?\n]/u)[0]?.trim() ?? ''
  if (!firstSentence) return explanation
  const maxLength = 80
  return firstSentence.length > maxLength ? `${firstSentence.slice(0, maxLength)}…` : firstSentence
})
function planStepStatusIcon(status: 'pending' | 'inProgress' | 'completed'): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'inProgress':
      return '•'
    default:
      return '○'
  }
}
function onPlanPanelImplement(): void {
  isPlanDetailOpen.value = false
  emit('implement-plan')
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer-plan-panel {
  @apply mb-2 overflow-visible rounded-xl border border-zinc-200 bg-zinc-50;
}

.thread-composer-plan-panel[data-streaming='true'] {
  @apply border-sky-200 bg-sky-50;
}

.thread-composer-plan-panel-header {
  @apply flex w-full items-center gap-2 border-0 bg-transparent px-2.5 py-1.5 text-left transition hover:bg-zinc-100;
}

.thread-composer-plan-panel-icon {
  @apply text-sm leading-none;
}

.thread-composer-plan-panel-chevron {
  @apply h-3.5 w-3.5 shrink-0 text-zinc-400;
}

.thread-composer-plan-panel-title {
  @apply text-xs font-semibold text-zinc-800;
}

.thread-composer-plan-panel-badge {
  @apply rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white;
}

.thread-composer-plan-panel-progress {
  @apply shrink-0 text-[11px] tabular-nums text-zinc-500;
}

.thread-composer-plan-panel-latest {
  @apply flex min-w-0 flex-1 items-center gap-1.5;
}

.thread-composer-plan-panel-latest-status {
  @apply shrink-0 text-xs leading-none;
}

.thread-composer-plan-panel-latest-status[data-status='completed'] {
  @apply text-emerald-600;
}

.thread-composer-plan-panel-latest-status[data-status='inProgress'] {
  @apply text-sky-600;
}

.thread-composer-plan-panel-latest-status[data-status='pending'] {
  @apply text-zinc-400;
}

.thread-composer-plan-panel-latest-text {
  @apply min-w-0 truncate text-xs text-zinc-600;
}

.thread-composer-plan-panel-explanation {
  /* round-23：摘要一句话 + 超出省略 */
  @apply m-0 line-clamp-2 break-words rounded-xl bg-zinc-100 px-3 py-2 text-xs leading-5;
  color: #4b5563;
}

.thread-composer-plan-panel-steps {
  @apply m-0 flex list-none flex-col gap-1.5 p-0;
}

.thread-composer-plan-panel-step {
  /* round-23：步骤项改为一行，超出省略 */
  @apply flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs leading-5;
  color: #4b5563;
}

.thread-composer-plan-panel-step-status {
  @apply w-3.5 shrink-0 text-center;
}

.thread-composer-plan-panel-step-status[data-status='completed'] {
  @apply text-emerald-600;
}

.thread-composer-plan-panel-step-status[data-status='inProgress'] {
  @apply text-sky-600;
}

.thread-composer-plan-panel-step-status[data-status='pending'] {
  @apply text-zinc-400;
}

.thread-composer-plan-panel-step-text {
  @apply min-w-0 flex-1 truncate;
}

.thread-composer-plan-panel-implement {
  @apply h-10 w-full rounded-full bg-zinc-900 px-4 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300;
}

:deep(.thread-composer-plan-panel-popover) {
  /* round-23：popover 整体不滚动，内容区滚动、执行按钮固定在底部 */
  @apply flex min-w-full max-h-[min(60vh,28rem)] flex-col overflow-hidden p-0;
}

.thread-composer-plan-panel-popover-content {
  @apply flex min-h-0 flex-1 flex-col;
}

.thread-composer-plan-panel-popover-scroll {
  @apply flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5;
}

.thread-composer-plan-panel-popover-footer {
  @apply shrink-0 border-t border-zinc-200 p-3;
}

.thread-composer-plan-panel-popover-head {
  @apply flex items-center gap-2 border-b border-zinc-200 pb-2.5;
}

.thread-composer-plan-panel-popover-section {
  @apply min-w-0;
}

.thread-composer-plan-panel-section-label {
  @apply m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400;
}
</style>