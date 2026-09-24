<template>
  <div v-if="visible" ref="rootRef" class="skill-picker" :style="positionStyle">
    <div class="skill-picker-header">
      <input
        ref="searchInputRef"
        v-model="query"
        class="skill-picker-search"
        type="text"
        :placeholder="t('Search skills...')"
        @keydown.escape.prevent="$emit('close')"
        @keydown.enter.prevent="selectHighlighted"
        @keydown.arrow-down.prevent="moveHighlight(1)"
        @keydown.arrow-up.prevent="moveHighlight(-1)"
      />
    </div>
    <ul v-if="filtered.length > 0" class="skill-picker-list" role="listbox">
      <li v-for="(skill, idx) in filtered" :key="skill.path">
        <button
          class="skill-picker-item"
          :class="{ 'is-highlighted': idx === highlightIndex }"
          type="button"
          @click="$emit('select', skill)"
          @pointerenter="highlightIndex = idx"
        >
          <span class="skill-picker-name">{{ skill.displayName || skill.name }}</span>
          <span v-if="skill.description" class="skill-picker-desc">{{ skill.description }}</span>
        </button>
      </li>
    </ul>
    <div v-else class="skill-picker-empty">{{ t('No skills found') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useUiLanguage } from '../../composables/useUiLanguage'

export type SkillOption = {
  name: string
  displayName?: string
  description: string
  path: string
}

const props = defineProps<{
  skills: SkillOption[]
  visible: boolean
  anchorBottom?: number
  anchorLeft?: number
}>()

const emit = defineEmits<{
  select: [skill: SkillOption]
  close: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const highlightIndex = ref(0)
const { t } = useUiLanguage()

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return props.skills
  return props.skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q)
      || (s.displayName ?? '').toLowerCase().includes(q)
      || s.description.toLowerCase().includes(q),
  )
})

const positionStyle = computed(() => {
  const styles: Record<string, string> = {}
  if (props.anchorBottom != null) styles.bottom = `${props.anchorBottom}px`
  if (props.anchorLeft != null) styles.left = `${props.anchorLeft}px`
  return styles
})

function moveHighlight(delta: number): void {
  if (filtered.value.length === 0) return
  highlightIndex.value = (highlightIndex.value + delta + filtered.value.length) % filtered.value.length
}

function selectHighlighted(): void {
  const skill = filtered.value[highlightIndex.value]
  if (!skill) return
  emit('select', skill)
}

watch(() => props.visible, (v) => {
  if (v) {
    query.value = ''
    highlightIndex.value = 0
    nextTick(() => searchInputRef.value?.focus())
  }
})

watch(query, () => {
  highlightIndex.value = 0
})
</script>

<style scoped>
@reference "../../style.css";

.skill-picker {
  @apply absolute z-40 w-72 max-sm:!left-4 max-sm:!right-4 max-sm:!w-auto max-h-64 rounded-xl border border-line-1 bg-s2 shadow-lg flex flex-col overflow-hidden;
}

.skill-picker-header {
  @apply p-2 border-b border-line-1;
}

.skill-picker-search {
  @apply w-full rounded-lg border border-line-1 bg-s0 px-2.5 py-1.5 text-sm text-ink-2 outline-none placeholder-ink-3 transition focus:border-line-2 focus:bg-s2;
}

.skill-picker-list {
  @apply m-0 list-none p-1 overflow-y-auto flex-1;
}

.skill-picker-item {
  @apply flex w-full flex-col items-start gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left transition hover:bg-s0;
}

.skill-picker-item.is-highlighted {
  @apply bg-s1;
}

.skill-picker-name {
  @apply text-sm font-medium text-ink-2;
}

.skill-picker-desc {
  @apply text-xs text-ink-3 line-clamp-1;
}

.skill-picker-empty {
  @apply p-3 text-center text-sm text-ink-3;
}
</style>
