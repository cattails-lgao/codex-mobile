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

.process-fold {
  @apply w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60;
}

.process-fold--running {
  @apply border-amber-200 bg-amber-50/50;
}

.process-fold-header {
  @apply flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-100;
}

.process-fold--running .process-fold-header {
  @apply hover:bg-amber-100/60;
}

.process-fold-label {
  @apply min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600;
}

.process-fold-toggle {
  @apply shrink-0 text-xs leading-none text-zinc-400;
}

.process-fold-body {
  @apply flex flex-col gap-1.5 border-t border-zinc-200 px-2.5 py-2.5;
}
</style>
