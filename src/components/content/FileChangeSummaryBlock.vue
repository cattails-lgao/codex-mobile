<template>
  <section v-if="summary" class="file-change-summary-block" :class="{ 'file-change-summary-block-inline': inline }">
    <button
      type="button"
      class="cmd-row cmd-row-group cmd-compact file-change-summary-row"
      :class="{ 'cmd-expanded': expanded }"
      @click="$emit('toggle')"
    >
      <span class="cmd-chevron" :class="{ 'cmd-chevron-open': expanded }">▶</span>
      <span class="file-change-summary-label">
        {{ fileChangeSummaryLabel(summary) }}
      </span>
      <span class="file-change-summary-status">
        <span
          v-for="part in fileChangeSummaryStatusParts(summary)"
          :key="`summary-status:${summary.turnId}:${part.tone}:${part.label}`"
          class="file-change-signed-count"
          :data-tone="part.tone"
        >
          {{ part.label }}
        </span>
      </span>
    </button>
    <div class="cmd-group-wrap" :class="{ 'cmd-group-visible': expanded }">
      <div class="file-change-panel-inner">
        <ul class="file-change-list">
          <li
            v-for="change in summary.changes"
            :key="`file-change:${summary.turnId}:${change.path}:${change.movedToPath || ''}`"
            class="file-change-item"
          >
            <span class="file-change-badge" :data-operation="fileChangeOperationTone(change)" :title="fileChangeOperationLabel(change)">
              {{ fileChangeBadgeLabel(change) }}
            </span>
            <button
              type="button"
              class="file-change-path-button"
              :title="change.path"
              @click="$emit('open-diff', change)"
            >
              {{ displayFileChangePath(change.path) }}
            </button>
            <span v-if="change.movedToPath" class="file-change-arrow">→</span>
            <button
              v-if="change.movedToPath"
              type="button"
              class="file-change-path-button"
              :title="change.movedToPath"
              @click="$emit('open-diff', change)"
            >
              {{ displayFileChangePath(change.movedToPath) }}
            </button>
            <span v-if="change.addedLineCount > 0 || change.removedLineCount > 0" class="file-change-delta">
              <span
                v-for="part in fileChangeDeltaParts(change)"
                :key="`change-delta:${summary.turnId}:${change.path}:${part.tone}:${part.label}`"
                class="file-change-signed-count"
                :data-tone="part.tone"
              >
                {{ part.label }}
              </span>
            </span>
          </li>
        </ul>
        <div v-if="actionable" class="file-change-actions">
          <p v-if="actionErrorText" class="file-change-action-error">
            {{ actionErrorText }}
          </p>
          <button
            type="button"
            class="file-change-action-button"
            :disabled="actionStatus === 'undoing' || actionStatus === 'redoing'"
            :title="nextAction === 'redo' ? 'Redo file changes from this turn' : 'Undo file changes from this turn'"
            :aria-label="nextAction === 'redo' ? 'Redo file changes from this turn' : 'Undo file changes from this turn'"
            @click="$emit('request-action', nextAction)"
          >
            <IconTablerArrowBackUp
              class="icon-svg file-change-action-icon"
              :class="{ 'file-change-action-icon-redo': nextAction === 'redo' }"
            />
            {{ actionLabel }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import {
  displayFileChangePath as displayFileChangePathCore,
  fileChangeBadgeLabel,
  fileChangeDeltaParts,
  fileChangeOperationLabel as fileChangeOperationLabelCore,
  fileChangeOperationTone,
  fileChangeSummaryLabel as fileChangeSummaryLabelCore,
  fileChangeSummaryStatusParts,
  type TurnFileChangeSummary,
} from '../../utils/conversationFileChanges'
import type { UiFileChange } from '../../types/codex'
import IconTablerArrowBackUp from '../icons/IconTablerArrowBackUp.vue'

const props = defineProps<{
  summary: TurnFileChangeSummary | null
  expanded: boolean
  inline?: boolean
  cwd: string
  actionable: boolean
  actionStatus: 'idle' | 'undoing' | 'redoing' | 'undone' | 'redone'
  actionErrorText: string
  nextAction: 'undo' | 'redo'
  actionLabel: string
}>()

defineEmits<{
  toggle: []
  'open-diff': [change: UiFileChange]
  'request-action': [action: 'undo' | 'redo']
}>()

const { t } = useUiLanguage()

const fileChangeOperationLabel = computed(() => (change: UiFileChange) => fileChangeOperationLabelCore(change, t))
const fileChangeSummaryLabel = computed(() => (summary: TurnFileChangeSummary | null) => fileChangeSummaryLabelCore(summary, t))
const displayFileChangePath = computed(() => (pathValue: string) => displayFileChangePathCore(pathValue, props.cwd))
</script>

<style scoped>
@reference "tailwindcss";

.file-change-summary-block {
  @apply mt-3 flex flex-col gap-0;
}

.file-change-summary-block-inline {
  @apply mt-4;
}

.file-change-summary-row {
  @apply border-dashed;
}

.file-change-summary-label {
  @apply flex-1 min-w-0 truncate text-xs font-medium text-zinc-700;
}

.file-change-summary-status {
  @apply inline-flex max-w-28 items-center justify-end gap-1.5 text-right text-[11px] font-semibold text-zinc-500 flex-shrink-0;
}

.file-change-panel-inner {
  @apply mb-1 min-h-0 overflow-hidden pl-2;
}

.file-change-list {
  @apply m-0 flex list-none flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white/80 p-1.5;
}

.file-change-item {
  @apply flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-700;
}

.file-change-badge {
  @apply inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em];
}

.file-change-badge[data-operation='add'] {
  @apply bg-emerald-50 text-emerald-700;
}

.file-change-badge[data-operation='update'] {
  @apply bg-sky-50 text-sky-700;
}

.file-change-badge[data-operation='delete'] {
  @apply bg-rose-50 text-rose-700;
}

.file-change-badge[data-operation='move'] {
  @apply bg-amber-50 text-amber-700;
}

.file-change-path {
  @apply min-w-0 break-all font-mono text-[13px];
}

.file-change-path-button {
  @apply min-w-0 border-0 bg-transparent p-0 text-left font-mono text-[13px] text-[#0969da] hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.file-change-arrow {
  @apply text-zinc-400;
}

.file-change-delta {
  @apply ml-auto inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600;
}

.file-change-actions {
  @apply mt-2 flex flex-wrap items-center justify-end gap-2;
}

.file-change-action-button {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60;
}

.file-change-action-icon {
  @apply text-sm;
}

.file-change-action-icon-redo {
  transform: scaleX(-1);
}

.file-change-action-error {
  @apply m-0 min-w-0 flex-1 text-xs text-rose-600;
}

.file-change-signed-count {
  @apply inline-flex items-center whitespace-nowrap;
}

.file-change-signed-count[data-tone='add'] {
  @apply text-emerald-600;
}

.file-change-signed-count[data-tone='remove'] {
  @apply text-rose-600;
}
</style>
