<template>
  <div class="warm-turn" :class="{ 'warm-turn--expanded': expanded }">
    <button type="button" class="warm-turn__head" :aria-expanded="expanded" @click="onToggle">
      <IconTablerChevronRight class="warm-turn__chevron" :class="{ 'warm-turn__chevron--open': expanded }" />
      <span class="warm-turn__preview">{{ userText }}</span>
      <span v-if="toolCount > 0" class="warm-turn__meta">{{ t('{n} tools', { n: toolCount }) }}</span>
    </button>
    <div class="warm-turn__content">
      <slot v-if="expanded" />
      <div v-else-if="assistantPreview" class="warm-turn__assistant">{{ assistantPreview }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'
import IconTablerChevronRight from '../icons/IconTablerChevronRight.vue'

defineProps<{
  userText: string
  assistantPreview: string
  toolCount: number
  expanded: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

const { t } = useUiLanguage()

function onToggle(): void {
  emit('toggle')
}
</script>

<style scoped>
@reference "tailwindcss";

.warm-turn {
  @apply w-full min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50/60;
}

.warm-turn__head {
  @apply flex w-full min-h-[38px] items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-100;
}

.warm-turn__chevron {
  @apply shrink-0 text-zinc-400 transition-transform duration-150;
}

.warm-turn__chevron--open {
  @apply rotate-90;
}

.warm-turn__preview {
  @apply min-w-0 flex-1 truncate font-medium text-zinc-800;
}

.warm-turn__meta {
  @apply shrink-0 whitespace-nowrap text-[11px] text-zinc-400;
}

.warm-turn__assistant {
  @apply truncate px-3 pb-2.5 pl-11 text-xs leading-snug text-zinc-400;
}
</style>
