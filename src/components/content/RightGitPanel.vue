<template>
  <div class="right-git-panel">
    <button v-if="showReview" class="rgp-review" type="button" @click="emit('toggleReview')">
      <IconTablerFilePencil class="rgp-review-icon" />
      <span class="rgp-review-label">{{ reviewOpen ? t('Review Worktree Changes (Open)') : t('Review Worktree Changes') }}</span>
      <span class="rgp-review-delta">
        <span class="rgp-added">+{{ worktreeChangeSummary.addedLineCount }}</span>
        <span class="rgp-removed">-{{ worktreeChangeSummary.removedLineCount }}</span>
      </span>
    </button>

    <div class="rgp-state">
      <span class="rgp-state-label">{{ detached ? t('Detached HEAD') : t('Current branch') }}</span>
      <span class="rgp-state-value">{{ displayLabel }}</span>
      <span v-if="currentCommitSummary" class="rgp-state-meta">{{ currentCommitSummary }}</span>
    </div>

    <div v-if="statusMessage" class="rgp-status" :class="{ 'is-error': statusKind === 'error' }">
      <span>{{ statusMessage }}</span>
      <a v-if="statusKind === 'error'" class="rgp-feedback" :href="feedbackMailto" @click="prepareHeaderFeedback($event, statusMessage)">{{ t('Send feedback') }}</a>
    </div>

    <div v-if="props.worktreeChanges.length > 0" class="rgp-section">
      <div class="rgp-section-title">
        {{ props.worktreeChanges.length }} {{ props.worktreeChanges.length === 1 ? t('file changed') : t('files changed') }}
      </div>
      <div class="rgp-file-list">
        <button
          v-for="file in props.worktreeChanges"
          :key="`${file.status}:${file.previousPath ?? ''}:${file.path}`"
          class="rgp-file"
          type="button"
          :title="file.previousPath ? `${file.previousPath} → ${file.path}` : file.path"
          @click="openWorktreeFile(file.path)"
        >
          <span class="rgp-file-status">{{ file.label }}</span>
          <span class="rgp-file-path">{{ file.path }}</span>
          <span v-if="file.previousPath" class="rgp-file-previous-path">← {{ file.previousPath }}</span>
        </button>
      </div>
    </div>

    <div class="rgp-section">
      <div class="rgp-section-title">{{ t('Branches') }}</div>
      <div class="rgp-search-wrap">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="rgp-search"
          type="text"
          :placeholder="t('Search branches...')"
        />
      </div>
      <ul class="rgp-branches" role="listbox">
        <li v-for="branch in filteredBranches" :key="branch.value" class="rgp-branch-item">
          <div class="rgp-branch-row">
            <button
              class="rgp-branch-button"
              :class="{ 'is-current': branch.value === currentBranch, 'is-selected': branch.value === selectedBranch }"
              type="button"
              :disabled="busy"
              @click="selectBranch(branch.value)"
            >
              <span class="rgp-branch-name">{{ branch.label }}</span>
              <span v-if="branch.value === currentBranch" class="rgp-branch-meta">{{ t('current') }}</span>
              <span v-else-if="branch.isRemote" class="rgp-branch-meta">{{ t('remote') }}</span>
            </button>
            <button
              v-if="branch.value === selectedBranch && branch.value !== currentBranch && !branch.isRemote"
              class="rgp-branch-checkout"
              type="button"
              :disabled="busy"
              @click="emit('checkoutBranch', branch.value)"
            >
              {{ t('Checkout') }}
            </button>
          </div>
        </li>
        <li v-if="filteredBranches.length === 0" class="rgp-empty">{{ t('No branches found.') }}</li>
      </ul>
    </div>

    <div class="rgp-section">
      <div class="rgp-section-title">{{ t('Commits') }}</div>
      <div class="rgp-search-wrap">
        <input
          v-model="commitSearchQuery"
          class="rgp-search"
          type="text"
          :placeholder="t('Search commits...')"
        />
      </div>
      <label class="rgp-toggle-row">
        <input v-model="showResetHistoryRefs" type="checkbox" @change="reloadSelectedBranchCommits" />
        <span>{{ t('Reset-history refs') }}</span>
      </label>
      <div class="rgp-commit-list">
        <div v-if="!selectedBranch" class="rgp-empty">{{ t('Select a branch.') }}</div>
        <div v-else-if="commitsLoadingFor === selectedBranchCommitsKey" class="rgp-empty">{{ t('Loading commits...') }}</div>
        <div v-else-if="commitsError" class="rgp-empty is-error">{{ commitsError }}</div>
        <template v-else>
          <button
            v-for="commit in filteredSelectedBranchCommits"
            :key="commit.sha"
            class="rgp-commit"
            :class="{ 'is-current': isCurrentCommit(commit), 'is-selected': commit.sha === selectedCommitSha }"
            type="button"
            :disabled="busy"
            :title="selectedBranchCommitActionTitle(commit)"
            @click="onSelectCommit(commit)"
          >
            <span class="rgp-commit-top">
              <span
                class="rgp-ref"
                role="button"
                tabindex="0"
                :title="copiedCommitSha === commit.sha ? t('Copied commit ref') : `${t('Copy')} ${commit.sha}`"
                @click.stop="copyCommitRef(commit)"
                @keydown.enter.prevent.stop="copyCommitRef(commit)"
                @keydown.space.prevent.stop="copyCommitRef(commit)"
              >
                {{ commit.shortSha }}
              </span>
              <span class="rgp-commit-meta">
                <span v-if="isCurrentCommit(commit)" class="rgp-branch-meta">{{ t('current') }}</span>
                <span>{{ commit.date }}</span>
              </span>
            </span>
            <span class="rgp-commit-subject">{{ commit.subject }}</span>
          </button>
          <div v-if="filteredSelectedBranchCommits.length === 0" class="rgp-empty">{{ t('No commits found.') }}</div>
        </template>
      </div>
    </div>

    <div v-if="selectedCommit" class="rgp-section">
      <div class="rgp-section-title">
        <span class="rgp-ref" role="button" tabindex="0" :title="copiedCommitSha === selectedCommit.sha ? t('Copied commit ref') : `${t('Copy')} ${selectedCommit.sha}`" @click.stop="copyCommitRef(selectedCommit)" @keydown.enter.prevent.stop="copyCommitRef(selectedCommit)">
          {{ selectedCommit.shortSha }}
        </span>
        <button
          class="rgp-reset-commit"
          type="button"
          :disabled="busy || selectedBranchIsRemote || !selectedBranch"
          @click="resetSelectedCommit"
        >
          {{ t('Reset') }}
        </button>
      </div>
      <p class="rgp-commit-detail-subject">{{ selectedCommit.subject }}</p>
      <div class="rgp-file-list">
        <div v-if="commitFilesLoadingFor === selectedCommit.sha" class="rgp-empty">{{ t('Loading files...') }}</div>
        <div v-else-if="commitFilesError" class="rgp-empty is-error">{{ commitFilesError }}</div>
        <template v-else>
          <button
            v-for="file in selectedCommitFiles"
            :key="`${file.status}:${file.previousPath ?? ''}:${file.path}`"
            class="rgp-file"
            type="button"
            :title="file.previousPath ? `${file.previousPath} → ${file.path}` : file.path"
            @click="openCommitFile(file.path)"
          >
            <span class="rgp-file-meta-row">
              <span class="rgp-file-status">{{ file.label }}</span>
              <span class="rgp-file-delta">
                <span class="rgp-added">+{{ formatFileLineCount(file.addedLineCount) }}</span>
                <span class="rgp-removed">-{{ formatFileLineCount(file.removedLineCount) }}</span>
              </span>
            </span>
            <span class="rgp-file-path">{{ file.path }}</span>
            <span v-if="file.previousPath" class="rgp-file-previous-path">← {{ file.previousPath }}</span>
          </button>
          <div v-if="selectedCommitFiles.length === 0" class="rgp-empty">{{ t('No file changes.') }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { GitCommitFileChange, GitCommitOption, WorktreeBranchOption } from '../../api/codexGateway'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { copyTextToClipboard } from '../../utils/clipboard'

const props = defineProps<{
  currentBranch: string | null
  headSha: string | null
  headSubject: string | null
  headDate: string | null
  detached: boolean
  dirty: boolean
  worktreeChangeSummary: { addedLineCount: number; removedLineCount: number }
  worktreeChanges: GitCommitFileChange[]
  branches: WorktreeBranchOption[]
  commitsByBranch: Record<string, GitCommitOption[]>
  commitsLoadingFor: string
  commitsError: string
  commitFilesBySha: Record<string, GitCommitFileChange[]>
  commitFilesLoadingFor: string
  commitFilesError: string
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
  loadCommitFiles: [sha: string]
  openCommitFile: [payload: { sha: string; path: string }]
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const commitSearchQuery = ref('')
const selectedBranch = ref('')
const selectedCommitSha = ref('')
const copiedCommitSha = ref('')
const lastCurrentBranch = ref('')
const showResetHistoryRefs = ref(true)
const showReview = computed(() => props.showReview !== false)
const { buildFeedbackMailto, feedbackMailtoBase, recordVisibleFailure } = useFeedbackDiagnostics()
const { t } = useUiLanguage()
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
  if (props.headSha) return `${t('Detached')} ${props.headSha}`
  return props.loading ? t('Loading branch...') : t('Detached HEAD')
})
const currentCommitSummary = computed(() => {
  const details = [props.headSha, props.headDate].filter(Boolean).join(' · ')
  const subject = props.headSubject?.trim() ?? ''
  if (subject && details) return `${subject} (${details})`
  return subject || details
})
const busy = computed(() => props.busy || props.loading)
const statusMessage = computed(() => props.error || (props.dirty ? t('Tracked changes must be committed, stashed, or discarded before switching or resetting. Untracked files are allowed unless Git would overwrite them.') : ''))
const statusKind = computed(() => props.error ? 'error' : 'info')
const filteredBranches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const branches = [...props.branches].sort((a, b) => {
    if (a.isRemote === true && b.isRemote !== true) return 1
    if (a.isRemote !== true && b.isRemote === true) return -1
    return 0
  })
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
const selectedCommit = computed(() => selectedBranchCommits.value.find((commit) => commit.sha === selectedCommitSha.value) ?? null)
const selectedCommitFiles = computed(() => selectedCommit.value ? props.commitFilesBySha[selectedCommit.value.sha] || [] : [])
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

