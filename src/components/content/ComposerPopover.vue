<template>
  <div ref="rootRef" class="composer-popover-anchor">
    <slot name="trigger" :toggle="toggle" :is-open="isOpen" />
    <Transition name="composer-popover">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="composer-popover-panel"
        :class="[widthClass, panelClass]"
        :style="panelStyle"
        role="menu"
        tabindex="-1"
        :aria-label="ariaLabel"
        @keydown="onPanelKeydown"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  /** Horizontal alignment of the panel relative to the anchor. */
  align?: 'start' | 'end' | 'center'
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
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
let isLayoutListenerAttached = false

const isOpen = computed(() => props.open)
const widthClass = computed(() => (
  props.width === 'lg' ? 'composer-popover-panel--lg' : 'composer-popover-panel--md'
))

const GAP = 8
const VIEWPORT_PADDING = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max)
}

// 面板用 viewport 定位 fixed（区别于绝对定位），避免被 .thread-composer-controls
// 在移动端的 overflow-x-auto 滚容器裁剪；思路与 ComposerDropdown#updateMenuPosition 一致。
function updatePanelPosition(): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root || typeof window === 'undefined') return
  const rect = root.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING * 2)
  const width = Math.min(panelRef.value?.offsetWidth ?? 288, maxWidth)
  const height = panelRef.value?.offsetHeight ?? 0

  let left: number
  if (props.align === 'end') {
    left = rect.right - width
  } else if (props.align === 'center') {
    left = rect.left + (rect.width - width) / 2
  } else {
    left = rect.left
  }
  left = clamp(left, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING))
  let top = rect.top - height - GAP
  top = clamp(top, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING))

  panelStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    right: 'auto',
    top: `${top}px`,
    bottom: 'auto',
    width: `${width}px`,
  }
}

function addLayoutListeners(): void {
  if (isLayoutListenerAttached || typeof window === 'undefined') return
  window.addEventListener('resize', updatePanelPosition)
  window.addEventListener('scroll', updatePanelPosition, true)
  window.addEventListener('orientationchange', updatePanelPosition)
  isLayoutListenerAttached = true
}

function removeLayoutListeners(): void {
  if (!isLayoutListenerAttached || typeof window === 'undefined') return
  window.removeEventListener('resize', updatePanelPosition)
  window.removeEventListener('scroll', updatePanelPosition, true)
  window.removeEventListener('orientationchange', updatePanelPosition)
  isLayoutListenerAttached = false
}

// 打开时把焦点移入面板（tabindex=-1）：方向键 keydown 才能落在 panel 上被捕获，
// 同时不干扰输入框（焦点在 panel 内时方向键不再移动光标）。
watch(isOpen, (open) => {
  if (!open) {
    removeLayoutListeners()
    panelStyle.value = {}
    return
  }
  addLayoutListeners()
  nextTick(() => {
    panelRef.value?.focus()
    updatePanelPosition()
    window.requestAnimationFrame(updatePanelPosition)
  })
})

onBeforeUnmount(() => {
  removeLayoutListeners()
})

function toggle(): void {
  emit('update:open', !props.open)
}

// 键盘导航（验收遗留补齐）：↑/↓ 在菜单项（panel 内可见按钮）间移动焦点，
// Home/End 到首/末项，Enter/Space 由浏览器在聚焦的按钮上原生触发，Esc 关闭。
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('update:open', false)
    return
  }
  const panel = panelRef.value
  if (!panel) return
  const items = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).filter(
    (el) => !el.disabled && el.offsetParent !== null,
  )
  if (items.length === 0) return
  if (event.key === 'Home') {
    event.preventDefault()
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    items[items.length - 1]?.focus()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  let index = items.findIndex((el) => el === document.activeElement)
  if (index < 0) {
    index = event.key === 'ArrowDown' ? -1 : 0
  }
  const delta = event.key === 'ArrowDown' ? 1 : -1
  const nextIndex = (index + delta + items.length) % items.length
  items[nextIndex]?.focus()
}

defineExpose({ root: rootRef })
</script>

<style scoped>
@reference "tailwindcss";

.composer-popover-anchor {
  @apply relative shrink-0;
}

.composer-popover-panel {
  @apply z-20 max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.composer-popover-panel--md {
  @apply w-64;
}

.composer-popover-panel--lg {
  @apply w-72;
}

.composer-popover-panel button:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 1px;
}

.composer-popover-enter-active {
  animation: composer-popover-in 150ms ease-out;
}

.composer-popover-leave-active {
  animation: composer-popover-in 150ms ease-out reverse;
}
</style>
