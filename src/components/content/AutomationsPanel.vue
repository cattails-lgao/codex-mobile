<template>
  <div class="automations-panel">
    <div class="automations-toolbar">
      <div class="automations-summary">
        <span>{{ automationRows.length }} total</span>
        <span>{{ activeCount }} active</span>
        <span>{{ pausedCount }} paused</span>
      </div>
      <button class="automations-refresh" type="button" :disabled="isLoading" @click="loadAutomations">
        {{ isLoading ? 'Refreshing...' : 'Refresh' }}
      </button>
    </div>

    <p v-if="loadError" class="automations-error">{{ loadError }}</p>

    <div v-if="isLoading && automationRows.length === 0" class="automations-empty">
      <IconTablerBolt class="automations-empty-icon" />
      <p>Loading automations...</p>
    </div>

    <div v-else-if="automationRows.length === 0" class="automations-empty">
      <IconTablerBolt class="automations-empty-icon" />
      <p>No automations yet</p>
      <span>Use a thread or project menu to add an automation.</span>
    </div>

    <div v-else class="automations-layout">
      <section class="automations-list" aria-label="Automations">
        <div
          v-for="row in automationRows"
          :key="row.automation.id"
          class="automation-row"
          :class="{ 'is-selected': selectedAutomationId === row.automation.id }"
          role="button"
          tabindex="0"
          @click="selectedAutomationId = row.automation.id"
          @keydown.enter.prevent="selectedAutomationId = row.automation.id"
          @keydown.space.prevent="selectedAutomationId = row.automation.id"
        >
          <span class="automation-row-icon" :data-status="row.automation.status">
            <IconTablerPlayerStopFilled v-if="row.automation.status === 'PAUSED'" />
            <IconTablerBolt v-else />
          </span>
          <span class="automation-row-main">
            <span class="automation-row-title">{{ row.automation.name }}</span>
            <span class="automation-row-meta">{{ row.scopeLabel }} • {{ row.targetLabel }}</span>
          </span>
          <span class="automation-row-side">
            <span class="automation-row-status" :data-status="row.automation.status">{{ statusLabel(row.automation.status) }}</span>
            <span class="automation-row-schedule">{{ row.scheduleLabel }}</span>
          </span>
          <button class="automation-edit-button" type="button" @click.stop="emitEditAutomation(row)">
            Edit
          </button>
        </div>
      </section>

      <aside v-if="selectedRow" class="automation-detail" aria-label="Automation details">
        <div class="automation-detail-heading">
          <span class="automation-detail-icon" :data-status="selectedRow.automation.status">
            <IconTablerPlayerStopFilled v-if="selectedRow.automation.status === 'PAUSED'" />
            <IconTablerBolt v-else />
          </span>
          <div class="automation-detail-title-wrap">
            <h2>{{ selectedRow.automation.name }}</h2>
            <span>{{ selectedRow.scopeLabel }}</span>
          </div>
          <button class="automation-detail-edit" type="button" @click="emitEditAutomation(selectedRow)">
            Edit
          </button>
        </div>

        <dl class="automation-detail-grid">
          <div>
            <dt>Status</dt>
            <dd>{{ statusLabel(selectedRow.automation.status) }}</dd>
          </div>
          <div>
            <dt>Schedule</dt>
            <dd>{{ selectedRow.scheduleLabel }}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd :title="selectedRow.targetTitle">{{ selectedRow.targetLabel }}</dd>
          </div>
          <div>
            <dt>ID</dt>
            <dd>{{ selectedRow.automation.id }}</dd>
          </div>
        </dl>

        <section class="automation-detail-prompt">
          <h3>Prompt</h3>
          <p>{{ selectedRow.automation.prompt }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getProjectAutomationMap, getThreadAutomationMap } from '../../api/codexGateway'
import type { UiProjectGroup, UiThreadAutomation, UiThreadAutomationStatus } from '../../types/codex'
import IconTablerBolt from '../icons/IconTablerBolt.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'

const props = defineProps<{
  groups: UiProjectGroup[]
  projectCwdByName: Record<string, string>
  selectedAutomationId?: string
}>()

const emit = defineEmits<{
  (event: 'select-automation', id: string): void
  (event: 'edit-automation', payload: AutomationEditRequest): void
}>()

type AutomationRow = {
  automation: UiThreadAutomation
  scope: 'thread' | 'project'
  scopeLabel: string
  targetLabel: string
  targetTitle: string
  scheduleLabel: string
}

type AutomationEditRequest = {
  scope: 'thread' | 'project'
  target: string
  automation: UiThreadAutomation
}

const threadAutomations = ref<Record<string, UiThreadAutomation[]>>({})
const projectAutomations = ref<Record<string, UiThreadAutomation[]>>({})
const isLoading = ref(false)
const loadError = ref('')
const selectedAutomationId = ref(props.selectedAutomationId ?? '')

const threadTitleById = computed(() => {
  const map = new Map<string, string>()
  for (const group of props.groups) {
    for (const thread of group.threads) {
      map.set(thread.id, thread.title)
    }
  }
  return map
})

