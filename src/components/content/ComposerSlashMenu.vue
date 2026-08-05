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

function skillBadgeText(scope: string | undefined): string {
  if (scope === 'system') return 'S'
  if (scope === 'repo') return 'R'
  if (scope === 'plugin') return 'P'
  return 'U'
}

function skillBadgeLabel(scope: string | undefined): string {
  if (scope === 'system') return t('System')
  if (scope === 'repo') return t('Repo')
  if (scope === 'plugin') return t('Plugin')
  return t('User')
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
        :key="command.skillPath || command.id"
        class="thread-composer-slash-row thread-composer-slash-row--skill"
        :class="{ 'is-active': builtinCommands.length + index === highlightedIndex }"
        type="button"
        role="option"
        :aria-selected="builtinCommands.length + index === highlightedIndex"
        @mousedown.prevent="emit('select', command)"
      >
        <span
          class="thread-composer-slash-skill-icon"
          :class="`is-${command.scope || 'user'}`"
          :aria-label="skillBadgeLabel(command.scope)"
          :title="skillBadgeLabel(command.scope)"
        >{{ skillBadgeText(command.scope) }}</span>
        <span class="thread-composer-slash-body thread-composer-slash-body--skill">
          <span class="thread-composer-slash-skill-name">{{ command.displayName || command.id }}</span>
          <span class="thread-composer-slash-desc thread-composer-slash-desc--skill">{{ command.description }}</span>
        </span>
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
  @apply flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100;
}

.thread-composer-slash-row.is-active {
  @apply bg-zinc-100;
}

.thread-composer-slash-prefix {
  @apply inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-700 px-1 text-[9px] font-semibold leading-none text-white;
}

.thread-composer-slash-skill-icon {
  @apply inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none;
}

.thread-composer-slash-skill-icon.is-user {
  @apply bg-sky-100 text-sky-700;
}

.thread-composer-slash-skill-icon.is-system {
  @apply bg-amber-100 text-amber-700;
}

.thread-composer-slash-skill-icon.is-repo {
  @apply bg-emerald-100 text-emerald-700;
}

.thread-composer-slash-skill-icon.is-plugin {
  @apply bg-violet-100 text-violet-700;
}

.thread-composer-slash-body {
  @apply min-w-0 flex items-baseline gap-2;
}

.thread-composer-slash-body--skill {
  @apply flex flex-col items-start gap-0.5;
}

.thread-composer-slash-name {
  @apply truncate font-medium text-zinc-900;
}

.thread-composer-slash-skill-name {
  @apply min-w-0 whitespace-normal break-words font-medium text-zinc-900;
  overflow-wrap: anywhere;
}

.thread-composer-slash-desc {
  @apply truncate text-zinc-400;
}

.thread-composer-slash-desc--skill {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
}

.thread-composer-slash-kind {
  @apply shrink-0 text-[10px] uppercase tracking-wide text-zinc-400;
}
</style>
