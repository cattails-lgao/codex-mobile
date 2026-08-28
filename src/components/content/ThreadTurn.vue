<template>
  <template v-if="warm">
    <slot name="warm-card" :warm="warm" />
    <slot v-for="item in warmItems" :key="item.message.id" :item="item" section="warm" />
  </template>

  <li v-else class="conversation-turn" :data-turn-key="turnKey">
    <section v-if="request" class="conversation-turn-request" aria-label="User request">
      <ol class="conversation-turn-items">
        <slot :item="request" section="request" />
      </ol>
    </section>

    <section v-if="processItemCount > 0" class="conversation-turn-process" aria-label="Turn process">
      <button
        v-if="canToggleProcess"
        class="conversation-turn-process-heading conversation-turn-process-toggle"
        type="button"
        :aria-expanded="isProcessExpanded"
        :aria-label="isProcessExpanded ? t('Collapse turn process') : t('Expand turn process')"
        @click="isProcessExpanded = !isProcessExpanded"
      >
        <IconTablerChevronDown v-if="isProcessExpanded" class="conversation-turn-process-toggle-icon" />
        <IconTablerChevronRight v-else class="conversation-turn-process-toggle-icon" />
        <span>{{ t('Turn process') }}</span>
        <span class="conversation-turn-process-count">{{ t('{n} process items', { n: processItemCount }) }}</span>
      </button>
      <div v-else class="conversation-turn-process-heading">{{ t('Turn process') }}</div>
      <ol v-if="isProcessExpanded" class="conversation-turn-items conversation-turn-process-items">
        <slot v-for="item in processItems" :key="item.message.id" :item="item" section="process" />
        <li v-for="anchorMessageId in fileChangeAnchorIds" :key="`file-change-${anchorMessageId}`" class="conversation-turn-row conversation-turn-file-change">
          <slot name="file-change" :anchor-message-id="anchorMessageId" />
        </li>
      </ol>
    </section>

    <section v-if="finalItem" class="conversation-turn-final" aria-label="Assistant final response">
      <ol class="conversation-turn-items">
        <slot :item="finalItem" section="final" />
      </ol>
    </section>

    <p v-if="durationMs != null && durationMs > 0" class="conversation-turn-time">
      {{ formatTurnDuration(durationMs) }}
    </p>
  </li>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { formatTurnDuration } from '../../composables/useDesktopStateUtils'
import type { UiMessage } from '../../types/codex'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'

export type ConversationTurnItem = {
  message: UiMessage
  presentation?: 'process' | 'final-assistant' | 'plan'
}

export type WarmTurnRenderData = {
  turn: number
  userText: string
  assistantPreview: string
  toolCount: number
  expanded: boolean
}

const props = withDefaults(defineProps<{
  turnKey: string
  request?: ConversationTurnItem
  processItems?: ConversationTurnItem[]
  finalItem?: ConversationTurnItem
  fileChangeAnchorIds?: string[]
  durationMs?: number
  warm?: WarmTurnRenderData
  warmItems?: ConversationTurnItem[]
}>(), {
  processItems: () => [],
  fileChangeAnchorIds: () => [],
  warmItems: () => [],
})

const { t } = useUiLanguage()
const isProcessExpanded = ref(true)
const processItemCount = computed(() => props.processItems.length + props.fileChangeAnchorIds.length)
const canToggleProcess = computed(() => Boolean(props.finalItem))

watch(processItemCount, (nextCount, previousCount) => {
  if (nextCount > previousCount) isProcessExpanded.value = true
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-turn {
  @apply m-0 flex w-full flex-col gap-3 border-t border-zinc-200 py-5 first:border-t-0 first:pt-0;
}

.conversation-turn-items,
.conversation-turn-warm-items {
  @apply m-0 flex list-none flex-col gap-2 p-0;
}

.conversation-turn-request {
  @apply w-full;
}



.conversation-turn-process {
  @apply flex w-full max-w-[min(var(--chat-column-max,45rem),100%)] mx-auto flex-col gap-1.5 border-l-2 border-zinc-200 pl-3;
}

.conversation-turn-process-heading {
  @apply text-xs font-medium tracking-normal text-zinc-600;
}

.conversation-turn-process-toggle {
  @apply inline-flex w-fit items-center gap-1 border-0 bg-transparent p-0 text-left cursor-pointer hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2;
}

.conversation-turn-process-toggle-icon {
  @apply size-3 shrink-0;
}

.conversation-turn-process-count {
  @apply text-[11px] font-normal text-zinc-500;
}

.conversation-turn-process-items {
  @apply gap-1.5;
}

.conversation-turn-final {
  @apply w-full pt-1;
}

.conversation-turn-time {
  @apply m-0 self-start pl-0.5 text-[11px] leading-tight text-zinc-400;
}

.conversation-turn-row {
  @apply m-0 w-full;
}

:global(:root.dark) .conversation-turn {
  @apply border-zinc-800;
}

:global(:root.dark) .conversation-turn-process {
  @apply border-zinc-700;
}

:global(:root.dark) .conversation-turn-process-heading {
  @apply text-zinc-400;
}

:global(:root.dark) .conversation-turn-process-toggle {
  @apply hover:text-zinc-100 focus-visible:ring-zinc-500 focus-visible:ring-offset-zinc-950;
}

:global(:root.dark) .conversation-turn-process-count {
  @apply text-zinc-500;
}

:global(:root.dark) .conversation-turn-time {
  @apply text-zinc-500;
}
</style>
