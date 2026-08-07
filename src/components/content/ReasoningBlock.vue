<template>
  <div class="reasoning-block" :data-state="expanded ? 'expanded' : 'collapsed'">
    <button
      type="button"
      class="reasoning-block-header"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <span class="reasoning-block-icon" aria-hidden="true">🧠</span>
      <span class="reasoning-block-title">{{ t('Thinking process') }}</span>
      <span class="reasoning-block-toggle" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-if="expanded" class="reasoning-block-body">
      <p v-if="summaryText" class="reasoning-block-summary">{{ summaryText }}</p>
      <div class="reasoning-block-content message-card" v-html="contentHtml" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiMessage } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'

const props = defineProps<{
  message: UiMessage
  expanded: boolean
  contentHtml: string
}>()

defineEmits<{
  toggle: []
}>()

const { t } = useUiLanguage()

const summaryText = computed(() => {
  const summary = props.message.reasoning?.summary ?? []
  return summary
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
})
</script>

<style scoped>
@reference "tailwindcss";

.reasoning-block {
  @apply w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/80;
}

.reasoning-block-header {
  @apply flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-100;
}

.reasoning-block-icon {
  @apply text-sm leading-none;
}

.reasoning-block-title {
  /* round-23 字体规范：思考文字 #737373 */
  @apply flex-1 text-xs font-semibold;
  color: #737373;
}

.reasoning-block-toggle {
  @apply text-xs text-zinc-400;
}

.reasoning-block-body {
  @apply border-t border-zinc-200 px-3 py-2;
}

.reasoning-block-summary {
  /* round-23 字体规范：思考文字 #737373 */
  @apply mb-2 whitespace-pre-wrap text-xs;
  color: #737373;
}

.reasoning-block-content {
  /* round-23 字体规范：思考文字 #737373 */
  @apply max-h-72 overflow-y-auto text-[13px] leading-relaxed;
  color: #737373;
}

.reasoning-block-content :deep(.message-text),
.reasoning-block-content :deep(.message-heading),
.reasoning-block-content :deep(.message-list) {
  @apply text-[13px] leading-relaxed;
  color: inherit;
}
</style>
