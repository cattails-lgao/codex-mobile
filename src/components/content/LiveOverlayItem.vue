<template>
  <li class="conversation-item conversation-item-overlay">
    <div class="message-row">
      <div class="message-stack">
        <article class="live-overlay-inline" aria-live="polite">
          <button
            v-if="overlay?.reasoningText"
            type="button"
            class="live-overlay-heading"
            :aria-expanded="isReasoningExpanded"
            @click="toggleReasoning"
          >
            <span class="live-overlay-label">{{ overlay?.activityLabel }}</span>
            <span class="live-overlay-toggle" aria-hidden="true">{{ isReasoningExpanded ? '▾' : '▸' }}</span>
          </button>
          <p v-else class="live-overlay-label">{{ overlay?.activityLabel }}</p>
          <p
            v-if="overlay?.reasoningText && isReasoningExpanded"
            class="live-overlay-reasoning"
          >
            {{ visibleReasoning }}
          </p>
          <div v-if="overlay?.errorText" class="live-overlay-error">
            <span>{{ overlay.errorText }}</span>
            <a class="live-overlay-feedback" :href="feedbackMailto" @click="prepareErrorFeedback($event, overlay.errorText)">{{ t('Send feedback') }}</a>
          </div>
        </article>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiLiveOverlay } from '../../types/codex'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { displayReasoningText } from '../../utils/reasoningDisplay'

const props = defineProps<{
  overlay: UiLiveOverlay | null
  feedbackMailto: string
}>()

const { buildFeedbackMailto, recordVisibleFailure } = useFeedbackDiagnostics()
const { t } = useUiLanguage()

// live overlay 的思考流默认展开（保持现有展示），可点击 Thinking 收起/展开。
const isReasoningExpanded = ref(true)
function toggleReasoning(): void {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

// 流式思考只保留末尾（默认 12,000 字符 / 240 行），超长思考不再拖垮渲染。
const visibleReasoning = computed(() =>
  displayReasoningText(props.overlay?.reasoningText ?? '', { streaming: true }),
)

function prepareErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.live-overlay-inline {
  /* 与消息卡片同宽（--chat-card-max 76ch），而不是整个聊天列宽：
     否则实时 thinking 会比普通消息宽一大截（第十六轮反馈「thinking 宽度与其他
     消息不一致」）。左对齐由 message-stack items-start 保证。 */
  @apply w-full max-w-[min(var(--chat-card-max,76ch),100%)] px-0 py-1 flex flex-col gap-1;
}

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-medium text-zinc-600;
}

.live-overlay-heading {
  @apply flex w-full min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left transition hover:opacity-80;
}

.live-overlay-toggle {
  @apply shrink-0 text-xs leading-5 text-zinc-400;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap break-words;
  display: block;
  max-height: calc(1.25rem * 5);
  overflow: auto;
  overflow-wrap: anywhere;
  scrollbar-width: none;
  mask-image: linear-gradient(to top, black 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, black 75%, transparent 100%);
}

.live-overlay-reasoning::-webkit-scrollbar {
  display: none;
}

.live-overlay-error {
  @apply m-0 flex items-start justify-between gap-3 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.live-overlay-feedback {
  @apply shrink-0 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold leading-none text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}
</style>
