import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildWorkspaceRootsProjectOrderState,
  collectWorkspaceRootPathsForProjectRemoval,
  filterGroupsByWorkspaceRoots,
  findAdjacentThreadId,
  mergeLiveMessages,
  mergePersistedReasoning,
  removeThreadFromGroups,
  isThreadUnreadByLastRead,
  useDesktopState,
} from './useDesktopState'
import type { UiProjectGroup } from '../types/codex'
import type { AvailableModel, WorkspaceRootsState } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  archiveThread: vi.fn(),
  forkThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAvailableCollaborationModes: vi.fn(),
  getAvailableModels: vi.fn(),
  getCurrentModelConfig: vi.fn(),
  getPendingServerRequests: vi.fn(),
  getSkillsList: vi.fn(),
  getThreadDetail: vi.fn(),
  getThreadGroupsPage: vi.fn(),
  getThreadQueueState: vi.fn(),
  getThreadTitleCache: vi.fn(),
  getWorkspaceRootsState: vi.fn(),
  generateThreadTitle: vi.fn(),
  getThreadReasoningArchive: vi.fn(),
  persistThreadReasoningArchive: vi.fn(),
  interruptThreadTurn: vi.fn(),
  listHooks: vi.fn(),
  persistThreadTitle: vi.fn(),
  renameThread: vi.fn(),
  replyToServerRequest: vi.fn(),
  resumeThread: vi.fn(),
  revertThreadFileChanges: vi.fn(),
  rollbackThread: vi.fn(),
  setCodexSpeedMode: vi.fn(),
  setThreadQueueState: vi.fn(),
  setWorkspaceRootsState: vi.fn(),
  startThread: vi.fn(),
  startThreadTurn: vi.fn(),
  subscribeCodexNotifications: vi.fn(),
}))

vi.mock('../api/codexGateway', () => ({
  ...gatewayMocks,
  getBackgroundThreadListLimit: vi.fn(() => 100),
  pickCodexRateLimitSnapshot: vi.fn(() => null),
}))

function thread(id: string, cwd: string, options: { hasWorktree?: boolean } = {}) {
  return {
    id,
    title: id,
    projectName: cwd ? cwd.split('/').at(-1) || cwd : 'Projectless',
    cwd,
    hasWorktree: options.hasWorktree ?? false,
    createdAtIso: '2026-04-28T00:00:00.000Z',
    updatedAtIso: '2026-04-28T00:00:00.000Z',
    preview: '',
    unread: false,
    inProgress: false,
  }
}

function modelsWithoutReasoning(...ids: string[]): AvailableModel[] {
  return ids.map((id) => ({
    id,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
  }))
}

function installTestWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage))
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
    },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  gatewayMocks.getThreadQueueState.mockResolvedValue({})
  gatewayMocks.getThreadTitleCache.mockResolvedValue({ titles: {} })
  gatewayMocks.getWorkspaceRootsState.mockRejectedValue(new Error('no workspace roots state'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterGroupsByWorkspaceRoots', () => {
  it('keeps projectless chats visible when workspace roots are configured', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'Projectless',
        threads: [thread('projectless-chat', '')],
      },
      {
        projectName: 'allowed-project',
        threads: [thread('allowed-chat', '/tmp/allowed-project')],
      },
      {
        projectName: 'other-project',
        threads: [thread('other-chat', '/tmp/other-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/allowed-project'],
      labels: {},
      active: ['/tmp/allowed-project'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'Projectless',
      'allowed-project',
    ])
  })

  it('keeps workspace roots with the same folder name as separate projects', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'api',
        threads: [
          thread('first-api-chat', '/tmp/first/api'),
          thread('second-api-chat', '/tmp/second/api'),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {},
      active: ['/tmp/first/api', '/tmp/second/api'],
      projectOrder: [],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      '/tmp/first/api',
      '/tmp/second/api',
    ])
  })

  it('uses Codex project-order when workspace roots are hydrated', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('alpha-chat', '/tmp/alpha')],
      },
      {
        projectName: 'beta',
        threads: [thread('beta-chat', '/tmp/beta')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/alpha', '/tmp/beta'],
      labels: {},
      active: ['/tmp/alpha'],
      projectOrder: ['/tmp/beta', '/tmp/alpha'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => group.projectName)).toEqual([
      'beta',
      'alpha',
    ])
  })

  it('keeps empty duplicate workspace roots visible in Codex project order', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'TestChat',
        threads: [thread('testchat-chat', '/Users/igor/temp/TestChat')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      labels: {},
      active: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
      projectOrder: ['/Users/igor/Documents/New project 2/TestChat', '/Users/igor/temp/TestChat'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['/Users/igor/Documents/New project 2/TestChat', 0],
      ['/Users/igor/temp/TestChat', 1],
    ])
  })

  it('keeps remote projects from Codex project order visible as empty project rows', () => {
    const groups: UiProjectGroup[] = []
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.length])).toEqual([
      ['remote-project-id', 0],
      ['local-project', 0],
    ])
  })

  it('keeps managed worktree threads under the matching workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['codex-web-local', ['main-chat', 'worktree-chat']],
    ])
  })

  it('keeps unregistered managed worktrees under the main root when another managed worktree root is registered', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('registered-worktree-chat', '/Users/igor/.codex/worktrees/a77f/codex-web-local', { hasWorktree: true }),
          thread('unregistered-worktree-chat', '/Users/igor/.codex/worktrees/53e7/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: [
        '/Users/igor/Git-projects/codex-web-local',
        '/Users/igor/.codex/worktrees/a77f/codex-web-local',
      ],
      labels: {
        '/Users/igor/.codex/worktrees/a77f/codex-web-local': 'codex-web-local2',
      },
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat', 'unregistered-worktree-chat']],
      ['/Users/igor/.codex/worktrees/a77f/codex-web-local', ['registered-worktree-chat']],
    ])
  })

  it('does not group unrelated git worktrees under a same-leaf workspace root project', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'codex-web-local',
        threads: [
          thread('main-chat', '/Users/igor/Git-projects/codex-web-local'),
          thread('other-git-worktree-chat', '/tmp/other/.git/worktrees/codex-web-local', { hasWorktree: true }),
        ],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/Users/igor/Git-projects/codex-web-local'],
      labels: {},
      active: ['/Users/igor/Git-projects/codex-web-local'],
      projectOrder: ['/Users/igor/Git-projects/codex-web-local'],
    }

    expect(filterGroupsByWorkspaceRoots(groups, rootsState).map((group) => [group.projectName, group.threads.map((row) => row.id)])).toEqual([
      ['/Users/igor/Git-projects/codex-web-local', ['main-chat']],
    ])
  })
})

