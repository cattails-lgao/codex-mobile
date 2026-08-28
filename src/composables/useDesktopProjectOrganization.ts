import { ref, type Ref } from 'vue'
import { getWorkspaceRootsState, setWorkspaceRootsState } from '../api/codexGateway'
import type { UiProjectGroup, UiThread } from '../types/codex'
import {
  areStringArraysEqual,
  buildWorkspaceRootsProjectOrderState,
  collectWorkspaceRootPathsForProjectRemoval,
  flattenThreads,
  matchesWorkspaceRootProject,
  mergeProjectOrder,
  mergeThreadGroups,
  omitKeys,
  orderGroupsByProjectOrder,
  reorderStringArray,
} from './useDesktopStateUtils'
import {
  loadProjectDisplayNames,
  loadProjectOrder,
  saveProjectDisplayNames,
  saveProjectOrder,
} from './useDesktopStatePersistence'

export interface DesktopProjectOrganizationDeps {
  sourceGroups: Ref<UiProjectGroup[]>
  projectGroups: Ref<UiProjectGroup[]>
  selectedThreadId: Ref<string>
  applyThreadFlags: () => void
  pruneThreadScopedState: (threads: UiThread[]) => void
  setSelectedThreadId: (threadId: string) => void
}

export function createDesktopProjectOrganization(deps: DesktopProjectOrganizationDeps) {
  const projectOrder = ref<string[]>(loadProjectOrder())
  const projectDisplayNameById = ref<Record<string, string>>(loadProjectDisplayNames())
  // ponytail: A single timer preserves the existing one-at-a-time inline rename flow;
  // use per-project timers if the UI ever supports simultaneous project renames.
  let renameProjectTimer: ReturnType<typeof setTimeout> | null = null

  function setProjectOrder(nextOrder: string[], options: { persist?: boolean } = {}): void {
    projectOrder.value = nextOrder
    if (options.persist !== false) saveProjectOrder(nextOrder)
  }

  function setProjectDisplayNames(
    nextDisplayNames: Record<string, string>,
    options: { persist?: boolean } = {},
  ): void {
    projectDisplayNameById.value = nextDisplayNames
    if (options.persist !== false) saveProjectDisplayNames(nextDisplayNames)
  }

  async function persistProjectLabelToGlobalState(projectName: string, displayName: string): Promise<void> {
    try {
      const rootsState = await getWorkspaceRootsState()
      const nextLabels = { ...rootsState.labels }
      let changed = false
      for (const rootPath of rootsState.order) {
        if (!matchesWorkspaceRootProject(rootPath, projectName)) continue
        const trimmed = displayName.trim()
        if (trimmed.length === 0) {
          if (nextLabels[rootPath] !== undefined) {
            delete nextLabels[rootPath]
            changed = true
          }
        } else if (nextLabels[rootPath] !== trimmed) {
          nextLabels[rootPath] = trimmed
          changed = true
        }
      }
      if (changed) {
        await setWorkspaceRootsState({
          order: rootsState.order,
          labels: nextLabels,
          active: rootsState.active,
          projectOrder: rootsState.projectOrder,
        })
      }
    } catch {
      // Keep localStorage-only rename when global state is unavailable.
    }
  }

  function renameProject(projectName: string, displayName: string): void {
    if (projectName.length === 0) return

    const currentValue = projectDisplayNameById.value[projectName] ?? ''
    if (currentValue === displayName) return

    setProjectDisplayNames({
      ...projectDisplayNameById.value,
      [projectName]: displayName,
    })

    if (renameProjectTimer !== null) clearTimeout(renameProjectTimer)
    renameProjectTimer = setTimeout(() => {
      renameProjectTimer = null
      void persistProjectLabelToGlobalState(projectName, displayName)
    }, 500)
  }

  async function persistProjectOrderToWorkspaceRoots(): Promise<void> {
    try {
      const rootsState = await getWorkspaceRootsState()
      const nextState = buildWorkspaceRootsProjectOrderState(
        rootsState,
        projectOrder.value,
        deps.sourceGroups.value,
      )

      await setWorkspaceRootsState({
        order: nextState.order,
        labels: rootsState.labels,
        active: nextState.active,
        projectOrder: nextState.projectOrder,
      })
    } catch {
      // Keep local project order when global state persistence is unavailable.
    }
  }

  async function removeProject(projectName: string): Promise<void> {
    if (projectName.length === 0) return

    const nextProjectOrder = projectOrder.value.filter((name) => name !== projectName)
    if (!areStringArraysEqual(projectOrder.value, nextProjectOrder)) {
      setProjectOrder(nextProjectOrder)
    }

    deps.sourceGroups.value = deps.sourceGroups.value.filter((group) => group.projectName !== projectName)

    if (projectDisplayNameById.value[projectName] !== undefined) {
      const nextDisplayNames = { ...projectDisplayNameById.value }
      delete nextDisplayNames[projectName]
      setProjectDisplayNames(nextDisplayNames)
    }

    deps.applyThreadFlags()

    const flatThreads = flattenThreads(deps.projectGroups.value)
    deps.pruneThreadScopedState(flatThreads)

    const currentExists = flatThreads.some((thread) => thread.id === deps.selectedThreadId.value)
    if (!currentExists) {
      deps.setSelectedThreadId(flatThreads[0]?.id ?? '')
    }

    const removedRootPaths = new Set<string>()
    try {
      const rootsState = await getWorkspaceRootsState()
      collectWorkspaceRootPathsForProjectRemoval(rootsState, projectName).forEach((rootPath) => {
        removedRootPaths.add(rootPath)
      })
    } catch {
      // Keep local-only removal when global state is unavailable.
    }

    if (removedRootPaths.size > 0) {
      try {
        const rootsState = await getWorkspaceRootsState()
        const nextOrder = rootsState.order.filter((rootPath) => !removedRootPaths.has(rootPath))
        const nextActive = rootsState.active.filter((rootPath) => !removedRootPaths.has(rootPath))
        const fallbackActive = nextActive.length === 0 && nextOrder.length > 0
          ? [nextOrder[0]]
          : nextActive
        await setWorkspaceRootsState({
          order: nextOrder,
          labels: omitKeys(rootsState.labels, removedRootPaths),
          active: fallbackActive,
          projectOrder: rootsState.projectOrder.filter(
            (item) => item !== projectName && !removedRootPaths.has(item),
          ),
        })
        return
      } catch {
        // Fall back to order-only persistence if direct removal fails.
      }
    }

    await persistProjectOrderToWorkspaceRoots()
  }

  function reorderProject(projectName: string, toIndex: number): void {
    if (projectName.length === 0 || deps.sourceGroups.value.length === 0) return

    const visibleOrder = deps.sourceGroups.value.map((group) => group.projectName)
    const fromIndex = visibleOrder.indexOf(projectName)
    if (fromIndex === -1) return

    const clampedToIndex = Math.max(0, Math.min(toIndex, visibleOrder.length - 1))
    const reorderedVisibleOrder = reorderStringArray(visibleOrder, fromIndex, clampedToIndex)
    if (reorderedVisibleOrder === visibleOrder) return

    setProjectOrder(mergeProjectOrder(reorderedVisibleOrder, deps.sourceGroups.value))

    const orderedGroups = orderGroupsByProjectOrder(deps.sourceGroups.value, projectOrder.value)
    deps.sourceGroups.value = mergeThreadGroups(deps.sourceGroups.value, orderedGroups)
    deps.applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  function pinProjectToTop(projectName: string): void {
    const normalizedName = projectName.trim()
    if (!normalizedName) return
    const nextOrder = [normalizedName, ...projectOrder.value.filter((name) => name !== normalizedName)]
    if (areStringArraysEqual(projectOrder.value, nextOrder)) return
    setProjectOrder(nextOrder)

    const orderedGroups = orderGroupsByProjectOrder(deps.sourceGroups.value, projectOrder.value)
    deps.sourceGroups.value = mergeThreadGroups(deps.sourceGroups.value, orderedGroups)
    deps.applyThreadFlags()
    void persistProjectOrderToWorkspaceRoots()
  }

  return {
    projectDisplayNameById,
    projectOrder,
    persistProjectOrderToWorkspaceRoots,
    pinProjectToTop,
    removeProject,
    renameProject,
    reorderProject,
    setProjectDisplayNames,
    setProjectOrder,
  }
}
