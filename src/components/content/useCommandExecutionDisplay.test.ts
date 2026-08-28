import { describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { UiMessage } from '../../types/codex'
import { createCommandExecutionDisplay, type CommandExecutionDisplayDeps } from './useCommandExecutionDisplay'

function command(id: string, status: 'inProgress' | 'completed' = 'completed'): UiMessage {
  return { id, messageType: 'commandExecution', commandExecution: { status } } as unknown as UiMessage
}

function liveAssistant(id: string): UiMessage {
  return { id, role: 'assistant', messageType: 'agentMessage.live', text: 'working' } as UiMessage
}

function depsFor(messages: UiMessage[], liveOverlay: unknown = null): ReturnType<typeof createCommandExecutionDisplay> {
  const deps: CommandExecutionDisplayDeps = {
    getMessages: () => messages,
    getLiveOverlay: () => liveOverlay as never,
    isCommandMessage: (m) => m.messageType === 'commandExecution' && Boolean(m.commandExecution),
  }
  return createCommandExecutionDisplay(deps)
}

describe('useCommandExecutionDisplay', () => {
  it('tracks the latest in-progress command message id', () => {
    expect(depsFor([command('c1', 'completed'), command('c2', 'inProgress')]).activeCommandMessageId.value).toBe('c2')
    expect(depsFor([command('c1', 'completed')]).activeCommandMessageId.value).toBe('')
  })

  it('groups consecutive commands by their latest id and hides the packed earlier rows', () => {
    const fork = depsFor([command('c1'), command('c2'), command('c3'), liveAssistant('a1'), command('c4')])

    expect(fork.groupedCommandsByLatestId.value).toEqual({ c3: [command('c1'), command('c2')] })
    expect([...fork.hiddenGroupedCommandIds.value].sort()).toEqual(['c1', 'c2'])
  })

  it('builds the work-block command list from grouped + latest', () => {
    const fork = depsFor([command('c1'), command('c2')])

    expect(fork.getGroupedCommandsForLatest(command('c2'))).toEqual([command('c1')])
    expect(fork.getWorkBlockCommands(command('c2'))).toEqual([command('c1'), command('c2')])
    expect(fork.getWorkBlockCommands(liveAssistant('a1'))).toEqual([])
  })

  it('auto-expands the active command until manually collapsed', () => {
    const fork = depsFor([command('c1', 'inProgress')])

    expect(fork.isCommandExpanded(command('c1'))).toBe(true)

    fork.toggleCommandExpand(command('c1'))
    expect(fork.isCommandExpanded(command('c1'))).toBe(false)

    fork.toggleCommandExpand(command('c1'))
    expect(fork.isCommandExpanded(command('c1'))).toBe(true)
  })

  it('compresses command rows and condenses output during a live turn', () => {
    const live = depsFor([command('c1')], { id: 'overlay' })
    expect(live.isCommandCompact(command('c1'))).toBe(true)
    expect(live.isCommandOutputCondensed(command('c1'))).toBe(true)

    const idle = depsFor([command('c1', 'completed')])
    expect(idle.isCommandCompact(command('c1'))).toBe(false)
    expect(idle.isCommandOutputCondensed(command('c1'))).toBe(false)
  })

  it('condenses output for an in-progress command even without a live overlay', () => {
    const fork = depsFor([command('c1', 'inProgress')])
    expect(fork.isCommandOutputCondensed(command('c1'))).toBe(true)
  })

  it('prunes stale ids from both expansion sets while keeping valid ones', () => {
    const fork = depsFor([])
    fork.expandedCommandIds.value = new Set(['a', 'b'])
    fork.collapsedAutoCommandIds.value = new Set(['a', 'c'])

    fork.pruneCommandIdSets(new Set(['a', 'c']))

    expect([...fork.expandedCommandIds.value]).toEqual(['a'])
    expect([...fork.collapsedAutoCommandIds.value].sort()).toEqual(['a', 'c'])
  })

  it('resets auto-collapse when the active command id changes', async () => {
    const messages = reactive<UiMessage[]>([command('c1', 'inProgress')])
    const fork = depsFor(messages)
    fork.toggleCommandExpand(command('c1'))
    expect(fork.isCommandExpanded(command('c1'))).toBe(false)

    messages[0] = command('c1', 'completed')
    messages.push(command('c2', 'inProgress'))
    await nextTick()
    expect(fork.collapsedAutoCommandIds.value.has('c1')).toBe(false)
  })
})