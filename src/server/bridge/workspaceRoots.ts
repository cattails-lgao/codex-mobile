// Workspace-root state slice, extracted from createCodexBridgeMiddleware.
// Reads/mutates the electron-saved-workspace-roots / workspace-root-labels /
// active-roots / project-order keys of .codex-global-state.json, canonicalizing
// paths through realpath, with a module-level serialized mutation chain. The
// heavy per-instance shell state is not touched; consumers inject
// persistWorkspaceRoot and rollbackCreatedWorktree through narrow structural
// interfaces, so this slice never imports back into the bridge shell.
import { readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import {
  asRecord,
  getCodexGlobalStatePath,
  normalizeStringArray,
  normalizeStringRecord,
  runCommand,
} from './core.js'

export type WorkspaceRootsState = {
  order: string[]
  labels: Record<string, string>
  active: string[]
  projectOrder: string[]
  remoteProjects: Array<{
    id: string
    hostId: string
    remotePath: string
    label: string
  }>
}

type PathRealpathResolver = (path: string) => Promise<string>

function normalizeRemoteProjects(value: unknown): WorkspaceRootsState['remoteProjects'] {
  if (!Array.isArray(value)) return []
  const next: WorkspaceRootsState['remoteProjects'] = []
  const seen = new Set<string>()
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push({
      id,
      hostId: typeof record.hostId === 'string' ? record.hostId.trim() : '',
      remotePath: typeof record.remotePath === 'string' ? record.remotePath.trim() : '',
      label: typeof record.label === 'string' ? record.label.trim() : '',
    })
  }
  return next
}

async function canonicalizeWorkspaceRootPath(
  value: string,
  pathRealpath: PathRealpathResolver,
): Promise<string> {
  if (!isAbsolute(value)) return value
  try {
    return await pathRealpath(value)
  } catch {
    return value
  }
}

async function canonicalizeWorkspaceRootPathList(
  values: string[],
  pathRealpath: PathRealpathResolver,
): Promise<string[]> {
  return normalizeStringArray(await Promise.all(values.map((value) => canonicalizeWorkspaceRootPath(value, pathRealpath))))
}

export async function canonicalizeWorkspaceRootsState(
  state: WorkspaceRootsState,
  pathRealpath: PathRealpathResolver = realpath,
): Promise<WorkspaceRootsState> {
  const [order, active, projectOrder] = await Promise.all([
    canonicalizeWorkspaceRootPathList(state.order, pathRealpath),
    canonicalizeWorkspaceRootPathList(state.active, pathRealpath),
    canonicalizeWorkspaceRootPathList(state.projectOrder, pathRealpath),
  ])
  const labelEntries = await Promise.all(
    Object.entries(state.labels)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(async ([key, label]) => {
        const canonicalKey = await canonicalizeWorkspaceRootPath(key, pathRealpath)
        return {
          canonicalKey,
          label,
          isCanonicalSource: canonicalKey === key,
        }
      }),
  )
  const labels: Record<string, string> = {}
  const labelSourceByCanonicalKey = new Map<string, { isCanonicalSource: boolean }>()
  for (const entry of labelEntries) {
    const existing = labelSourceByCanonicalKey.get(entry.canonicalKey)
    if (existing?.isCanonicalSource === true && !entry.isCanonicalSource) continue
    if (existing && existing.isCanonicalSource === entry.isCanonicalSource) continue
    labels[entry.canonicalKey] = entry.label
    labelSourceByCanonicalKey.set(entry.canonicalKey, {
      isCanonicalSource: entry.isCanonicalSource,
    })
  }

  return {
    order,
    labels,
    active,
    projectOrder,
    remoteProjects: state.remoteProjects.map((project) => ({ ...project })),
  }
}

export async function canonicalizeWorkspaceRootsStateForRead(
  state: WorkspaceRootsState,
  pathRealpath: PathRealpathResolver = realpath,
): Promise<WorkspaceRootsState> {
  return await canonicalizeWorkspaceRootsState(state, pathRealpath)
}

async function canonicalizeThreadCwdRecord(
  value: unknown,
  canonicalizeCwd: (cwd: string) => Promise<string>,
): Promise<unknown> {
  const record = asRecord(value)
  const cwd = typeof record?.cwd === 'string' ? record.cwd : ''
  if (!record || !cwd) return value
  const canonicalCwd = await canonicalizeCwd(cwd)
  return canonicalCwd === cwd ? value : { ...record, cwd: canonicalCwd }
}

