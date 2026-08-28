import { ref, type Ref } from 'vue'
import { getThreadGroupsPage, getBackgroundThreadListLimit, type WorkspaceRootsState } from '../api/codexGateway'
import type { UiProjectGroup, UiThread } from '../types/codex'
import { flattenThreads, removeThreadFromGroups } from './useDesktopStateUtils'

const BACKGROUND_THREAD_PAGINATION_DELAY_MS = 10_000
const RECENT_THREAD_LIST_LOAD_REUSE_MS = 2000

/**
 * round-62 下一批：线程列表加载的读请求 + 缓存所有权（thread loading）。
 * 只搬入读取请求与其专属缓存/去重逻辑；写侧编排函数（applyThreadGroups、
 * hydrateWorkspaceRootsStateIfNeeded、loadThreadTitleCacheIfNeeded、
 * loadWorkspaceRootsStateForThreadList、pruneThreadScopedState、setSelectedThreadId）
 * 仍是 useDesktopState() 闭包共享的 mutation 入口，经窄依赖注入，不搬走。
 */
export interface ThreadListLoadingDeps {
  selectedThreadId: Ref<string>
  /** 已合并的展示分组（loadThreads 用它决定默认选中线程）。 */
  projectGroups: Ref<UiProjectGroup[]>
  /** 进行中线程表：分页暂停/恢复的依据，历史高风险路径，行为保持不变。 */
  inProgressById: Ref<Record<string, boolean>>
  applyThreadGroups: (groups: UiProjectGroup[], rootsState: WorkspaceRootsState | null) => void
  hydrateWorkspaceRootsStateIfNeeded: (groups: UiProjectGroup[], rootsState: WorkspaceRootsState | null) => Promise<void>
  loadThreadTitleCacheIfNeeded: (options?: { force?: boolean }) => Promise<void>
  loadWorkspaceRootsStateForThreadList: () => Promise<WorkspaceRootsState | null>
  pruneThreadScopedState: (flatThreads: UiThread[]) => void
  setSelectedThreadId: (nextThreadId: string, options?: { persist?: boolean }) => void
}

