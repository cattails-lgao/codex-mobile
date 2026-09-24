<template>
  <li
    class="thread-row-item"
    :data-menu-open="props.menuOpen ? 'true' : 'false'"
  >
    <SidebarMenuRow
      class="thread-row"
      :data-active="props.selected"
      :data-live="props.threadState === 'working' ? 'true' : 'false'"
      :data-pinned="props.pinned"
      :data-menu-open="props.menuOpen ? 'true' : 'false'"
      :force-right-hover="props.menuOpen"
      @click="emit('select')"
      @mouseleave="emit('row-leave', $event)"
      @contextmenu="emit('row-contextmenu', $event)"
    >
      <template #left>
        <span class="thread-left-stack">
          <span
            v-if="props.showStatusIndicator"
            class="thread-status-indicator"
            :data-state="props.threadState"
          />
          <button
            class="thread-delete-button"
            type="button"
            :data-confirming="props.inlineDeleteConfirming"
            :title="props.inlineDeleteConfirming ? props.confirmDeleteLabel : props.deleteLabel"
            @click.stop="emit('inline-delete')"
          >
            <span v-if="props.inlineDeleteConfirming" class="thread-delete-confirm-label">{{ props.confirmLabel }}</span>
            <IconTablerTrash v-else class="thread-icon" />
          </button>
        </span>
      </template>

      <button class="thread-main-button" type="button" @click.stop="emit('select')">
        <span class="thread-row-title-wrap">
          <span class="thread-row-title-line">
            <span class="thread-row-title">{{ props.thread.title }}</span>
            <IconTablerGitFork v-if="props.thread.hasWorktree" class="thread-row-worktree-icon" :title="props.worktreeLabel" />
            <span
              v-if="props.automationCount > 0"
              class="thread-row-automation-chip"
              :title="props.automationTooltip"
            >
              <IconTablerBolt class="thread-row-automation-icon" />
              <span v-if="props.automationCount > 1" class="thread-row-automation-count">
                {{ props.automationCount }}
              </span>
            </span>
            <span
              v-if="props.thread.pendingRequestState"
              class="thread-row-request-chip"
              :data-state="props.thread.pendingRequestState"
            >
              {{ props.requestLabel }}
            </span>
          </span>
        </span>
      </button>

      <template #right>
        <span class="thread-row-time">{{ props.relativeTime }}</span>
      </template>
      <template #right-hover>
        <div :ref="setMenuWrapRef" class="thread-menu-wrap">
          <button
            class="thread-menu-trigger"
            type="button"
            title="thread_menu"
            @click.stop="emit('menu-toggle')"
          >
            <IconTablerDots class="thread-icon" />
          </button>
        </div>
      </template>
    </SidebarMenuRow>
  </li>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { UiThread } from '../../types/codex'
import IconTablerBolt from '../icons/IconTablerBolt.vue'
import IconTablerDots from '../icons/IconTablerDots.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'
import IconTablerTrash from '../icons/IconTablerTrash.vue'
import SidebarMenuRow from './SidebarMenuRow.vue'

type ThreadState = 'external' | 'awaiting-approval' | 'awaiting-response' | 'working' | 'unread' | 'idle'

const props = defineProps<{
  thread: UiThread
  selected: boolean
  pinned: boolean
  menuOpen: boolean
  showStatusIndicator: boolean
  threadState: ThreadState
  inlineDeleteConfirming: boolean
  automationCount: number
  automationTooltip: string
  requestLabel: string
  relativeTime: string
  deleteLabel: string
  confirmDeleteLabel: string
  confirmLabel: string
  worktreeLabel: string
  setMenuWrapRef: (element: HTMLDivElement | null) => void
}>()

const emit = defineEmits<{
  select: []
  'inline-delete': []
  'menu-toggle': []
  'row-leave': [event: MouseEvent]
  'row-contextmenu': [event: MouseEvent]
}>()

function setMenuWrapRef(element: Element | ComponentPublicInstance | null): void {
  props.setMenuWrapRef(element instanceof HTMLDivElement ? element : null)
}
</script>

<style scoped>
@reference "../../style.css";

.thread-row-item {
  @apply m-0;
}

.thread-row-item[data-menu-open='true'] {
  @apply relative z-40;
}

/* round-95: thread rows follow the mockup's .row — hover/active lift to the s2
   surface, the selected row gets a 2px neutral rail (ink-2) and a running row
   overrides the rail to --live so amber strictly means "something is moving".
   The rail lives on this component's scoped rules; .thread-row lands on the
   SidebarMenuRow root element together with this file's data-v attribute. */
