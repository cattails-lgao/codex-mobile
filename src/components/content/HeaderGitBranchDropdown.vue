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
          <span v-if="currentCommitSummary" class="header-git-state-meta">{{ currentCommitSummary }}</span>
        </div>

        <div v-if="statusMessage" class="header-git-status" :class="{ 'is-error': statusKind === 'error' }">
          <span>{{ statusMessage }}</span>
          <a v-if="statusKind === 'error'" class="header-git-feedback" :href="feedbackMailto" @click="prepareHeaderFeedback($event, statusMessage)">Send feedback</a>
        </div>

        <div class="header-git-columns">
          <section class="header-git-commit-panel" aria-label="Branch commits">
            <div class="header-git-search-wrap">
              <input
                v-model="commitSearchQuery"
                class="header-git-search"
                type="text"
                placeholder="Search commits..."
                @keydown.esc.prevent="onEscapeCommitSearch"
              />
            </div>
            <label class="header-git-toggle-row">
              <input v-model="showResetHistoryRefs" type="checkbox" @change="reloadSelectedBranchCommits" />
              <span>Reset-history refs</span>
            </label>
            <div class="header-git-commit-list">
              <div v-if="!selectedBranch" class="header-git-commits-empty">Select a branch.</div>
              <div v-else-if="commitsLoadingFor === selectedBranch" class="header-git-commits-empty">Loading commits...</div>
              <div v-else-if="commitsError" class="header-git-commits-empty is-error">{{ commitsError }}</div>
              <template v-else>
                <button
                  v-for="commit in filteredSelectedBranchCommits"
                  :key="commit.sha"
                  class="header-git-commit"
                  :class="{ 'is-current': isCurrentCommit(commit) }"
                  type="button"
                  :disabled="busy || selectedBranchIsRemote"
                  :title="selectedBranchCommitActionTitle(commit)"
                  @click="onSelectCommit(commit)"
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
                <div v-if="filteredSelectedBranchCommits.length === 0" class="header-git-commits-empty">No commits found.</div>
              </template>
            </div>
          </section>

          <section class="header-git-branch-panel" aria-label="Branches">
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
                    class="header-git-branch-button"
                    :class="{ 'is-current': branch.value === currentBranch, 'is-selected': branch.value === selectedBranch }"
                    type="button"
                    :disabled="busy"
                    @click="selectBranch(branch.value)"
                  >
                    <span class="header-git-branch-name">{{ branch.label }}</span>
                    <span v-if="branch.value === currentBranch" class="header-git-branch-meta">current</span>
                    <span v-else-if="branch.isRemote" class="header-git-branch-meta">remote</span>
                  </button>
                  <button
                    v-if="branch.value === selectedBranch && branch.value !== currentBranch"
                    class="header-git-branch-checkout"
                    type="button"
                    :disabled="busy"
                    @click="emit('checkoutBranch', branch.value)"
                  >
                    Checkout
                  </button>
                </div>
              </li>
              <li v-if="filteredBranches.length === 0" class="header-git-empty">No branches found.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GitCommitOption, WorktreeBranchOption } from '../../api/codexGateway'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'

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
  loadCommits: [payload: { branch: string; includeResetHistory: boolean }]
}>()

const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const commitSearchQuery = ref('')
const selectedBranch = ref('')
const lastCurrentBranch = ref('')
const showResetHistoryRefs = ref(true)
const showReview = computed(() => props.showReview !== false)
const { buildFeedbackMailto, feedbackMailtoBase, recordVisibleFailure } = useFeedbackDiagnostics()
const feedbackMailto = feedbackMailtoBase()

function prepareHeaderFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}

const displayLabel = computed(() => {
  if (props.currentBranch) return props.currentBranch
  if (props.headSubject) return props.headSubject
  if (props.headSha) return `Detached ${props.headSha}`
  return props.loading ? 'Loading branch...' : 'Detached HEAD'
})
const currentCommitSummary = computed(() => {
  const details = [props.headSha, props.headDate].filter(Boolean).join(' · ')
  const subject = props.headSubject?.trim() ?? ''
  if (subject && details) return `${subject} (${details})`
  return subject || details
})
const triggerLabel = computed(() => `Git branch: ${displayLabel.value}`)
const disabled = computed(() => props.loading && props.branches.length === 0)
const busy = computed(() => props.busy || props.loading)
const statusMessage = computed(() => props.error || (props.dirty ? 'Tracked changes must be committed, stashed, or discarded before switching or resetting. Untracked files are allowed unless Git would overwrite them.' : ''))
const statusKind = computed(() => props.error ? 'error' : 'info')
const filteredBranches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const branches = props.branches.filter((branch) => branch.isRemote !== true)
  if (!query) return branches
  return branches.filter((branch) => branch.label.toLowerCase().includes(query) || branch.value.toLowerCase().includes(query))
})
const selectedBranchOption = computed(() => props.branches.find((branch) => branch.value === selectedBranch.value) ?? null)
const selectedBranchIsRemote = computed(() => selectedBranchOption.value?.isRemote === true)
const selectedBranchCommitsKey = computed(() => {
  if (!selectedBranch.value) return ''
  return `${selectedBranch.value}\u0000${showResetHistoryRefs.value ? 'with-reset-history' : 'without-reset-history'}`
})
const selectedBranchCommits = computed(() => selectedBranchCommitsKey.value ? props.commitsByBranch[selectedBranchCommitsKey.value] || [] : [])
const filteredSelectedBranchCommits = computed(() => {
  const query = commitSearchQuery.value.trim().toLowerCase()
  const commits = selectedBranchCommits.value
  if (!query) return commits
  return commits.filter((commit) => {
    return (
      commit.sha.toLowerCase().includes(query) ||
      commit.shortSha.toLowerCase().includes(query) ||
      commit.subject.toLowerCase().includes(query) ||
      commit.date.toLowerCase().includes(query)
    )
  })
})

