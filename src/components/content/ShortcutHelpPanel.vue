<script setup lang="ts">
// Keyboard shortcuts help overlay (round-151, desktop-parity batch 1 #3).
//
// Presentation only, same contract as CommandPalette.vue: mounted means open,
// closing is delegated upward through `close`, and the catalog it renders comes
// from utils/keyboardShortcuts.ts. The platform flag is a prop rather than a
// second `navigator.platform` read, so App.vue stays the single place that
// decides what "this machine" means.
import { nextTick, onMounted, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerX from '../icons/IconTablerX.vue'
import {
  SHORTCUT_GROUPS,
  countShortcuts,
  formatShortcutEntry,
} from '../../utils/keyboardShortcuts'

const props = withDefaults(
  defineProps<{
    isMac?: boolean
  }>(),
  {
    isMac: false,
  },
)

const emit = defineEmits<{
  close: []
}>()

const { t } = useUiLanguage()

const groups = SHORTCUT_GROUPS
const total = countShortcuts()
const closeButtonRef = ref<HTMLButtonElement | null>(null)

// Focus lands on the close button so the overlay is dismissable by keyboard the
// moment it opens, and so Esc has somewhere real to return focus from.
onMounted(async () => {
  await nextTick()
  closeButtonRef.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="shortcut-help-backdrop" role="presentation" @click="emit('close')">
      <section
        class="shortcut-help"
        role="dialog"
        aria-modal="true"
        :aria-label="t('Keyboard shortcuts')"
        @click.stop
      >
        <header class="shortcut-help-header">
          <h2 class="shortcut-help-title">{{ t('Keyboard shortcuts') }}</h2>
          <span class="shortcut-help-count" aria-hidden="true">{{ total }}</span>
          <button
            ref="closeButtonRef"
            class="shortcut-help-close"
            type="button"
            :aria-label="t('Close')"
            :title="t('Close')"
            @click="emit('close')"
          >
            <IconTablerX class="shortcut-help-close-icon" />
          </button>
        </header>

        <div class="shortcut-help-body">
          <section v-for="group in groups" :key="group.id" class="shortcut-help-group">
            <h3 class="shortcut-help-group-label">{{ t(group.label) }}</h3>
            <dl class="shortcut-help-list">
              <div v-for="item in group.entries" :key="item.id" class="shortcut-help-row">
                <dt class="shortcut-help-keys">
                  <kbd class="shortcut-help-key">{{ formatShortcutEntry(item, props.isMac) }}</kbd>
                </dt>
                <dd class="shortcut-help-label">
                  <span class="shortcut-help-label-text">{{ t(item.label) }}</span>
                  <span v-if="item.note" class="shortcut-help-note">{{ t(item.note) }}</span>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <footer class="shortcut-help-footer">{{ t('Press Esc to close') }}</footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "../../style.css";

.shortcut-help-backdrop {
  @apply fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/40 p-4;
  padding-top: 12vh;
  backdrop-filter: blur(2px);
}

.shortcut-help {
  @apply flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line-1 bg-s2 shadow-2xl;
}

.shortcut-help-header {
  @apply flex items-center gap-2 border-b border-line-1 px-3 py-2.5;
}

.shortcut-help-title {
  @apply m-0 min-w-0 flex-1 truncate text-ui font-medium text-ink-1;
}

.shortcut-help-count {
  @apply shrink-0 text-nano tabular-nums text-ink-4;
}

.shortcut-help-close {
  @apply inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-ink-3 transition hover:bg-s1 hover:text-ink-1;
}

.shortcut-help-close-icon {
  @apply h-4 w-4 shrink-0;
}

.shortcut-help-body {
  @apply max-h-[min(58vh,26rem)] overflow-y-auto px-3 py-2;
}

.shortcut-help-group + .shortcut-help-group {
  @apply mt-3 border-t border-line-1 pt-3;
}

.shortcut-help-group-label {
  @apply m-0 pb-1 text-micro font-semibold uppercase tracking-wide text-ink-3;
}

.shortcut-help-list {
  @apply m-0 flex flex-col gap-1;
}

.shortcut-help-row {
  @apply flex items-baseline justify-between gap-3 rounded-md px-1.5 py-1;
}

.shortcut-help-keys {
  @apply shrink-0;
}

.shortcut-help-key {
  @apply rounded border border-line-1 bg-s1 px-1.5 py-0.5 font-mono text-micro text-ink-2;
}

.shortcut-help-label {
  @apply m-0 flex min-w-0 flex-col items-end text-right;
}

.shortcut-help-label-text {
  @apply text-xs text-ink-2;
}

.shortcut-help-note {
  @apply text-nano text-ink-4;
}

.shortcut-help-footer {
  @apply border-t border-line-1 px-3 py-2 text-center text-nano text-ink-4;
}
</style>