export function createDesktopThreadListLoading(deps: ThreadListLoadingDeps) {
  const {
    selectedThreadId,
    projectGroups,
    inProgressById,
    applyThreadGroups,
    hydrateWorkspaceRootsStateIfNeeded,
    loadThreadTitleCacheIfNeeded,
    loadWorkspaceRootsStateForThreadList,
    pruneThreadScopedState,
    setSelectedThreadId,
  } = deps

  const hasLoadedThreads = ref(false)
  const isLoadingThreads = ref(false)
  const isThreadListFullyLoaded = ref(false)

  let loadThreadsPromise: Promise<void> | null = null
  let lastThreadListLoadAt = 0
  let threadListNextCursor: string | null = null
  let threadListBackgroundTimer: number | null = null
  let isLoadingRemainingThreadPages = false
  let hasLoadedAllThreadPages = false
  let loadedThreadListGroups: UiProjectGroup[] = []
  let loadedThreadListRootsState: WorkspaceRootsState | null = null

  function mergeThreadGroupPages(previous: UiProjectGroup[], incoming: UiProjectGroup[]): UiProjectGroup[] {
    if (previous.length === 0) return incoming
    if (incoming.length === 0) return previous

    const threadById = new Map<string, UiThread>()
    for (const thread of flattenThreads(previous)) {
      threadById.set(thread.id, thread)
    }
    for (const thread of flattenThreads(incoming)) {
      threadById.set(thread.id, thread)
    }
    const groupsByProject = new Map<string, UiThread[]>()
    for (const thread of threadById.values()) {
      const existing = groupsByProject.get(thread.projectName)
      if (existing) existing.push(thread)
      else groupsByProject.set(thread.projectName, [thread])
    }

    return Array.from(groupsByProject.entries())
      .map(([projectName, threads]) => ({
        projectName,
        threads: threads.sort(
          (first, second) => new Date(second.updatedAtIso).getTime() - new Date(first.updatedAtIso).getTime(),
        ),
      }))
      .sort((first, second) => {
        const firstUpdated = new Date(first.threads[0]?.updatedAtIso ?? 0).getTime()
        const secondUpdated = new Date(second.threads[0]?.updatedAtIso ?? 0).getTime()
        return secondUpdated - firstUpdated
      })
  }

  function hasActiveInProgressThreads(): boolean {
    return Object.values(inProgressById.value).some((value) => value === true)
  }

  function scheduleRemainingThreadPages(rootsState: WorkspaceRootsState | null = loadedThreadListRootsState): void {
    if (!threadListNextCursor || isLoadingRemainingThreadPages || hasActiveInProgressThreads()) return

    loadedThreadListRootsState = rootsState

    if (typeof window === 'undefined') {
      void loadRemainingThreadPages(rootsState)
      return
    }

    if (threadListBackgroundTimer !== null) {
      window.clearTimeout(threadListBackgroundTimer)
    }

    threadListBackgroundTimer = window.setTimeout(() => {
      threadListBackgroundTimer = null
      if (!threadListNextCursor || hasActiveInProgressThreads()) return
      void loadRemainingThreadPages(loadedThreadListRootsState)
    }, BACKGROUND_THREAD_PAGINATION_DELAY_MS)
  }

  async function loadRemainingThreadPages(rootsState: WorkspaceRootsState | null): Promise<void> {
    if (isLoadingRemainingThreadPages || !threadListNextCursor || hasActiveInProgressThreads()) return
    isLoadingRemainingThreadPages = true

    try {
      const page = await getThreadGroupsPage(threadListNextCursor, getBackgroundThreadListLimit())
      threadListNextCursor = page.nextCursor
      hasLoadedAllThreadPages = page.nextCursor === null
      isThreadListFullyLoaded.value = hasLoadedAllThreadPages
      loadedThreadListGroups = mergeThreadGroupPages(loadedThreadListGroups, page.groups)
      applyThreadGroups(loadedThreadListGroups, rootsState)
    } catch {
      // Keep the first page usable; a later refresh can retry remaining pages.
    } finally {
      isLoadingRemainingThreadPages = false
      if (threadListNextCursor && !hasActiveInProgressThreads()) {
        scheduleRemainingThreadPages(rootsState)
      }
    }
  }

  async function loadThreads(options: { force?: boolean } = {}) {
    if (loadThreadsPromise) {
      await loadThreadsPromise
      return
    }
    if (
      options.force !== true &&
      hasLoadedThreads.value &&
      Date.now() - lastThreadListLoadAt < RECENT_THREAD_LIST_LOAD_REUSE_MS
    ) {
      return
    }

    loadThreadsPromise = (async () => {
    if (!hasLoadedThreads.value) {
      isLoadingThreads.value = true
    }

    try {
      const [page, rootsState] = await Promise.all([
        getThreadGroupsPage(),
        loadWorkspaceRootsStateForThreadList(),
        loadThreadTitleCacheIfNeeded({ force: options.force === true }),
      ])
      loadedThreadListRootsState = rootsState
      const groups = page.groups
      // The server response is authoritative: replace the list on every load
      // rather than union-merging it with the previous snapshot, so threads the
      // server no longer returns (e.g. subagent sessions filtered out since the
      // last load) disappear from the sidebar instead of lingering.
      loadedThreadListGroups = groups
      threadListNextCursor = page.nextCursor
      hasLoadedAllThreadPages = page.nextCursor === null
      isThreadListFullyLoaded.value = hasLoadedAllThreadPages
      await hydrateWorkspaceRootsStateIfNeeded(groups, rootsState)

      applyThreadGroups(loadedThreadListGroups, rootsState)
      hasLoadedThreads.value = true
      lastThreadListLoadAt = Date.now()
      if (!hasLoadedAllThreadPages) {
        scheduleRemainingThreadPages(rootsState)
      }

      const flatThreads = flattenThreads(projectGroups.value)
      pruneThreadScopedState(flatThreads)

      const currentExists = flatThreads.some((thread) => thread.id === selectedThreadId.value)

      if (!currentExists && !selectedThreadId.value) {
        setSelectedThreadId(flatThreads[0]?.id ?? '')
      }
    } finally {
      isLoadingThreads.value = false
    }
    })().finally(() => {
      loadThreadsPromise = null
    })

    await loadThreadsPromise
  }

  function removeThreadFromLoadedLists(threadId: string): void {
    loadedThreadListGroups = removeThreadFromGroups(loadedThreadListGroups, threadId)
  }

  function hasRemainingThreadPages(): boolean {
    return threadListNextCursor !== null
  }

  function dispose(): void {
    if (threadListBackgroundTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(threadListBackgroundTimer)
      threadListBackgroundTimer = null
    }
  }

  return {
    dispose,
    hasActiveInProgressThreads,
    hasLoadedThreads,
    hasRemainingThreadPages,
    isLoadingThreads,
    isThreadListFullyLoaded,
    loadThreads,
    removeThreadFromLoadedLists,
    scheduleRemainingThreadPages,
  }
}