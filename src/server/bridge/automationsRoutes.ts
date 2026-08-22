// Heartbeat / cron automation HTTP routes, sliced out of
// createCodexBridgeMiddleware. Eight CRUD handlers depend only on
// bridge/automations.ts helpers (zero closure); the single run handler needs the
// Shell-owned appendThreadQueuedMessage (thin wrapper over the shared queue
// transaction subsystem that also feeds BackendQueueProcessor and
// thread-queue-state) and backendQueueProcessor.scheduleThreadQueueDrain, both
// injected via AutomationsRouteDeps. buildHeartbeatQueuedMessage +
// escapeHeartbeatXmlText (automations-only) live here.
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  deleteProjectCronAutomation,
  deleteThreadHeartbeatAutomation,
  listProjectCronAutomations,
  listThreadHeartbeatAutomations,
  readProjectCronAutomation,
  readProjectCronAutomations,
  readThreadHeartbeatAutomation,
  readThreadHeartbeatAutomations,
  toAutomationApiData,
  toAutomationApiMap,
  toAutomationApiRecord,
  writeProjectCronAutomation,
  writeThreadHeartbeatAutomation,
  type ThreadAutomationRecord,
} from './automations.js'
import { asRecord } from './core.js'
import { isAbsoluteLikePath } from '../../pathUtils.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void
type ReadJsonBody = (req: IncomingMessage) => Promise<unknown>

// Structural mirror of the Shell's StoredQueuedMessage; buildHeartbeatQueuedMessage
// produces this and hands it to the injected appendThreadQueuedMessage.
type QueuedMessage = {
  id: string
  text: string
  imageUrls: string[]
  skills: Array<{ name: string; path: string }>
  fileAttachments: Array<{ label: string; path: string; fsPath: string }>
  collaborationMode: 'default' | 'plan'
}

export type AutomationsRouteDeps = {
  setJson: SetJson
  readJsonBody: ReadJsonBody
  appendThreadQueuedMessage: (threadId: string, message: QueuedMessage) => Promise<void>
  scheduleThreadQueueDrain: (threadId: string, delayMs: number) => void
}

function escapeHeartbeatXmlText(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

function buildHeartbeatQueuedMessage(automation: ThreadAutomationRecord): QueuedMessage {
  return {
    id: `automation-${automation.id}-${Date.now()}-${randomBytes(3).toString('hex')}`,
    text: `<heartbeat>
<automation_id>${escapeHeartbeatXmlText(automation.id)}</automation_id>
<current_time_iso>${new Date().toISOString()}</current_time_iso>
<instructions>
${escapeHeartbeatXmlText(automation.prompt)}
</instructions>
</heartbeat>`,
    imageUrls: [],
    skills: [],
    fileAttachments: [],
    collaborationMode: 'default',
  }
}

export async function handleAutomationsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: AutomationsRouteDeps,
): Promise<boolean> {
  const { setJson, readJsonBody, appendThreadQueuedMessage, scheduleThreadQueueDrain } = deps

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-automations') {
    const automationsByThreadId = await listThreadHeartbeatAutomations()
    setJson(res, 200, { data: toAutomationApiMap(automationsByThreadId) })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/project-automations') {
    const automationsByProjectName = await listProjectCronAutomations()
    setJson(res, 200, { data: toAutomationApiMap(automationsByProjectName) })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-automation') {
    const threadId = url.searchParams.get('threadId')?.trim() ?? ''
    const automationId = url.searchParams.get('automationId')?.trim() ?? ''
    if (!threadId) {
      setJson(res, 400, { error: 'Missing threadId' })
      return true
    }
    const automation = automationId
      ? await readThreadHeartbeatAutomation(threadId, automationId)
      : await readThreadHeartbeatAutomations(threadId)
    setJson(res, 200, { data: toAutomationApiData(automation) })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/project-automation') {
    const projectName = url.searchParams.get('projectName')?.trim() ?? ''
    const automationId = url.searchParams.get('automationId')?.trim() ?? ''
    if (!projectName) {
      setJson(res, 400, { error: 'Missing projectName' })
      return true
    }
    const automation = automationId
      ? await readProjectCronAutomation(projectName, automationId)
      : await readProjectCronAutomations(projectName)
    setJson(res, 200, { data: toAutomationApiData(automation) })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/thread-automation') {
    const payload = asRecord(await readJsonBody(req))
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
    const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
    const rrule = typeof payload?.rrule === 'string' ? payload.rrule.trim() : ''
    const status = payload?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    if (!threadId || !name || !prompt || !rrule) {
      setJson(res, 400, { error: 'threadId, name, prompt, and rrule are required' })
      return true
    }
    const automation = await writeThreadHeartbeatAutomation({ threadId, id, name, prompt, rrule, status })
    setJson(res, 200, { data: toAutomationApiRecord(automation) })
    return true
  }

  if (req.method === 'PUT' && url.pathname === '/codex-api/project-automation') {
    const payload = asRecord(await readJsonBody(req))
    const projectName = typeof payload?.projectName === 'string' ? payload.projectName.trim() : ''
    const id = typeof payload?.id === 'string' ? payload.id.trim() : ''
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
    const rrule = typeof payload?.rrule === 'string' ? payload.rrule.trim() : ''
    const status = payload?.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE'
    if (!projectName || !name || !prompt || !rrule) {
      setJson(res, 400, { error: 'projectName, name, prompt, and rrule are required' })
      return true
    }
    if (!isAbsoluteLikePath(projectName)) {
      setJson(res, 400, { error: 'Project automation cwd must be an absolute path' })
      return true
    }
    const automation = await writeProjectCronAutomation({ projectName, id, name, prompt, rrule, status })
    setJson(res, 200, { data: toAutomationApiRecord(automation) })
    return true
  }

  if (req.method === 'POST' && url.pathname === '/codex-api/thread-automation/run') {
    const payload = asRecord(await readJsonBody(req))
    const threadId = typeof payload?.threadId === 'string' ? payload.threadId.trim() : ''
    const automationId = typeof payload?.automationId === 'string' ? payload.automationId.trim() : ''
    if (!threadId || !automationId) {
      setJson(res, 400, { error: 'threadId and automationId are required' })
      return true
    }
    const automation = await readThreadHeartbeatAutomation(threadId, automationId)
    if (!automation) {
      setJson(res, 404, { error: 'Automation not found for thread' })
      return true
    }
    await appendThreadQueuedMessage(threadId, buildHeartbeatQueuedMessage(automation))
    scheduleThreadQueueDrain(threadId, 0)
    setJson(res, 200, { data: { queued: true } })
    return true
  }

  if (req.method === 'DELETE' && url.pathname === '/codex-api/thread-automation') {
    const threadId = url.searchParams.get('threadId')?.trim() ?? ''
    const automationId = url.searchParams.get('automationId')?.trim() ?? ''
    if (!threadId) {
      setJson(res, 400, { error: 'Missing threadId' })
      return true
    }
    const removed = await deleteThreadHeartbeatAutomation(threadId, automationId)
    setJson(res, 200, { data: { removed } })
    return true
  }

  if (req.method === 'DELETE' && url.pathname === '/codex-api/project-automation') {
    const projectName = url.searchParams.get('projectName')?.trim() ?? ''
    const automationId = url.searchParams.get('automationId')?.trim() ?? ''
    if (!projectName) {
      setJson(res, 400, { error: 'Missing projectName' })
      return true
    }
    const removed = await deleteProjectCronAutomation(projectName, automationId)
    setJson(res, 200, { data: { removed } })
    return true
  }

  return false
}