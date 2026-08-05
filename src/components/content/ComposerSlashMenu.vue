<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { SlashCommand, SlashCommandKind } from './slashCommands'

defineProps<{
  commands: SlashCommand[]
  highlightedIndex: number
}>()

const emit = defineEmits<{
  select: [command: SlashCommand]
}>()

const { t } = useUiLanguage()

function kindLabel(kind: SlashCommandKind): string {
  if (kind === 'rpc') return t('Action')
  if (kind === 'text') return t('Prompt')
  return t('Local')
}
</script>

<template>
  <div class="composer-popover" role="listbox" :aria-label="t('Commands')">
    <button
      v-for="(command, index) in commands"
      :key="command.id"
      class="thread-composer-slash-row"
      :class="{ 'is-active': index === highlightedIndex }"
      type="button"
      role="option"
      :aria-selected="index === highlightedIndex"
      @mousedown.prevent="emit('select', command)"
    >
      <span class="thread-composer-slash-prefix" aria-hidden="true">/</span>
      <span class="thread-composer-slash-body">
        <span class="thread-composer-slash-name">{{ command.id }}</span>
        <span class="thread-composer-slash-desc">{{ t(command.description) }}</span>
      </span>
      <span class="thread-composer-slash-kind">{{ kindLabel(command.kind) }}</span>
    </button>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.thread-composer-slash-row {
  @apply flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.thread-composer-slash-row.is-active {
  @apply bg-zinc-100;
}

.thread-composer-slash-prefix {
  @apply inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-700 px-1 text-[9px] font-semibold leading-none text-white;
}

.thread-composer-slash-body {
  @apply min-w-0 flex items-baseline gap-2;
}

.thread-composer-slash-name {
  @apply truncate font-medium text-zinc-900;
}

.thread-composer-slash-desc {
  @apply truncate text-zinc-400;
}

.thread-composer-slash-kind {
  @apply shrink-0 text-[10px] uppercase tracking-wide text-zinc-400;
}
</style>