const projectLabelByCwd = computed(() => {
  const map = new Map<string, string>()
  for (const group of props.groups) {
    const cwd = props.projectCwdByName[group.projectName]?.trim()
    if (cwd) map.set(cwd, group.projectName)
  }
  return map
})

const automationRows = computed<AutomationRow[]>(() => {
  const rows: AutomationRow[] = []
  for (const [threadId, automations] of Object.entries(threadAutomations.value)) {
    const threadTitle = threadTitleById.value.get(threadId) ?? threadId
    for (const automation of automations) {
      rows.push({
        automation,
        scope: 'thread',
        scopeLabel: 'Heartbeat',
        targetLabel: threadTitle,
        targetTitle: threadId,
        scheduleLabel: describeAutomationSchedule(automation),
      })
    }
  }
  for (const [cwd, automations] of Object.entries(projectAutomations.value)) {
    const projectLabel = projectLabelByCwd.value.get(cwd) ?? getPathLeaf(cwd)
    for (const automation of automations) {
      rows.push({
        automation,
        scope: 'project',
        scopeLabel: 'Project',
        targetLabel: projectLabel,
        targetTitle: cwd,
        scheduleLabel: describeAutomationSchedule(automation),
      })
    }
  }
  return rows.sort((first, second) => {
    const firstStatusRank = first.automation.status === 'ACTIVE' ? 0 : 1
    const secondStatusRank = second.automation.status === 'ACTIVE' ? 0 : 1
    if (firstStatusRank !== secondStatusRank) return firstStatusRank - secondStatusRank
    const firstCreated = first.automation.createdAtMs ?? 0
    const secondCreated = second.automation.createdAtMs ?? 0
    if (firstCreated !== secondCreated) return secondCreated - firstCreated
    const firstUpdated = first.automation.updatedAtMs ?? 0
    const secondUpdated = second.automation.updatedAtMs ?? 0
    if (firstUpdated !== secondUpdated) return secondUpdated - firstUpdated
    return first.automation.name.localeCompare(second.automation.name)
  })
})

const activeCount = computed(() => automationRows.value.filter((row) => row.automation.status === 'ACTIVE').length)
const pausedCount = computed(() => automationRows.value.filter((row) => row.automation.status === 'PAUSED').length)
const selectedRow = computed(() =>
  automationRows.value.find((row) => row.automation.id === selectedAutomationId.value) ?? automationRows.value[0] ?? null,
)

watch(
  () => props.selectedAutomationId,
  (id) => {
    if (id) selectedAutomationId.value = id
  },
)

watch(selectedAutomationId, (id) => {
  if (id) emit('select-automation', id)
})

watch(automationRows, (rows) => {
  if (rows.length === 0) {
    selectedAutomationId.value = ''
    return
  }
  if (!selectedAutomationId.value || !rows.some((row) => row.automation.id === selectedAutomationId.value)) {
    selectedAutomationId.value = rows[0].automation.id
  }
})

onMounted(() => {
  void loadAutomations()
})

defineExpose({
  loadAutomations,
})

async function loadAutomations(): Promise<void> {
  isLoading.value = true
  loadError.value = ''
  try {
    const [threadMap, projectMap] = await Promise.all([
      getThreadAutomationMap(),
      getProjectAutomationMap(),
    ])
    threadAutomations.value = threadMap
    projectAutomations.value = projectMap
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load automations'
  } finally {
    isLoading.value = false
  }
}

function statusLabel(status: UiThreadAutomationStatus): string {
  return status === 'PAUSED' ? 'Paused' : 'Active'
}

function emitEditAutomation(row: AutomationRow): void {
  emit('edit-automation', {
    scope: row.scope,
    target: row.targetTitle,
    automation: row.automation,
  })
}

function describeAutomationSchedule(automation: UiThreadAutomation): string {
  if (automation.status === 'PAUSED') return 'Paused'
  if (automation.nextRunAtMs) return `Next ${formatDateTime(automation.nextRunAtMs)}`
  const rrule = automation.rrule.trim()
  if (/FREQ=MINUTELY/i.test(rrule)) {
    const interval = /INTERVAL=(\d+)/i.exec(rrule)?.[1] ?? '1'
    return interval === '1' ? 'Every minute' : `Every ${interval} minutes`
  }
  if (/FREQ=HOURLY/i.test(rrule)) {
    const interval = /INTERVAL=(\d+)/i.exec(rrule)?.[1] ?? '1'
    return interval === '1' ? 'Hourly' : `Every ${interval} hours`
  }
  if (/FREQ=DAILY/i.test(rrule)) return 'Daily'
  if (/FREQ=WEEKLY/i.test(rrule)) return 'Weekly'
  return 'Custom schedule'
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getPathLeaf(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  return normalized.split('/').filter(Boolean).pop() ?? path
}
</script>

<style scoped>
@reference "tailwindcss";

.automations-panel {
  @apply flex min-h-0 flex-1 flex-col gap-3 px-2 pb-3 sm:px-6 sm:pb-6;
}

.automations-toolbar {
  @apply flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 pb-3;
}

.automations-summary {
  @apply flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-zinc-500;
}

.automations-summary span {
  @apply rounded-full bg-zinc-100 px-2 py-1;
}

.automations-refresh {
  @apply h-8 shrink-0 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60;
}

.automations-error {
  @apply m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700;
}

.automations-layout {
  @apply grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)];
}

