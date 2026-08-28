import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRootsState } from '../api/codexGateway'
import type { UiProjectGroup } from '../types/codex'

const gatewayMocks = vi.hoisted(() => ({
  getWorkspaceRootsState: vi.fn(),
  setWorkspaceRootsState: vi.fn(),
}))
const persistenceMocks = vi.hoisted(() => ({
  loadProjectDisplayNames: vi.fn<() => Record<string, string>>(() => ({})),
  loadProjectOrder: vi.fn<() => string[]>(() => []),
  saveProjectDisplayNames: vi.fn(),
  saveProjectOrder: vi.fn(),
}))

vi.mock('../api/codexGateway', () => gatewayMocks)
vi.mock('./useDesktopStatePersistence', () => persistenceMocks)

import { createDesktopProjectOrganization } from './useDesktopProjectOrganization'

function group(projectName: string, threadId: string): UiProjectGroup {
  return {
    projectName,
    threads: [{
      id: threadId,
      title: threadId,
      projectName,
      cwd: `/tmp/${projectName}`,
      hasWorktree: false,
      createdAtIso: '2026-08-28T00:00:00.000Z',
      updatedAtIso: '2026-08-28T00:00:00.000Z',
      preview: '',
      unread: false,
      inProgress: false,
    }],
  }
}

function rootsState(): WorkspaceRootsState {
  return {
    order: ['/tmp/alpha', '/tmp/beta'],
    labels: {},
    active: ['/tmp/alpha'],
    projectOrder: ['/tmp/alpha', '/tmp/beta'],
  }
}

function createState(groups: UiProjectGroup[], selectedThreadId = '') {
  const sourceGroups = ref(groups)
  const projectGroups = ref(groups)
  const selected = ref(selectedThreadId)
  const applyThreadFlags = vi.fn(() => {
    projectGroups.value = sourceGroups.value
  })
  const pruneThreadScopedState = vi.fn()
  const setSelectedThreadId = vi.fn((threadId: string) => {
    selected.value = threadId
  })
  const organization = createDesktopProjectOrganization({
    sourceGroups,
    projectGroups,
    selectedThreadId: selected,
    applyThreadFlags,
    pruneThreadScopedState,
    setSelectedThreadId,
  })
  return {
    ...organization,
    sourceGroups,
    projectGroups,
    selected,
    applyThreadFlags,
    pruneThreadScopedState,
    setSelectedThreadId,
  }
}

describe('createDesktopProjectOrganization', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    persistenceMocks.loadProjectDisplayNames.mockReturnValue({})
    persistenceMocks.loadProjectOrder.mockReturnValue([])
    gatewayMocks.getWorkspaceRootsState.mockResolvedValue(rootsState())
    gatewayMocks.setWorkspaceRootsState.mockResolvedValue(undefined)
  })

  it('persists a renamed project locally and updates its workspace-root label after debounce', async () => {
    vi.useFakeTimers()
    const state = createState([group('alpha', 'thread-a')])

    state.renameProject('alpha', 'Alpha workspace')
    expect(state.projectDisplayNameById.value).toEqual({ alpha: 'Alpha workspace' })
    expect(persistenceMocks.saveProjectDisplayNames).toHaveBeenCalledWith({ alpha: 'Alpha workspace' })
    expect(gatewayMocks.setWorkspaceRootsState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    expect(gatewayMocks.setWorkspaceRootsState).toHaveBeenCalledWith({
      order: ['/tmp/alpha', '/tmp/beta'],
      labels: { '/tmp/alpha': 'Alpha workspace' },
      active: ['/tmp/alpha'],
      projectOrder: ['/tmp/alpha', '/tmp/beta'],
    })
  })

  it('removes a project, prunes its threads, and selects the first remaining thread', async () => {
    persistenceMocks.loadProjectOrder.mockReturnValue(['alpha', 'beta'])
    persistenceMocks.loadProjectDisplayNames.mockReturnValue({ alpha: 'Alpha' })
    const state = createState([group('alpha', 'thread-a'), group('beta', 'thread-b')], 'thread-a')

    await state.removeProject('alpha')

    expect(state.sourceGroups.value.map((entry) => entry.projectName)).toEqual(['beta'])
    expect(state.projectDisplayNameById.value).toEqual({})
    expect(state.pruneThreadScopedState).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'thread-b' }),
    ])
    expect(state.setSelectedThreadId).toHaveBeenCalledWith('thread-b')
    expect(gatewayMocks.setWorkspaceRootsState).toHaveBeenCalledWith({
      order: ['/tmp/beta'],
      labels: {},
      active: ['/tmp/beta'],
      projectOrder: ['/tmp/beta'],
    })
  })

  it('reorders and pins projects without losing their threads', async () => {
    persistenceMocks.loadProjectOrder.mockReturnValue(['alpha', 'beta'])
    const alpha = group('alpha', 'thread-a')
    const beta = group('beta', 'thread-b')
    const state = createState([alpha, beta])

    state.reorderProject('beta', 0)
    expect(state.projectOrder.value).toEqual(['beta', 'alpha'])
    expect(state.sourceGroups.value).toEqual([beta, alpha])
    expect(state.sourceGroups.value[0]?.threads.map((thread) => thread.id)).toEqual(['thread-b'])

    state.pinProjectToTop('alpha')
    expect(state.projectOrder.value).toEqual(['alpha', 'beta'])
    expect(state.sourceGroups.value).toEqual([alpha, beta])
    await vi.waitFor(() => expect(gatewayMocks.setWorkspaceRootsState).toHaveBeenCalled())
  })
})
