<template>
  <div ref="rootRef" class="runtime-dropdown">
    <button class="runtime-dropdown-trigger" type="button" @click="isOpen = !isOpen">
      <component :is="selectedOption.icon" class="runtime-dropdown-trigger-icon" />
      <span class="runtime-dropdown-trigger-label">{{ selectedOption.label }}</span>
      <IconTablerChevronDown class="runtime-dropdown-trigger-chevron" />
    </button>

    <div v-if="isOpen" class="runtime-dropdown-menu-wrap">
      <div class="runtime-dropdown-menu">
        <div class="runtime-dropdown-title">Continue in</div>
        <button
          v-for="option in options"
          :key="option.value"
          class="runtime-dropdown-option"
          :class="{ 'is-selected': modelValue === option.value }"
          type="button"
          @click="onSelect(option.value)"
        >
          <component :is="option.icon" class="runtime-dropdown-option-icon" />
          <span class="runtime-dropdown-option-label">{{ option.label }}</span>
          <span v-if="modelValue === option.value" class="runtime-dropdown-option-check">✓</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'
import IconTablerFolder from '../icons/IconTablerFolder.vue'
import IconTablerGitFork from '../icons/IconTablerGitFork.vue'

type RuntimeMode = 'local' | 'worktree'

const props = defineProps<{
  modelValue: RuntimeMode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RuntimeMode]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const options = [
  { value: 'local' as const, label: 'Local project', icon: IconTablerFolder },
  { value: 'worktree' as const, label: 'New worktree', icon: IconTablerGitFork },
]

const selectedOption = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0])

function onSelect(value: RuntimeMode): void {
  emit('update:modelValue', value)
  isOpen.value = false
}

function onWindowPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown)
})
</script>

<style scoped>
@reference "tailwindcss";

.runtime-dropdown {
  @apply relative;
}

.runtime-dropdown-trigger {
  @apply inline-flex items-center gap-1.5 h-8 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50;
}

.runtime-dropdown-trigger-icon {
  @apply h-3.5 w-3.5 text-zinc-500;
}

.runtime-dropdown-trigger-label {
  @apply whitespace-nowrap;
}

.runtime-dropdown-trigger-chevron {
  @apply h-3.5 w-3.5 text-zinc-500;
}

.runtime-dropdown-menu-wrap {
  @apply absolute left-0 top-[calc(100%+8px)] z-50;
}

.runtime-dropdown-menu {
  @apply flex min-w-52 flex-col rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg;
}

.runtime-dropdown-title {
  @apply px-2.5 py-2 text-xs font-medium text-zinc-500;
}

.runtime-dropdown-option {
  @apply flex items-center gap-2 rounded-xl border-0 bg-transparent px-2.5 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100;
}

.runtime-dropdown-option.is-selected {
  @apply bg-zinc-100;
}

.runtime-dropdown-option-icon {
  @apply h-4 w-4 shrink-0 text-zinc-500;
}

.runtime-dropdown-option-label {
  @apply flex-1 text-left;
}

.runtime-dropdown-option-check {
  @apply text-zinc-700;
}
</style>
