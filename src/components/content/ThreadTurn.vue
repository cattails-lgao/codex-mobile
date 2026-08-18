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

    <section v-if="processItems.length > 0 || fileChangeAnchorIds.length > 0" class="conversation-turn-process" aria-label="Turn process">
      <div class="conversation-turn-process-heading">{{ t('Turn process') }}</div>
      <ol class="conversation-turn-items conversation-turn-process-items">
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
  </li>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import type { UiMessage } from '../../types/codex'

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

withDefaults(defineProps<{
  turnKey: string
  request?: ConversationTurnItem
  processItems?: ConversationTurnItem[]
  finalItem?: ConversationTurnItem
  fileChangeAnchorIds?: string[]
  warm?: WarmTurnRenderData
  warmItems?: ConversationTurnItem[]
}>(), {
  processItems: () => [],
  fileChangeAnchorIds: () => [],
  warmItems: () => [],
})

const { t } = useUiLanguage()
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
  @apply flex w-full flex-col gap-1.5 border-l-2 border-zinc-200 pl-3;
}

.conversation-turn-process-heading {
  @apply text-[11px] font-medium uppercase tracking-normal text-zinc-500;
}

.conversation-turn-process-items {
  @apply gap-1.5;
}

.conversation-turn-final {
  @apply w-full pt-1;
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
</style>