export async function canonicalizeThreadListResponseForRead(
  payload: unknown,
  pathRealpath: PathRealpathResolver = realpath,
): Promise<unknown> {
  const record = asRecord(payload)
  if (!record || !Array.isArray(record.data)) return payload
  const cwdCanonicalizationByValue = new Map<string, Promise<string>>()
  const canonicalizeCwd = (cwd: string): Promise<string> => {
    let canonicalized = cwdCanonicalizationByValue.get(cwd)
    if (!canonicalized) {
      canonicalized = canonicalizeWorkspaceRootPath(cwd, pathRealpath)
      cwdCanonicalizationByValue.set(cwd, canonicalized)
    }
    return canonicalized
  }
  return {
    ...record,
    data: await Promise.all(record.data.map((item) => canonicalizeThreadCwdRecord(item, canonicalizeCwd))),
  }
}

export async function readWorkspaceRootsState(): Promise<WorkspaceRootsState> {
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}

  try {
    const raw = await readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    payload = asRecord(parsed) ?? {}
  } catch {
    payload = {}
  }

  return await canonicalizeWorkspaceRootsState({
    order: normalizeStringArray(payload['electron-saved-workspace-roots']),
    labels: normalizeStringRecord(payload['electron-workspace-root-labels']),
    active: normalizeStringArray(payload['active-workspace-roots']),
    projectOrder: normalizeStringArray(payload['project-order']),
    remoteProjects: normalizeRemoteProjects(payload['remote-projects']),
  })
}

export async function writeWorkspaceRootsState(nextState: WorkspaceRootsState): Promise<void> {
  const state = await canonicalizeWorkspaceRootsState(nextState)
  const statePath = getCodexGlobalStatePath()
  let payload: Record<string, unknown> = {}
  try {
    const raw = await readFile(statePath, 'utf8')
    payload = asRecord(JSON.parse(raw)) ?? {}
  } catch {
    payload = {}
  }

  payload['electron-saved-workspace-roots'] = normalizeStringArray(state.order)
  payload['electron-workspace-root-labels'] = normalizeStringRecord(state.labels)
  payload['active-workspace-roots'] = normalizeStringArray(state.active)
  payload['project-order'] = normalizeStringArray(state.projectOrder)

  await writeFile(statePath, JSON.stringify(payload), 'utf8')
}

let workspaceRootsMutation: Promise<void> = Promise.resolve()

function queueWorkspaceRootsMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const run = workspaceRootsMutation.catch(() => undefined).then(mutation)
  workspaceRootsMutation = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function prependUniqueString(value: string, items: string[]): string[] {
  return [value, ...items.filter((item) => item !== value)]
}

export async function updateWorkspaceRootsState(
  updater: (existingState: WorkspaceRootsState) => WorkspaceRootsState,
): Promise<void> {
  await queueWorkspaceRootsMutation(async () => {
    const existingState = await readWorkspaceRootsState()
    await writeWorkspaceRootsState(updater(existingState))
  })
}

export async function persistWorkspaceRoot(workspaceRoot: string, label = ''): Promise<void> {
  const normalizedRoot = workspaceRoot.trim()
  if (!normalizedRoot) return

  await updateWorkspaceRootsState((existingState) => {
    const nextLabels = { ...existingState.labels }
    const trimmedLabel = label.trim()
    if (trimmedLabel.length > 0) {
      nextLabels[normalizedRoot] = trimmedLabel
    }
    return {
      order: prependUniqueString(normalizedRoot, existingState.order),
      labels: nextLabels,
      active: prependUniqueString(normalizedRoot, existingState.active),
      projectOrder: prependUniqueString(normalizedRoot, existingState.projectOrder),
      remoteProjects: existingState.remoteProjects,
    }
  })
}

export async function rollbackCreatedWorktree(
  gitRoot: string,
  worktreeCwd: string,
  cleanupDirectory?: string,
  branchName?: string,
): Promise<void> {
  try {
    await runCommand('git', ['worktree', 'remove', '--force', worktreeCwd], { cwd: gitRoot })
  } catch {
    await rm(worktreeCwd, { recursive: true, force: true }).catch(() => undefined)
  }

  if (cleanupDirectory && cleanupDirectory !== worktreeCwd) {
    await rm(cleanupDirectory, { recursive: true, force: true }).catch(() => undefined)
  }

  if (branchName) {
    await runCommand('git', ['branch', '-D', branchName], { cwd: gitRoot }).catch(() => undefined)
  }
}