describe('removeThreadFromGroups', () => {
  it('removes an archived thread and drops the now-empty project group', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
      {
        projectName: 'archived-project',
        threads: [thread('archive-me', '/tmp/archived-project')],
      },
      {
        projectName: 'beta',
        threads: [thread('keep-beta', '/tmp/beta')],
      },
      {
        projectName: 'empty-workspace-root',
        threads: [],
      },
    ]

    expect(removeThreadFromGroups(groups, 'archive-me').map((group) => [
      group.projectName,
      group.threads.map((row) => row.id),
    ])).toEqual([
      ['alpha', ['keep-alpha']],
      ['beta', ['keep-beta']],
      ['empty-workspace-root', []],
    ])
  })

  it('preserves referential identity when the thread is absent', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'alpha',
        threads: [thread('keep-alpha', '/tmp/alpha')],
      },
    ]

    expect(removeThreadFromGroups(groups, 'missing-thread')).toBe(groups)
  })
})

describe('workspace roots project persistence helpers', () => {
  it('collects duplicate-path project roots by full path when removing a project', () => {
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/first/api', '/tmp/second/api'],
      labels: {
        '/tmp/first/api': 'First API',
        '/tmp/second/api': 'Second API',
      },
      active: ['/tmp/first/api'],
      projectOrder: ['/tmp/first/api', '/tmp/second/api'],
    }

    expect([...collectWorkspaceRootPathsForProjectRemoval(rootsState, '/tmp/first/api')]).toEqual([
      '/tmp/first/api',
    ])
  })

  it('preserves remote project ids in explicit project order when persisting workspace roots', () => {
    const groups: UiProjectGroup[] = [
      {
        projectName: 'local-project',
        threads: [thread('local-chat', '/tmp/local-project')],
      },
    ]
    const rootsState: WorkspaceRootsState = {
      order: ['/tmp/local-project'],
      labels: {},
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
      remoteProjects: [{
        id: 'remote-project-id',
        hostId: 'remote-ssh-discovered:a1',
        remotePath: '/home/ubuntu',
        label: 'ubuntu',
      }],
    }

    expect(buildWorkspaceRootsProjectOrderState(rootsState, ['remote-project-id', 'local-project'], groups)).toEqual({
      order: ['/tmp/local-project'],
      active: ['/tmp/local-project'],
      projectOrder: ['remote-project-id', '/tmp/local-project'],
    })
  })
})

describe('thread unread state helpers', () => {
  const cutoffIso = '2026-05-01T12:00:00.000Z'

  it('uses the initialization cutoff when a thread has no read state', () => {
    expect(isThreadUnreadByLastRead('2026-05-01T11:59:59.000Z', undefined, cutoffIso)).toBe(false)
    expect(isThreadUnreadByLastRead('2026-05-01T12:00:01.000Z', undefined, cutoffIso)).toBe(true)
  })

  it('uses per-thread read state instead of the global cutoff after a thread is read', () => {
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:30:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(false)
    expect(isThreadUnreadByLastRead(
      '2026-05-01T12:50:00.000Z',
      '2026-05-01T12:45:00.000Z',
      cutoffIso,
    )).toBe(true)
  })
})

describe('collaboration mode selection', () => {
  it('can prime an empty selected thread without clearing persisted selection', () => {
    installTestWindow({
      'codex-web-local.selected-thread-id.v1': 'thread-a',
    })

    const state = useDesktopState()

    expect(state.selectedThreadId.value).toBe('thread-a')

    state.primeSelectedThread('', { persist: false })

    expect(state.selectedThreadId.value).toBe('')
    expect(window.localStorage.getItem('codex-web-local.selected-thread-id.v1')).toBe('thread-a')
  })

  it('does not carry plan mode from new chats into existing threads', () => {
    installTestWindow({
      'codex-web-local.collaboration-mode.v1': 'plan',
    })

    const state = useDesktopState()

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')

    expect(state.selectedCollaborationMode.value).toBe('plan')
    expect(window.localStorage.getItem('codex-web-local.collaboration-mode-by-context.v1')).toBe(null)

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.setSelectedCollaborationMode('plan')
    state.primeSelectedThread('thread-b')

    expect(state.selectedCollaborationMode.value).toBe('default')

    state.primeSelectedThread('thread-a')

    expect(state.selectedCollaborationMode.value).toBe('plan')
  })
})

describe('Codex CLI availability', () => {
  it('surfaces a chat runtime error when the app-server bridge cannot find Codex CLI', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockRejectedValue(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })

    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')
  })

  it('clears a previous Codex CLI missing banner when a later refresh fails for another reason', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage
      .mockRejectedValueOnce(new Error('Codex CLI is not available. Install @openai/codex or set CODEXUI_CODEX_COMMAND.'))
      .mockRejectedValueOnce(new Error('Connection lost'))

    const state = useDesktopState()

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.codexCliMissingError.value).toBe('Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.')

    await state.refreshAll({ awaitAncillaryRefreshes: true })
    expect(state.error.value).toBe('Connection lost')
    expect(state.codexCliMissingError.value).toBe('')
  })

})

