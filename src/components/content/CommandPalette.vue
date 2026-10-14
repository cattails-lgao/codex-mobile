<script setup lang="ts">
// Command palette overlay (round-150, desktop-parity batch 2).
//
// Mounted/unmounted by App.vue — there is no `isOpen` prop, "mounted" means "open".
// It owns only presentation state (query + highlighted row); execution is delegated
// upward through the `run` event, which App.vue maps to an existing handler.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerSearch from '../icons/IconTablerSearch.vue'
import { groupPaletteCommands, matchPaletteCommands, type PaletteCommand } from './commandRegistry'

const props = defineProps<{ commands: PaletteCommand[] }>()

const emit = defineEmits<{
  close: []
  run: [commandId: string]
}>()

const { t } = useUiLanguage()

const query = ref('')
const highlightedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const matches = computed(() => matchPaletteCommands(props.commands, query.value))
const sections = computed(() => groupPaletteCommands(matches.value))
/** Keyboard navigation runs over the flattened, group-ordered list. */
const flatMatches = computed(() => sections.value.flatMap((section) => section.commands))

// Any keystroke that changes the result set must drop the cursor back to the top,
// otherwise the highlight can point past the end of a shortened list.
watch(matches, () => {
  highlightedIndex.value = 0
})

watch(highlightedIndex, async () => {
  await nextTick()
  const rows = Array.from(listRef.value?.querySelectorAll('.command-palette-row') ?? [])
  const row = rows[highlightedIndex.value]
  if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' })
})

function rowIndex(command: PaletteCommand): number {
  return flatMatches.value.indexOf(command)
}

function moveHighlight(delta: number): void {
  const count = flatMatches.value.length
  if (count === 0) return
  highlightedIndex.value = (highlightedIndex.value + delta + count) % count
}

function selectCommand(command: PaletteCommand): void {
  emit('run', command.id)
}

function selectHighlighted(): void {
  const command = flatMatches.value[highlightedIndex.value]
  if (command) selectCommand(command)
}

// Handled on the input rather than on window so the palette never has to compete
// with App.vue's global shortcuts: preventDefault() here stops the window handler
// (it bails on event.defaultPrevented) for the keys the palette owns.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveHighlight(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveHighlight(-1)
    return
  }
  if (event.key === 'Tab') {
    // Keep focus in the search field: Tab cycles the highlight instead of leaving.
    event.preventDefault()
    moveHighlight(event.shiftKey ? -1 : 1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    selectHighlighted()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="command-palette-backdrop" role="presentation" @click="emit('close')">
      <section
        class="command-palette"
        role="dialog"
        aria-modal="true"
        :aria-label="t('Command palette')"
        @click.stop
      >
        <div class="command-palette-search">
          <IconTablerSearch class="command-palette-search-icon" />
          <input
            ref="inputRef"
            v-model="query"
            class="command-palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            :placeholder="t('Type a command...')"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKeydown"
          />
          <span class="command-palette-count" aria-hidden="true">{{ matches.length }}/{{ props.commands.length }}</span>
        </div>

        <div id="command-palette-list" ref="listRef" class="command-palette-list" role="listbox">
          <template v-for="section in sections" :key="section.group">
            <div class="command-palette-group-label">{{ t(section.label) }}</div>
            <button
              v-for="command in section.commands"
              :key="command.id"
              class="command-palette-row"
              :class="{ 'is-active': rowIndex(command) === highlightedIndex }"
              type="button"
              tabindex="-1"
              role="option"
              :aria-selected="rowIndex(command) === highlightedIndex"
              @click="selectCommand(command)"
            >
              <span class="command-palette-row-title">{{ t(command.title) }}</span>
              <span v-if="command.shortcut" class="command-palette-row-shortcut">{{ command.shortcut }}</span>
            </button>
          </template>
          <p v-if="matches.length === 0" class="command-palette-empty">{{ t('No matching commands') }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "../../style.css";

.command-palette-backdrop {
  @apply fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/40 p-4;
  padding-top: 12vh;
  backdrop-filter: blur(2px);
}

.command-palette {
  @apply flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line-1 bg-s2 shadow-2xl;
}

.command-palette-search {
  @apply flex items-center gap-2 border-b border-line-1 px-3 py-2.5;
}

.command-palette-search-icon {
  @apply h-4 w-4 shrink-0 text-ink-3;
}

.command-palette-input {
  @apply min-w-0 flex-1 border-0 bg-transparent p-0 text-ui text-ink-1 outline-none;
}

.command-palette-input::placeholder {
  @apply text-ink-4;
}

.command-palette-count {
  @apply shrink-0 text-nano tabular-nums text-ink-4;
}

.command-palette-list {
  @apply max-h-[min(52vh,22rem)] overflow-y-auto p-1.5;
}

.command-palette-group-label {
  @apply px-2 pb-1 pt-2 text-nano font-semibold uppercase tracking-wide text-ink-3 first:pt-1;
}

.command-palette-row {
  @apply flex w-full min-w-0 items-center justify-between gap-3 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-ink-2 transition;
}

.command-palette-row:hover {
  @apply bg-s1;
}

.command-palette-row.is-active {
  @apply bg-s1 text-ink-1;
}

.command-palette-row-title {
  @apply min-w-0 truncate;
}

.command-palette-row-shortcut {
  @apply shrink-0 rounded border border-line-1 px-1.5 py-0.5 text-nano tabular-nums text-ink-4;
}

.command-palette-empty {
  @apply px-2 py-6 text-center text-xs text-ink-3;
}
</style>
