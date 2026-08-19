<template>
  <li
    class="thread-row-item"
    :data-menu-open="props.menuOpen ? 'true' : 'false'"
  >
    <SidebarMenuRow
      class="thread-row"
      :data-active="props.selected"
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
@reference "tailwindcss";

.thread-row-item {
  @apply m-0;
}

.thread-row-item[data-menu-open='true'] {
  @apply relative z-40;
}

.thread-row {
  @apply hover:bg-zinc-200;
}

.thread-row[data-menu-open='true'] {
  @apply relative z-30;
}

.thread-left-stack {
  @apply relative w-4 h-4 flex items-center justify-center;
}

.thread-delete-button {
  @apply absolute left-0 top-1/2 -translate-y-1/2 h-4 min-w-4 rounded text-zinc-500 opacity-0 pointer-events-none transition flex items-center justify-center;
}

.thread-delete-button[data-confirming='true'] {
  @apply z-10 h-5 min-w-16 px-1.5 bg-rose-600 text-white opacity-100 pointer-events-auto shadow-sm;
}

.thread-delete-confirm-label {
  @apply text-[11px] font-medium leading-none;
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
  @apply min-w-0 block flex-1 text-sm leading-5 font-normal text-zinc-800 truncate whitespace-nowrap;
}

.thread-row-worktree-icon {
  @apply w-3 h-3 text-zinc-500 shrink-0;
}

.thread-row-request-chip {
  @apply inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none;
}

.thread-row-request-chip[data-state='approval'] {
  @apply border-emerald-500/20 bg-emerald-500/15 text-emerald-700;
}

.thread-row-request-chip[data-state='response'] {
  @apply border-sky-200 bg-sky-50 text-sky-700;
}

.thread-status-indicator {
  @apply w-2.5 h-2.5 rounded-full;
}

.thread-row-time {
  @apply block text-sm font-normal text-zinc-500;
}

.thread-menu-wrap {
  @apply relative;
}

.thread-menu-trigger {
  @apply h-4 w-4 rounded p-0 text-xs text-zinc-600 flex items-center justify-center;
}

.thread-row-automation-chip {
  @apply inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full bg-amber-100 px-1 text-amber-800;
}

.thread-row-automation-icon {
  @apply h-3 w-3 shrink-0;
}

.thread-row-automation-count {
  @apply text-[10px] font-semibold leading-none tabular-nums;
}

.thread-row[data-active='true'] {
  @apply bg-zinc-200;
}

.thread-row:hover .thread-delete-button,
.thread-row:focus-within .thread-delete-button,
.thread-delete-button[data-confirming='true'] {
  @apply opacity-100 pointer-events-auto;
}

.thread-status-indicator[data-state='unread'] {
  width: 6.6667px;
  height: 6.6667px;
  @apply bg-blue-600;
}

.thread-status-indicator[data-state='working'] {
  @apply border-2 border-zinc-500 border-t-transparent bg-transparent animate-spin;
}

.thread-status-indicator[data-state='external'] {
  @apply bg-amber-500;
}

.thread-status-indicator[data-state='awaiting-approval'] {
  @apply bg-emerald-500;
}

.thread-status-indicator[data-state='awaiting-response'] {
  @apply bg-sky-500;
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
