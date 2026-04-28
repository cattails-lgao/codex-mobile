<template>
  <section class="sidebar-chats-shelf" aria-label="Chats">
    <div class="sidebar-chats-header">
      <span class="sidebar-chats-title">{{ t('Chats') }}</span>
      <div class="sidebar-chats-actions">
        <button
          class="sidebar-chats-action"
          type="button"
          :aria-pressed="filterActive"
          :aria-label="filterActive ? t('Hide chat filters') : t('Filter chats')"
          :title="filterActive ? t('Hide chat filters') : t('Filter chats')"
          @click="$emit('toggle-filter')"
        >
          <IconTablerFilter class="sidebar-chats-action-icon" />
        </button>
        <button
          class="sidebar-chats-action"
          type="button"
          :aria-label="t('New chat')"
          :title="t('New chat')"
          @click="$emit('start-new-chat')"
        >
          <IconTablerFilePencil class="sidebar-chats-action-icon" />
        </button>
      </div>
    </div>

    <p v-if="recentChats.length === 0" class="sidebar-chats-empty">{{ t('No chats') }}</p>
    <ul v-else class="sidebar-chats-list">
      <li v-for="thread in recentChats" :key="thread.id">
        <button
          class="sidebar-chat-row"
          :class="{ 'is-active': thread.id === selectedThreadId }"
          type="button"
          @click="$emit('select', thread.id)"
        >
          <span class="sidebar-chat-title">{{ thread.title }}</span>
          <span class="sidebar-chat-time">{{ formatRelativeThread(thread) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UiProjectGroup, UiThread } from '../../types/codex'
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerFilePencil from '../icons/IconTablerFilePencil.vue'
import IconTablerFilter from '../icons/IconTablerFilter.vue'

const props = withDefaults(
  defineProps<{
    groups: UiProjectGroup[]
    selectedThreadId: string
    filterActive?: boolean
  }>(),
  {
    filterActive: false,
  },
)

defineEmits<{
  select: [threadId: string]
  'start-new-chat': []
  'toggle-filter': []
}>()

const { t } = useUiLanguage()

const recentChats = computed(() =>
  props.groups
    .flatMap((group) => group.threads)
    .sort((a, b) => getThreadTimestamp(b) - getThreadTimestamp(a))
    .slice(0, 4),
)

function getThreadTimestamp(thread: UiThread): number {
  const timestamp = new Date(thread.updatedAtIso || thread.createdAtIso).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatRelativeThread(thread: UiThread): string {
  const timestamp = getThreadTimestamp(thread)
  if (timestamp <= 0) return ''

  const diffMs = Date.now() - timestamp
  if (diffMs < 0) return 'now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day

  if (diffMs < minute) return 'now'
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))}h`
  if (diffMs < week) return `${Math.max(1, Math.floor(diffMs / day))}d`
  return `${Math.max(1, Math.floor(diffMs / week))}w`
}
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-chats-shelf {
  @apply border-t border-slate-200 px-3 py-2;
}

.sidebar-chats-header {
  @apply flex items-center justify-between gap-2 px-1;
}

.sidebar-chats-title {
  @apply text-xs font-medium text-slate-500;
}

.sidebar-chats-actions {
  @apply flex items-center gap-1;
}

.sidebar-chats-action {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-800;
}

.sidebar-chats-action[aria-pressed='true'] {
  @apply bg-slate-200 text-slate-900;
}

.sidebar-chats-action-icon {
  @apply h-4 w-4;
}

.sidebar-chats-list {
  @apply mt-1 flex flex-col gap-0.5;
}

.sidebar-chat-row {
  @apply flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left text-sm text-slate-800 transition hover:bg-slate-200;
}

.sidebar-chat-row.is-active {
  @apply bg-slate-200 text-slate-950;
}

.sidebar-chat-title {
  @apply min-w-0 flex-1 truncate;
}

.sidebar-chat-time {
  @apply shrink-0 text-xs text-slate-500;
}

.sidebar-chats-empty {
  @apply mt-1 px-1.5 text-sm text-slate-500;
}
</style>
