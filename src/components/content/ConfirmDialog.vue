<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-dialog-overlay" @click.self="$emit('cancel')">
      <div
        class="confirm-dialog-panel"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
      >
        <h3 class="confirm-dialog-title">{{ title }}</h3>
        <p class="confirm-dialog-message">{{ message }}</p>
        <div class="confirm-dialog-actions">
          <button
            class="confirm-dialog-btn confirm-dialog-btn-cancel"
            type="button"
            @click="$emit('cancel')"
          >
            {{ cancelLabel || 'Cancel' }}
          </button>
          <button
            class="confirm-dialog-btn confirm-dialog-btn-confirm"
            :class="{ 'is-danger': danger }"
            type="button"
            @click="$emit('confirm')"
          >
            {{ confirmLabel || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }>(),
  {
    confirmLabel: '',
    cancelLabel: '',
    danger: false,
  },
)

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<style scoped>
@reference "tailwindcss";

.confirm-dialog-overlay {
  @apply fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4;
}

.confirm-dialog-panel {
  @apply w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl;
}

.confirm-dialog-title {
  @apply m-0 text-sm font-semibold text-zinc-900;
}

.confirm-dialog-message {
  @apply m-0 mt-1.5 text-sm leading-5 text-zinc-500;
}

.confirm-dialog-actions {
  @apply mt-4 flex items-center justify-end gap-2;
}

.confirm-dialog-btn {
  @apply rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50;
}

.confirm-dialog-btn-confirm {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.confirm-dialog-btn-confirm.is-danger {
  @apply border-rose-600 bg-rose-600 text-white hover:bg-rose-700;
}

:global(:root.dark) .confirm-dialog-panel {
  @apply border-zinc-700 bg-zinc-900;
}

:global(:root.dark) .confirm-dialog-title {
  @apply text-zinc-100;
}

:global(:root.dark) .confirm-dialog-message {
  @apply text-zinc-400;
}

:global(:root.dark) .confirm-dialog-btn {
  @apply border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700;
}

:global(:root.dark) .confirm-dialog-btn-confirm {
  @apply border-zinc-100 bg-zinc-100 text-zinc-900 hover:bg-zinc-200;
}
</style>
