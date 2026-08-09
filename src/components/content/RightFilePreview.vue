<template>
  <div class="right-file-preview">
    <div class="right-file-preview-header">
      <div class="right-file-preview-title-wrap">
        <span class="right-file-preview-title">{{ name }}</span>
        <span class="right-file-preview-path">{{ filePath }}</span>
      </div>
      <a
        class="right-file-preview-open"
        :href="browseUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('Open in browser') }}
      </a>
    </div>
    <div class="right-file-preview-body">
      <div v-if="isLoading" class="right-file-preview-empty">{{ t('Loading file…') }}</div>
      <div v-else-if="loadError" class="right-file-preview-empty is-error">{{ loadError }}</div>
      <img
        v-else-if="preview && preview.isImage"
        class="right-file-preview-image"
        :src="browseUrl"
        :alt="name"
      />
      <pre v-else-if="preview && preview.isText && preview.content !== undefined" class="right-file-preview-code">{{ preview.content }}</pre>
      <div v-else class="right-file-preview-empty">
        <p>{{ t('This file type cannot be previewed.') }}</p>
        <a
          class="right-file-preview-open"
          :href="browseUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('Open in browser') }}
        </a>
      </div>
    </div>
    <div v-if="preview && preview.truncated" class="right-file-preview-footer">
      {{ t('File is large; showing the first part.') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { previewLocalFile, type LocalFilePreview } from '../../api/codexGateway'
import { useUiLanguage } from '../../composables/useUiLanguage'

const props = defineProps<{
  filePath: string
  name: string
}>()

const { t } = useUiLanguage()

const preview = ref<LocalFilePreview | null>(null)
const isLoading = ref(false)
const loadError = ref('')

const browseUrl = computed(() => {
  const normalized = props.filePath.replace(/\\/g, '/')
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `/codex-local-browse${encodeURI(withSlash)}`
})

watch(
  () => props.filePath,
  async (filePath) => {
    preview.value = null
    loadError.value = ''
    if (!filePath) return
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
</script>

<style scoped>
@reference "tailwindcss";

.right-file-preview {
  @apply flex h-full min-h-0 flex-col;
}

.right-file-preview-header {
  @apply flex shrink-0 items-start gap-3 border-b border-zinc-200 bg-white px-3 py-2;
}

.right-file-preview-title-wrap {
  @apply flex min-w-0 flex-1 flex-col gap-0.5;
}

.right-file-preview-title {
  @apply truncate text-xs font-semibold text-zinc-900;
}

.right-file-preview-path {
  @apply truncate font-mono text-[10px] leading-4 text-zinc-400;
}

.right-file-preview-open {
  @apply shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100;
}

.right-file-preview-body {
  @apply min-h-0 flex-1 overflow-auto bg-slate-50;
}

.right-file-preview-image {
  @apply block max-h-full w-full object-contain;
}

.right-file-preview-code {
  @apply m-0 min-h-full whitespace-pre bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-100;
}

.right-file-preview-empty {
  @apply flex flex-col items-center gap-3 px-4 py-8 text-center text-xs text-zinc-500;
}

.right-file-preview-empty.is-error {
  @apply text-red-600;
}

.right-file-preview-footer {
  @apply shrink-0 border-t border-zinc-200 px-3 py-1.5 text-center text-[11px] text-zinc-400;
}
</style>
