<template>
  <div class="message-row" data-role="system">
    <div class="message-stack" data-role="system">
      <div class="tool-call-block" :class="statusClass" :title="title">
        <span class="tool-call-pip" :class="badgeClass" aria-hidden="true" />
        <code class="tool-call-name">{{ nameLabel }}</code>
        <span v-if="metricText" class="tool-call-metric">{{ metricText }}</span>
        <span v-if="badgeText" class="tool-call-status" :class="badgeClass">{{ badgeText }}</span>
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

// round-93：与 WorkBlockItem 同一套「工具调用行」语言（度量稿 .toolrow）——
// 14px pip 列 + 等宽工具名 + 右侧耗时读数 + 等宽大写徽记。
const nameLabel = computed(() => {
  const toolCall = props.message.toolCall
  if (!toolCall) return props.message.text || '(tool)'
  return toolCall.server ? `${toolCall.server} · ${toolCall.tool}` : toolCall.tool
})

// 读数只写真实拥有的数据：MCP 工具调用带 durationMs，显示真实耗时；没有就不显示。
const metricText = computed(() => {
  const duration = props.message.toolCall?.durationMs
  if (typeof duration !== 'number' || duration < 0) return ''
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`
})

// 机器口径徽记（等宽大写，颜色只表示状态）。本地化状态文案保留在 title 里。
const badge = computed(() => {
  switch (props.message.toolCall?.status) {
    case 'inProgress':
      return { text: 'RUN', cls: 'is-live' }
    case 'failed':
      return { text: 'FAIL', cls: 'is-alert' }
    case 'completed':
      return { text: 'OK', cls: 'is-ok' }
    default:
      return { text: '', cls: '' }
  }
})

const badgeText = computed(() => badge.value.text)
const badgeClass = computed(() => badge.value.cls)

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
  const parts = [nameLabel.value, statusLabel.value]
  if (toolCall.error) parts.push(toolCall.error)
  if (typeof toolCall.durationMs === 'number' && toolCall.durationMs >= 0) {
    parts.push(`${toolCall.durationMs}ms`)
  }
  return parts.join(' · ')
})
</script>

<style scoped>
@reference "../../style.css";

/* 自带的 message-row / message-stack 不经过 ThreadConversation 的 scoped 规则
   （那条只落在「作为组件根」的 message-row 上），message-stack 是无样式 flex 子项、
   会缩成内容宽——命令行卡片实测 706px 全列宽而工具行只有 ~220px，参差。这里显式拉伸。 */
.message-row {
  @apply w-full min-w-0;
}

.message-stack {
  @apply w-full min-w-0;
}

/* round-93：与 WorkBlockItem 同款「工具调用行」卡片（度量稿 .toolrow）。
   round-24 去掉的是旧的高对比卡片；这里回归的是度量稿里安静的发丝边框形态，
   并把状态从「emoji + 本地化文案」改成 pip + 等宽徽记（状态可扫描）。 */
.tool-call-block {
  @apply grid w-full min-w-0 cursor-default items-center gap-2.5 rounded-[10px] border border-line-1 bg-s2 px-3 py-2 transition-colors;
  grid-template-columns: 14px minmax(0, 1fr) auto auto;
}

.tool-call-block:hover {
  @apply border-line-2;
}

/* 运行中：边框转 --live 40%。写在 :hover 之后，同权重下后者胜出。 */
.tool-call-block.tool-call-running {
  border-color: color-mix(in srgb, var(--live) 40%, transparent);
}

.tool-call-pip {
  @apply h-1.5 w-1.5 justify-self-center rounded-full;
}

.tool-call-pip.is-ok {
  @apply bg-ok;
}

.tool-call-pip.is-alert {
  @apply bg-alert;
}

.tool-call-pip.is-live {
  @apply bg-live;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 22%, transparent);
  animation: tool-pip-breathe 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .tool-call-pip.is-live {
    animation: none;
  }
}

@keyframes tool-pip-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.tool-call-name {
  @apply min-w-0 truncate font-mono text-xs text-ink-1;
}

/* 耗时读数：等宽 + tabular-nums（机器口径），ink-3。 */
.tool-call-metric {
  @apply shrink-0 font-mono text-xs tabular-nums text-ink-3;
}

.tool-call-status {
  @apply shrink-0 font-mono text-xs uppercase tracking-[0.08em];
}

.tool-call-status.is-ok {
  @apply text-ok;
}

.tool-call-status.is-live {
  @apply text-live;
}

.tool-call-status.is-alert {
  @apply text-alert;
}
</style>