.thread-row {
  @apply relative hover:bg-s2;
}

.thread-row[data-active='true']::before,
.thread-row[data-live='true']::before {
  content: "";
  @apply absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-ink-2;
}

.thread-row[data-live='true']::before {
  @apply bg-live;
}

.thread-row[data-menu-open='true'] {
  @apply relative z-30;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-delete-button {
  @apply absolute left-0 top-1/2 -translate-y-1/2 h-4 min-w-4 rounded text-ink-3 opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-delete-button[data-confirming='true'] {
  @apply z-10 h-5 min-w-16 px-1.5 bg-alert text-ink-inv opacity-100 pointer-events-auto shadow-sm;
}

.thread-delete-confirm-label {
  @apply text-micro font-medium leading-none;
}

.thread-main-button {
  @apply min-w-0 w-full text-left rounded px-0 py-0 flex items-center min-h-5;
}

.thread-row-title-wrap {
  @apply min-w-0 inline-flex w-full items-center;
}

.thread-row-title-line {
  @apply min-w-0 inline-flex w-full items-center gap-1.5;
}

.thread-row-title {
  @apply min-w-0 block flex-1 text-sm leading-5 font-normal text-ink-2 truncate whitespace-nowrap;
}

.thread-row[data-active='true'] .thread-row-title {
  @apply font-medium text-ink-1;
}

.thread-row-worktree-icon {
  @apply w-3 h-3 text-ink-3 shrink-0;
}

.thread-row-request-chip {
  @apply inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-micro font-medium leading-none;
}

.thread-row-request-chip[data-state='approval'] {
  @apply border-ok/20 bg-ok/15 text-ok;
}

.thread-row-request-chip[data-state='response'] {
  @apply border-line-1 bg-s1 text-ink-2;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

/* 度量稿 .when：等宽（机器口径）+ tabular-nums，相对时间跳变时列宽稳定。 */
.thread-row-time {
  @apply block font-mono text-xs text-ink-3 tabular-nums;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-xs text-ink-3 flex items-center justify-center;
}

.thread-row-automation-chip {
  @apply inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full bg-live px-1 text-live;
}

.thread-row-automation-icon {
  @apply h-3 w-3 shrink-0;
}

.thread-row-automation-count {
  @apply text-nano font-semibold leading-none tabular-nums;
}

.thread-row[data-active='true'] {
  @apply bg-s2;
}

.thread-row:hover .thread-delete-button,
.thread-row:focus-within .thread-delete-button,
.thread-delete-button[data-confirming='true'] {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-s-inv;
}

/* round-95: 运行中从「转圈的边框」改成度量稿的 pip——6px 圆点 + --live + 22% 光晕 +
   1.6s 呼吸（prefers-reduced-motion 归零）。其余状态指示本轮不动（属状态色裸类清理，P2）。 */
.thread-status-indicator[data-state='working'] {
  @apply relative w-1.5 h-1.5 rounded-full bg-live;
}

.thread-status-indicator[data-state='working']::after {
  content: "";
  @apply absolute inset-0 rounded-full;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 22%, transparent);
  animation: thread-pip-breathe 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .thread-status-indicator[data-state='working']::after {
    animation: none;
  }
}

@keyframes thread-pip-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.thread-status-indicator[data-state='external'] {
  @apply bg-live;
}

.thread-status-indicator[data-state='awaiting-approval'] {
  @apply bg-ok;
}

.thread-status-indicator[data-state='awaiting-response'] {
  @apply bg-ink-3;
}

.thread-row:hover .thread-status-indicator[data-state='unread'],
.thread-row:hover .thread-status-indicator[data-state='working'],
.thread-row:hover .thread-status-indicator[data-state='external'],
.thread-row:hover .thread-status-indicator[data-state='awaiting-approval'],
.thread-row:hover .thread-status-indicator[data-state='awaiting-response'],
.thread-row:focus-within .thread-status-indicator[data-state='unread'],
.thread-row:focus-within .thread-status-indicator[data-state='working'],
.thread-row:focus-within .thread-status-indicator[data-state='external'],
.thread-row:focus-within .thread-status-indicator[data-state='awaiting-approval'],
.thread-row:focus-within .thread-status-indicator[data-state='awaiting-response'] {
  @apply opacity-0;
}
</style>