describe('startup request deduplication', () => {
  it('reloads cached thread titles on forced thread refresh', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getThreadTitleCache
      .mockResolvedValueOnce({ titles: {} })
      .mockResolvedValueOnce({ titles: { 'thread-1': 'Imported title' } })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('thread-1')

    await state.refreshAll({ includeSelectedThreadMessages: false, forceThreadRefresh: true })

    expect(gatewayMocks.getThreadTitleCache).toHaveBeenCalledTimes(2)
    expect(state.projectGroups.value[0]?.threads[0]?.title).toBe('Imported title')
  })

  it('reuses a just-loaded thread list during startup refresh bursts', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })

    try {
      const state = useDesktopState()
      await state.refreshAll({ includeSelectedThreadMessages: false })
      await state.refreshAll({ includeSelectedThreadMessages: false })

      expect(gatewayMocks.getThreadGroupsPage).toHaveBeenCalledTimes(1)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('reuses a just-loaded skills list for the same selected cwd', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([
      {
        name: 'example',
        description: 'Example skill',
        path: '/tmp/project/.agents/skills/example/SKILL.md',
        scope: 'project',
        enabled: true,
      },
    ])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5'))

    try {
      const state = useDesktopState()
      state.primeSelectedThread('thread-1')
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

      expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(1)
      expect(gatewayMocks.getSkillsList).toHaveBeenCalledWith(['/tmp/project'])
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('reuses a just-loaded empty skills list for the same selected cwd', async () => {
    installTestWindow()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5'))

    try {
      const state = useDesktopState()
      state.primeSelectedThread('thread-1')
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
      await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

      expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(1)
      expect(state.installedSkills.value).toEqual([])
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('bypasses recent thread-list reuse for event-driven thread refreshes', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('thread-1', '/tmp/project')] }],
      nextCursor: null,
    })

    try {
      const state = useDesktopState()
      await state.refreshAll({ includeSelectedThreadMessages: false })
      const callsBeforeNotification = gatewayMocks.getThreadGroupsPage.mock.calls.length
      state.startPolling()
      expect(notificationHandler).toBeDefined()
      notificationHandler!({
        method: 'thread/name/updated',
        params: {
          threadId: 'thread-1',
          threadName: 'Updated title',
        },
      })
      await Promise.resolve()
      await Promise.resolve()

      expect(gatewayMocks.getThreadGroupsPage.mock.calls.length).toBeGreaterThan(callsBeforeNotification)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('live error overlay', () => {
  it('shows the default thinking overlay while a selected thread is in progress without activity events', async () => {
    installTestWindow()
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'create todo list app',
          messageType: 'userMessage',
        },
      ],
      inProgress: true,
      activeTurnId: 'turn-1',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-thinking')
    await state.loadMessages('thread-thinking')

    expect(state.selectedLiveOverlay.value).toMatchObject({
      activityLabel: 'Thinking',
      reasoningText: '',
      errorText: '',
    })
  })

  it('keeps a new live error visible when an older persisted turn error exists', async () => {
    installTestWindow()
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'old-error',
          role: 'system',
          text: 'old persisted failure',
          messageType: 'turnError',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-with-errors')
    await state.loadMessages('thread-with-errors')
    state.startPolling()

    notificationHandler?.({
      method: 'turn/completed',
      params: {
        threadId: 'thread-with-errors',
        turnId: 'new-turn',
        turn: {
          id: 'new-turn',
          status: 'failed',
          error: { message: 'new live failure' },
        },
      },
    })

    expect(state.selectedLiveOverlay.value?.errorText).toBe('new live failure')
  })

  it('suppresses a live error only after that same error has persisted', async () => {
    installTestWindow()
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'persisted-error',
          role: 'system',
          text: 'same failure',
          messageType: 'turnError',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-with-persisted-error')
    await state.loadMessages('thread-with-persisted-error')
    state.startPolling()

    notificationHandler?.({
      method: 'turn/completed',
      params: {
        threadId: 'thread-with-persisted-error',
        turnId: 'same-turn',
        turn: {
          id: 'same-turn',
          status: 'failed',
          error: { message: 'same failure' },
        },
      },
    })

    expect(state.selectedLiveOverlay.value).toBe(null)
  })

  it('maps commandExecution started to the Running command overlay label', async () => {
    // round-24：Running command 时 live-overlay-details 只含命令文本（命令文本
    // 已显示在消息列表的 WorkBlockItem 里），LiveOverlayItem 据此隐藏 details。
    installTestWindow()
    let notificationHandler: (notification: { method: string; params?: unknown }) => void = () => {}
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler
      return vi.fn()
    })
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'run it',
          messageType: 'userMessage',
        },
      ],
      inProgress: true,
      activeTurnId: 'turn-1',
      turnIndexByTurnId: {},
      hasMoreOlder: false,
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-running-cmd')
    await state.loadMessages('thread-running-cmd')
    state.startPolling()

    notificationHandler?.({
      method: 'item/started',
      params: {
        threadId: 'thread-running-cmd',
        turnId: 'turn-1',
        itemId: 'cmd-1',
        item: { type: 'commandExecution', id: 'cmd-1', command: 'ls -la', status: 'in_progress' },
      },
    })

    expect(state.selectedLiveOverlay.value?.activityLabel).toBe('Running command')
    // details 只有命令文本（组件层面在 Running command 下隐藏展示）
    expect(state.selectedLiveOverlay.value?.activityDetails).toEqual(['ls -la'])
  })
})

