<template>
  <section class="directory-section">
    <div class="directory-toolbar">
      <input
        :value="searchQuery"
        class="directory-search"
        type="search"
        placeholder="Search Composio connectors..."
        aria-label="Search Composio connectors"
        @input="emit('update:search-query', ($event.target as HTMLInputElement).value)"
      />
      <div class="directory-sort-group" role="group" aria-label="Sort Composio connectors">
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
    <div v-if="error" class="directory-error">{{ error }}</div>
    <div v-else-if="isLoadingComposio" class="directory-loading">Loading Composio connectors...</div>
    <div v-else-if="!composioStatus?.available" class="directory-empty">
      <div class="directory-empty-copy">
        <p class="directory-empty-text">Composio CLI is not installed in this environment.</p>
        <div class="directory-card-actions">
          <button class="directory-action primary" type="button" :disabled="isInstallingComposio" @click="installComposioCli">
            {{ isInstallingComposio ? installingLabel : installLabel }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="!composioStatus.authenticated" class="composio-preview">
      <article class="composio-preview-hero">
        <div class="composio-preview-copy">
          <div class="directory-card-fallback composio-fallback">C</div>
          <div>
            <p class="composio-preview-kicker">Connector catalog preview</p>
            <h3 class="composio-preview-title">Connect everyday apps like Gmail, Calendar, Reddit, YouTube, and Drive.</h3>
            <p class="composio-preview-text">
              Composio is installed locally. Login to browse the live catalog, connect your accounts, and try simple actions from this machine.
            </p>
          </div>
        </div>
        <div class="composio-preview-actions">
          <button class="directory-action primary" type="button" :disabled="isStartingComposioLogin" @click="startComposioCliLogin">
            {{ isStartingComposioLogin ? openingLabel : loginLabel }}
          </button>
          <button class="directory-action-link" type="button" @click="openExternalUrl(composioStatus.webUrl || 'https://dashboard.composio.dev/')">
            {{ openDashboardLabel }}
          </button>
        </div>
      </article>
      <div class="composio-preview-grid">
        <article v-for="connector in visibleComposioPreviewConnectors" :key="connector.slug" class="directory-card composio-preview-card">
          <div class="directory-card-top">
            <div class="directory-card-fallback composio-fallback">{{ connector.initial }}</div>
            <div class="directory-card-main">
              <div class="directory-card-title-row">
                <span class="directory-card-title">{{ connector.name }}</span>
                <span class="directory-badge is-muted">{{ previewLabel }}</span>
              </div>
              <span class="directory-card-meta">{{ connector.meta }}</span>
            </div>
          </div>
          <p class="directory-card-description">{{ connector.description }}</p>
          <div class="directory-chip-row">
            <span v-for="chip in connector.chips" :key="chip" class="directory-chip">{{ chip }}</span>
          </div>
        </article>
      </div>
    </div>
    <div v-else class="directory-section composio-section">
      <article class="directory-card directory-card-wide composio-status-card">
        <div class="directory-card-top">
          <div class="directory-card-fallback composio-fallback">C</div>
          <div class="directory-card-main">
            <div class="directory-card-title-row">
              <span class="directory-card-title">{{ workspaceLabel }}</span>
              <span class="directory-badge">{{ connectedLabel }}</span>
            </div>
            <span class="directory-card-meta">{{ composioStatus.email || composioStatus.defaultOrgName || authenticatedLabel }}</span>
          </div>
        </div>
        <p class="directory-card-description">
          {{ workspaceSummary }}
        </p>
        <div class="directory-chip-row">
          <span v-if="composioStatus.defaultOrgName" class="directory-chip">{{ composioStatus.defaultOrgName }}</span>
          <span v-if="composioStatus.cliVersion" class="directory-chip">CLI {{ composioStatus.cliVersion }}</span>
          <span v-if="connectorCount" class="directory-chip">
            Showing {{ connectorCount }}{{ total ? ` / ${total}` : '' }} connectors
          </span>
        </div>
        <div class="directory-card-actions">
          <button class="directory-action-link" type="button" @click="openExternalUrl(composioStatus.webUrl)">
            {{ openDashboardLabel }}
          </button>
        </div>
      </article>

      <div v-if="visibleComposioConnectors.length === 0" class="directory-empty">No Composio connectors found.</div>
      <div v-else class="directory-grid">
        <article v-for="connector in visibleComposioConnectors" :key="connector.slug" class="directory-card">
          <div class="directory-card-top">
            <img v-if="connector.logoUrl" class="directory-card-icon" :src="connector.logoUrl" :alt="connector.name" loading="lazy" />
            <div v-else class="directory-card-fallback composio-fallback">{{ connector.name.charAt(0) }}</div>
            <div class="directory-card-main">
              <div class="directory-card-title-row">
                <span class="directory-card-title">{{ connector.name }}</span>
                <span v-if="connector.activeCount > 0" class="directory-badge">{{ connectedLabel }}</span>
                <span v-else-if="connector.isNoAuth" class="directory-badge">{{ noAuthLabel }}</span>
              </div>
              <span class="directory-card-meta">{{ composioMetaLabel(connector) }}</span>
            </div>
          </div>
          <p v-if="connector.description" class="directory-card-description">{{ connector.description }}</p>
          <div class="directory-chip-row">
            <span class="directory-chip">{{ connector.toolsCount }} tools</span>
            <span v-if="connector.triggersCount > 0" class="directory-chip">{{ connector.triggersCount }} triggers</span>
            <span v-if="connector.authModes.length > 0" class="directory-chip">{{ connector.authModes.join(', ') }}</span>
          </div>
          <div class="directory-card-actions">
            <button class="directory-action" type="button" @click="openComposioDetail(connector.slug)">
              {{ detailsLabel }}
            </button>
            <button
              v-if="composioPrimaryActionLabel(connector)"
              class="directory-action-link"
              type="button"
              :disabled="actionSlug === connector.slug"
              @click="runComposioPrimaryAction(connector)"
            >
              {{ actionSlug === connector.slug ? openingLabel : composioPrimaryActionLabel(connector) }}
            </button>
            <button
              v-if="canTryComposio(connector)"
              class="directory-action primary"
              type="button"
              :disabled="isTryActionInFlight"
              @click="tryComposio(connector)"
            >
              {{ tryInFlightKey === composioTryKey(connector.slug) ? startingLabel : tryLabel }}
            </button>
          </div>
        </article>
      </div>
      <div v-if="hasMoreComposioConnectors" class="directory-section-actions">
        <button
          class="directory-action"
          type="button"
          :disabled="isLoadingComposio"
          @click="loadMoreComposio"
        >
          {{ isLoadingComposio ? loadingLabel : loadMoreLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DirectoryComposioConnector, DirectoryComposioConnection, DirectoryComposioStatus } from '../../api/codexGateway'
import type { DirectorySortMode } from './directoryHubUtils'

type ComposioPreviewConnector = {
  name: string
  slug: string
  initial: string
  meta: string
  description: string
  chips: string[]
}

defineProps<{
  composioStatus: DirectoryComposioStatus | null
  searchQuery: string
  sortMode: DirectorySortMode
  error: string
  isLoadingComposio: boolean
  isInstallingComposio: boolean
  isStartingComposioLogin: boolean
  visibleComposioConnectors: DirectoryComposioConnector[]
  visibleComposioPreviewConnectors: ComposioPreviewConnector[]
  workspaceSummary: string
  connectorCount: number
  total: number
  hasMoreComposioConnectors: boolean
  actionSlug: string
  isTryActionInFlight: boolean
  tryInFlightKey?: string
  composioMetaLabel: (connector: DirectoryComposioConnector) => string
  composioPrimaryActionLabel: (connector: DirectoryComposioConnector) => string
  canTryComposio: (connector: DirectoryComposioConnector) => boolean
  composioTryKey: (slug: string) => string
  openComposioDetail: (slug: string) => void
  runComposioPrimaryAction: (connector: DirectoryComposioConnector) => void
  tryComposio: (connector: DirectoryComposioConnector, connections?: DirectoryComposioConnection[]) => void
  installComposioCli: () => void
  startComposioCliLogin: () => void
  loadMoreComposio: () => void
  openExternalUrl: (url: string) => void
  workspaceLabel: string
  connectedLabel: string
  authenticatedLabel: string
  noAuthLabel: string
  previewLabel: string
  openDashboardLabel: string
  detailsLabel: string
  installLabel: string
  installingLabel: string
  loginLabel: string
  openingLabel: string
  startingLabel: string
  tryLabel: string
  loadMoreLabel: string
  loadingLabel: string
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