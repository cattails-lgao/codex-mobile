<template>
  <div class="reasoning-block" :data-state="expanded ? 'expanded' : 'collapsed'">
    <button
      type="button"
      class="reasoning-block-header"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <!-- round-26：思考块不再需要 icon（reasoning-block-icon 已移除），
           标题 + toggle 与命令块的「命令 + 状态」保持同密度 -->
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
  const raw = (props.message.reasoning?.summary ?? [])
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!raw) return ''
  // r187：自带 summary 的 provider（litellm/deepseek 等）归一化后 message.text
  // 与 summary 是同一段文本，而正文区（contentHtml）已渲染 message.text——
  // 再渲染 summary 就会在同一块里同文出现两遍。与正文一致（压空白比对）时
  // 跳过摘要段落；summary 与正文不同（真·摘要 + 原始思考）时仍两者都渲染。
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  if (normalize(raw) === normalize(props.message.text ?? '')) return ''
  return raw
})
</script>

<style scoped>
@reference "../../style.css";

/* round-24：思考过程块改为与 Running command（WorkBlockItem）同款朴素行样式：
   去掉圆角/边框/背景卡片，标题行「图标 + 标题 + toggle」与命令块的
   「序号 + 命令 + 状态」保持一致的视觉密度。 */
.reasoning-block {
  @apply w-full min-w-0;
}

.reasoning-block-header {
  @apply flex w-full min-w-0 items-center gap-1.5 px-0 py-0.5 text-left cursor-pointer transition-colors hover:opacity-80;
}

.reasoning-block-title {
  /* round-23 字体规范：思考文字 #737373 */
  @apply flex-1 min-w-0 truncate text-xs font-medium;
  color: #737373;
}

.reasoning-block-toggle {
  @apply shrink-0 text-nano leading-none text-ink-3;
}

.reasoning-block-body {
  @apply flex flex-col gap-1 px-0 py-1.5;
}

.reasoning-block-summary {
  /* round-23 字体规范：思考文字 #737373 */
  @apply m-0 whitespace-pre-wrap text-xs leading-5;
  color: #737373;
}

.reasoning-block-content {
  /* round-23 字体规范：思考文字 #737373 */
  @apply max-h-72 overflow-y-auto text-ui leading-relaxed;
  color: #737373;
}

.reasoning-block-content :deep(.message-text),
.reasoning-block-content :deep(.message-heading),
.reasoning-block-content :deep(.message-list) {
  @apply text-ui leading-relaxed;
  color: inherit;
}
</style>
