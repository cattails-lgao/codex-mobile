import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillInfo, UiHooksListEntry } from '../api/codexGateway'

const gatewayMocks = vi.hoisted(() => ({
  getSkillsList: vi.fn(),
  listHooks: vi.fn(),
}))

vi.mock('../api/codexGateway', () => gatewayMocks)

import { createDesktopCatalogs } from './useDesktopCatalogs'

const skill = (name: string): SkillInfo => ({
  name,
  description: `${name} description`,
  path: `/skills/${name}/SKILL.md`,
  scope: 'user',
  enabled: true,
})

const hooks: UiHooksListEntry[] = [
  {
    cwd: '/repo',
    hooks: [{ event: 'PreToolUse', command: 'pre.sh', timeout: null, enabled: true }],
    warnings: [],
    errors: [],
  },
]

describe('createDesktopCatalogs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    gatewayMocks.getSkillsList.mockReset()
    gatewayMocks.listHooks.mockReset()
  })

  it('reuses a recent skills load for the same cwd and reloads when cwd changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    let selectedCwd = '/repo-a'
    gatewayMocks.getSkillsList
      .mockResolvedValueOnce([skill('alpha')])
      .mockResolvedValueOnce([skill('beta')])
    const state = createDesktopCatalogs({ getSelectedCwd: () => selectedCwd })

    await state.refreshSkills()
    await state.refreshSkills()
    expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.getSkillsList).toHaveBeenLastCalledWith(['/repo-a'])
    expect(state.installedSkills.value).toEqual([skill('alpha')])

    selectedCwd = '/repo-b'
    await state.refreshSkills()
    expect(gatewayMocks.getSkillsList).toHaveBeenCalledTimes(2)
    expect(gatewayMocks.getSkillsList).toHaveBeenLastCalledWith(['/repo-b'])
    expect(state.installedSkills.value).toEqual([skill('beta')])
  })

  it('force-refreshes skills for the same cwd and uses the global request without a cwd', async () => {
    let selectedCwd = ' /repo '
    gatewayMocks.getSkillsList.mockResolvedValue([])
    const state = createDesktopCatalogs({ getSelectedCwd: () => selectedCwd })

    await state.refreshSkills()
    await state.refreshSkills({ force: true })
    selectedCwd = '   '
    await state.refreshSkills()

    expect(gatewayMocks.getSkillsList.mock.calls).toEqual([
      [['/repo']],
      [['/repo']],
      [undefined],
    ])
  })

  it('reuses in-flight hook loads', async () => {
    let resolveHooks: ((value: UiHooksListEntry[]) => void) | undefined
    gatewayMocks.listHooks.mockImplementationOnce(() => new Promise((resolve) => {
      resolveHooks = resolve
    }))
    const state = createDesktopCatalogs({ getSelectedCwd: () => '' })

    const first = state.refreshHooks()
    const second = state.refreshHooks({ force: true })
    expect(gatewayMocks.listHooks).toHaveBeenCalledTimes(1)
    expect(state.isHooksLoading.value).toBe(true)

    resolveHooks?.(hooks)
    await Promise.all([first, second])
    expect(state.hooksList.value).toEqual(hooks)
    expect(state.isHooksLoading.value).toBe(false)
  })

  it('keeps previous hooks and restores loading state after a failed forced refresh', async () => {
    gatewayMocks.listHooks
      .mockResolvedValueOnce(hooks)
      .mockRejectedValueOnce(new Error('offline'))
    const state = createDesktopCatalogs({ getSelectedCwd: () => '' })

    await state.refreshHooks()
    await state.refreshHooks()
    await state.refreshHooks({ force: true })

    expect(gatewayMocks.listHooks).toHaveBeenCalledTimes(2)
    expect(state.hooksList.value).toEqual(hooks)
    expect(state.isHooksLoading.value).toBe(false)
  })
})