describe('provider model selection', () => {
  it('ignores global selected-model localStorage when OpenCode Zen is the active provider', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread__': 'gpt-5.5',
      }),
      'codex-web-local.selected-model-id.v1': 'gpt-5.5',
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning(
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ))

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getAvailableModels).toHaveBeenCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('').trim()).toBe('big-pickle')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::opencode-zen': 'big-pickle',
    })
    expect(window.localStorage.getItem('codex-web-local.selected-model-id.v1')).toBe(null)
  })

  it('restores a valid provider-scoped OpenCode Zen selected model from localStorage', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::opencode-zen': 'ring-2.6-1t-free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'big-pickle',
      providerId: 'opencode-zen',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning(
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ))

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'deepseek-v4-flash-free',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('ring-2.6-1t-free')
    expect(state.readModelIdForThread('').trim()).toBe('ring-2.6-1t-free')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::opencode-zen': 'ring-2.6-1t-free',
    })
  })

  it('stores the new-thread Codex model in a provider-scoped slot', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::openrouter-free': 'openrouter/free',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning(
      'gpt-5.5',
      'gpt-5.4-mini',
    ))

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('gpt-5.5')
    expect(state.readModelIdForThread('').trim()).toBe('gpt-5.5')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::openrouter-free': 'openrouter/free',
      '__new-thread-provider__::codex': 'gpt-5.5',
    })
  })

  it('drops stale non-Codex selected models from the Codex model list', async () => {
    installTestWindow({
      'codex-web-local.selected-model-by-context.v1': JSON.stringify({
        '__new-thread-provider__::codex': 'big-pickle',
      }),
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning(
      'gpt-5.5',
      'gpt-5.4-mini',
    ))

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.availableModelIds.value).toEqual([
      'gpt-5.5',
      'gpt-5.4-mini',
    ])
    expect(state.availableModelIds.value).not.toContain('big-pickle')
    expect(state.selectedModelId.value).toBe('gpt-5.5')
    expect(state.readModelIdForThread('').trim()).toBe('gpt-5.5')
    expect(JSON.parse(window.localStorage.getItem('codex-web-local.selected-model-by-context.v1') ?? '{}')).toEqual({
      '__new-thread-provider__::codex': 'gpt-5.5',
    })
  })

  it('uses model-specific reasoning levels and clamps incompatible selections to the model default', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.6-sol',
      providerId: '',
      reasoningEffort: 'ultra',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue([
      {
        id: 'gpt-5.6-sol',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        defaultReasoningEffort: 'low',
      },
      {
        id: 'gpt-5.5',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
      },
    ])

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(state.selectedModelId.value).toBe('gpt-5.6-sol')
    expect(state.selectedReasoningEffort.value).toBe('ultra')
    expect(state.availableModelReasoningEfforts.value['gpt-5.5']).toEqual(['low', 'medium', 'high', 'xhigh'])

    state.setSelectedModelIdForThread('__new-thread__', 'gpt-5.5')
    expect(state.selectedReasoningEffort.value).toBe('medium')

    state.setSelectedReasoningEffort('ultra')
    expect(state.selectedReasoningEffort.value).toBe('medium')
  })

  it('keeps an existing OpenCode Zen thread locked to Zen models after Codex auth becomes active', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('legacy-zen-thread', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockImplementation(async (options?: { providerId?: string }) => {
      if (options?.providerId === 'opencode-zen') {
        return modelsWithoutReasoning('big-pickle', 'ring-2.6-1t-free')
      }
      return modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini')
    })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'opencode_zen',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    state.primeSelectedThread('legacy-zen-thread')
    await state.loadMessages('legacy-zen-thread')
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })

    expect(gatewayMocks.getAvailableModels).toHaveBeenLastCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual([
      'big-pickle',
      'ring-2.6-1t-free',
    ])
    expect(state.selectedModelId.value).toBe('big-pickle')
    expect(state.readModelIdForThread('legacy-zen-thread')).toBe('big-pickle')
    expect(state.readModelIdForThread('')).toBe('gpt-5.4-mini')
  })

  it('loads provider models for a selected provider-backed thread during scheduled refreshes', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({
      groups: [{ projectName: 'Project', threads: [thread('legacy-zen-thread', '/tmp/project')] }],
      nextCursor: null,
    })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockImplementation(async (options?: { providerId?: string }) => {
      if (options?.providerId === 'opencode-zen') {
        return modelsWithoutReasoning('big-pickle', 'ring-2.6-1t-free')
      }
      return modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini')
    })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'opencode_zen',
      messages: [],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    state.primeSelectedThread('legacy-zen-thread')
    await state.loadMessages('legacy-zen-thread')
    await state.refreshAll({ includeSelectedThreadMessages: false })
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))

    expect(gatewayMocks.getAvailableModels).toHaveBeenLastCalledWith({
      includeProviderModels: true,
      requireProviderModels: true,
      providerId: 'opencode-zen',
    })
    expect(state.availableModelIds.value).toEqual(['big-pickle', 'ring-2.6-1t-free'])
    expect(state.selectedModelId.value).toBe('big-pickle')
  })

  it('captures the active provider when creating a new thread', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini'))
    gatewayMocks.startThread.mockResolvedValue({
      threadId: 'codex-thread',
      model: 'gpt-5.5',
      modelProvider: 'openai',
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')
    gatewayMocks.getThreadDetail.mockResolvedValue({
      model: 'gpt-5.5',
      modelProvider: 'openai',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Hi.',
          messageType: 'agentMessage',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    await state.sendMessageToNewThread('hi', '/tmp/project')

    expect(gatewayMocks.startThread).toHaveBeenCalledWith('/tmp/project', 'gpt-5.5')
    expect(gatewayMocks.startThreadTurn).toHaveBeenCalledWith(
      'codex-thread',
      'hi',
      [],
      'gpt-5.5',
      'medium',
      undefined,
      [],
      'default',
    )
    expect(state.readModelIdForThread('codex-thread')).toBe('gpt-5.5')
    expect(state.messages.value.some((message) => (
      message.role === 'user' &&
      message.text === 'hi' &&
      message.messageType === 'userMessage.optimistic'
    ))).toBe(true)

    const modelConfigCallsBeforeLoad = gatewayMocks.getCurrentModelConfig.mock.calls.length
    const availableModelCallsBeforeLoad = gatewayMocks.getAvailableModels.mock.calls.length
    await state.loadMessages('codex-thread')
    expect(gatewayMocks.getCurrentModelConfig).toHaveBeenCalledTimes(modelConfigCallsBeforeLoad)
    expect(gatewayMocks.getAvailableModels).toHaveBeenCalledTimes(availableModelCallsBeforeLoad)
    expect(state.messages.value.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:hi',
      'assistant:Hi.',
    ])
  })

  it('refreshes a loaded optimistic thread when completion events arrive', async () => {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.4-mini',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini'))
    gatewayMocks.startThread.mockResolvedValue({
      threadId: 'mini-thread',
      model: 'gpt-5.4-mini',
      modelProvider: 'openai',
    })
    gatewayMocks.startThreadTurn.mockResolvedValue('turn-1')
    gatewayMocks.getThreadDetail.mockResolvedValue({
      model: 'gpt-5.4-mini',
      modelProvider: 'openai',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'hi',
          messageType: 'userMessage',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Hi.',
          messageType: 'agentMessage',
        },
      ],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    await state.sendMessageToNewThread('hi', '/tmp/project')
    state.startPolling()
    expect(notificationHandler).toBeDefined()
    notificationHandler!({
      method: 'turn/completed',
      params: {
        threadId: 'mini-thread',
        turn: { id: 'turn-1', status: 'completed' },
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getThreadDetail).toHaveBeenCalledWith('mini-thread')
    expect(state.messages.value.map((message) => `${message.role}:${message.text}`)).toEqual([
      'user:hi',
      'system:Worked for <1s',
      'assistant:Hi.',
    ])
  })

  it('surfaces selected thread load failures and still refreshes models', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getAvailableCollaborationModes.mockResolvedValue([{ value: 'default', label: 'Default' }])
    gatewayMocks.getSkillsList.mockResolvedValue([])
    gatewayMocks.getAccountRateLimits.mockResolvedValue(null)
    gatewayMocks.getCurrentModelConfig.mockResolvedValue({
      model: 'gpt-5.5',
      providerId: '',
      reasoningEffort: 'medium',
      speedMode: 'standard',
    })
    gatewayMocks.getAvailableModels.mockResolvedValue(modelsWithoutReasoning('gpt-5.5', 'gpt-5.4-mini'))
    gatewayMocks.resumeThread.mockRejectedValue(new Error('thread not found'))

    const state = useDesktopState()
    state.primeSelectedThread('missing-thread')
    await state.refreshAll({
      includeSelectedThreadMessages: true,
      awaitAncillaryRefreshes: true,
    })

    expect(state.selectedLiveOverlay.value?.errorText).toContain('thread not found')
    expect(state.availableModelIds.value).toEqual(['gpt-5.5', 'gpt-5.4-mini'])
    expect(state.selectedModelId.value).toBe('gpt-5.5')

    await state.ensureThreadMessagesLoaded('missing-thread', { silent: true })
    await state.loadMessages('missing-thread')
    expect(gatewayMocks.resumeThread).toHaveBeenCalledTimes(1)
  })
})

