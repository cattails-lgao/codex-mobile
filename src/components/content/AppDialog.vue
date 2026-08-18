<template>
  <Teleport to="body">
    <div v-if="open" class="app-dialog-overlay" @click.self="close">
      <div
        class="app-dialog-panel"
        :class="`app-dialog-panel--${size}`"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel || title"
        @keydown.esc.prevent="close"
      >
        <div class="app-dialog-header">
          <div class="app-dialog-title-wrap">
            <h3 class="app-dialog-title">{{ title }}</h3>
            <p v-if="subtitle" class="app-dialog-subtitle">{{ subtitle }}</p>
          </div>
          <button
            class="app-dialog-close"
            type="button"
            :aria-label="t('Close')"
            :title="t('Close')"
            @click="close"
          >
            <IconTablerX class="app-dialog-close-icon" />
          </button>
        </div>
        <div class="app-dialog-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="app-dialog-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerX from '../icons/IconTablerX.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    ariaLabel?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    subtitle: '',
    ariaLabel: '',
    size: 'sm',
  },
)

const emit = defineEmits<{
  close: []
}>()

const { t } = useUiLanguage()

function close(): void {
  emit('close')
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (typeof window === 'undefined') return
    if (open) {
      window.addEventListener('keydown', onWindowKeydown)
    } else {
      window.removeEventListener('keydown', onWindowKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<style scoped>
@reference "tailwindcss";

.app-dialog-overlay {
  @apply fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4;
}

.app-dialog-panel {
  @apply flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl;
}

.app-dialog-panel--sm {
  @apply max-w-sm;
}

.app-dialog-panel--md {
  @apply max-w-lg;
}

.app-dialog-panel--lg {
  @apply max-w-2xl;
}

.app-dialog-header {
  @apply flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3;
}

.app-dialog-title-wrap {
  @apply min-w-0 flex-1;
}

.app-dialog-title {
  @apply m-0 text-base font-semibold text-zinc-900;
}

.app-dialog-subtitle {
  @apply m-0 mt-0.5 text-sm leading-5 text-zinc-500;
}

.app-dialog-close {
  @apply flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800;
}

.app-dialog-close-icon {
  @apply h-4 w-4;
}

.app-dialog-body {
  @apply min-h-0 flex-1 overflow-y-auto p-4;
}

.app-dialog-footer {
  @apply flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3;
}
</style>
