<template>
  <div class="message-row" data-role="system">
    <div class="message-stack" data-role="system">
      <div class="tool-call-block" :class="statusClass" :title="title">
        <span class="tool-call-icon" aria-hidden="true">🛠</span>
        <span v-if="message.toolCall?.server" class="tool-call-server">{{ message.toolCall.server }}</span>
        <code class="tool-call-name">{{ message.toolCall?.tool || message.text || '(tool)' }}</code>
        <span class="tool-call-status">
          <span v-if="message.toolCall?.status === 'inProgress'" class="work-block-spinner" aria-hidden="true" />
          <span v-else-if="message.toolCall?.status === 'completed'" class="tool-call-status-icon" aria-hidden="true">✓</span>
          <span v-else class="tool-call-status-icon" aria-hidden="true">✗</span>
          {{ statusLabel }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiMessage } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'

const props = defineProps<{
  message: UiMessage
}>()

const { t } = useUiLanguage()

const statusLabel = computed(() => {
  const toolCall = props.message.toolCall
  if (!toolCall) return ''
  switch (toolCall.status) {
    case 'inProgress': return t('Running')
    case 'failed': return t('Failed')
    default: return t('Done')
  }
})

const statusClass = computed(() => {
  switch (props.message.toolCall?.status) {
    case 'inProgress': return 'tool-call-running'
    case 'failed': return 'tool-call-error'
    default: return 'tool-call-ok'
  }
})

const title = computed(() => {
  const toolCall = props.message.toolCall
  if (!toolCall) return ''
  const parts: string[] = []
  if (toolCall.server) parts.push(toolCall.server)
  parts.push(toolCall.tool)
  if (toolCall.error) parts.push(toolCall.error)
  if (typeof toolCall.durationMs === 'number' && toolCall.durationMs >= 0) {
    parts.push(`${toolCall.durationMs}ms`)
  }
  return parts.join(' · ')
})
</script>

<style scoped>
@reference "tailwindcss";

.tool-call-block {
  @apply flex w-full min-w-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2.5 py-1.5;
}

.tool-call-icon {
  @apply shrink-0 text-xs leading-none;
}

.tool-call-server {
  /* round-23 字体规范：工具文字 #737373 */
  @apply shrink-0 rounded bg-zinc-200 px-1 py-0.5 font-mono text-[10px] leading-3;
  color: #737373;
}

.tool-call-name {
  /* round-23 字体规范：工具文字 #737373 */
  @apply min-w-0 flex-1 truncate font-mono text-xs;
  color: #737373;
}

.tool-call-status {
  /* round-23 字体规范：工具文字 #737373 */
  @apply flex shrink-0 items-center gap-1 text-[11px] font-medium;
  color: #737373;
}

.tool-call-status-icon {
  @apply text-xs leading-none;
}

.work-block-spinner {
  @apply inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-500/40 border-t-amber-500;
}

.tool-call-block.tool-call-running {
  @apply border-amber-300;
}

.tool-call-block.tool-call-running .tool-call-status {
  @apply text-amber-600;
}

.tool-call-block.tool-call-ok {
  @apply border-emerald-300;
}

.tool-call-block.tool-call-ok .tool-call-status-icon {
  @apply text-emerald-600;
}

.tool-call-block.tool-call-error {
  @apply border-rose-300;
}

.tool-call-block.tool-call-error .tool-call-status {
  @apply text-rose-600;
}
</style>
