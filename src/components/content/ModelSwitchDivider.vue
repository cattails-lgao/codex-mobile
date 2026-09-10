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
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 12px;
  font-size: 12px;
  color: #71717a;
}

.model-switch-track {
  flex: 1;
  height: 1px;
  background: rgba(148, 163, 184, 0.5);
}

.model-switch-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.92;
}

:global(:root.dark) .model-switch-divider {
  color: #71717a;
}

:global(:root.dark) .model-switch-track {
  background: rgba(63, 63, 70, 0.55);
}
</style>