describe('findAdjacentThreadId', () => {
  it('selects the next thread after the archived thread', () => {
    const threads = [
      thread('first-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
      thread('next-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('next-thread')
  })

  it('falls back to the previous thread when the last thread is archived', () => {
    const threads = [
      thread('previous-thread', '/tmp/project'),
      thread('selected-thread', '/tmp/project'),
    ]

    expect(findAdjacentThreadId(threads, 'selected-thread')).toBe('previous-thread')
  })

  it('returns no fallback when there is no adjacent thread', () => {
    expect(findAdjacentThreadId([thread('selected-thread', '/tmp/project')], 'selected-thread')).toBe('')
  })
})

describe('P1-3 notification surface', () => {
  function captureNotificationHandler(): (notification: { method: string; params?: unknown }) => void {
    installTestWindow()
    vi.mocked(window.setTimeout).mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        void Promise.resolve().then(() => callback())
      }
      return 1
    }) as typeof window.setTimeout)
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getSkillsList.mockResolvedValue([])
    return (notification) => notificationHandler!(notification)
  }

  it('forwards app/list/updated to realtime event listeners', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    const received: string[] = []
    const stopListening = state.onRealtimeEvent((method) => received.push(method))

    sendNotification({ method: 'app/list/updated', params: { data: [] } })
    sendNotification({ method: 'mcpServer/startupStatus/updated', params: { name: 'server', status: 'running' } })
    sendNotification({ method: 'mcpServer/oauthLogin/completed', params: { name: 'server', success: true } })

    expect(received).toEqual([
      'app/list/updated',
      'mcpServer/startupStatus/updated',
      'mcpServer/oauthLogin/completed',
    ])
    stopListening()
  })

  it('refreshes installed skills on skills/changed', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false, awaitAncillaryRefreshes: true })
    state.startPolling()
    const callsBefore = gatewayMocks.getSkillsList.mock.calls.length

    sendNotification({ method: 'skills/changed', params: {} })
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getSkillsList.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('refreshes the thread list on thread lifecycle notifications', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    const callsBefore = gatewayMocks.getThreadGroupsPage.mock.calls.length

    sendNotification({ method: 'thread/archived', params: { threadId: 'thread-1' } })
    sendNotification({ method: 'thread/deleted', params: { threadId: 'thread-1' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getThreadGroupsPage.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('silently ignores known notifications with no UI consumer', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    const listCallsBefore = gatewayMocks.getThreadGroupsPage.mock.calls.length

    sendNotification({ method: 'model/rerouted', params: { threadId: 'thread-1', turnId: 'turn-1', fromModel: 'a', toModel: 'b', reason: 'fallback' } })
    sendNotification({ method: 'turn/moderationMetadata', params: { threadId: 'thread-1', turnId: 'turn-1', metadata: {} } })
    sendNotification({ method: 'item/mcpToolCall/progress', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', message: 'progress' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getThreadGroupsPage.mock.calls.length).toBe(listCallsBefore)
  })

  it('does not reload the thread list for high-frequency realtime voice blocks', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    const listCallsBefore = gatewayMocks.getThreadGroupsPage.mock.calls.length

    sendNotification({ method: 'thread/realtime/outputAudio/delta', params: { threadId: 'thread-1', itemId: 'item-1', deltaBase64: 'abc' } })
    sendNotification({ method: 'thread/realtime/transcript/delta', params: { threadId: 'thread-1', itemId: 'item-1', delta: 'hi' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.getThreadGroupsPage.mock.calls.length).toBe(listCallsBefore)
  })

  it('archives live reasoning into the persisted message list when a turn completes', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    state.primeSelectedThread('thread-1')

    sendNotification({ method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: '先确认环境' } })
    sendNotification({ method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: '，再规划步骤' } })
    await Promise.resolve()

    // agent 内容开始 → clearLiveReasoningForThread 把 live thinking 存档
    sendNotification({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '开始回答' } })
    await Promise.resolve()

    const stored = window.localStorage.getItem('codex-web-local.thread-reasoning.v1')
    expect(stored).toBeTruthy()
    expect(stored).toContain('先确认环境，再规划步骤')
    expect(stored).toContain('reasoning:local:thread-1:')
  })

  it('captures full reasoning items from item/started + item/completed and archives them', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    state.primeSelectedThread('thread-1')

    // This app-server does not stream item/reasoning/textDelta; reasoning
    // content arrives inline in the full item payloads.
    sendNotification({ method: 'turn/started', params: { threadId: 'thread-1', turnId: 'turn-1' } })
    sendNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'rs-1',
        item: { type: 'reasoning', id: 'rs-1', summary: [], content: [{ type: 'reasoning_text', text: '先探索环境' }] },
      },
    })
    await Promise.resolve()
    expect(state.selectedLiveOverlay.value?.reasoningText).toContain('先探索环境')

    // item/completed re-emits the same item with the full text; only the
    // missing suffix should be appended, not a duplicate.
    sendNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'rs-1',
        item: { type: 'reasoning', id: 'rs-1', summary: [], content: [{ type: 'reasoning_text', text: '先探索环境，再规划步骤' }] },
      },
    })
    await Promise.resolve()
    expect(state.selectedLiveOverlay.value?.reasoningText).toBe('先探索环境，再规划步骤')

    sendNotification({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '开始回答' } })
    await Promise.resolve()

    const stored = window.localStorage.getItem('codex-web-local.thread-reasoning.v1')
    expect(stored).toBeTruthy()
    expect(stored).toContain('先探索环境，再规划步骤')
  })

  it('archives textDelta reasoning with per-item anchors when commands interleave', async () => {
    // round-24：textDelta 增量通道不伴随 item/started 的 reasoning 项，
    // 此前 turnItemSequenceByThreadId 没有 reasoning 条目 → buildTurnReasoningItems
    // 为空 → 回退整段存档（无 reasoningAnchorMessageId）→ 刷新后全部思考
    // 按 turnIndex 插到轮首。修复后增量通道也按 item 粒度记录时序与文本。
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    state.primeSelectedThread('thread-1')

    sendNotification({ method: 'turn/started', params: { threadId: 'thread-1', turnId: 'turn-1' } })
    // 思考A（增量）→ 命令 → 思考B（增量）→ agent 内容
    sendNotification({ method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: '思考A' } })
    sendNotification({ method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-1', delta: ' 追加' } })
    sendNotification({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'cmd-1',
        item: { type: 'commandExecution', id: 'cmd-1', command: 'ls', status: 'in_progress' },
      },
    })
    sendNotification({ method: 'item/reasoning/textDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'rs-2', delta: '思考B' } })
    await Promise.resolve()

    // agent 内容开始 → clearLiveReasoningForThread 把 live thinking 存档
    sendNotification({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'agent-1', delta: '开始回答' } })
    await Promise.resolve()

    const stored = window.localStorage.getItem('codex-web-local.thread-reasoning.v1')
    expect(stored).toBeTruthy()
    expect(stored).toContain('思考A 追加')
    expect(stored).toContain('思考B')
    // 思考A 锚定该轮首条（无前置工具时为空锚点回退轮首），思考B 锚定命令 cmd-1
    expect(stored).toContain('reasoningAnchorMessageId":"cmd-1"')
  })

  it('captures plan items from item/completed as live plan messages', async () => {
    const sendNotification = captureNotificationHandler()
    const state = useDesktopState()
    await state.refreshAll({ includeSelectedThreadMessages: false })
    state.startPolling()
    state.primeSelectedThread('thread-1')

    sendNotification({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'turn-1-plan',
        item: {
          type: 'plan',
          id: 'turn-1-plan',
          text: '# 计划\n## 实施步骤\n1. 搭建目录\n2. 实现主程序\n3. 编写自测',
        },
      },
    })
    await Promise.resolve()

    const plan = state.messages.value.find((message) => message.messageType === 'plan' || message.messageType === 'plan.live')
    expect(plan).toBeTruthy()
    // 编号列表优先：只解析 3 个真实步骤，而不是把每个项目符号都当步骤
    expect(plan?.plan?.steps).toHaveLength(3)
    expect(plan?.plan?.steps[0]?.step).toBe('搭建目录')
    expect(plan?.turnId).toBe('turn-1')
  })

  it('bypasses recent-load reuse when force is set', async () => {
    installTestWindow()
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.resumeThread.mockResolvedValue({
      model: '',
      modelProvider: '',
      messages: [{ id: 'user-1', role: 'user', text: 'hi', messageType: 'userMessage' }],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })
    gatewayMocks.getThreadDetail.mockResolvedValue({
      model: '',
      modelProvider: '',
      messages: [{ id: 'user-1', role: 'user', text: 'hi', messageType: 'userMessage' }],
      inProgress: false,
      activeTurnId: '',
      hasMoreOlder: false,
      turnIndexByTurnId: {},
    })

    const state = useDesktopState()
    state.primeSelectedThread('thread-1')
    const messageFetchCalls = () =>
      gatewayMocks.resumeThread.mock.calls.length + gatewayMocks.getThreadDetail.mock.calls.length

    await state.loadMessages('thread-1')
    const callsAfterFirstLoad = messageFetchCalls()
    expect(callsAfterFirstLoad).toBeGreaterThan(0)

    await state.loadMessages('thread-1', { silent: true })
    expect(messageFetchCalls()).toBe(callsAfterFirstLoad)

    await state.loadMessages('thread-1', { silent: true, force: true })
    expect(messageFetchCalls()).toBeGreaterThan(callsAfterFirstLoad)
  })
})

