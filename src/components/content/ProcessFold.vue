<template>
  <div
    class="process-fold"
    :class="{ 'process-fold--open': open, 'process-fold--running': running }"
  >
    <button
      type="button"
      class="process-fold-header"
      :aria-expanded="open"
      @click="onToggle"
    >
      <span class="process-fold-label">{{ label }}</span>
      <span class="process-fold-toggle" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>
    <div v-if="open" class="process-fold-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import {
  getProcessFoldPreference,
  onProcessFoldPreferenceChange,
} from '../../utils/processFoldPreference'

const props = defineProps<{
  label: string
  running: boolean
  hasOutsideContent: boolean
}>()

// 运行中自动展开、完成自动收起（对应 Reasonix TurnCollapse 的 useEffect 语义）；
// 用户手动点击后本折叠不再被自动收放，直到下一轮运行开始。
const open = ref(getProcessFoldPreference() === 'expanded' || !props.hasOutsideContent)
const userOverridden = ref(false)
let prevRunning = false

const stopPreferenceListener = onProcessFoldPreferenceChange(() => {
  userOverridden.value = false
  if (getProcessFoldPreference() === 'expanded') {
    open.value = true
  } else if (!props.running && props.hasOutsideContent) {
    open.value = false
  }
})

watch(
  () => props.running,
  (running) => {
    const wasRunning = prevRunning
    prevRunning = running
    if (running) {
      if (!wasRunning) userOverridden.value = false
      if (!userOverridden.value) open.value = true
    } else if (
      wasRunning &&
      !userOverridden.value &&
      props.hasOutsideContent &&
      getProcessFoldPreference() !== 'expanded'
    ) {
      open.value = false
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => stopPreferenceListener())

function onToggle(): void {
  userOverridden.value = true
  open.value = !open.value
}
</script>

<style scoped>
@reference "tailwindcss";

/* 折叠条视觉降噪（round-17 反馈「不需要圆形边框和背景色、收起按钮放文本旁」）：
   去掉圆角/边框/背景，toggle 紧跟文本（不再推到行尾）。 */
.process-fold {
  @apply w-full min-w-0;
}

.process-fold--running .process-fold-label {
  @apply text-amber-600;
}

.process-fold-header {
  @apply flex w-full min-w-0 items-center gap-1 px-0 py-0.5 text-left transition-colors;
}

.process-fold-label {
  @apply min-w-0 truncate text-xs font-medium text-zinc-500;
}

.process-fold-toggle {
  @apply shrink-0 text-[10px] leading-none text-zinc-400;
}

.process-fold-body {
  @apply flex flex-col gap-1 px-0 py-1.5;
}
</style>
