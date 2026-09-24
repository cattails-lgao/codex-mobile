<template>
  <div class="tool-batch-block" :class="{ 'tool-batch-block--open': open }">
    <button
      type="button"
      class="tool-batch-head"
      :aria-expanded="open"
      :title="title"
      @click="open = !open"
    >
      <span class="tool-batch-toggle" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
      <span class="tool-batch-icon" aria-hidden="true">🛠</span>
      <span class="tool-batch-label">{{ label }}</span>
      <span class="tool-batch-count">{{ messages.length }}</span>
    </button>
    <div v-if="open" class="tool-batch-body">
      <ToolCallRow v-for="message in messages" :key="message.id" :message="message" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiMessage } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { buildToolBatchLabel, type ToolBatchKind } from '../../utils/toolAggregation'
import ToolCallRow from './ToolCallRow.vue'

const props = defineProps<{
  kind: ToolBatchKind
  messages: UiMessage[]
}>()

const { t } = useUiLanguage()

const open = ref(false)

const label = computed(() => buildToolBatchLabel(props.kind, props.messages, { t }))

const title = computed(() => props.messages.map((message) => message.toolCall?.tool ?? '').join(' · '))
</script>

<style scoped>
@reference "../../style.css";

.tool-batch-block {
  @apply w-full min-w-0 border-l-2 border-line-1 pl-2;
}

.tool-batch-head {
  @apply flex w-full min-h-[30px] items-center gap-1.5 px-0 py-1 text-left transition hover:text-ink-1;
}

.tool-batch-toggle {
  @apply shrink-0 text-nano leading-none text-ink-3;
}

.tool-batch-icon {
  @apply shrink-0 text-xs leading-none;
}

.tool-batch-label {
  @apply min-w-0 flex-1 truncate text-xs font-medium text-ink-3;
}

.tool-batch-count {
  @apply shrink-0 rounded bg-line-1 px-1.5 py-0.5 font-mono text-nano leading-3 text-ink-3;
}

.tool-batch-body {
  @apply flex flex-col gap-1.5 border-l border-line-1 pl-2 py-1.5;
}
</style>