describe('hooks notifications', () => {
  it('loads hooks once and force-refreshes on hook/started and hook/completed', async () => {
    installTestWindow()
    let notificationHandler: ((notification: { method: string; params?: unknown }) => void) | undefined
    gatewayMocks.subscribeCodexNotifications.mockImplementation((handler) => {
      notificationHandler = handler as typeof notificationHandler
      return vi.fn()
    })
    gatewayMocks.listHooks.mockResolvedValue([{ cwd: '/repo', hooks: [], warnings: [], errors: [] }])
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])

    const state = useDesktopState()
    await state.refreshHooks()
    expect(gatewayMocks.listHooks).toHaveBeenCalledTimes(1)

    state.startPolling()
    expect(notificationHandler).toBeDefined()
    notificationHandler!({ method: 'hook/started' })
    await Promise.resolve()
    await Promise.resolve()
    notificationHandler!({ method: 'hook/completed' })
    await Promise.resolve()
    await Promise.resolve()

    expect(gatewayMocks.listHooks).toHaveBeenCalledTimes(3)
    expect(state.hooksList.value).toEqual([{ cwd: '/repo', hooks: [], warnings: [], errors: [] }])
  })

  it('keeps previous hooks when the refresh fails', async () => {
    installTestWindow()
    gatewayMocks.listHooks
      .mockResolvedValueOnce([{ cwd: '/repo', hooks: [{ event: 'PreToolUse', command: 'pre.sh', timeout: null, enabled: null }], warnings: [], errors: [] }])
      .mockRejectedValueOnce(new Error('boom'))

    const state = useDesktopState()
    await state.refreshHooks()
    await state.refreshHooks({ force: true })

    expect(state.hooksList.value).toEqual([
      { cwd: '/repo', hooks: [{ event: 'PreToolUse', command: 'pre.sh', timeout: null, enabled: null }], warnings: [], errors: [] },
    ])
    expect(state.isHooksLoading.value).toBe(false)
  })
})

