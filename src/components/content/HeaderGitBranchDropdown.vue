<template>
  <div ref="rootRef" class="header-git-dropdown" :class="{ 'is-review-open': reviewOpen }">
    <button
      class="header-git-trigger"
      type="button"
      :disabled="disabled"
      :title="triggerLabel"
      :aria-label="triggerLabel"
      @click="toggleOpen"
    >
      <IconTablerGitFork class="header-git-trigger-icon" />
      <span class="header-git-trigger-label">{{ displayLabel }}</span>
      <span v-if="dirty" class="header-git-dirty-dot" aria-label="Uncommitted changes" />
      <IconTablerChevronDown class="header-git-trigger-chevron" />
    </button>

    <div v-if="isOpen" class="header-git-menu-wrap">
      <div class="header-git-menu">
        <button v-if="showReview" class="header-git-review-row" type="button" @click="emit('toggleReview')">
          <IconTablerFilePencil class="header-git-row-icon" />
          <span>{{ reviewOpen ? 'Review (Open)' : 'Review' }}</span>
        </button>

        <div class="header-git-state">
          <span class="header-git-state-label">{{ detached ? 'Detached HEAD' : 'Current branch' }}</span>
          <span class="header-git-state-value">{{ displayLabel }}</span>
          <span v-if="detachedCommitMeta" class="header-git-state-meta">{{ detachedCommitMeta }}</span>
        </div>

        <div v-if="statusMessage" class="header-git-status" :class="{ 'is-error': statusKind === 'error' }">
          {{ statusMessage }}
        </div>

        <div class="header-git-search-wrap">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="header-git-search"
            type="text"
            placeholder="Search branches..."
            @keydown.esc.prevent="onEscapeSearch"
          />
        </div>

        <ul class="header-git-branches" role="listbox">
          <li v-for="branch in filteredBranches" :key="branch.value" class="header-git-branch-item">
            <div class="header-git-branch-row">
              <button
                class="header-git-branch-expand"
                type="button"
                :aria-label="expandedBranch === branch.value ? 'Hide commits' : 'Show commits'"
                @click="toggleBranchCommits(branch.value)"
              >
                <IconTablerChevronRight class="header-git-expand-icon" :class="{ 'is-expanded': expandedBranch === branch.value }" />
              </button>
              <button
                class="header-git-branch-button"
                :class="{ 'is-current': branch.value === currentBranch }"
                type="button"
                :disabled="busy"
                @click="emit('checkoutBranch', branch.value)"
              >
                <span class="header-git-branch-name">{{ branch.label }}</span>
                <span v-if="branch.value === currentBranch" class="header-git-branch-meta">current</span>
                <span v-else-if="branch.isRemote" class="header-git-branch-meta">remote</span>
              </button>
            </div>

            <div v-if="expandedBranch === branch.value" class="header-git-commits">
              <div v-if="commitsLoadingFor === branch.value" class="header-git-commits-empty">Loading commits...</div>
              <div v-else-if="commitsError" class="header-git-commits-empty is-error">{{ commitsError }}</div>
              <button
                v-for="commit in commitsByBranch[branch.value] || []"
                :key="commit.sha"
                class="header-git-commit"
                :class="{ 'is-current': isCurrentCommit(commit) }"
                type="button"
                :disabled="busy || branch.isRemote"
                :title="commitActionTitle(branch, commit)"
                @click="onSelectCommit(branch, commit)"
              >
                <span class="header-git-commit-top">
                  <code>{{ commit.shortSha }}</code>
                  <span class="header-git-commit-meta">
                    <span v-if="isCurrentCommit(commit)" class="header-git-branch-meta">current</span>
                    <span>{{ commit.date }}</span>
                  </span>
                </span>
                <span class="header-git-commit-subject">{{ commit.subject }}</span>
              </button>
              <div
                v-if="commitsLoadingFor !== branch.value && !commitsError && (commitsByBranch[branch.value] || []).length === 0"
                class="header-git-commits-empty"
              >
                No commits found.
              </div>
            </div>
          </li>
          <li v-if="filteredBranches.length === 0" class="header-git-empty">No branches found.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GitCommitOption, WorktreeBranchOption } from '../../api/codexGateway'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'

const props = defineProps<{
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  branches: WorktreeBranchOption[]
  commitsByBranch: Record<string, GitCommitOption[]>
  commitsLoadingFor: string
  commitsError: string
  loading: boolean
  busy: boolean
  error: string
  reviewOpen: boolean
  showReview?: boolean
}>()

const emit = defineEmits<{
  toggleReview: []
  checkoutBranch: [branch: string]
  resetBranchToCommit: [payload: { branch: string; sha: string }]
  loadCommits: [branch: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const expandedBranch = ref('')
const showReview = computed(() => props.showReview !== false)

const displayLabel = computed(() => {
  if (props.currentBranch) return props.currentBranch
  if (props.headSubject) return props.headSubject
  if (props.headSha) return `Detached ${props.headSha}`
  return props.loading ? 'Loading branch...' : 'Detached HEAD'
})
const detachedCommitMeta = computed(() => {
  if (!props.detached) return ''
  return [props.headSha, props.headDate].filter(Boolean).join(' · ')
})
const triggerLabel = computed(() => `Git branch: ${displayLabel.value}`)
const disabled = computed(() => props.loading && props.branches.length === 0)
const busy = computed(() => props.busy || props.loading)
const statusMessage = computed(() => props.error || (props.dirty ? 'Tracked changes must be committed, stashed, or discarded before switching or resetting. Untracked files are allowed unless Git would overwrite them.' : ''))
const statusKind = computed(() => props.error ? 'error' : 'info')
const filteredBranches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const branches = props.branches
  if (!query) return branches
  return branches.filter((branch) => branch.label.toLowerCase().includes(query) || branch.value.toLowerCase().includes(query))
})

