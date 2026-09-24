<template>
  <nav class="sidebar-primary-nav">
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">{{ t('New thread') }}</SidebarMenuRow>
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">{{ t('Automations') }}</SidebarMenuRow>
    <SidebarMenuRow as="button" class="sidebar-nav-item" type="button">{{ t('Skills') }}</SidebarMenuRow>
  </nav>
</template>

<script setup lang="ts">
import SidebarMenuRow from './SidebarMenuRow.vue'
import { useUiLanguage } from '../../composables/useUiLanguage'

const { t } = useUiLanguage()
</script>

<style scoped>
@reference "../../style.css";

.sidebar-primary-nav {
  @apply flex flex-col gap-1;
}

.sidebar-nav-item {
  @apply text-sm font-normal text-ink-2 hover:bg-line-1;
}
</style>
