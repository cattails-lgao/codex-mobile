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
@reference "../../style.css";

.confirm-dialog-overlay {
  @apply fixed inset-0 z-[var(--z-modal-top)] flex items-center justify-center bg-black/40 p-4;
}

.confirm-dialog-panel {
  @apply w-full max-w-sm rounded-xl border border-line-1 bg-s2 p-4 shadow-2xl;
}

.confirm-dialog-title {
  @apply m-0 text-sm font-semibold text-ink-1;
}

.confirm-dialog-message {
  @apply m-0 mt-1.5 text-sm leading-5 text-ink-3;
}

.confirm-dialog-actions {
  @apply mt-4 flex items-center justify-end gap-2;
}

.confirm-dialog-btn {
  @apply rounded-lg border border-line-1 bg-s2 px-3 py-1.5 text-sm font-medium text-ink-2 transition hover:bg-s0;
}

.confirm-dialog-btn-confirm {
  @apply border-ink-1 bg-s-inv text-ink-inv hover:bg-s-inv-soft;
}

.confirm-dialog-btn-confirm.is-danger {
  @apply border-alert bg-alert text-ink-inv hover:bg-alert;
}
</style>
