import { computed, ref } from 'vue'
import type { UiLiveOverlay, UiMessage } from '../../types/codex'

export interface CommandExecutionDisplayDeps {
  getMessages: () => UiMessage[]
  getLiveOverlay: () => UiLiveOverlay | null
  isCommandMessage: (message: UiMessage) => boolean
}

export function createCommandExecutionDisplay(deps: CommandExecutionDisplayDeps) {
  const { getMessages, getLiveOverlay, isCommandMessage } = deps

  const expandedCommandIds = ref<Set<string>>(new Set())

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

  // 命令块不自动展开：新命令到达时若自动展开，随后旁白文本/状态变化会立刻收起，
  // 造成「先弹出黑色输出块再缩回」的列表闪烁。保持收起，点击才展开。
  function isCommandExpanded(message: UiMessage): boolean {
    return isCommandMessage(message) && expandedCommandIds.value.has(message.id)
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
    if (nextExpanded.has(message.id)) {
      nextExpanded.delete(message.id)
    } else {
      nextExpanded.add(message.id)
    }
    expandedCommandIds.value = nextExpanded
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
  }

  return {
    expandedCommandIds,
    activeCommandMessageId,
    hasLiveAssistantText,
    isLiveTurnRuntime,
    groupedCommandsByLatestId,
    hiddenGroupedCommandIds,
    isCommandExpanded,
    isCommandCompact,
    isCommandOutputCondensed,
    toggleCommandExpand,
    getGroupedCommandsForLatest,
    getWorkBlockCommands,
    pruneCommandIdSets,
  }
}