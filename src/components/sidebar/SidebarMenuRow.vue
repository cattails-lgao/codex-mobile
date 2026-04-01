<template>
  <component
    :is="props.as"
    class="sidebar-menu-row"
    :data-has-left="hasLeft"
    :data-has-right="hasRight"
    :data-has-right-hover="hasRightHover"
    :data-force-right-hover="props.forceRightHover"
    v-bind="$attrs"
  >
    <span v-if="hasLeft" class="sidebar-menu-row-left">
      <slot name="left" />
    </span>

    <span class="sidebar-menu-row-main">
      <slot />
    </span>

    <span v-if="hasRight" class="sidebar-menu-row-right">
      <span v-if="hasRightDefault" class="sidebar-menu-row-right-default">
        <slot name="right" />
      </span>
      <span v-if="hasRightHover" class="sidebar-menu-row-right-hover">
        <slot name="right-hover" />
      </span>
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    as?: string
    forceRightHover?: boolean
  }>(),
  {
    as: 'div',
    forceRightHover: false,
  },
)

const slots = useSlots()

const hasLeft = computed(() => Boolean(slots.left))
const hasRightDefault = computed(() => Boolean(slots.right))
const hasRightHover = computed(() => Boolean(slots['right-hover']))
const hasRight = computed(() => hasRightDefault.value || hasRightHover.value)
</script>

<style scoped>
@reference "tailwindcss";

.sidebar-menu-row {
  @apply w-full min-w-0 rounded-lg px-3 py-1 text-left transition flex items-center gap-2;
}

.sidebar-menu-row-left {
  @apply w-4 h-4 shrink-0 flex items-center justify-center text-zinc-500;
}

.sidebar-menu-row-main {
  @apply min-w-0 flex-1;
}

.sidebar-menu-row-right {
  @apply relative ml-2 shrink-0 flex items-center justify-end;
}

.sidebar-menu-row-right-default,
.sidebar-menu-row-right-hover {
  @apply transition;
}

.sidebar-menu-row[data-has-right='true'] .sidebar-menu-row-right-hover {
  @apply absolute right-0 top-1/2 -translate-y-1/2 opacity-0 invisible pointer-events-none;
}

.sidebar-menu-row[data-has-right='true'][data-has-right-hover='true']:hover .sidebar-menu-row-right-default,
.sidebar-menu-row[data-has-right='true'][data-has-right-hover='true']:focus-within .sidebar-menu-row-right-default {
  @apply opacity-0 invisible pointer-events-none;
}

.sidebar-menu-row[data-has-right='true'][data-has-right-hover='true']:hover .sidebar-menu-row-right-hover,
.sidebar-menu-row[data-has-right='true'][data-has-right-hover='true']:focus-within .sidebar-menu-row-right-hover {
  @apply opacity-100 visible pointer-events-auto;
}

.sidebar-menu-row[data-has-right='true'][data-force-right-hover='true'] .sidebar-menu-row-right-default {
  @apply opacity-0 invisible pointer-events-none;
}

.sidebar-menu-row[data-has-right='true'][data-force-right-hover='true'] .sidebar-menu-row-right-hover {
  @apply opacity-100 visible pointer-events-auto;
}
</style>
