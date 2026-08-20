<template>
  <div v-if="selectedImages.length > 0" class="thread-composer-attachments">
    <div v-for="image in selectedImages" :key="image.id" class="thread-composer-attachment">
      <video
        v-if="isVideoMediaUrl(image.url)"
        class="thread-composer-attachment-image"
        :src="image.url"
        controls
        preload="metadata"
      />
      <img v-else class="thread-composer-attachment-image" :src="image.url" :alt="image.name || 'Selected image'" />
      <button
        class="thread-composer-attachment-remove"
        type="button"
        :aria-label="`Remove ${image.name || 'image'}`"
        :disabled="isInteractionDisabled"
        @click="emit('remove-image', image.id)"
      >
        x
      </button>
    </div>
  </div>

  <div v-if="folderUploadGroups.length > 0" class="thread-composer-folder-chips">
    <span v-for="group in folderUploadGroups" :key="group.id" class="thread-composer-folder-chip">
      <IconTablerFolder class="thread-composer-folder-chip-icon" />
      <span class="thread-composer-folder-chip-name" :title="group.name">{{ group.name }}</span>
      <span class="thread-composer-folder-chip-meta">
        <template v-if="group.isUploading">
          {{ getFolderUploadPercent(group) }}% uploading ({{ group.processed }}/{{ group.total }})
        </template>
        <template v-else>
          {{ group.filePaths.length }} file{{ group.filePaths.length === 1 ? '' : 's' }}
        </template>
      </span>
      <button
        class="thread-composer-folder-chip-remove"
        type="button"
        :aria-label="`Remove folder ${group.name}`"
        :disabled="isInteractionDisabled"
        @click="emit('remove-folder', group.id)"
      >×</button>
    </span>
  </div>

  <div v-if="standaloneFileAttachments.length > 0" class="thread-composer-file-chips">
    <span v-for="att in standaloneFileAttachments" :key="att.fsPath" class="thread-composer-file-chip">
      <IconTablerFilePencil class="thread-composer-file-chip-icon" />
      <span class="thread-composer-file-chip-name" :title="att.fsPath">{{ att.label }}</span>
      <button
        class="thread-composer-file-chip-remove"
        type="button"
        :aria-label="`Remove ${att.label}`"
        :disabled="isInteractionDisabled"
        @click="emit('remove-file', att.fsPath)"
      >×</button>
    </span>
  </div>

  <div v-if="selectedSkills.length > 0" class="thread-composer-skill-chips">
    <span v-for="skill in selectedSkills" :key="skill.path" class="thread-composer-skill-chip">
      <button
        class="thread-composer-skill-chip-name"
        type="button"
        :title="skillMarkdownPath(skill.path)"
        :aria-label="`Open ${skill.displayName || skill.name} SKILL.md`"
        @click="openSkillMarkdown(skill)"
      >
        {{ skill.displayName || skill.name }}
      </button>
      <button
        class="thread-composer-skill-chip-remove"
        type="button"
        :aria-label="`Remove skill ${skill.displayName || skill.name}`"
        @click="emit('remove-skill', skill.path)"
      >×</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import type { FileAttachment } from './ThreadComposer.vue'

type SelectedImage = {
  id: string
  name: string
  url: string
}

type FolderUploadGroup = {
  id: string
  name: string
  total: number
  processed: number
  filePaths: string[]
  isUploading: boolean
}

type SkillItem = { name: string; displayName?: string; description: string; path: string; scope?: string; enabled?: boolean }

const props = defineProps<{
  selectedImages: SelectedImage[]
  folderUploadGroups: FolderUploadGroup[]
  standaloneFileAttachments: FileAttachment[]
  selectedSkills: SkillItem[]
  isInteractionDisabled: boolean
}>()

const emit = defineEmits<{
  'remove-image': [id: string]
  'remove-folder': [groupId: string]
  'remove-file': [fsPath: string]
  'remove-skill': [path: string]
}>()

const VIDEO_MEDIA_EXTENSIONS = /\.(mp4|m4v|webm|mov|mkv|ogv|ogg|mpeg|avi)$/iu

function isVideoMediaUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^video\/|^data:video\//i.test(trimmed) || VIDEO_MEDIA_EXTENSIONS.test(trimmed)) return true
  return false
}

function getFolderUploadPercent(group: FolderUploadGroup): number {
  if (group.total <= 0) return 0
  return Math.round((group.processed / group.total) * 100)
}

function skillMarkdownPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('/SKILL.md') ? trimmed : `${trimmed.replace(/\/+$/, '')}/SKILL.md`
}

function openSkillMarkdown(skill: SkillItem): void {
  const markdownPath = skillMarkdownPath(skill.path)
  if (!markdownPath || typeof window === 'undefined') return
  window.open(`/codex-local-browse${encodeURI(markdownPath)}`, '_blank', 'noopener,noreferrer')
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer-attachments {
  @apply mb-2 flex flex-wrap gap-2;
}

.thread-composer-attachment {
  @apply relative h-14 w-14 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50;
}

.thread-composer-attachment:has(video) {
  @apply h-20 w-28;
}

.thread-composer-attachment-image {
  @apply h-full w-full object-cover;
}

.thread-composer-attachment:has(video) .thread-composer-attachment-image {
  @apply object-contain;
}

.thread-composer-attachment-remove {
  @apply absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border-0 bg-black/70 text-xs leading-none text-white;
}

.thread-composer-file-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-folder-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-folder-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800;
}

.thread-composer-folder-chip-icon {
  @apply h-3.5 w-3.5 text-amber-600 shrink-0;
}

.thread-composer-folder-chip-name {
  @apply truncate max-w-40 font-medium;
}

.thread-composer-folder-chip-meta {
  @apply text-amber-700/90;
}

.thread-composer-folder-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-amber-600 transition hover:bg-amber-200 hover:text-amber-800 text-xs leading-none p-0;
}

.thread-composer-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700;
}

.thread-composer-file-chip-icon {
  @apply h-3.5 w-3.5 text-zinc-400 shrink-0;
}

.thread-composer-file-chip-name {
  @apply truncate max-w-40 font-mono;
}

.thread-composer-file-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700 text-xs leading-none p-0;
}

.thread-composer-skill-chips {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.thread-composer-skill-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700;
}

.thread-composer-skill-chip-name {
  @apply min-w-0 max-w-[12rem] truncate border-0 bg-transparent p-0 text-left font-medium text-inherit underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500;
}

.thread-composer-skill-chip-remove {
  @apply ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-0 bg-transparent text-emerald-500 transition hover:bg-emerald-200 hover:text-emerald-700 text-xs leading-none p-0;
}
</style>