function toggleOpen(): void {
  if (disabled.value) return
  isOpen.value = !isOpen.value
}

function toggleBranchCommits(branch: string): void {
  expandedBranch.value = expandedBranch.value === branch ? '' : branch
  if (expandedBranch.value) emit('loadCommits', branch)
}

function isCurrentCommit(commit: GitCommitOption): boolean {
  const headSha = props.headSha?.trim() ?? ''
  if (!headSha) return false
  return commit.sha === headSha || commit.shortSha === headSha || commit.sha.startsWith(headSha)
}

function commitActionTitle(branch: WorktreeBranchOption, commit: GitCommitOption): string {
  if (branch.isRemote) return 'Remote branches cannot be reset from this menu'
  return `Reset ${branch.value} to ${commit.shortSha}`
}

function onSelectCommit(branch: WorktreeBranchOption, commit: GitCommitOption): void {
  if (branch.isRemote) return
  emit('resetBranchToCommit', { branch: branch.value, sha: commit.sha })
}

function onEscapeSearch(): void {
  if (searchQuery.value) {
    searchQuery.value = ''
    return
  }
  isOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  const target = event.target
  if (!root || !(target instanceof Node) || root.contains(target)) return
  isOpen.value = false
  searchQuery.value = ''
}

watch(isOpen, (open) => {
  if (open) void nextTick(() => searchInputRef.value?.focus())
})

onMounted(() => window.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<style scoped>
@reference "tailwindcss";

.header-git-dropdown {
  @apply relative inline-flex min-w-0;
}

.header-git-trigger {
  @apply inline-flex min-h-7 max-w-56 min-w-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60;
}

.header-git-dropdown.is-review-open .header-git-trigger {
  @apply border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800;
}

.header-git-trigger-icon,
.header-git-trigger-chevron,
.header-git-row-icon {
  @apply h-4 w-4 shrink-0;
}

.header-git-trigger-label {
  @apply min-w-0 truncate;
}

.header-git-dirty-dot {
  @apply h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500;
}

.header-git-menu-wrap {
  @apply absolute right-0 top-[calc(100%+8px)] z-50;
}

.header-git-menu {
  @apply w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.header-git-review-row,
.header-git-branch-button,
.header-git-commit {
  @apply flex w-full border-0 bg-transparent text-left transition;
}

.header-git-review-row {
  @apply items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100;
}

.header-git-state {
  @apply mx-1 my-1 rounded-lg bg-zinc-50 px-2 py-1.5 text-xs;
}

.header-git-state-label {
  @apply block text-[0.68rem] uppercase tracking-wide text-zinc-500;
}

.header-git-state-value {
  @apply block truncate font-medium text-zinc-800;
}

.header-git-state-meta {
  @apply mt-0.5 block truncate text-[0.68rem] text-zinc-500;
}

.header-git-status {
  @apply mx-1 my-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800;
}

.header-git-status.is-error {
  @apply bg-red-50 text-red-700;
}

.header-git-search-wrap {
  @apply px-1 py-1;
}

.header-git-search {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-zinc-400;
}

.header-git-branches {
  @apply m-0 max-h-80 list-none overflow-y-auto p-0;
}

.header-git-branch-item {
  @apply m-0 p-0;
}

.header-git-branch-row {
  @apply flex items-stretch gap-1;
}

.header-git-branch-expand {
  @apply flex w-7 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-zinc-500 transition hover:bg-zinc-100;
}

.header-git-expand-icon {
  @apply h-4 w-4 transition-transform;
}

.header-git-expand-icon.is-expanded {
  @apply rotate-90;
}

.header-git-branch-button {
  @apply min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait;
}

.header-git-branch-button.is-current {
  @apply bg-zinc-100 text-zinc-950;
}

.header-git-branch-name,
.header-git-commit-subject {
  @apply min-w-0 truncate;
}

.header-git-branch-meta {
  @apply shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.65rem] uppercase text-zinc-500;
}

.header-git-commits {
  @apply ml-8 mr-1 mb-1 rounded-lg border border-zinc-100 bg-zinc-50 p-1;
}

.header-git-commit {
  @apply flex-col gap-0.5 rounded-md px-2 py-1.5 text-xs text-zinc-700 hover:bg-white disabled:cursor-wait;
}

.header-git-commit.is-current {
  @apply bg-white ring-1 ring-zinc-300;
}

.header-git-commit-top {
  @apply flex items-center justify-between gap-2 text-[0.68rem] text-zinc-500;
}

.header-git-commit-meta {
  @apply flex shrink-0 items-center gap-1.5;
}

.header-git-commit-top code {
  @apply rounded bg-zinc-200 px-1 py-0.5 font-mono text-[0.68rem] text-zinc-700;
}

.header-git-empty,
.header-git-commits-empty {
  @apply px-2 py-1.5 text-xs text-zinc-500;
}

.header-git-commits-empty.is-error {
  @apply text-red-700;
}
</style>
