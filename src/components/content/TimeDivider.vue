<template>
  <div class="time-divider">
    <span class="time-divider-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<style scoped>
.time-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 12px;
  font-size: 12px;
  color: #71717a;
}

.time-divider-label {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  white-space: nowrap;
  font-weight: 500;
}

:global(:root.dark) .time-divider {
  color: #a1a1aa;
}

:global(:root.dark) .time-divider-label {
  background: rgba(63, 63, 70, 0.5);
}
</style>
