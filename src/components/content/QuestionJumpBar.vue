<template>
  <nav
    v-if="anchors.length >= MIN_ANCHORS"
    class="question-jump-bar"
    :aria-label="t('Question navigation')"
  >
    <div
      ref="trackRef"
      class="question-jump-track"
      @mousemove="onTrackMove"
      @mouseleave="clearHover"
      @mousedown="onTrackDown"
    >
      <button
        v-for="(anchor, index) in anchors"
        :key="anchor.turn"
        type="button"
        class="question-jump-item"
        :data-turn="anchor.turn"
        :aria-label="t('Jump to question {n}', { n: anchor.turn + 1 })"
        @mousedown.prevent
        @click="onJump(anchor)"
      >
        <span class="question-jump-dot" :style="dotStyle(index)" />
      </button>
    </div>
    <div
      v-if="hoveredAnchor"
      class="question-jump-preview"
      role="tooltip"
      :style="{ top: previewTop }"
    >
      <span class="question-jump-preview-text">{{ hoveredAnchor.text }}</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'

export type QuestionAnchor = { turn: number; text: string }

// 少于 2 个问题时导航无意义（对应 Reasonix QUESTION_NAV_MIN_COUNT）
const MIN_ANCHORS = 2

const ACTIVE_COLOR = '#3b82f6' // blue-500

const props = defineProps<{
  anchors: QuestionAnchor[]
  activeTurn: number
}>()

const emit = defineEmits<{ jump: [turn: number] }>()

const { t } = useUiLanguage()

const trackRef = ref<HTMLElement | null>(null)
const hoverIndex = ref(-1)
const previewTop = ref('0px')

const hoveredAnchor = computed(() => {
  const index = hoverIndex.value
  if (index < 0) return null
  return props.anchors[index] ?? null
})

// Reasonix dotProps 的「距离感」效果：悬停点放大、相邻 1/2 档渐变缩小，
// 其余按激活态（最后一个问题）着色，transitionDelay 随距离递增形成波。
function dotStyle(index: number): Record<string, string | undefined> {
  const isActive = props.activeTurn === props.anchors[index]?.turn
  const style: Record<string, string | undefined> = {}
  if (hoverIndex.value < 0) {
    style.width = isActive ? '18px' : '12px'
    style.background = isActive ? ACTIVE_COLOR : undefined
    return style
  }
  const d = Math.abs(index - hoverIndex.value)
  style.width = d === 0 ? '32px' : d === 1 ? '20px' : d === 2 ? '14px' : isActive ? '18px' : '12px'
  style.background =
    d === 0 ? ACTIVE_COLOR : d === 1 ? 'rgba(59,130,246,0.6)' : d === 2 ? 'rgba(59,130,246,0.35)' : isActive ? ACTIVE_COLOR : undefined
  style.transitionDelay = `${d * 20}ms`
  return style
}

function closestItemIndex(clientY: number): number {
  const track = trackRef.value
  if (!track) return -1
  const items = Array.from(track.querySelectorAll<HTMLElement>('.question-jump-item'))
  let best = -1
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < items.length; i += 1) {
    const rect = items[i].getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const dist = Math.abs(clientY - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function onTrackMove(event: MouseEvent): void {
  const index = closestItemIndex(event.clientY)
  if (index < 0) return
  hoverIndex.value = index
  const track = trackRef.value
  if (!track) return
  const items = Array.from(track.querySelectorAll<HTMLElement>('.question-jump-item'))
  const itemRect = items[index]?.getBoundingClientRect()
  const trackRect = track.getBoundingClientRect()
  if (!itemRect) return
  const mid = itemRect.top + itemRect.height / 2
  previewTop.value = `${mid - trackRect.top}px`
}

function clearHover(): void {
  hoverIndex.value = -1
}

function onTrackDown(event: MouseEvent): void {
  const index = closestItemIndex(event.clientY)
  const anchor = index >= 0 ? props.anchors[index] : null
  if (anchor) emit('jump', anchor.turn)
}

function onJump(anchor: QuestionAnchor): void {
  emit('jump', anchor.turn)
}
</script>

<style scoped>
@reference "tailwindcss";

.question-jump-bar {
  @apply pointer-events-none absolute right-0 top-1/2 z-20 w-14 -translate-y-1/2;
  opacity: 0;
  animation: question-jump-in 0.18s ease-out 0.08s forwards;
}

@keyframes question-jump-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.question-jump-track {
  @apply pointer-events-auto flex flex-col items-center gap-1.5;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: none;
}

.question-jump-track::-webkit-scrollbar {
  display: none;
}

.question-jump-item {
  @apply flex h-3 w-full items-center justify-center p-0;
  background: transparent;
  border: none;
  cursor: pointer;
}

.question-jump-dot {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: #d4d4d8; /* zinc-300 */
  transition:
    background 200ms,
    width 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.question-jump-preview {
  @apply pointer-events-none absolute right-full mr-3 -translate-y-1/2 max-w-[240px] overflow-hidden rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 shadow-md;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.question-jump-preview-text {
  @apply block truncate;
}

@media (max-width: 767px) {
  .question-jump-bar {
    display: none;
  }
}
</style>
