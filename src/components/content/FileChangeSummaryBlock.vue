<template>
  <section v-if="summary" class="file-change-summary-block" :class="{ 'file-change-summary-block-inline': inline }">
    <button
      type="button"
      class="file-change-summary-row"
      :class="{ 'file-change-summary-row-expanded': expanded }"
      @click="$emit('toggle')"
    >
      <span class="file-change-chevron" :class="{ 'file-change-chevron-open': expanded }">▶</span>
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
    <div class="file-change-panel" :class="{ 'file-change-panel-visible': expanded }">
      <div class="file-change-panel-inner">
        <ul class="file-change-list">
          <li
            v-for="change in summary.changes"
            :key="`file-change:${summary.turnId}:${change.path}:${change.movedToPath || ''}`"
            class="file-change-item"
          >
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
            <button
              v-if="actionable"
              type="button"
              class="file-change-file-undo-button"
              :title="fileChangeFileUndoLabel(change)"
              :aria-label="fileChangeFileUndoLabel(change)"
              @click="$emit('request-file-action', change)"
            >
              <IconTablerArrowBackUp class="icon-svg file-change-action-icon" />
            </button>
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
  'request-file-action': [change: UiFileChange]
}>()

const { t } = useUiLanguage()

const fileChangeOperationLabel = computed(() => (change: UiFileChange) => fileChangeOperationLabelCore(change, t))
const fileChangeSummaryLabel = computed(() => (summary: TurnFileChangeSummary | null) => fileChangeSummaryLabelCore(summary, t))
const displayFileChangePath = computed(() => (pathValue: string) => displayFileChangePathCore(pathValue, props.cwd))
const fileChangeFileUndoLabel = computed(() => (change: UiFileChange) => `${t('Undo')} ${displayFileChangePathCore(change.path, props.cwd)}`)
</script>

<style scoped>
@reference "tailwindcss";

.file-change-summary-block {
  @apply flex w-full min-w-0 flex-col gap-0;
}

/* round-33：fileChange 块视觉对齐（round-17 视觉降噪 + round-23 字体规范）——
   与命令块/思考块/折叠条一致：无边框、无背景、无卡片，正文 #737373。此前
   复用 cmd-*（ProcessFold 的卡片化折叠条样式）导致与消息流其他块风格不搭。 */
.file-change-summary-row {
  @apply flex w-full min-w-0 cursor-pointer items-center gap-1 px-0 py-0.5 text-left transition-colors hover:opacity-80;
}

.file-change-chevron {
  @apply shrink-0 text-[10px] leading-none text-zinc-400 transition-transform duration-150;
}

.file-change-chevron-open {
  transform: rotate(90deg);
}

.file-change-summary-label {
  /* round-23 字体规范：工具文字 #737373 */
  @apply min-w-0 flex-1 truncate text-xs font-medium;
  color: #737373;
}

.file-change-summary-status {
  @apply inline-flex max-w-28 shrink-0 items-center justify-end gap-1.5 text-right text-[11px] font-semibold text-zinc-500;
}

.file-change-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms ease-out;
}

.file-change-panel-visible {
  grid-template-rows: 1fr;
}

.file-change-panel-inner {
  @apply min-h-0 overflow-hidden;
}

/* 展开列表：去卡片化，左竖线缩进锚定层次 */
.file-change-list {
  @apply m-0 flex list-none flex-col gap-0 border-l border-zinc-200/80 py-0.5 pl-2.5;
}

.file-change-item {
  @apply flex flex-wrap items-center gap-1.5 py-0.5 text-sm text-zinc-600;
}

.file-change-badge {
  @apply inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em];
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

.file-change-path-button {
  @apply min-w-0 border-0 bg-transparent p-0 text-left font-mono text-xs text-[#0969da] hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.file-change-arrow {
  @apply text-zinc-400;
}

.file-change-delta {
  /* round-34：变更数字移到行首（与撤销按钮同在最左），去掉 ml-auto 右推 */
  @apply inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-zinc-500;
}

.file-change-actions {
  @apply mt-1 flex flex-wrap items-center justify-end gap-2;
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

.file-change-file-undo-button {
  /* round-34：撤销按钮移到行首（变更数字旁），去掉 ml-auto 右推 */
  @apply inline-flex shrink-0 items-center rounded-md border border-transparent bg-transparent p-1 text-zinc-400 transition hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700;
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
