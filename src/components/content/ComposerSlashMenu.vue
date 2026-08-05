<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { SlashCommand, SlashCommandKind } from './slashCommands'

const props = defineProps<{
  commands: SlashCommand[]
  highlightedIndex: number
}>()

const emit = defineEmits<{
  select: [command: SlashCommand]
}>()

const { t } = useUiLanguage()

const rootRef = ref<HTMLElement | null>(null)

const builtinCommands = computed(() => props.commands.filter((command) => command.group !== 'skill'))
const skillCommands = computed(() => props.commands.filter((command) => command.group === 'skill'))

watch(
  () => props.highlightedIndex,
  async () => {
    await nextTick()
    rootRef.value?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  },
)

function kindLabel(kind: SlashCommandKind): string {
  if (kind === 'rpc') return t('Action')
  if (kind === 'text') return t('Prompt')
  if (kind === 'skill') return t('Skill')
  return t('Local')
}
</script>

<template>
  <div ref="rootRef" class="composer-popover" role="listbox" :aria-label="t('Commands')">
    <template v-if="builtinCommands.length > 0">
      <div class="composer-popover-group-label">{{ t('Commands') }}</div>
      <button
        v-for="(command, index) in builtinCommands"
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
    </template>

    <template v-if="skillCommands.length > 0">
      <div class="composer-popover-group-label composer-popover-group-label--skills">{{ t('Skills') }}</div>
      <button
        v-for="(command, index) in skillCommands"
        :key="command.id"
        class="thread-composer-slash-row"
        :class="{ 'is-active': builtinCommands.length + index === highlightedIndex }"
        type="button"
        role="option"
        :aria-selected="builtinCommands.length + index === highlightedIndex"
        @mousedown.prevent="emit('select', command)"
      >
        <span class="thread-composer-slash-prefix thread-composer-slash-prefix--skill" aria-hidden="true">/</span>
        <span class="thread-composer-slash-body">
          <span class="thread-composer-slash-name">{{ command.displayName || command.id }}</span>
          <span class="thread-composer-slash-desc">{{ command.description }}</span>
        </span>
        <span class="thread-composer-slash-kind">{{ kindLabel(command.kind) }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.composer-popover-group-label {
  @apply px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 first:pt-1;
}

.composer-popover-group-label--skills {
  @apply border-t border-zinc-100 mt-1;
}

.thread-composer-slash-row {
  @apply flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.thread-composer-slash-row.is-active {
  @apply bg-zinc-100;
}

.thread-composer-slash-prefix {
  @apply inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-700 px-1 text-[9px] font-semibold leading-none text-white;
}

.thread-composer-slash-prefix--skill {
  @apply bg-emerald-600;
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
