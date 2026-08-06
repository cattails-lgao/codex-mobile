<template>
  <div
    v-if="showEdit || showFork || showCopy"
    class="message-toolbar"
    :data-role="role"
  >
    <button
      v-if="showEdit"
      type="button"
      class="message-edit-button"
      :aria-label="t('Edit this message')"
      :title="t('Edit this message')"
      @click="$emit('edit')"
    >
      <IconTablerFilePencil class="icon-svg message-edit-icon" />
      <span class="message-edit-label">{{ t('Edit message') }}</span>
    </button>
    <button
      v-if="showFork"
      type="button"
      class="message-fork-button"
      :aria-label="t('Fork thread from this response')"
      :title="t('Fork thread from this response')"
      @click="$emit('fork')"
    >
      <IconTablerGitFork class="icon-svg message-fork-icon" />
      <span class="message-fork-label">{{ t('Fork') }}</span>
    </button>
    <button
      v-if="showCopy"
      type="button"
      class="message-copy-button"
      :data-copied="copied"
      :aria-label="copied ? t('Response copied') : t('Copy response')"
      :title="copied ? t('Response copied') : t('Copy response')"
      @click="$emit('copy')"
    >
      <IconTablerCopy class="icon-svg message-copy-icon" />
      <span class="message-copy-label">{{ copied ? 'Copied' : 'Copy' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerCopy from '../icons/IconTablerCopy.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'

withDefaults(defineProps<{
  role: string
  showEdit?: boolean
  showFork?: boolean
  showCopy?: boolean
  copied?: boolean
}>(), {
  showEdit: false,
  showFork: false,
  showCopy: false,
  copied: false,
})

defineEmits<{
  edit: []
  fork: []
  copy: []
}>()

const { t } = useUiLanguage()
</script>

<style scoped>
@reference "tailwindcss";

.message-toolbar {
  @apply mt-1 self-start flex items-center gap-1 opacity-[0.01] transition-opacity duration-200;
}

:global(.message-row:hover) .message-toolbar {
  @apply opacity-100;
}

.message-copy-button {
  @apply inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/90 px-1.25 py-0.5 text-[9px] font-medium leading-none text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-900;
}

.message-fork-button {
  @apply inline-flex items-center gap-0.5 px-0.5 py-0 text-[9px] font-medium leading-none text-slate-500 transition hover:text-slate-900;
}

.message-copy-button[data-copied='true'] {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.message-edit-button {
  @apply inline-flex items-center gap-0.5 px-0.5 py-0 text-[9px] font-medium leading-none text-amber-600/70 transition hover:text-amber-700;
}

.message-fork-icon,
.message-copy-icon,
.message-edit-icon {
  @apply text-[10px];
}

.message-fork-label,
.message-copy-label,
.message-edit-label {
  @apply leading-none;
}
</style>
