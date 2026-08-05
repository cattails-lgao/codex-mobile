<template>
  <Teleport to="body">
    <div v-if="open" class="file-preview-backdrop" @click="close">
      <div
        class="file-preview-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('File preview')"
        tabindex="-1"
        @click.stop
      >
        <div class="file-preview-header">
          <div class="file-preview-title-wrap">
            <span class="file-preview-title">{{ name }}</span>
            <span v-if="filePath" class="file-preview-path">{{ filePath }}</span>
          </div>
          <div class="file-preview-actions">
            <a
              class="file-preview-open"
              :href="browseUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('Open in browser') }}
            </a>
            <button
              class="file-preview-close"
              type="button"
              :aria-label="t('Close')"
              :title="t('Close')"
              @click="close"
            >
              <IconTablerX class="icon-svg" />
            </button>
          </div>
        </div>
        <div class="file-preview-body">
          <div v-if="isLoading" class="file-preview-empty">{{ t('Loading file…') }}</div>
          <div v-else-if="loadError" class="file-preview-empty is-error">{{ loadError }}</div>
          <img
            v-else-if="preview && preview.isImage"
            class="file-preview-image"
            :src="browseUrl"
            :alt="name"
          />
          <pre v-else-if="preview && preview.isText && preview.content !== undefined" class="file-preview-code">{{ preview.content }}</pre>
          <div v-else class="file-preview-empty">
            <p>{{ t('This file type cannot be previewed.') }}</p>
            <a
              class="file-preview-open"
              :href="browseUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('Open in browser') }}
            </a>
          </div>
        </div>
        <div v-if="preview && preview.truncated" class="file-preview-footer">
          {{ t('File is large; showing the first part.') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { previewLocalFile, type LocalFilePreview } from '../../api/codexGateway'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerX from '../icons/IconTablerX.vue'

const props = defineProps<{
  open: boolean
  filePath: string
  name: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useUiLanguage()

const preview = ref<LocalFilePreview | null>(null)
const isLoading = ref(false)
const loadError = ref('')

const browseUrl = computed(() => {
  const normalized = props.filePath.replace(/\\/g, '/')
  return `/codex-local-browse${encodeURI(normalized)}`
})

function close(): void {
  emit('close')
}

watch(
  () => [props.open, props.filePath] as const,
  async ([open, filePath]) => {
    preview.value = null
    loadError.value = ''
    if (!open || !filePath) return
    isLoading.value = true
    try {
      preview.value = await previewLocalFile(filePath)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'Failed to preview file'
    } finally {
      isLoading.value = false
    }
  },
  { immediate: true },
)

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
</script>

<style scoped>
@reference "tailwindcss";

.file-preview-backdrop {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6;
}

.file-preview-panel {
  @apply flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl;
}

.file-preview-header {
  @apply flex shrink-0 items-start gap-3 border-b border-zinc-200 px-4 py-3;
}

.file-preview-title-wrap {
  @apply flex min-w-0 flex-1 flex-col gap-0.5;
}

.file-preview-title {
  @apply truncate text-sm font-semibold text-zinc-900;
}

.file-preview-path {
  @apply truncate font-mono text-[11px] leading-4 text-zinc-400;
}

.file-preview-actions {
  @apply flex shrink-0 items-center gap-2;
}

.file-preview-open {
  @apply rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100;
}

.file-preview-close {
  @apply flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100;
}

.file-preview-body {
  @apply min-h-0 flex-1 overflow-auto;
}

.file-preview-image {
  @apply block max-h-[76vh] w-full object-contain;
}

.file-preview-code {
  @apply m-0 min-h-full whitespace-pre bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100;
}

.file-preview-empty {
  @apply flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-zinc-500;
}

.file-preview-empty.is-error {
  @apply text-red-600;
}

.file-preview-footer {
  @apply shrink-0 border-t border-zinc-200 px-4 py-2 text-center text-xs text-zinc-400;
}
</style>