function selectBranch(branch: string): void {
  selectedBranch.value = branch
  selectedCommitSha.value = ''
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
  return `${t('Show')} ${commit.shortSha} ${t('files')}`
}

function onSelectCommit(commit: GitCommitOption): void {
  selectedCommitSha.value = commit.sha
  emit('loadCommitFiles', commit.sha)
}

function copyCommitRef(commit: GitCommitOption): void {
  const value = commit.sha.trim() || commit.shortSha.trim()
  if (!value) return
  copiedCommitSha.value = commit.sha
  void copyTextToClipboard(value).catch(() => {
    copiedCommitSha.value = ''
  })
}

function resetSelectedCommit(): void {
  if (!selectedBranch.value || !selectedCommit.value || selectedBranchIsRemote.value) return
  emit('resetBranchToCommit', { branch: selectedBranch.value, sha: selectedCommit.value.sha })
}

function formatFileLineCount(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '-'
}

function openCommitFile(filePath: string): void {
  if (!selectedCommit.value) return
  emit('openCommitFile', { sha: selectedCommit.value.sha, path: filePath })
}

function openWorktreeFile(filePath: string): void {
  if (!props.headSha) return
  emit('openCommitFile', { sha: props.headSha, path: filePath })
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

onMounted(() => {
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
    if (selectedBranch.value) {
      emit('loadCommits', { branch: selectedBranch.value, includeResetHistory: showResetHistoryRefs.value })
    }
  },
  { immediate: true },
)

watch(selectedBranchCommits, (commits) => {
  if (!selectedCommitSha.value) return
  if (!commits.some((commit) => commit.sha === selectedCommitSha.value)) {
    selectedCommitSha.value = ''
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.right-git-panel {
  @apply flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto p-2;
}

.rgp-review {
  @apply flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50;
}

.rgp-review-icon {
  @apply h-4 w-4 shrink-0;
}

.rgp-review-label {
  @apply min-w-0 flex-1 truncate;
}

.rgp-review-delta {
  @apply ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium;
}

.rgp-added {
  @apply text-emerald-600;
}

.rgp-removed {
  @apply text-red-600;
}

.rgp-state {
  @apply rounded-lg bg-zinc-50 px-2 py-1.5 text-xs;
}

.rgp-state-label {
  @apply block text-[0.68rem] uppercase tracking-wide text-zinc-500;
}

.rgp-state-value {
  @apply block truncate font-medium text-zinc-800;
}

.rgp-state-meta {
  @apply mt-0.5 block truncate text-[0.68rem] text-zinc-500;
}

.rgp-status {
  @apply flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800;
}

.rgp-status.is-error {
  @apply bg-red-50 text-red-700;
}

.rgp-feedback {
  @apply shrink-0 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 transition hover:bg-red-50;
}

.rgp-section {
  @apply rounded-lg border border-zinc-100 bg-zinc-50 p-1;
}

.rgp-section-title {
  @apply flex items-center justify-between gap-2 px-1 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-zinc-500;
}

.rgp-search-wrap {
  @apply px-1 py-1;
}

.rgp-search {
  @apply w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-zinc-400;
}

.rgp-toggle-row {
  @apply mx-1 mb-1 flex items-center gap-2 rounded-md px-1 py-1 text-xs text-zinc-500;
}

.rgp-toggle-row input {
  @apply h-3.5 w-3.5 shrink-0;
}

.rgp-branches,
.rgp-commit-list {
  @apply m-0 max-h-56 list-none overflow-y-auto p-0;
}

.rgp-branch-item {
  @apply m-0 p-0;
}

.rgp-branch-row {
  @apply flex items-stretch gap-1;
}

.rgp-branch-button,
.rgp-commit,
.rgp-file {
  @apply flex w-full border-0 bg-transparent text-left transition;
}

.rgp-branch-button {
  @apply min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait;
}

.rgp-branch-button.is-current,
.rgp-branch-button.is-selected {
  @apply bg-zinc-100 text-zinc-950;
}

.rgp-branch-button.is-selected {
  @apply ring-1 ring-zinc-300;
}

.rgp-branch-checkout {
  @apply w-auto shrink-0 items-center rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-wait;
}

.rgp-branch-name,
.rgp-commit-subject {
  @apply min-w-0 truncate;
}

.rgp-branch-meta {
  @apply shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[0.65rem] uppercase text-zinc-500;
}

.rgp-commit {
  @apply flex-col gap-0.5 rounded-md px-2 py-1.5 text-xs text-zinc-700 hover:bg-white disabled:cursor-wait;
}

.rgp-commit.is-current {
  @apply bg-white ring-1 ring-zinc-300;
}

.rgp-commit.is-selected {
  @apply bg-white ring-1 ring-zinc-400;
}

.rgp-commit-top {
  @apply flex items-center justify-between gap-2 text-[0.68rem] text-zinc-500;
}

.rgp-commit-meta {
  @apply flex shrink-0 items-center gap-1.5;
}

.rgp-ref {
  @apply inline-flex w-fit max-w-full items-center rounded border-0 bg-zinc-200 px-1 py-0.5 font-mono text-[0.68rem] text-zinc-700 outline-none transition hover:bg-zinc-300;
}

.rgp-empty {
  @apply px-2 py-1.5 text-xs text-zinc-500;
}

.rgp-empty.is-error {
  @apply text-red-700;
}

.rgp-commit-detail-subject {
  @apply m-0 mt-1 line-clamp-2 px-1 pb-1 text-xs text-zinc-800;
}

.rgp-reset-commit {
  @apply rounded-md border border-zinc-200 bg-zinc-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400;
}

.rgp-file-list {
  @apply max-h-48 overflow-y-auto;
}

.rgp-file {
  @apply mt-1 flex-col gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-700 hover:bg-white;
}

.rgp-file-meta-row {
  @apply flex min-w-0 items-center justify-between gap-2;
}

.rgp-file-status {
  @apply w-fit rounded bg-zinc-200 px-1.5 py-0.5 text-[0.65rem] uppercase text-zinc-600;
}

.rgp-file-delta {
  @apply flex shrink-0 items-center gap-1 font-mono text-[0.68rem];
}

.rgp-file-path {
  @apply min-w-0 truncate;
}

.rgp-file-previous-path {
  @apply min-w-0 truncate text-[0.68rem] text-zinc-500;
}
</style>
