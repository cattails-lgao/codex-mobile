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
    <div v-else-if="visibleRows.length === 0" class="rfp-empty">{{ t('No files in workspace.') }}</div>
    <div v-else class="rfp-groups">
      <div
        v-for="row in visibleRows"
        :key="row.node.relativePath"
        class="rfp-row"
        :style="{ paddingLeft: `${row.depth * 12 + 6}px` }"
      >
        <button
          v-if="row.node.kind === 'dir'"
          class="rfp-dir"
          type="button"
          :aria-expanded="isDirOpen(row.node.relativePath)"
          @click="toggleDir(row.node.relativePath)"
        >
          <span class="rfp-dir-chevron" aria-hidden="true">{{ isDirOpen(row.node.relativePath) ? '▾' : '▸' }}</span>
          <span class="rfp-dir-icon" aria-hidden="true">{{ isDirOpen(row.node.relativePath) ? '📂' : '📁' }}</span>
          <span class="rfp-dir-name">{{ row.node.name }}</span>
        </button>
        <button
          v-else
          class="rfp-file"
          type="button"
          :title="row.node.relativePath"
          @click="openFile(row.node)"
        >
          <span class="rfp-file-icon" aria-hidden="true">📄</span>
          <span class="rfp-file-label">{{ row.node.name }}</span>
        </button>
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
const collapsedDirs = ref<Set<string>>(new Set())

type FileTreeNode = {
  name: string
  path: string
  relativePath: string
  kind: 'dir' | 'file'
  children: FileTreeNode[]
}

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.sort((first, second) => {
    if (first.kind !== second.kind) return first.kind === 'dir' ? -1 : 1
    return first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function buildTree(source: WorkspaceFileEntry[]): FileTreeNode[] {
  const roots: FileTreeNode[] = []
  const byRelativePath = new Map<string, FileTreeNode>()

  function ensureDir(segments: string[]): FileTreeNode {
    let current = ''
    let parent = roots
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      let node = byRelativePath.get(current)
      if (!node) {
        node = { name: segment, path: '', relativePath: current, kind: 'dir', children: [] }
        byRelativePath.set(current, node)
        parent.push(node)
      }
      parent = node.children
    }
    return byRelativePath.get(current) as FileTreeNode
  }

  for (const entry of source) {
    const parts = entry.relativePath.split('/').filter(Boolean)
    if (parts.length === 0) continue
    if (entry.isDirectory) {
      const dir = ensureDir(parts)
      dir.path = entry.path
      continue
    }
    const fileName = parts[parts.length - 1]
    const dirSegments = parts.slice(0, -1)
    const parent = dirSegments.length > 0 ? ensureDir(dirSegments).children : roots
    parent.push({ name: fileName, path: entry.path, relativePath: entry.relativePath, kind: 'file', children: [] })
  }

  sortTreeNodes(roots)
  for (const node of byRelativePath.values()) sortTreeNodes(node.children)
  return roots
}

const tree = computed<FileTreeNode[]>(() => buildTree(entries.value))

const visibleRows = computed<Array<{ node: FileTreeNode; depth: number }>>(() => {
  const query = filterQuery.value.trim().toLowerCase()
  const rows: Array<{ node: FileTreeNode; depth: number }> = []

  function isNodeMatching(node: FileTreeNode): boolean {
    if (!query) return true
    if (node.relativePath.toLowerCase().includes(query)) return true
    return node.children.some(isNodeMatching)
  }

  function walk(nodes: FileTreeNode[], depth: number): void {
    for (const node of nodes) {
      if (query && !isNodeMatching(node)) continue
      rows.push({ node, depth })
      if (node.kind === 'file') continue
      const expanded = query ? true : !collapsedDirs.value.has(node.relativePath)
      if (expanded) walk(node.children, depth + 1)
    }
  }

  walk(tree.value, 0)
  return rows
})

function isDirOpen(relativePath: string): boolean {
  if (filterQuery.value.trim()) return true
  return !collapsedDirs.value.has(relativePath)
}

function toggleDir(relativePath: string): void {
  const next = new Set(collapsedDirs.value)
  if (next.has(relativePath)) {
    next.delete(relativePath)
  } else {
    next.add(relativePath)
  }
  collapsedDirs.value = next
}

function openFile(node: FileTreeNode): void {
  emit('open-preview', { path: node.path, label: node.name })
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
    collapsedDirs.value = new Set()
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

.rfp-row {
  @apply mb-px;
}

.rfp-dir {
  @apply flex w-full items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-1 text-left text-xs font-medium text-zinc-700 transition hover:bg-zinc-100;
}

.rfp-dir-chevron {
  @apply w-3 shrink-0 text-zinc-400;
}

.rfp-dir-icon {
  @apply shrink-0 text-[11px] leading-none;
}

.rfp-dir-name {
  @apply min-w-0 truncate;
}

.rfp-file {
  @apply flex min-w-0 items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-1 text-left transition hover:bg-zinc-100;
}

.rfp-file-icon {
  @apply shrink-0 text-[11px] leading-none text-zinc-400;
}

.rfp-file-label {
  @apply truncate text-xs font-medium text-zinc-800;
}

.rfp-empty {
  @apply px-3 py-3 text-xs text-zinc-500;
}

.rfp-empty.is-error {
  @apply text-red-600;
}
</style>