describe('rollbackSelectedThread interrupts an in-flight turn first', () => {
  function installRollbackState(threadId: string, options: { inProgress: boolean; activeTurnId: string }) {
    installTestWindow()
    gatewayMocks.subscribeCodexNotifications.mockImplementation(() => vi.fn())
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.getThreadDetail.mockResolvedValue({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'do the thing',
          messageType: 'userMessage',
          turnId: 'turn-1',
          turnIndex: 0,
        },
        {
          id: 'agent-1',
          role: 'assistant',
          text: options.inProgress ? 'working...' : 'done',
          messageType: 'agentMessage',
          turnId: 'turn-2',
          turnIndex: 1,
        },
      ],
      inProgress: options.inProgress,
      activeTurnId: options.activeTurnId,
      turnIndexByTurnId: { 'turn-1': 0, 'turn-2': 1 },
      hasMoreOlder: false,
    })
    gatewayMocks.interruptThreadTurn.mockResolvedValue(null)
    gatewayMocks.resumeThread.mockResolvedValue(null)
    gatewayMocks.rollbackThread.mockResolvedValue([
      {
        id: 'user-1',
        role: 'user',
        text: 'do the thing',
        messageType: 'userMessage',
        turnId: 'turn-1',
        turnIndex: 0,
      },
    ])
    const state = useDesktopState()
    state.primeSelectedThread(threadId)
    return state
  }

  it('stops the active turn before rolling back when the thread is in progress', async () => {
    const state = installRollbackState('thread-rollback', { inProgress: true, activeTurnId: 'turn-2' })
    await state.loadMessages('thread-rollback')

    await state.rollbackSelectedThread('turn-1')

    expect(gatewayMocks.interruptThreadTurn).toHaveBeenCalledWith('thread-rollback', 'turn-2')
    expect(gatewayMocks.rollbackThread).toHaveBeenCalledWith('thread-rollback', 2)
  })

  it('skips the interrupt and rolls back directly when the thread is idle', async () => {
    const state = installRollbackState('thread-rollback-idle', { inProgress: false, activeTurnId: '' })
    await state.loadMessages('thread-rollback-idle')

    await state.rollbackSelectedThread('turn-1')

    expect(gatewayMocks.interruptThreadTurn).not.toHaveBeenCalled()
    expect(gatewayMocks.rollbackThread).toHaveBeenCalledWith('thread-rollback-idle', 2)
  })
})

describe('interruptSelectedThreadTurn removes the unsubmitted turn locally', () => {
  function installInterruptState(threadId: string) {
    // 预置一条属于 turn-1 的 thinking 存档：中断后应随该 turn 一并移除
    installTestWindow({
      'codex-web-local.thread-reasoning.v1': JSON.stringify({
        [threadId]: [
          {
            id: 'reasoning:local:interrupt:1',
            role: 'system',
            text: 'thinking for the interrupted turn',
            messageType: 'reasoning',
            reasoning: { summary: [], content: ['thinking for the interrupted turn'] },
            turnId: 'turn-1',
            turnIndex: 0,
          },
        ],
      }),
    })
    gatewayMocks.subscribeCodexNotifications.mockImplementation(() => vi.fn())
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.interruptThreadTurn.mockResolvedValue(null)
    gatewayMocks.resumeThread.mockResolvedValue(null)
    // 第一次 thread/read：turn-1 仅含用户消息（无 agent 输出）→ 中断判定成立；
    // 第二次（中断后强制刷新）：服务端已把 turn-1 整体移除
    gatewayMocks.getThreadDetail
      .mockResolvedValueOnce({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            text: 'do the thing',
            messageType: 'userMessage',
            turnId: 'turn-1',
            turnIndex: 0,
          },
        ],
        inProgress: true,
        activeTurnId: 'turn-1',
        turnIndexByTurnId: { 'turn-1': 0 },
        hasMoreOlder: false,
      })
      .mockResolvedValueOnce({
        messages: [],
        inProgress: false,
        activeTurnId: '',
        turnIndexByTurnId: {},
        hasMoreOlder: false,
      })
    const state = useDesktopState()
    state.primeSelectedThread(threadId)
    return state
  }

  it('drops the interrupted turn messages and thinking archive, and fills the composer payload', async () => {
    const state = installInterruptState('thread-interrupt')
    await state.loadMessages('thread-interrupt')
    expect(state.messages.value.some((message) => message.id === 'user-1')).toBe(true)

    await state.interruptSelectedThreadTurn()

    expect(gatewayMocks.interruptThreadTurn).toHaveBeenCalledWith('thread-interrupt', 'turn-1')
    // 需求 1：中断后消息列表不再残留被中断的用户消息
    expect(state.messages.value.some((message) => message.id === 'user-1')).toBe(false)
    // 被移除 turn 的思考存档一并清理
    expect(state.messages.value.some((message) => message.messageType === 'reasoning' && message.turnId === 'turn-1')).toBe(false)
    // 回填输入框的载荷保留原消息文本
    expect(state.interruptedUnsubmittedMessage.value?.text).toBe('do the thing')
  })

  it('keeps persisted turns untouched when interrupting a turn that produced agent output', async () => {
    installTestWindow()
    gatewayMocks.subscribeCodexNotifications.mockImplementation(() => vi.fn())
    gatewayMocks.getPendingServerRequests.mockResolvedValue([])
    gatewayMocks.getThreadGroupsPage.mockResolvedValue({ groups: [], nextCursor: null })
    gatewayMocks.interruptThreadTurn.mockResolvedValue(null)
    gatewayMocks.resumeThread.mockResolvedValue(null)
    // turn-1 已有 agent 输出（命令执行）：中断不会移除该 turn
    gatewayMocks.getThreadDetail
      .mockResolvedValueOnce({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            text: 'do the thing',
            messageType: 'userMessage',
            turnId: 'turn-1',
            turnIndex: 0,
          },
          {
            id: 'cmd-1',
            role: 'system',
            text: '',
            messageType: 'commandExecution',
            turnId: 'turn-1',
            turnIndex: 0,
            commandExecution: { command: 'ls', status: 'completed', exitCode: 0, aggregatedOutput: '' },
          },
        ],
        inProgress: true,
        activeTurnId: 'turn-1',
        turnIndexByTurnId: { 'turn-1': 0 },
        hasMoreOlder: false,
      })
      .mockResolvedValueOnce({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            text: 'do the thing',
            messageType: 'userMessage',
            turnId: 'turn-1',
            turnIndex: 0,
          },
        ],
        inProgress: false,
        activeTurnId: '',
        turnIndexByTurnId: { 'turn-1': 0 },
        hasMoreOlder: false,
      })
    const state = useDesktopState()
    state.primeSelectedThread('thread-interrupt-agent')
    await state.loadMessages('thread-interrupt-agent')

    await state.interruptSelectedThreadTurn()

    // 有 agent 输出时不判定为「未提交 turn」：不回填、不移除消息
    expect(state.interruptedUnsubmittedMessage.value).toBeNull()
    expect(state.messages.value.some((message) => message.id === 'user-1')).toBe(true)
  })
})

