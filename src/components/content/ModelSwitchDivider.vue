<template>
  <div class="model-switch-divider" :title="to ? `切换模型：${from ?? ''} → ${to}` : undefined">
    <span class="model-switch-track" aria-hidden="true" />
    <span class="model-switch-label">
      {{ from ? `${from} → ` : '' }}{{ to }}
    </span>
    <span class="model-switch-track" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  from?: string
  to?: string
}>()
</script>

<style scoped>
.model-switch-divider {
  @apply flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500;
}

.model-switch-track {
  @apply flex-1 h-px bg-slate-300/80;
}

.model-switch-label {
  @apply whitespace-nowrap overflow-hidden text-ellipsis;
  opacity: 0.92;
}

:global(:root.dark) .model-switch-divider {
  @apply text-zinc-500;
}

:global(:root.dark) .model-switch-track {
  @apply bg-zinc-700/80;
}
</style>