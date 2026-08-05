<template>
  <div ref="rootRef" class="composer-popover-anchor" :class="{ 'is-align-end': align === 'end' }">
    <slot name="trigger" :toggle="toggle" :is-open="isOpen" />
    <Transition name="composer-popover">
      <div
        v-if="isOpen"
        class="composer-popover-panel"
        :class="[widthClass, panelClass]"
        role="menu"
        :aria-label="ariaLabel"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  open: boolean
  /** Horizontal alignment of the panel relative to the anchor. */
  align?: 'start' | 'end'
  /** Panel width preset. */
  width?: 'md' | 'lg'
  /** Extra classes appended to the panel surface. */
  panelClass?: string
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const rootRef = ref<HTMLElement | null>(null)

const isOpen = computed(() => props.open)
const widthClass = computed(() => (
  props.width === 'lg' ? 'composer-popover-panel--lg' : 'composer-popover-panel--md'
))

function toggle(): void {
  emit('update:open', !props.open)
}

defineExpose({ root: rootRef })
</script>

<style scoped>
@reference "tailwindcss";

.composer-popover-anchor {
  @apply relative shrink-0;
}

.composer-popover-panel {
  @apply absolute bottom-11 left-0 z-20 max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.composer-popover-panel--md {
  @apply w-64;
}

.composer-popover-panel--lg {
  @apply w-72;
}

.composer-popover-anchor.is-align-end .composer-popover-panel {
  @apply left-auto right-0;
}

.composer-popover-enter-active {
  animation: composer-popover-in 150ms ease-out;
}

.composer-popover-leave-active {
  animation: composer-popover-in 150ms ease-out reverse;
}
</style>
