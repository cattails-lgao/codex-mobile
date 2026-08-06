<template>
  <div class="right-files-panel">
    <div class="rfp-toolbar">
      <input
        v-model="filterQuery"
        class="rfp-search"
        type="text"
        :placeholder="t('Filter files...')"
      />
    </div>

    <div v-if="isLoading" class="rfp-empty">{{ t('Loading files...') }}</div>
    <div v-else-if="loadError" class="rfp-empty is-error">{{ loadError }}</div>
    <div v-else-if="groups.length === 0" class="rfp-empty">{{ t('No files in workspace.') }}</div>
    <div v-else class="rfp-groups">
      <div v-for="group in groups" :key="group.name" class="rfp-group">
        <button
          class="rfp-group-header"
          type="button"
          :aria-expanded="isGroupOpen(group.name)"
          @click="toggleGroup(group.name)"
        >
          <span class="rfp-group-chevron" aria-hidden="true">{{ isGroupOpen(group.name) ? '▾' : '▸' }}</span>
          <span class="rfp-group-name">{{ group.name }}</span>
          <span class="rfp-group-count">{{ group.files.length }}</span>
        </button>
        <div v-if="isGroupOpen(group.name)" class="rfp-group-body">
          <button
            v-for="file in group.files"
            :key="file.path"
            class="rfp-file"
            type="button"
            :title="file.relativePath"
            @click="openFile(file)"
          >
            <span class="rfp-file-label">{{ file.label }}</span>
            <span class="rfp-file-sub">{{ file.sub }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { listWorkspaceFiles, type WorkspaceFileEntry } from '../../api/codexGateway'
import { useUiLanguage } from '../../composables/useUiLanguage'

const props = defineProps<{
  cwd: string
}>()

const emit = defineEmits<{
  'open-preview': [payload: { path: string; label: string }]
}>()

const { t } = useUiLanguage()

const entries = ref<WorkspaceFileEntry[]>([])
const isLoading = ref(false)
const loadError = ref('')
const filterQuery = ref('')
const collapsedGroups = ref<Set<string>>(new Set())

type FileRow = { path: string; relativePath: string; label: string; sub: string }
type FileGroup = { name: string; files: FileRow[] }

const groups = computed<FileGroup[]>(() => {
  const query = filterQuery.value.trim().toLowerCase()
  const rows = query
    ? entries.value.filter((entry) => entry.relativePath.toLowerCase().includes(query))
    : entries.value
  const byGroup = new Map<string, FileGroup>()
  const rootFiles: FileRow[] = []
  for (const entry of rows) {
    if (entry.isDirectory) continue
    const slash = entry.relativePath.indexOf('/')
    const groupName = slash < 0 ? '' : entry.relativePath.slice(0, slash)
    const rest = slash < 0 ? entry.relativePath : entry.relativePath.slice(slash + 1)
    const row: FileRow = {
      path: entry.path,
      relativePath: entry.relativePath,
      label: rest.slice(rest.lastIndexOf('/') + 1),
      sub: rest,
    }
    if (groupName) {
      let group = byGroup.get(groupName)
      if (!group) {
        group = { name: groupName, files: [] }
        byGroup.set(groupName, group)
      }
      group.files.push(row)
    } else {
      rootFiles.push(row)
    }
  }
  const ordered = [...byGroup.values()].sort((a, b) => a.name.localeCompare(b.name))
  if (rootFiles.length > 0) ordered.unshift({ name: '(root)', files: rootFiles })
  return ordered
})

function isGroupOpen(name: string): boolean {
  return !collapsedGroups.value.has(name)
}

function toggleGroup(name: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  collapsedGroups.value = next
}

function openFile(file: FileRow): void {
  emit('open-preview', { path: file.path, label: file.label })
}

async function loadFiles(): Promise<void> {
  const cwd = props.cwd.trim()
  if (!cwd) {
    entries.value = []
    loadError.value = ''
    return
  }
  isLoading.value = true
  loadError.value = ''
  try {
    entries.value = await listWorkspaceFiles(cwd)
  } catch (error) {
    entries.value = []
    loadError.value = error instanceof Error ? error.message : 'Failed to load workspace files'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadFiles()
})

watch(
  () => props.cwd,
  () => {
    collapsedGroups.value = new Set()
    filterQuery.value = ''
    void loadFiles()
  },
)
</script>

<style scoped>
@reference "tailwindcss";

.right-files-panel {
  @apply flex h-full min-h-0 flex-col;
}

.rfp-toolbar {
  @apply shrink-0 border-b border-zinc-200 p-2;
}

.rfp-search {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 outline-none transition focus:border-zinc-400;
}

.rfp-groups {
  @apply min-h-0 flex-1 overflow-y-auto p-1.5;
}

.rfp-group {
  @apply mb-1;
}

.rfp-group-header {
  @apply flex w-full items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left text-xs font-medium text-zinc-700 transition hover:bg-zinc-100;
}

.rfp-group-chevron {
  @apply w-3 shrink-0 text-zinc-400;
}

.rfp-group-name {
  @apply min-w-0 truncate;
}

.rfp-group-count {
  @apply ml-auto shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] leading-4 text-zinc-500;
}

.rfp-group-body {
  @apply mt-0.5 flex flex-col gap-px pl-3.5;
}

.rfp-file {
  @apply flex min-w-0 flex-col rounded-md border-0 bg-transparent px-1.5 py-1 text-left transition hover:bg-zinc-100;
}

.rfp-file-label {
  @apply truncate text-xs font-medium text-zinc-800;
}

.rfp-file-sub {
  @apply truncate font-mono text-[10px] leading-4 text-zinc-400;
}

.rfp-empty {
  @apply px-3 py-3 text-xs text-zinc-500;
}

.rfp-empty.is-error {
  @apply text-red-600;
}

:global(:root.dark) .rfp-toolbar {
  @apply border-zinc-800;
}

:global(:root.dark) .rfp-search {
  @apply border-zinc-700 bg-zinc-900 text-zinc-100 focus:border-zinc-500;
}

:global(:root.dark) .rfp-group-header {
  @apply text-zinc-300 hover:bg-zinc-800;
}

:global(:root.dark) .rfp-group-chevron {
  @apply text-zinc-500;
}

:global(:root.dark) .rfp-group-count {
  @apply bg-zinc-800 text-zinc-400;
}

:global(:root.dark) .rfp-file:hover {
  @apply bg-zinc-800;
}

:global(:root.dark) .rfp-file-label {
  @apply text-zinc-100;
}

:global(:root.dark) .rfp-file-sub {
  @apply text-zinc-500;
}

:global(:root.dark) .rfp-empty {
  @apply text-zinc-400;
}

:global(:root.dark) .rfp-empty.is-error {
  @apply text-red-400;
}
</style>
