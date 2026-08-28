import { computed, ref, watch } from 'vue'
import type { UiProjectGroup, UiThreadAutomation, UiThreadAutomationStatus } from '../../types/codex'
import {
  deleteProjectAutomation,
  deleteThreadAutomation,
  getProjectAutomationMap,
  runThreadAutomationNow,
  upsertProjectAutomation,
  upsertThreadAutomation,
} from '../../api/codexGateway'

export type AutomationScheduleMode = 'daily' | 'interval' | 'advanced'
export type AutomationIntervalUnit = 'minutes' | 'hours' | 'days'
export type AutomationTargetMode = 'thread' | 'project'
export type AutomationScheduleDraft = {
  mode: AutomationScheduleMode
  dailyTime: string
  interval: number
  intervalUnit: AutomationIntervalUnit
}

export interface AutomationDialogDeps {
  getGroups: () => UiProjectGroup[]
  t: (key: string, params?: Record<string, string | number>) => string
  getProjectDisplayName: (projectName: string) => string
  getProjectAutomationKey: (projectName: string) => string
  closeThreadMenu: () => void
  closeProjectMenu: () => void
  onAutomationsChanged: () => void
}

export function createAutomationDialog(deps: AutomationDialogDeps) {
  const { getGroups, t } = deps

  const automationByThreadId = ref<Record<string, UiThreadAutomation[]>>({})
  const automationByProjectName = ref<Record<string, UiThreadAutomation[]>>({})
  const automationDialogVisible = ref(false)
  const automationDialogScope = ref<'thread' | 'project'>('thread')
  const automationDialogThreadId = ref('')
  const automationDialogProjectName = ref('')
  const automationDialogAutomationId = ref('')
  const automationDialogMode = ref<'create' | 'edit'>('create')
  const automationTargetPickerVisible = ref(false)
  const automationTargetMode = ref<AutomationTargetMode>('thread')
  const automationTargetValue = ref('')
  const automationDialogError = ref('')
  const automationDialogNotice = ref('')
  const projectAutomationActionError = ref('')
  const isSavingAutomation = ref(false)
  const isRunningAutomation = ref(false)
  const automationDraft = ref<{
    name: string
    prompt: string
    rrule: string
    status: UiThreadAutomationStatus
  }>({
    name: '',
    prompt: '',
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    status: 'ACTIVE',
  })
  const automationScheduleDraft = ref<AutomationScheduleDraft>({
    mode: 'daily',
    dailyTime: '09:00',
    interval: 1,
    intervalUnit: 'hours',
  })
  const automationDialogAutomations = computed(() => {
    if (automationDialogScope.value === 'project') {
      const projectName = automationDialogProjectName.value
      return projectName ? (automationByProjectName.value[projectName] ?? []) : []
    }
    const threadId = automationDialogThreadId.value
    return threadId ? (automationByThreadId.value[threadId] ?? []) : []
  })
  const automationSchedulePreview = computed(() => describeAutomationSchedule(automationDraft.value.rrule))
  const automationDialogSubtitle = computed(() => {
    if (automationTargetPickerVisible.value && automationDialogMode.value === 'create') {
      if (automationTargetMode.value === 'thread') return t('This creates a heartbeat automation attached to the selected chat.')
      return t('This creates a project automation attached to the selected project folder.')
    }
    return automationDialogScope.value === 'project'
      ? t('This creates project automations attached to the selected project folder.')
      : t('This creates heartbeat automations attached to the selected thread.')
  })
  const automationThreadTargetOptions = computed(() => {
    const rows: Array<{ value: string; label: string; searchText: string }> = []
    for (const group of getGroups()) {
      for (const thread of group.threads) {
        const title = thread.title?.trim() || thread.id
        const project = deps.getProjectDisplayName(group.projectName)
        rows.push({
          value: thread.id,
          label: `${title} · ${project}`,
          searchText: `${title} ${project} ${thread.id}`.toLowerCase(),
        })
      }
    }
    return rows
  })
  const automationProjectTargetOptions = computed(() => {
    const rows: Array<{ value: string; label: string; searchText: string }> = []
    for (const group of getGroups()) {
      const cwd = deps.getProjectAutomationKey(group.projectName)
      if (!cwd) continue
      const label = deps.getProjectDisplayName(group.projectName)
      rows.push({
        value: cwd,
        label,
        searchText: `${label} ${cwd}`.toLowerCase(),
      })
    }
    return rows
  })
  const automationTargetDropdownOptions = computed(() => {
    const source = automationTargetMode.value === 'project'
      ? automationProjectTargetOptions.value
      : automationThreadTargetOptions.value
    return source.map((option) => ({ value: option.value, label: option.label }))
  })
  const automationIntervalUnitOptions = [
    { value: 'minutes', label: t('minutes') },
    { value: 'hours', label: t('hours') },
    { value: 'days', label: t('days') },
  ]
  const automationStatusOptions = computed(() => [
    { value: 'ACTIVE', label: t('Active') },
    { value: 'PAUSED', label: t('Paused') },
  ])
  watch(automationTargetDropdownOptions, (options) => {
    if (!automationTargetPickerVisible.value) return
    if (options.some((option) => option.value === automationTargetValue.value)) return
    automationTargetValue.value = options[0]?.value ?? ''
  })

  function threadAutomationCount(threadId: string): number {
    return automationByThreadId.value[threadId]?.length ?? 0
  }

  function threadHasAutomation(threadId: string): boolean {
    return threadAutomationCount(threadId) > 0
  }

  function projectAutomationCount(projectName: string): number {
    const key = deps.getProjectAutomationKey(projectName)
    return key ? (automationByProjectName.value[key]?.length ?? 0) : 0
  }

  function projectHasAutomation(projectName: string): boolean {
    return projectAutomationCount(projectName) > 0
  }

  function automationTooltip(automations: UiThreadAutomation[]): string {
    if (automations.length === 0) return ''
    if (automations.length > 1) {
      const activeCount = automations.filter((automation) => automation.status === 'ACTIVE').length
      return `${automations.length} ${t('automations')} • ${activeCount} ${t('active')}`
    }
    const [automation] = automations
    const nextRunLabel = automation.status === 'PAUSED'
      ? '-'
      : automation.nextRunAtMs
        ? new Date(automation.nextRunAtMs).toLocaleString()
        : t('Not scheduled')
    return `${automation.name} • ${t('Next run')}: ${nextRunLabel}`
  }

  function threadAutomationTooltip(threadId: string): string {
    return automationTooltip(automationByThreadId.value[threadId] ?? [])
  }

  function projectAutomationTooltip(projectName: string): string {
    const key = deps.getProjectAutomationKey(projectName)
    return automationTooltip(key ? (automationByProjectName.value[key] ?? []) : [])
  }

  function padRruleNumber(value: number): string {
    return String(Math.max(0, value)).padStart(2, '0')
  }

  function parsePositiveInteger(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(1, Math.floor(parsed))
  }

  function buildDailyRrule(time: string): string {
    const [rawHour, rawMinute] = time.split(':')
    const hour = Math.min(23, Math.max(0, Number(rawHour) || 0))
    const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0))
    return `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute}`
  }

  function buildIntervalRrule(interval: number, unit: AutomationIntervalUnit): string {
    const normalizedInterval = parsePositiveInteger(interval, 1)
    if (unit === 'minutes') return `FREQ=MINUTELY;INTERVAL=${normalizedInterval}`
    if (unit === 'hours') return `FREQ=HOURLY;INTERVAL=${normalizedInterval}`
    return `FREQ=DAILY;INTERVAL=${normalizedInterval}`
  }

  function parseRruleParts(rrule: string): Record<string, string> {
    return Object.fromEntries(
      rrule
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [key, ...rest] = part.split('=')
          return [key.toUpperCase(), rest.join('=').trim()]
        })
        .filter(([key, value]) => key && value),
    )
  }

  function createScheduleDraftFromRrule(rrule: string): AutomationScheduleDraft {
    const parts = parseRruleParts(rrule)
    const frequency = parts.FREQ?.toUpperCase()
    const interval = parsePositiveInteger(parts.INTERVAL, 1)
    if (frequency === 'DAILY' && parts.BYHOUR !== undefined && parts.BYMINUTE !== undefined && interval === 1) {
      const hour = Math.min(23, Math.max(0, Number(parts.BYHOUR) || 0))
      const minute = Math.min(59, Math.max(0, Number(parts.BYMINUTE) || 0))
      return {
        mode: 'daily',
        dailyTime: `${padRruleNumber(hour)}:${padRruleNumber(minute)}`,
        interval: 1,
        intervalUnit: 'hours',
      }
    }
    if (frequency === 'MINUTELY' || frequency === 'HOURLY' || (frequency === 'DAILY' && parts.INTERVAL !== undefined)) {
      return {
        mode: 'interval',
        dailyTime: '09:00',
        interval,
        intervalUnit: frequency === 'MINUTELY' ? 'minutes' : frequency === 'HOURLY' ? 'hours' : 'days',
      }
    }
    return {
      mode: 'advanced',
      dailyTime: '09:00',
      interval: 1,
      intervalUnit: 'hours',
    }
  }

  function describeAutomationSchedule(rrule: string): string {
    const parts = parseRruleParts(rrule)
    const frequency = parts.FREQ?.toUpperCase()
    const interval = parsePositiveInteger(parts.INTERVAL, 1)
    if (frequency === 'DAILY' && parts.BYHOUR !== undefined && parts.BYMINUTE !== undefined && interval === 1) {
      const hour = Math.min(23, Math.max(0, Number(parts.BYHOUR) || 0))
      const minute = Math.min(59, Math.max(0, Number(parts.BYMINUTE) || 0))
      return `${t('RRULE')}: ${rrule} · ${t('runs daily at')} ${padRruleNumber(hour)}:${padRruleNumber(minute)}`
    }
    if (frequency === 'MINUTELY') return `${t('RRULE')}: ${rrule} · ${t('runs every')} ${interval} ${t('minute(s)')}`
    if (frequency === 'HOURLY') return `${t('RRULE')}: ${rrule} · ${t('runs every')} ${interval} ${t('hour(s)')}`
    if (frequency === 'DAILY' && parts.INTERVAL !== undefined) return `${t('RRULE')}: ${rrule} · ${t('runs every')} ${interval} ${t('day(s)')}`
    return rrule ? `${t('RRULE')}: ${rrule}` : t('RRULE is required.')
  }

  function syncAutomationRruleFromScheduleDraft(): void {
    const draft = automationScheduleDraft.value
    if (draft.mode === 'daily') {
      automationDraft.value.rrule = buildDailyRrule(draft.dailyTime)
    } else if (draft.mode === 'interval') {
      automationDraft.value.rrule = buildIntervalRrule(draft.interval, draft.intervalUnit)
    }
  }

  function onAutomationIntervalUnitChange(value: string): void {
    if (value !== 'minutes' && value !== 'hours' && value !== 'days') return
    automationScheduleDraft.value = {
      ...automationScheduleDraft.value,
      intervalUnit: value,
    }
    syncAutomationRruleFromScheduleDraft()
  }

  function onAutomationStatusChange(value: string): void {
    if (value !== 'ACTIVE' && value !== 'PAUSED') return
    automationDraft.value = {
      ...automationDraft.value,
      status: value,
    }
  }

  function syncAutomationScheduleDraftFromRrule(): void {
    automationScheduleDraft.value = createScheduleDraftFromRrule(automationDraft.value.rrule)
  }

  function setAutomationScheduleMode(mode: AutomationScheduleMode): void {
    automationScheduleDraft.value = {
      ...automationScheduleDraft.value,
      mode,
    }
    syncAutomationRruleFromScheduleDraft()
  }

  function openAutomationDialog(threadId: string): void {
    automationDialogScope.value = 'thread'
    automationDialogThreadId.value = threadId
    automationDialogProjectName.value = ''
    automationTargetPickerVisible.value = false
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    const existing = automationByThreadId.value[threadId]?.[0]
    if (existing) {
      selectAutomationForEditing(existing.id)
    } else {
      startNewAutomationDraft()
    }
    automationDialogVisible.value = true
    deps.closeThreadMenu()
  }

  function openProjectAutomationDialog(projectName: string): void {
    const projectCwd = deps.getProjectAutomationKey(projectName)
    if (!projectCwd) {
      automationDialogScope.value = 'project'
      automationDialogThreadId.value = ''
      automationDialogProjectName.value = ''
      automationTargetPickerVisible.value = false
      automationDialogError.value = t('Project automation requires a resolved absolute project path.')
      automationDialogNotice.value = ''
      automationDialogVisible.value = true
      deps.closeProjectMenu()
      return
    }
    automationDialogScope.value = 'project'
    automationDialogThreadId.value = ''
    automationDialogProjectName.value = projectCwd
    automationTargetPickerVisible.value = false
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    const existing = automationByProjectName.value[projectCwd]?.[0]
    if (existing) {
      selectAutomationForEditing(existing.id)
    } else {
      startNewAutomationDraft()
    }
    automationDialogVisible.value = true
    deps.closeProjectMenu()
  }

  function openAutomationEditorFromPanel(payload: {
    scope: 'thread' | 'project'
    target: string
    automation: UiThreadAutomation
  }): void {
    automationDialogScope.value = payload.scope
    automationDialogThreadId.value = payload.scope === 'thread' ? payload.target : ''
    automationDialogProjectName.value = payload.scope === 'project' ? payload.target : ''
    automationTargetPickerVisible.value = false
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    if (payload.scope === 'project') {
      automationByProjectName.value = updateAutomationForProject(automationByProjectName.value, payload.target, payload.automation)
    } else {
      automationByThreadId.value = updateAutomationForThread(automationByThreadId.value, payload.target, payload.automation)
    }
    selectAutomationForEditing(payload.automation.id)
    automationDialogVisible.value = true
    deps.closeProjectMenu()
    deps.closeThreadMenu()
  }

  function openAutomationCreatorFromPanel(): void {
    automationTargetPickerVisible.value = true
    automationTargetMode.value = 'thread'
    automationTargetValue.value = automationThreadTargetOptions.value[0]?.value ?? ''
    automationDialogScope.value = 'thread'
    automationDialogThreadId.value = ''
    automationDialogProjectName.value = ''
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    startNewAutomationDraft()
    automationDialogVisible.value = true
    deps.closeProjectMenu()
    deps.closeThreadMenu()
  }

  function setAutomationTargetMode(mode: AutomationTargetMode): void {
    automationTargetMode.value = mode
    automationTargetValue.value = ''
    automationDialogScope.value = mode === 'project' ? 'project' : 'thread'
    automationTargetValue.value = automationTargetDropdownOptions.value[0]?.value ?? ''
  }

  function startNewAutomationDraft(): void {
    automationDialogAutomationId.value = ''
    automationDialogMode.value = 'create'
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    automationDraft.value = {
      name: automationDialogScope.value === 'project' ? 'Project automation' : 'Thread automation',
      prompt: '',
      rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
      status: 'ACTIVE',
    }
    automationScheduleDraft.value = createScheduleDraftFromRrule(automationDraft.value.rrule)
  }

  function selectAutomationForEditing(automationId: string): void {
    const existing = automationDialogAutomations.value.find((automation) => automation.id === automationId)
    if (!existing) return
    automationDialogAutomationId.value = existing.id
    automationDialogMode.value = 'edit'
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    automationDraft.value = {
      name: existing.name,
      prompt: existing.prompt,
      rrule: existing.rrule,
      status: existing.status,
    }
    automationScheduleDraft.value = createScheduleDraftFromRrule(existing.rrule)
  }

  function closeAutomationDialog(): void {
    automationDialogVisible.value = false
    automationDialogScope.value = 'thread'
    automationDialogThreadId.value = ''
    automationDialogProjectName.value = ''
    automationDialogAutomationId.value = ''
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    isSavingAutomation.value = false
    isRunningAutomation.value = false
  }

  function omitAutomationThread(state: Record<string, UiThreadAutomation[]>, threadId: string): Record<string, UiThreadAutomation[]> {
    return Object.fromEntries(Object.entries(state).filter(([id]) => id !== threadId))
  }

  function updateAutomationForThread(
    state: Record<string, UiThreadAutomation[]>,
    threadId: string,
    saved: UiThreadAutomation,
  ): Record<string, UiThreadAutomation[]> {
    const existing = state[threadId] ?? []
    const index = existing.findIndex((automation) => automation.id === saved.id)
    const next = [...existing]
    if (index >= 0) {
      next.splice(index, 1, saved)
    } else {
      next.push(saved)
    }
    return { ...state, [threadId]: next }
  }

  function removeAutomationForThread(
    state: Record<string, UiThreadAutomation[]>,
    threadId: string,
    automationId: string,
  ): Record<string, UiThreadAutomation[]> {
    const next = (state[threadId] ?? []).filter((automation) => automation.id !== automationId)
    return next.length > 0 ? { ...state, [threadId]: next } : omitAutomationThread(state, threadId)
  }

  function omitAutomationProject(state: Record<string, UiThreadAutomation[]>, projectName: string): Record<string, UiThreadAutomation[]> {
    return Object.fromEntries(Object.entries(state).filter(([name]) => name !== projectName))
  }

  function updateAutomationForProject(
    state: Record<string, UiThreadAutomation[]>,
    projectName: string,
    saved: UiThreadAutomation,
  ): Record<string, UiThreadAutomation[]> {
    const existing = state[projectName] ?? []
    const index = existing.findIndex((automation) => automation.id === saved.id)
    const next = [...existing]
    if (index >= 0) {
      next.splice(index, 1, saved)
    } else {
      next.push(saved)
    }
    return { ...state, [projectName]: next }
  }

  async function reloadProjectAutomations(): Promise<void> {
    automationByProjectName.value = await getProjectAutomationMap()
  }

  async function removeAutomationsForThread(threadId: string): Promise<void> {
    await deleteThreadAutomation(threadId).catch(() => undefined)
    automationByThreadId.value = omitAutomationThread(automationByThreadId.value, threadId)
  }

  async function submitAutomationDialog(): Promise<void> {
    let threadId = automationDialogThreadId.value
    let projectName = automationDialogProjectName.value
    isSavingAutomation.value = true
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    try {
      syncAutomationRruleFromScheduleDraft()
      if (automationTargetPickerVisible.value && automationDialogMode.value === 'create') {
        if (automationTargetMode.value === 'thread') {
          threadId = automationTargetValue.value
          projectName = ''
          automationDialogScope.value = 'thread'
          automationDialogThreadId.value = threadId
          automationDialogProjectName.value = ''
        } else {
          projectName = automationTargetValue.value
          threadId = ''
          automationDialogScope.value = 'project'
          automationDialogThreadId.value = ''
          automationDialogProjectName.value = projectName
        }
      }
      if (automationDialogScope.value === 'thread' && !threadId) {
        throw new Error(t('Select a chat target for this automation'))
      }
      if (automationDialogScope.value === 'project' && !projectName) {
        throw new Error(t('Select a project target for this automation'))
      }
      const input = {
        id: automationDialogAutomationId.value || undefined,
        name: automationDraft.value.name,
        prompt: automationDraft.value.prompt,
        rrule: automationDraft.value.rrule,
        status: automationDraft.value.status,
      }
      const saved = automationDialogScope.value === 'project'
        ? await upsertProjectAutomation({ ...input, projectName })
        : await upsertThreadAutomation({ ...input, threadId })
      if (automationDialogScope.value === 'project') {
        await reloadProjectAutomations()
      } else {
        automationByThreadId.value = updateAutomationForThread(automationByThreadId.value, threadId, saved)
      }
      deps.onAutomationsChanged()
      selectAutomationForEditing(saved.id)
      automationDialogNotice.value = t('Automation saved.')
      isSavingAutomation.value = false
    } catch (error) {
      automationDialogError.value = error instanceof Error ? error.message : t('Failed to save automation')
      isSavingAutomation.value = false
    }
  }

  async function onDeleteAutomationFromDialog(): Promise<void> {
    const threadId = automationDialogThreadId.value
    const projectName = automationDialogProjectName.value
    const automationId = automationDialogAutomationId.value
    if (!automationId) return
    if (automationDialogScope.value === 'thread' && !threadId) return
    if (automationDialogScope.value === 'project' && !projectName) return
    isSavingAutomation.value = true
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    try {
      if (automationDialogScope.value === 'project') {
        await deleteProjectAutomation(projectName, automationId)
        await reloadProjectAutomations()
      } else {
        await deleteThreadAutomation(threadId, automationId)
        automationByThreadId.value = removeAutomationForThread(automationByThreadId.value, threadId, automationId)
      }
      const nextAutomation = automationDialogAutomations.value[0]
      if (nextAutomation) {
        selectAutomationForEditing(nextAutomation.id)
      } else {
        startNewAutomationDraft()
      }
      deps.onAutomationsChanged()
      isSavingAutomation.value = false
    } catch (error) {
      automationDialogError.value = error instanceof Error ? error.message : t('Failed to remove automation')
      isSavingAutomation.value = false
    }
  }

  async function onRunAutomationFromDialog(): Promise<void> {
    const threadId = automationDialogThreadId.value
    const automationId = automationDialogAutomationId.value
    if (!threadId || !automationId) return
    isRunningAutomation.value = true
    automationDialogError.value = ''
    automationDialogNotice.value = ''
    try {
      await runThreadAutomationNow(threadId, automationId)
      automationDialogNotice.value = t('Automation run queued.')
    } catch (error) {
      automationDialogError.value = error instanceof Error ? error.message : t('Failed to run automation')
    } finally {
      isRunningAutomation.value = false
    }
  }

  return {
    automationByThreadId,
    automationByProjectName,
    automationDialogVisible,
    automationDialogScope,
    automationDialogThreadId,
    automationDialogProjectName,
    automationDialogAutomationId,
    automationDialogMode,
    automationTargetPickerVisible,
    automationTargetMode,
    automationTargetValue,
    automationDialogError,
    automationDialogNotice,
    projectAutomationActionError,
    isSavingAutomation,
    isRunningAutomation,
    automationDraft,
    automationScheduleDraft,
    automationDialogAutomations,
    automationSchedulePreview,
    automationDialogSubtitle,
    automationThreadTargetOptions,
    automationProjectTargetOptions,
    automationTargetDropdownOptions,
    automationIntervalUnitOptions,
    automationStatusOptions,
    threadAutomationCount,
    threadHasAutomation,
    projectAutomationCount,
    projectHasAutomation,
    threadAutomationTooltip,
    projectAutomationTooltip,
    syncAutomationRruleFromScheduleDraft,
    onAutomationIntervalUnitChange,
    onAutomationStatusChange,
    syncAutomationScheduleDraftFromRrule,
    setAutomationScheduleMode,
    openAutomationDialog,
    openProjectAutomationDialog,
    openAutomationEditorFromPanel,
    openAutomationCreatorFromPanel,
    setAutomationTargetMode,
    startNewAutomationDraft,
    selectAutomationForEditing,
    closeAutomationDialog,
    omitAutomationProject,
    reloadProjectAutomations,
    removeAutomationsForThread,
    submitAutomationDialog,
    onDeleteAutomationFromDialog,
    onRunAutomationFromDialog,
  }
}