import { computed, ref, watch } from 'vue'
import type { UiLiveOverlay, UiMessage } from '../../types/codex'

export interface CommandExecutionDisplayDeps {
  getMessages: () => UiMessage[]
  getLiveOverlay: () => UiLiveOverlay | null
  isCommandMessage: (message: UiMessage) => boolean
}

export function createCommandExecutionDisplay(deps: CommandExecutionDisplayDeps) {
  const { getMessages, getLiveOverlay, isCommandMessage } = deps

  const expandedCommandIds = ref<Set<string>>(new Set())
  const collapsedAutoCommandIds = ref<Set<string>>(new Set())

  const activeCommandMessageId = computed(() => {
    const messages = getMessages()
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.messageType === 'commandExecution' && message.commandExecution?.status === 'inProgress') {
        return message.id
      }
    }
    return ''
  })

  const hasLiveAssistantText = computed(() =>
    getMessages().some((message) =>
      message.role === 'assistant' &&
      message.messageType === 'agentMessage.live' &&
      message.text.trim().length > 0,
    ),
  )

  const isLiveTurnRuntime = computed(() =>
    Boolean(getLiveOverlay()) || activeCommandMessageId.value.length > 0 || hasLiveAssistantText.value,
  )

  const groupedCommandsByLatestId = computed<Record<string, UiMessage[]>>(() => {
    const messages = getMessages()
    const next: Record<string, UiMessage[]> = {}
    for (let index = 0; index < messages.length;) {
      const message = messages[index]
      if (!isCommandMessage(message)) {
        index += 1
        continue
      }

      const block: UiMessage[] = []
      while (index < messages.length && isCommandMessage(messages[index])) {
        block.push(messages[index])
        index += 1
      }

      if (block.length <= 1) continue
      const latest = block[block.length - 1]
      next[latest.id] = block.slice(0, -1)
    }
    return next
  })

  const hiddenGroupedCommandIds = computed(() => {
    const next = new Set<string>()
    for (const commands of Object.values(groupedCommandsByLatestId.value)) {
      for (const command of commands) {
        next.add(command.id)
      }
    }
    return next
  })

  function isCommandAutoExpanded(message: UiMessage): boolean {
    return !hasLiveAssistantText.value && message.id === activeCommandMessageId.value
  }

  function isCommandExpanded(message: UiMessage): boolean {
    if (!isCommandMessage(message)) return false
    return expandedCommandIds.value.has(message.id)
      || (!collapsedAutoCommandIds.value.has(message.id) && isCommandAutoExpanded(message))
  }

  function isCommandCompact(message: UiMessage): boolean {
    return isCommandMessage(message) && isLiveTurnRuntime.value
  }

  function isCommandOutputCondensed(message: UiMessage): boolean {
    return isCommandMessage(message) && (isLiveTurnRuntime.value || message.commandExecution?.status === 'inProgress')
  }

  function toggleCommandExpand(message: UiMessage): void {
    if (!isCommandMessage(message)) return

    const nextExpanded = new Set(expandedCommandIds.value)
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    const isAutoExpanded = isCommandAutoExpanded(message)
    const isManuallyExpanded = nextExpanded.has(message.id)

    if (isManuallyExpanded) {
      nextExpanded.delete(message.id)
      if (isAutoExpanded) nextCollapsedAuto.add(message.id)
    } else if (isAutoExpanded && !nextCollapsedAuto.has(message.id)) {
      nextCollapsedAuto.add(message.id)
    } else {
      nextExpanded.add(message.id)
      nextCollapsedAuto.delete(message.id)
    }

    expandedCommandIds.value = nextExpanded
    collapsedAutoCommandIds.value = nextCollapsedAuto
  }

  function getGroupedCommandsForLatest(message: UiMessage): UiMessage[] {
    return groupedCommandsByLatestId.value[message.id] ?? []
  }

  function getWorkBlockCommands(message: UiMessage): UiMessage[] {
    if (!isCommandMessage(message)) return []
    return [...getGroupedCommandsForLatest(message), message]
  }

  function prune(source: Set<string>, validIds: Set<string>): Set<string> {
    if (source.size === 0) return source
    const next = new Set<string>()
    for (const id of source) {
      if (validIds.has(id)) next.add(id)
    }
    return next.size === source.size ? source : next
  }

  function pruneCommandIdSets(validIds: Set<string>): void {
    expandedCommandIds.value = prune(expandedCommandIds.value, validIds)
    collapsedAutoCommandIds.value = prune(collapsedAutoCommandIds.value, validIds)
  }

  watch(activeCommandMessageId, (nextId, prevId) => {
    if (!prevId || prevId === nextId) return
    if (!collapsedAutoCommandIds.value.has(prevId)) return
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    nextCollapsedAuto.delete(prevId)
    collapsedAutoCommandIds.value = nextCollapsedAuto
  })

  return {
    expandedCommandIds,
    collapsedAutoCommandIds,
    activeCommandMessageId,
    hasLiveAssistantText,
    isLiveTurnRuntime,
    groupedCommandsByLatestId,
    hiddenGroupedCommandIds,
    isCommandAutoExpanded,
    isCommandExpanded,
    isCommandCompact,
    isCommandOutputCondensed,
    toggleCommandExpand,
    getGroupedCommandsForLatest,
    getWorkBlockCommands,
    pruneCommandIdSets,
  }
}