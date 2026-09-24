<template>
  <div ref="rootRef" class="composer-dropdown">
    <button
      class="composer-dropdown-trigger"
      :class="variantClass"
      type="button"
      :title="triggerAccessibleLabel"
      :aria-label="triggerAccessibleLabel"
      :disabled="disabled"
      @click="onToggle"
    >
      <component :is="selectedPrefixIcon" v-if="selectedPrefixIcon" class="composer-dropdown-prefix-icon" />
      <span v-if="!iconOnly" class="composer-dropdown-value">{{ selectedLabel }}</span>
      <IconTablerChevronDown class="composer-dropdown-chevron" />
    </button>

    <div
      v-if="isOpen"
      ref="menuWrapRef"
      class="composer-dropdown-menu-wrap"
      :class="{
        'composer-dropdown-menu-wrap-up': openDirection === 'up',
        'composer-dropdown-menu-wrap-down': openDirection === 'down',
      }"
      :style="menuWrapStyle"
    >
      <div ref="menuRef" class="composer-dropdown-menu">
        <div v-if="enableSearch" class="composer-dropdown-search-wrap">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="composer-dropdown-search-input"
            type="text"
            :placeholder="searchPlaceholderText"
            @keydown.esc.prevent="onEscapeSearch"
          />
        </div>

        <ul class="composer-dropdown-options" role="listbox">
          <li v-for="option in filteredOptions" :key="option.value">
            <button
              class="composer-dropdown-option"
              :class="{ 'is-selected': option.value === modelValue }"
              type="button"
              @click="onSelect(option.value)"
            >
              {{ option.label }}
            </button>
          </li>
          <li v-if="filteredOptions.length === 0" class="composer-dropdown-empty">
            {{ emptyText }}
          </li>
        </ul>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'

type DropdownOption = {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  selectedPrefixIcon?: Component | null
  iconOnly?: boolean
  openDirection?: 'up' | 'down'
  menuAlign?: 'start' | 'end'
  enableSearch?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
  variant?: 'plain' | 'pill'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const menuWrapRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const menuWrapStyle = ref<Record<string, string>>({})
let isLayoutListenerAttached = false

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder?.trim() || ''
})

const openDirection = computed(() => props.openDirection ?? 'down')
const menuAlign = computed(() => props.menuAlign ?? 'start')
const iconOnly = computed(() => props.iconOnly === true)
const enableSearch = computed(() => props.enableSearch === true)
const variantClass = computed(() => (
  props.variant === 'pill' ? 'composer-dropdown-trigger--pill' : ''
))
const searchPlaceholderText = computed(() => props.searchPlaceholder?.trim() || 'Quick search projects')
const emptyText = computed(() => props.emptyLabel?.trim() || 'No results')
const triggerAccessibleLabel = computed(() => selectedLabel.value || props.placeholder?.trim() || 'Select option')
const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options
  return props.options.filter((option) => {
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
})

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updateMenuPosition(): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root || typeof window === 'undefined') return

  const rect = root.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const viewportPadding = 8
  const gap = 8
  const maxMenuWidth = Math.max(0, viewportWidth - viewportPadding * 2)
  const measuredWidth = menuRef.value?.offsetWidth ?? menuWrapRef.value?.offsetWidth ?? 224
  const measuredHeight = menuRef.value?.offsetHeight ?? menuWrapRef.value?.offsetHeight ?? 0
  const menuWidth = Math.min(measuredWidth, maxMenuWidth)
  const maxLeft = Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding)
  const desiredLeft = menuAlign.value === 'end' ? rect.right - menuWidth : rect.left
  const left = clamp(desiredLeft, viewportPadding, maxLeft)

  let top = openDirection.value === 'up'
    ? rect.top - measuredHeight - gap
    : rect.bottom + gap
  if (measuredHeight > 0 && top + measuredHeight > viewportHeight - viewportPadding) {
    top = viewportHeight - measuredHeight - viewportPadding
  }
  top = Math.max(viewportPadding, top)

  menuWrapStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    right: 'auto',
    top: `${top}px`,
    bottom: 'auto',
    width: `${menuWidth}px`,
  }
}

