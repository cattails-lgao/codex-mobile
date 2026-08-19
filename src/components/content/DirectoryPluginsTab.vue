<template>
  <section class="directory-section">
    <div class="directory-toolbar">
      <input
        :value="searchQuery"
        class="directory-search"
        type="search"
        placeholder="Search plugins..."
        aria-label="Search plugins"
        @input="emit('update:search-query', ($event.target as HTMLInputElement).value)"
      />
      <div class="directory-sort-group" role="group" aria-label="Sort plugins">
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

    <div v-if="supportsMarketplace" class="directory-marketplace">
      <div class="directory-marketplace-header">
        <span class="directory-marketplace-title">Marketplaces</span>
        <button
          class="directory-marketplace-upgrade"
          type="button"
          :disabled="isMarketplaceActionInFlight"
          @click="upgradeAllMarketplaces"
        >
          {{ marketplaceActionName === 'upgrade' ? upgradingLabel : upgradeAllLabel }}
        </button>
      </div>
      <div v-if="marketplaces.length === 0" class="directory-marketplace-empty">No marketplaces configured.</div>
      <div v-else class="directory-marketplace-list">
        <div v-for="marketplace in marketplaces" :key="marketplace.name" class="directory-marketplace-row">
          <span class="directory-marketplace-name">{{ marketplace.displayName }}</span>
          <code v-if="marketplace.path" class="directory-marketplace-path">{{ marketplace.path }}</code>
          <button
            class="directory-marketplace-remove"
            type="button"
            :disabled="isMarketplaceActionInFlight"
            @click="removeMarketplace(marketplace.name)"
          >
            {{ marketplaceActionName === `remove:${marketplace.name}` ? removingLabel : removeLabel }}
          </button>
        </div>
      </div>
      <div class="directory-marketplace-add">
        <input
          :value="marketplaceSourceUrl"
          class="directory-marketplace-source"
          type="url"
          placeholder="Git URL to add a marketplace"
          aria-label="Marketplace Git URL"
          @input="emit('update:marketplace-source-url', ($event.target as HTMLInputElement).value)"
          @keydown.enter="addMarketplace"
        />
        <button
          class="directory-marketplace-add-button"
          type="button"
          :disabled="isMarketplaceActionInFlight || !marketplaceSourceUrl.trim()"
          @click="addMarketplace"
        >
          {{ marketplaceActionName === 'add' ? addingLabel : addLabel }}
        </button>
      </div>
    </div>

    <div v-if="!supportsPlugins" class="directory-empty">
      Plugin APIs unavailable in this Codex CLI. Update Codex CLI to use plugin catalog features.
    </div>
    <div v-else-if="error" class="directory-error">{{ error }}</div>
    <div v-else-if="isLoading" class="directory-loading">Loading plugins...</div>
    <div v-else-if="plugins.length === 0" class="directory-empty">No plugins found.</div>
    <div v-else class="directory-grid">
      <button
        v-for="plugin in plugins"
        :key="plugin.id"
        class="directory-card"
        :class="{ 'is-disabled': plugin.installed && !plugin.enabled }"
        type="button"
        @click="openPluginDetail(plugin)"
      >
        <div class="directory-card-top">
          <img
            v-if="pluginIconSrc(plugin)"
            class="directory-card-icon"
            :src="pluginIconSrc(plugin)"
            :alt="plugin.displayName"
            loading="lazy"
          />
          <div v-else class="directory-card-fallback" :style="fallbackStyle(plugin)">
            {{ plugin.displayName.charAt(0) }}
          </div>
          <div class="directory-card-main">
            <div class="directory-card-title-row">
              <span class="directory-card-title">{{ plugin.displayName }}</span>
              <span v-if="plugin.installed && !plugin.enabled" class="directory-badge is-muted">{{ disabledLabel }}</span>
              <span v-else-if="plugin.installed" class="directory-badge">{{ installedLabel }}</span>
            </div>
            <span class="directory-card-meta">{{ plugin.developerName || plugin.marketplaceDisplayName || plugin.marketplaceName || pluginLabel }}</span>
          </div>
        </div>
        <p v-if="plugin.description" class="directory-card-description">{{ plugin.description }}</p>
        <div class="directory-chip-row">
          <span v-if="plugin.category" class="directory-chip">{{ plugin.category }}</span>
          <span v-for="capability in plugin.capabilities.slice(0, 2)" :key="capability" class="directory-chip">{{ capability }}</span>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DirectoryPluginSummary } from '../../api/codexGateway'
import type { DirectorySortMode } from './directoryHubUtils'

type Marketplace = {
  name: string
  displayName: string
  path: string | null
}

defineProps<{
  plugins: DirectoryPluginSummary[]
  searchQuery: string
  sortMode: DirectorySortMode
  supportsPlugins: boolean
  supportsMarketplace: boolean
  error: string
  isLoading: boolean
  marketplaces: Marketplace[]
  marketplaceSourceUrl: string
  marketplaceActionName: string
  isMarketplaceActionInFlight: boolean
  pluginIconSrc: (plugin: DirectoryPluginSummary | null) => string
  fallbackStyle: (plugin: DirectoryPluginSummary) => Record<string, string>
  openPluginDetail: (plugin: DirectoryPluginSummary) => void
  addMarketplace: () => void
  removeMarketplace: (name: string) => void
  upgradeAllMarketplaces: () => void
  disabledLabel: string
  installedLabel: string
  pluginLabel: string
  upgradeAllLabel: string
  upgradingLabel: string
  removingLabel: string
  removeLabel: string
  addingLabel: string
  addLabel: string
}>()

const emit = defineEmits<{
  'update:search-query': [value: string]
  'update:sort-mode': [value: DirectorySortMode]
  'update:marketplace-source-url': [value: string]
}>()

const sortModes: Array<{ id: DirectorySortMode; label: string }> = [
  { id: 'popular', label: 'Popular' },
  { id: 'name', label: 'A-Z' },
  { id: 'date', label: 'Date' },
]
</script>
