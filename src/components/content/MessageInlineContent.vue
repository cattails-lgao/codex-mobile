<script setup lang="ts">
import type { InlineSegment } from '../../utils/conversationMarkdown'

defineProps<{
  segments: InlineSegment[]
  toBrowseUrl: (path: string) => string
}>()
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <span v-if="segment.kind === 'text'">{{ segment.value }}</span>
    <strong v-else-if="segment.kind === 'bold'" class="message-bold-text">{{ segment.value }}</strong>
    <em v-else-if="segment.kind === 'italic'" class="message-italic-text">{{ segment.value }}</em>
    <s v-else-if="segment.kind === 'strikethrough'" class="message-strikethrough-text">{{ segment.value }}</s>
    <a
      v-else-if="segment.kind === 'file'"
      class="message-file-link"
      :href="toBrowseUrl(segment.path)"
      target="_blank"
      rel="noopener noreferrer"
      :title="segment.path"
    >
      {{ segment.displayPath }}
    </a>
    <a
      v-else-if="segment.kind === 'url'"
      class="message-file-link"
      :href="segment.href"
      target="_blank"
      rel="noopener noreferrer"
      :title="segment.href"
    >
      {{ segment.value }}
    </a>
    <code v-else class="message-inline-code">{{ segment.value }}</code>
  </template>
</template>

<style scoped>
@reference "tailwindcss";

.message-bold-text {
  /* round-23 字体规范：加粗 #17181a（与标题同色） */
  @apply font-semibold;
  color: #17181a;
}

.message-italic-text {
  @apply italic;
}

.message-strikethrough-text {
  @apply line-through text-slate-500;
}

.message-inline-code {
  @apply bg-transparent p-0 font-sans text-[1em] font-semibold text-inherit;
  line-height: inherit;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}
</style>