function addLayoutListeners(): void {
  if (isLayoutListenerAttached || typeof window === 'undefined') return
  window.addEventListener('resize', updateMenuPosition)
  window.addEventListener('scroll', updateMenuPosition, true)
  isLayoutListenerAttached = true
}

function removeLayoutListeners(): void {
  if (!isLayoutListenerAttached || typeof window === 'undefined') return
  window.removeEventListener('resize', updateMenuPosition)
  window.removeEventListener('scroll', updateMenuPosition, true)
  isLayoutListenerAttached = false
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
  searchQuery.value = ''
}

function onEscapeSearch(): void {
  if (searchQuery.value.length > 0) {
    searchQuery.value = ''
    return
  }
  isOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
  searchQuery.value = ''
}

watch(isOpen, (open) => {
  if (!open) {
    removeLayoutListeners()
    menuWrapStyle.value = {}
    return
  }
  addLayoutListeners()
  nextTick(() => {
    updateMenuPosition()
    window.requestAnimationFrame(updateMenuPosition)
    if (enableSearch.value) searchInputRef.value?.focus()
  })
})

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  removeLayoutListeners()
})
</script>

<style scoped>
@reference "../../style.css";

.composer-dropdown {
  @apply relative inline-flex min-w-0;
}

.composer-dropdown-trigger {
  @apply inline-flex min-h-7 min-w-0 items-center gap-1 border-0 bg-transparent px-0 py-0.5 text-sm leading-tight text-ink-3 outline-none transition;
}

/* `--pill` 变体只有输入区那两个控件在用（已核：模型 / 推理强度），所以这里写下的就是
   「芯片」语言本身，而不是一个泛用变体：等宽字、6px 圆角、发丝边框、无填充、中性墨色。
   模型那枚由 ThreadComposerModelControls 覆盖成 --model（紫），以标明「这是模型身份」；
   这正是审计第②条那个缺陷的正面修法——四个下拉原本是四颗一模一样的全圆角药丸。 */
.composer-dropdown-trigger--pill {
  @apply h-7 rounded-md border border-line-1 bg-transparent px-2 font-mono text-xs text-ink-3 transition hover:border-line-2 hover:text-ink-1 disabled:cursor-not-allowed disabled:text-ink-4;
}

.composer-dropdown-trigger--pill .composer-dropdown-chevron {
  @apply text-current opacity-70;
}

.composer-dropdown-prefix-icon {
  @apply h-3.5 w-3.5 shrink-0 text-live;
}

.composer-dropdown-trigger:disabled {
  @apply cursor-not-allowed text-ink-3;
}

.composer-dropdown-value {
  @apply whitespace-nowrap text-left truncate pb-px;
}

.composer-dropdown-chevron {
  @apply mt-px h-3.5 w-3.5 shrink-0 text-ink-3;
}

.composer-dropdown-menu-wrap {
  @apply absolute left-0 z-50;
}

.composer-dropdown-menu-wrap-down {
  @apply top-[calc(100%+8px)];
}

.composer-dropdown-menu-wrap-up {
  @apply bottom-[calc(100%+8px)];
}

.composer-dropdown-menu {
  @apply m-0 min-w-56 rounded-xl border border-line-1 bg-s2 p-1 shadow-lg;
}

.composer-dropdown-search-wrap {
  @apply px-1 pb-1;
}

.composer-dropdown-search-input {
  @apply w-full rounded-md border border-line-1 bg-s2 px-2 py-1 text-xs text-ink-2 outline-none transition focus:border-line-3;
}

.composer-dropdown-options {
  @apply m-0 max-h-56 list-none overflow-y-auto p-0;
}

.composer-dropdown-option {
  @apply flex w-full items-center rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-sm text-ink-2 transition hover:bg-s1;
}

.composer-dropdown-option.is-selected {
  @apply bg-s1;
}

.composer-dropdown-empty {
  @apply px-2 py-1.5 text-xs text-ink-3;
}
</style>
