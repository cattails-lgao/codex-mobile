<template>
  <section class="directory-section">
    <SkillsHub
      :try-in-flight-key="tryInFlightKey"
      @skills-changed="emit('skills-changed')"
      @try-item="(payload) => emit('try-item', payload)"
    >
      <template #before-installed>
        <div class="skills-embedded-section">
          <button class="skills-embedded-toggle" type="button" @click="toggleMcpSectionOpen">
            <span class="skills-embedded-title">MCPs({{ visibleMcpServers.length }})</span>
            <span class="skills-embedded-chevron" :class="{ 'is-open': isMcpSectionOpen }">›</span>
          </button>
          <div v-if="isMcpSectionOpen" class="skills-embedded-body">
            <div v-if="!supportsMcps" class="directory-empty">
              MCP status APIs unavailable in this Codex CLI. Update Codex CLI to inspect MCP servers.
            </div>
            <div v-else-if="mcpError" class="directory-error">{{ mcpError }}</div>
            <div v-else-if="isLoadingMcps" class="directory-loading">Loading MCP servers...</div>
            <div v-else-if="visibleMcpServers.length === 0" class="directory-empty">No MCP servers configured.</div>
            <div v-else class="mcp-skill-grid">
              <article v-for="server in visibleMcpServers" :key="server.name">
                <button class="mcp-skill-card skill-card" type="button" @click="toggleMcpExpanded(server.name)">
                  <div class="mcp-skill-card-top">
                    <div class="mcp-skill-avatar-fallback">{{ server.name.charAt(0) }}</div>
                    <div class="mcp-skill-info">
                      <div class="mcp-skill-header">
                        <span class="mcp-skill-name">{{ server.name }}</span>
                        <span class="mcp-skill-badge" :class="mcpCardBadgeClass(server.authStatus)">{{ formatMcpAuthStatus(server.name) }}</span>
                      </div>
                      <span class="mcp-skill-owner">mcp</span>
                    </div>
                    <span class="mcp-skill-chevron" :class="{ 'is-open': expandedMcpNames.has(server.name) }">›</span>
                  </div>
                  <p class="mcp-skill-meta">{{ server.tools.length }} tools · {{ server.resources.length + server.resourceTemplates.length }} resources</p>
                  <div v-if="expandedMcpNames.has(server.name)" class="directory-mcp-detail">
                    <div v-if="server.tools.length > 0">
                      <h3 class="directory-mini-heading">Tools</h3>
                      <p class="directory-mini-list">{{ server.tools.map((tool) => tool.title || tool.name).join(', ') }}</p>
                    </div>
                    <div v-if="server.resources.length > 0 || server.resourceTemplates.length > 0">
                      <h3 class="directory-mini-heading">Resources</h3>
                      <p class="directory-mini-list">
                        {{ [...server.resources.map((r) => r.title || r.name || r.uri), ...server.resourceTemplates.map((r) => r.title || r.name || r.uriTemplate)].join(', ') }}
                      </p>
                    </div>
                  </div>
                </button>
              </article>
            </div>
          </div>
        </div>
      </template>
    </SkillsHub>
  </section>
</template>

<script setup lang="ts">
import type { DirectoryMcpServerStatus } from '../../api/codexGateway'
import SkillsHub from './SkillsHub.vue'

type DirectorySkillsTryItemPayload = {
  kind: 'skill'
  name: string
  displayName: string
  skillPath?: string
}

defineProps<{
  tryInFlightKey?: string
  supportsMcps: boolean
  mcpError: string
  isLoadingMcps: boolean
  visibleMcpServers: DirectoryMcpServerStatus[]
  isMcpSectionOpen: boolean
  expandedMcpNames: Set<string>
  formatMcpAuthStatus: (serverName: string) => string
  mcpCardBadgeClass: (status: string) => string
  toggleMcpSectionOpen: () => void
  toggleMcpExpanded: (name: string) => void
}>()