describe('message stream merge helpers', () => {
  function persistedMessage(id: string, role: 'user' | 'assistant' | 'system', turnIndex: number | undefined, extra: Record<string, unknown> = {}) {
    return { id, role, text: id, turnIndex, ...extra } as Parameters<typeof mergePersistedReasoning>[0][number]
  }

  it('inserts persisted reasoning after the user message of its turn', () => {
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('a1', 'assistant', 0),
      persistedMessage('u2', 'user', 1),
      persistedMessage('a2', 'assistant', 1),
    ]
    const reasoning = [
      persistedMessage('r1', 'system', 0, { messageType: 'reasoning' }),
      persistedMessage('r2', 'system', 1, { messageType: 'reasoning' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'r1', 'a1', 'u2', 'r2', 'a2'])
  })

  it('keeps multiple reasoning messages of one turn in archive order', () => {
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('a1', 'assistant', 0),
    ]
    const reasoning = [
      persistedMessage('r1', 'system', 0, { messageType: 'reasoning' }),
      persistedMessage('r2', 'system', 0, { messageType: 'reasoning' }),
      persistedMessage('r3', 'system', 0, { messageType: 'reasoning' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'r1', 'r2', 'r3', 'a1'])
  })

  it('interleaves anchored reasoning after its preceding tool/command message', () => {
    // round-23：思考项带时序锚点（reasoningAnchorMessageId）时插到对应
    // 工具/命令之后，实现「提问 -> 思考 -> 工具 -> 思考 -> 回复」的真实时序。
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('cmd1', 'system', 0, { messageType: 'commandExecution' }),
      persistedMessage('cmd2', 'system', 0, { messageType: 'commandExecution' }),
      persistedMessage('a1', 'assistant', 0),
    ]
    const reasoning = [
      persistedMessage('r1', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'u1' }),
      persistedMessage('r2', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'cmd1' }),
      persistedMessage('r3', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'cmd2' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'r1', 'cmd1', 'r2', 'cmd2', 'r3', 'a1'])
  })

  it('matches reasoning anchors against session-cmd-prefixed persisted command ids', () => {
    // round-26：live 阶段 item/started 的 commandExecution id 是 `call_*`，持久化
    // 后 app-server 加 `session-cmd-` 前缀；存档的锚点是 live id，若不兼容前缀
    // 会找不到锚点 → 回退轮首 → 刷新后全部思考堆到每轮开头。
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('session-cmd-call_abc', 'system', 0, { messageType: 'commandExecution' }),
      persistedMessage('a1', 'assistant', 0),
    ]
    const reasoning = [
      persistedMessage('r1', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'call_abc' }),
      persistedMessage('r2', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'session-cmd-call_abc' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'session-cmd-call_abc', 'r1', 'r2', 'a1'])
  })

  it('falls back to turn placement when the anchor message is missing', () => {
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('a1', 'assistant', 0),
    ]
    const reasoning = [
      persistedMessage('r1', 'system', 0, { messageType: 'reasoning', reasoningAnchorMessageId: 'gone-tool' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'r1', 'a1'])
  })

  it('appends reasoning without a matching turn to the end', () => {
    const persisted = [
      persistedMessage('u1', 'user', 0),
      persistedMessage('a1', 'assistant', 0),
    ]
    const reasoning = [
      persistedMessage('rNoTurn', 'system', undefined, { messageType: 'reasoning' }),
      persistedMessage('rOtherTurn', 'system', 5, { messageType: 'reasoning' }),
    ]
    const merged = mergePersistedReasoning(persisted, reasoning)
    expect(merged.map((message) => message.id)).toEqual(['u1', 'a1', 'rNoTurn', 'rOtherTurn'])
  })

  it('interleaves live messages by first-seen arrival order', () => {
    const liveCommands = [
      persistedMessage('cmd2', 'system', 0, { messageType: 'commandExecution' }),
    ]
    const liveAgent = [
      persistedMessage('agent1', 'assistant', 0, { messageType: 'agentMessage.live' }),
      persistedMessage('agent3', 'assistant', 0, { messageType: 'agentMessage.live' }),
    ]
    // 到达顺序：agent1 先到（上一轮 computed 已注册），随后 cmd2、agent3。
    mergeLiveMessages('thread-x', [[], [], [], [liveAgent[0]]], [])
    const merged = mergeLiveMessages('thread-x', [[], liveCommands, [], liveAgent], [])
    expect(merged.map((message) => message.id)).toEqual(['agent1', 'cmd2', 'agent3'])
  })

  it('drops live messages whose id already exists in persisted', () => {
    const persisted = [persistedMessage('cmd1', 'system', 0, { messageType: 'commandExecution' })]
    const live = [persistedMessage('cmd1', 'system', 0, { messageType: 'commandExecution' })]
    const merged = mergeLiveMessages('thread-y', [live], persisted)
    expect(merged.map((message) => message.id)).toEqual([])
  })
})
