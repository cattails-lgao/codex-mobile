<template>
  <section class="directory-section">
    <div class="directory-toolbar">
      <input
        :value="searchQuery"
        class="directory-search"
        type="search"
        placeholder="Search apps..."
        aria-label="Search apps"
        @input="emit('update:search-query', ($event.target as HTMLInputElement).value)"
      />
      <div class="directory-sort-group" role="group" aria-label="Sort apps">
        <button
          v-for="mode in sortModes"
          :key="mode.id"
          class="directory-sort-button"
          :class="{ 'is-active': sortMode === mode.id }"
          type="button"
          @click="emit('update:sort-mode', mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
    <div v-if="!supportsApps" class="directory-empty">
      Apps APIs unavailable in this Codex CLI. Update Codex CLI to manage apps.
    </div>
    <div v-else-if="error" class="directory-error">{{ error }}</div>
    <div v-else-if="isLoading" class="directory-loading">Loading apps...</div>
    <div v-else-if="apps.length === 0" class="directory-empty">No apps found.</div>
    <div v-else class="directory-grid">
      <article v-for="app in apps" :key="app.id" class="directory-card">
        <div class="directory-card-top">
          <img v-if="appLogoSrc(app)" class="directory-card-icon" :src="appLogoSrc(app)" :alt="app.name" loading="lazy" />
          <div v-else class="directory-card-fallback">{{ app.name.charAt(0) }}</div>
          <div class="directory-card-main">
            <div class="directory-card-title-row">
              <span class="directory-card-title">{{ app.name }}</span>
              <span v-if="!app.isEnabled" class="directory-badge is-muted">{{ disabledLabel }}</span>
              <span v-else-if="app.isAccessible" class="directory-badge">{{ connectedLabel }}</span>
            </div>
            <span class="directory-card-meta">{{ appMetaLabel(app) }}</span>
          </div>
        </div>
        <p v-if="app.description" class="directory-card-description">{{ app.description }}</p>
        <div class="directory-chip-row">
          <span v-if="app.category" class="directory-chip">{{ app.category }}</span>
          <span v-for="name in app.pluginDisplayNames.slice(0, 2)" :key="name" class="directory-chip">{{ name }}</span>
        </div>
        <div class="directory-card-actions">
          <button class="directory-action" type="button" :disabled="actionId === app.id" @click="toggleApp(app)">
            {{ app.isEnabled ? disableLabel : enableLabel }}
          </button>
          <button v-if="app.installUrl" class="directory-action-link" type="button" @click="openExternalUrl(app.installUrl)">
            {{ app.isAccessible ? manageLabel : loginLabel }}
          </button>
          <button
            v-if="app.isAccessible && app.isEnabled"
            class="directory-action"
            type="button"
            :disabled="isTryActionInFlight"
            @click="tryApp(app)"
          >
            {{ tryInFlightKey === appTryKey(app) ? startingLabel : tryLabel }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DirectoryAppInfo } from '../../api/codexGateway'
import type { DirectorySortMode } from './directoryHubUtils'

defineProps<{
  apps: DirectoryAppInfo[]
  searchQuery: string
  sortMode: DirectorySortMode
  supportsApps: boolean
  error: string
  isLoading: boolean
  actionId: string
  tryInFlightKey?: string
  isTryActionInFlight: boolean
  appLogoSrc: (app: DirectoryAppInfo) => string
  appMetaLabel: (app: DirectoryAppInfo) => string
  appTryKey: (app: DirectoryAppInfo) => string
  toggleApp: (app: DirectoryAppInfo) => void
  openExternalUrl: (url: string) => void
  tryApp: (app: DirectoryAppInfo) => void
  disabledLabel: string
  connectedLabel: string
  enableLabel: string
  disableLabel: string
  manageLabel: string
  loginLabel: string
  tryLabel: string
  startingLabel: string
}>()

const emit = defineEmits<{
  'update:search-query': [value: string]
  'update:sort-mode': [value: DirectorySortMode]
}>()

const sortModes: Array<{ id: DirectorySortMode; label: string }> = [
  { id: 'popular', label: 'Popular' },
  { id: 'name', label: 'A-Z' },
  { id: 'date', label: 'Date' },
]
</script>