const emit = defineEmits<{
  'skills-changed': []
  'try-item': [payload: DirectorySkillsTryItemPayload]
}>()
</script>

<style scoped>
@reference "tailwindcss";

.directory-section {
  @apply mx-auto flex w-full max-w-5xl flex-col gap-3;
}

.skills-embedded-section {
  @apply flex flex-col gap-2;
}

.skills-embedded-toggle {
  @apply flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 cursor-pointer;
}

.skills-embedded-title {
  @apply text-sm font-medium;
}

.skills-embedded-chevron {
  @apply inline-block text-base leading-none transition-transform;
}

.skills-embedded-chevron.is-open {
  @apply rotate-90;
}

.skills-embedded-body {
  @apply flex flex-col gap-3;
}

.mcp-skill-grid {
  @apply grid grid-cols-1 gap-3 md:grid-cols-2;
}

.mcp-skill-card {
  @apply flex w-full flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 hover:shadow-sm cursor-pointer;
}

.mcp-skill-card-top {
  @apply flex items-start gap-2.5;
}

.mcp-skill-avatar-fallback {
  @apply w-8 h-8 rounded-full shrink-0 bg-zinc-200 text-zinc-500 flex items-center justify-center text-xs font-medium uppercase;
}

.mcp-skill-info {
  @apply flex flex-col gap-0.5 min-w-0 flex-1;
}

.mcp-skill-header {
  @apply flex items-center gap-2;
}

.mcp-skill-name {
  @apply text-sm font-medium text-zinc-900 truncate;
}

.mcp-skill-owner {
  @apply text-xs text-zinc-400;
}

.mcp-skill-meta {
  @apply m-0 text-xs text-zinc-500;
}

.mcp-skill-chevron {
  @apply inline-block text-base leading-none text-zinc-400 transition-transform;
}

.mcp-skill-chevron.is-open {
  @apply rotate-90;
}

.mcp-skill-badge {
  @apply shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none border;
}

.mcp-skill-badge-ok {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.mcp-skill-badge-warning {
  @apply border-amber-200 bg-amber-50 text-amber-700;
}

.mcp-skill-badge-muted {
  @apply border-zinc-200 bg-zinc-100 text-zinc-500;
}

.directory-loading,
.directory-empty,
.directory-error {
  @apply rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500;
}

.directory-error {
  @apply border-rose-200 bg-rose-50 text-rose-700;
}

.directory-mcp-detail {
  @apply flex flex-col gap-3 border-t border-zinc-100 pt-3;
}

.directory-mini-heading {
  @apply m-0 text-xs font-semibold text-zinc-700;
}

.directory-mini-list {
  @apply m-0 text-xs leading-relaxed text-zinc-500;
}

:global(:root.dark) .directory-loading,
:global(:root.dark) .directory-empty {
  @apply border-zinc-700 bg-zinc-900;
}

:global(:root.dark) .directory-mini-heading {
  @apply text-zinc-100;
}

:global(:root.dark) .directory-mini-list {
  @apply text-zinc-400;
}

:global(:root.dark) .mcp-skill-name {
  @apply text-zinc-100;
}

:global(:root.dark) .mcp-skill-owner {
  @apply text-zinc-400;
}

:global(:root.dark) .mcp-skill-meta {
  @apply text-zinc-300;
}

:global(:root.dark) .skills-embedded-toggle,
:global(:root.dark) .skills-embedded-title {
  @apply text-zinc-300 hover:text-zinc-100;
}

:global(:root.dark) .mcp-skill-card {
  @apply border-zinc-700 bg-zinc-900 hover:border-zinc-600;
}

:global(:root.dark) .mcp-skill-avatar-fallback {
  @apply bg-zinc-700 text-zinc-300;
}

:global(:root.dark) .mcp-skill-chevron {
  @apply text-zinc-500;
}
</style>