.automations-list {
  @apply min-h-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white;
}

.automation-row {
  @apply grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-zinc-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-zinc-50;
}

.automation-row.is-selected {
  @apply bg-zinc-100;
}

.automation-row-icon,
.automation-detail-icon {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700;
}

.automation-row-icon[data-status='PAUSED'],
.automation-detail-icon[data-status='PAUSED'] {
  @apply bg-zinc-100 text-zinc-500;
}

.automation-row-icon :deep(svg),
.automation-detail-icon :deep(svg) {
  @apply h-4 w-4;
}

.automation-row-main {
  @apply flex min-w-0 flex-col gap-0.5;
}

.automation-row-title {
  @apply truncate text-sm font-medium text-zinc-950;
}

.automation-row-meta {
  @apply truncate text-xs text-zinc-500;
}

.automation-row-side {
  @apply flex min-w-24 flex-col items-end gap-0.5 text-right;
}

.automation-row-status {
  @apply text-xs font-medium text-emerald-700;
}

.automation-row-status[data-status='PAUSED'] {
  @apply text-zinc-500;
}

.automation-row-schedule {
  @apply max-w-36 truncate text-xs text-zinc-500;
}

.automation-edit-button,
.automation-detail-edit {
  @apply h-7 shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50;
}

.automation-detail-edit {
  @apply ml-auto;
}

.automation-detail {
  @apply flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4;
}

.automation-detail-heading {
  @apply flex min-w-0 items-center gap-3;
}

.automation-detail-title-wrap {
  @apply flex min-w-0 flex-col gap-0.5;
}

.automation-detail-title-wrap h2 {
  @apply m-0 truncate text-base font-semibold text-zinc-950;
}

.automation-detail-title-wrap span {
  @apply text-xs font-medium uppercase tracking-[0.14em] text-zinc-500;
}

.automation-detail-grid {
  @apply grid grid-cols-1 gap-2 sm:grid-cols-2;
}

.automation-detail-grid div {
  @apply min-w-0 rounded-lg bg-zinc-50 px-3 py-2;
}

.automation-detail-grid dt {
  @apply text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500;
}

.automation-detail-grid dd {
  @apply m-0 truncate text-sm text-zinc-900;
}

.automation-detail-prompt {
  @apply flex min-h-0 flex-col gap-2;
}

.automation-detail-prompt h3 {
  @apply m-0 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500;
}

.automation-detail-prompt p {
  @apply m-0 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-800;
}

.automations-empty {
  @apply mx-auto flex min-h-72 w-full max-w-xl flex-1 flex-col items-center justify-center gap-2 text-center text-zinc-500;
}

.automations-empty-icon {
  @apply h-8 w-8 text-zinc-400;
}

.automations-empty p {
  @apply m-0 text-base font-medium text-zinc-800;
}

.automations-empty span {
  @apply text-sm;
}

:global(:root.dark) .automations-toolbar {
  @apply border-zinc-800;
}

:global(:root.dark) .automations-summary span,
:global(:root.dark) .automation-row-icon[data-status='PAUSED'],
:global(:root.dark) .automation-detail-icon[data-status='PAUSED'] {
  @apply bg-zinc-800 text-zinc-400;
}

:global(:root.dark) .automations-refresh,
:global(:root.dark) .automation-edit-button,
:global(:root.dark) .automation-detail-edit,
:global(:root.dark) .automations-list,
:global(:root.dark) .automation-detail {
  @apply border-zinc-800 bg-zinc-950 text-zinc-100;
}

:global(:root.dark) .automations-refresh:hover,
:global(:root.dark) .automation-edit-button:hover,
:global(:root.dark) .automation-detail-edit:hover,
:global(:root.dark) .automation-row:hover,
:global(:root.dark) .automation-row.is-selected {
  @apply bg-zinc-900;
}

:global(:root.dark) .automation-row {
  @apply border-zinc-800;
}

:global(:root.dark) .automation-row-title,
:global(:root.dark) .automation-detail-title-wrap h2,
:global(:root.dark) .automation-detail-grid dd,
:global(:root.dark) .automations-empty p {
  @apply text-zinc-100;
}

:global(:root.dark) .automation-row-meta,
:global(:root.dark) .automation-row-schedule,
:global(:root.dark) .automation-detail-title-wrap span,
:global(:root.dark) .automation-detail-grid dt,
:global(:root.dark) .automation-detail-prompt h3,
:global(:root.dark) .automations-summary,
:global(:root.dark) .automations-empty {
  @apply text-zinc-400;
}

:global(:root.dark) .automation-detail-grid div,
:global(:root.dark) .automation-detail-prompt p {
  @apply bg-zinc-900 text-zinc-200;
}
</style>
