<template>
  <aside class="api-panel-root">
    <header class="api-panel-header">
      <h2 class="api-panel-title">{{ t('AppServer API') }}</h2>
      <p class="api-panel-count">{{ methods.length }} {{ t('methods') }}</p>
    </header>

    <p v-if="isLoading" class="api-panel-loading">{{ t('Loading method catalog...') }}</p>

    <ul v-else class="api-method-list">
      <li v-for="method in methods" :key="method" class="api-method-item">
        <code class="api-method-code">{{ method }}</code>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { useUiLanguage } from '../../composables/useUiLanguage'

defineProps<{
  methods: string[]
  isLoading: boolean
}>()

const { t } = useUiLanguage()
</script>

<style scoped>
@reference "../../style.css";

.api-panel-root {
  @apply h-full min-h-0 rounded-2xl border border-line-1 bg-s2 p-4 flex flex-col;
}

.api-panel-header {
  @apply pb-3 border-b border-line-1;
}

.api-panel-title {
  @apply m-0 text-lg font-semibold text-ink-1;
}

.api-panel-count {
  @apply m-0 mt-1 text-xs text-ink-3;
}

.api-panel-loading {
  @apply mt-3 mb-0 text-sm text-ink-3;
}

.api-method-list {
  @apply mt-3 list-none m-0 p-0 overflow-y-auto min-h-0 flex-1 flex flex-col gap-1;
}

.api-method-item {
  @apply m-0;
}

.api-method-code {
  @apply block rounded-md bg-s1 px-2 py-1 text-xs text-ink-2;
}
</style>