function toggleOpen(): void {
  if (disabled.value) return
  isOpen.value = !isOpen.value
}

function selectBranch(branch: string): void {
  selectedBranch.value = branch
  emit('loadCommits', { branch, includeResetHistory: showResetHistoryRefs.value })
}

function reloadSelectedBranchCommits(): void {
  if (!selectedBranch.value) return
  emit('loadCommits', { branch: selectedBranch.value, includeResetHistory: showResetHistoryRefs.value })
}

function isCurrentCommit(commit: GitCommitOption): boolean {
  const headSha = props.headSha?.trim() ?? ''
  if (!headSha) return false
  return commit.sha === headSha || commit.shortSha === headSha || commit.sha.startsWith(headSha)
}

function selectedBranchCommitActionTitle(commit: GitCommitOption): string {
  if (selectedBranchIsRemote.value) return 'Remote branches cannot be reset from this menu'
  return `Reset ${selectedBranch.value} to ${commit.shortSha}`
}

function onSelectCommit(commit: GitCommitOption): void {
  if (!selectedBranch.value || selectedBranchIsRemote.value) return
  emit('resetBranchToCommit', { branch: selectedBranch.value, sha: commit.sha })
}

function onEscapeSearch(): void {
  if (searchQuery.value) {
    searchQuery.value = ''
    return
  }
  isOpen.value = false
}

function onEscapeCommitSearch(): void {
  if (commitSearchQuery.value) {
    commitSearchQuery.value = ''
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
  commitSearchQuery.value = ''
}

function preferredBranch(): string {
  const currentBranch = props.currentBranch?.trim()
  if (currentBranch) return currentBranch
  return props.branches[0]?.value ?? ''
}

function ensureSelectedBranchCommits(): void {
  const targetBranch = selectedBranch.value || preferredBranch()
  if (!targetBranch) return
  selectedBranch.value = targetBranch
  emit('loadCommits', { branch: targetBranch, includeResetHistory: showResetHistoryRefs.value })
}

watch(isOpen, (open) => {
  if (!open) return
  ensureSelectedBranchCommits()
  void nextTick(() => searchInputRef.value?.focus())
})

watch(
  () => [props.currentBranch, props.branches.map((branch) => branch.value).join('\n')] as const,
  () => {
    const targetBranch = preferredBranch()
    if (!targetBranch) {
      selectedBranch.value = ''
      lastCurrentBranch.value = ''
      return
    }
    const currentBranch = props.currentBranch?.trim() ?? ''
    const currentBranchChanged = currentBranch !== lastCurrentBranch.value
    lastCurrentBranch.value = currentBranch
    if (currentBranchChanged || !selectedBranch.value || !props.branches.some((branch) => branch.value === selectedBranch.value)) {
      selectedBranch.value = targetBranch
    }
    if (isOpen.value && selectedBranch.value) {
      emit('loadCommits', { branch: selectedBranch.value, includeResetHistory: showResetHistoryRefs.value })
    }
  },
  { immediate: true },
)

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
  @apply w-[42rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.header-git-review-row,
.header-git-branch-button,
.header-git-branch-checkout,
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
  @apply mx-1 my-1 flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800;
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

.header-git-toggle-row {
  @apply mx-1 mb-1 flex items-center gap-2 rounded-md px-1 py-1 text-xs text-zinc-500;
}

.header-git-toggle-row input {
  @apply h-3.5 w-3.5 shrink-0;
}

.header-git-columns {
  @apply grid min-h-80 grid-cols-[minmax(0,1.15fr)_minmax(13rem,0.85fr)] gap-1;
}

.header-git-commit-panel,
.header-git-branch-panel {
  @apply min-w-0 rounded-lg border border-zinc-100 bg-zinc-50 p-1;
}

.header-git-commit-list {
  @apply max-h-80 overflow-y-auto;
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

.header-git-branch-button {
  @apply min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait;
}

.header-git-branch-button.is-current,
.header-git-branch-button.is-selected {
  @apply bg-zinc-100 text-zinc-950;
}

.header-git-branch-button.is-selected {
  @apply ring-1 ring-zinc-300;
}

.header-git-branch-checkout {
  @apply w-auto shrink-0 items-center rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-wait;
}

.header-git-branch-name,
.header-git-commit-subject {
  @apply min-w-0 truncate;
}

.header-git-branch-meta {
  @apply shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.65rem] uppercase text-zinc-500;
}

.header-git-commits {
  @apply rounded-lg border border-zinc-100 bg-zinc-50 p-1;
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
  @apply flex items-start justify-between gap-2 text-red-700;
}

.header-git-feedback {
  @apply shrink-0 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200;
}

@media (max-width: 640px) {
  .header-git-columns {
    @apply grid-cols-1;
  }

  .header-git-commit-list,
  .header-git-branches {
    @apply max-h-56;
  }
}
</style>
