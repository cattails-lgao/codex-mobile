import { computed, ref } from 'vue'
import type { UiFileChange, UiMessage } from '../../types/codex'
import {
  aggregateFileChanges,
  buildDiffViewerLines,
  fileChangeKey,
  type DiffViewerLine,
  type TurnFileChangeSummary,
} from '../../utils/conversationFileChanges'

export interface FileChangeSummariesDeps {
  getMessages: () => UiMessage[]
  getLiveTurnId: () => string
  isFileChangeMessage: (message: UiMessage) => boolean
  isCopyableAssistantMessage: (message: UiMessage) => boolean
  isReasoningMessage: (message: UiMessage) => boolean
  isPlanMessage: (message: UiMessage) => boolean
  isFoldMember: (message: UiMessage) => boolean
  getHiddenGroupedCommandIds: () => ReadonlySet<string>
  isMobile: () => boolean
}

function pruneIdSet(source: Set<string>, validIds: Set<string>): Set<string> {
  if (source.size === 0) return source
  const next = new Set<string>()
  for (const id of source) {
    if (validIds.has(id)) next.add(id)
  }
  return next.size === source.size ? source : next
}

export function createFileChangeSummaries(deps: FileChangeSummariesDeps) {
  const {
    getMessages,
    getLiveTurnId,
    isFileChangeMessage,
    isCopyableAssistantMessage,
    isReasoningMessage,
    isPlanMessage,
    isFoldMember,
    getHiddenGroupedCommandIds,
    isMobile,
  } = deps

  const expandedFileChangeSummaryIds = ref<Set<string>>(new Set())
  const activeDiffViewerSummary = ref<TurnFileChangeSummary | null>(null)
  const activeDiffViewerChangeKey = ref('')
  const isDiffViewerFileListOpen = ref(false)

  const anchoredFileChangeSummaryByAnchorId = computed<Record<string, TurnFileChangeSummary>>(() => {
    const anchorIdByTurnKey = new Map<string, string>()
    const assistantSummaryByAnchorId = new Map<string, TurnFileChangeSummary>()
    const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

    // round-24：fileChange 汇总块在「当前会话轮结束后展示在最后」——锚点从
    // 「该轮最后一个 assistant 文本」改为「该轮最后一条实质渲染消息」（命令/
    // 工具/assistant 文本均可），这样 fileChange 块总是落在轮末而不是嵌在
    // 回复卡片中间。plan 被 filteredMessages 过滤、旧命令被分组/fold 隐藏、
    // fileChange 自身与 reasoning 不作为锚点。
    const isAnchorCandidate = (message: UiMessage): boolean =>
      !isFileChangeMessage(message)
      && !isReasoningMessage(message)
      && !isPlanMessage(message)
      && !getHiddenGroupedCommandIds().has(message.id)
      && !isFoldMember(message)

    for (const message of getMessages()) {
      const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
      if (isAnchorCandidate(message)) {
        anchorIdByTurnKey.set(turnKey, message.id)
      }

      if (isCopyableAssistantMessage(message) && typeof message.turnIndex === 'number') {
        if (Array.isArray(message.fileChanges) && message.fileChanges.length > 0) {
          assistantSummaryByAnchorId.set(message.id, {
            changes: aggregateFileChanges(message.fileChanges),
            sourceMessageIds: [],
            source: 'assistant',
            turnId: message.turnId ?? '',
          })
        }
      }

      if (!isFileChangeMessage(message)) continue
      const current = fileChangeMessagesByTurnKey.get(turnKey)
      if (current) current.push(message)
      else fileChangeMessagesByTurnKey.set(turnKey, [message])
    }

    const summaries: Record<string, TurnFileChangeSummary> = {}
    for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
      const anchorId = anchorIdByTurnKey.get(turnKey)
      if (!anchorId) continue
      const assistantTurnId = assistantSummaryByAnchorId.get(anchorId)?.turnId ?? ''
      summaries[anchorId] = {
        changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
        sourceMessageIds: messages.map((message) => message.id),
        source: 'metadata',
        turnId: messages.find((message) => typeof message.turnId === 'string' && message.turnId.length > 0)?.turnId ?? assistantTurnId,
      }
    }

    for (const [anchorId, summary] of assistantSummaryByAnchorId.entries()) {
      if (!summaries[anchorId]) {
        summaries[anchorId] = summary
      }
    }

    return summaries
  })

  const standaloneFileChangeSummaryByMessageId = computed<Record<string, TurnFileChangeSummary>>(() => {
    const fileChangeMessagesByTurnKey = new Map<string, UiMessage[]>()

    // round-24：anchored 锚点已放宽到「轮末任意实质消息」，几乎所有轮次都能
    // 锚定；standalone 仅兜底 anchored 覆盖不到的情况（轮内没有任何可锚定
    // 消息）。因此跳过条件从「有 assistant 文本」改为「该轮 fileChange 消息
    // 已被 anchored 聚合覆盖」。
    const anchoredSourceIds = new Set<string>()
    for (const summary of Object.values(anchoredFileChangeSummaryByAnchorId.value)) {
      for (const sourceMessageId of summary.sourceMessageIds) {
        anchoredSourceIds.add(sourceMessageId)
      }
    }

    for (const message of getMessages()) {
      if (!isFileChangeMessage(message)) continue
      const turnKey = typeof message.turnIndex === 'number' ? `turn:${message.turnIndex}` : `message:${message.id}`
      const current = fileChangeMessagesByTurnKey.get(turnKey)
      if (current) current.push(message)
      else fileChangeMessagesByTurnKey.set(turnKey, [message])
    }

    const summaries: Record<string, TurnFileChangeSummary> = {}
    for (const [turnKey, messages] of fileChangeMessagesByTurnKey.entries()) {
      if (messages.some((message) => anchoredSourceIds.has(message.id))) continue
      const visibleMessage = messages[messages.length - 1]
      if (!visibleMessage) continue
      summaries[visibleMessage.id] = {
        changes: aggregateFileChanges(messages.flatMap((message) => message.fileChanges ?? [])),
        sourceMessageIds: messages.map((message) => message.id),
        source: 'metadata',
        turnId: visibleMessage.turnId ?? messages.find((message) => typeof message.turnId === 'string' && message.turnId.length > 0)?.turnId ?? '',
      }
    }

    return summaries
  })

  const hiddenFileChangeMessageIds = computed(() => {
    const next = new Set<string>()
    for (const summary of Object.values(anchoredFileChangeSummaryByAnchorId.value)) {
      for (const messageId of summary.sourceMessageIds) {
        next.add(messageId)
      }
    }
    for (const [messageId, summary] of Object.entries(standaloneFileChangeSummaryByMessageId.value)) {
      for (const sourceMessageId of summary.sourceMessageIds) {
        if (sourceMessageId !== messageId) {
          next.add(sourceMessageId)
        }
      }
    }
    return next
  })

  const diffViewerChanges = computed<UiFileChange[]>(() => activeDiffViewerSummary.value?.changes ?? [])

  const activeDiffViewerChange = computed<UiFileChange | null>(() => {
    const changes = diffViewerChanges.value
    if (changes.length === 0) return null
    return changes.find((change) => fileChangeKey(change) === activeDiffViewerChangeKey.value) ?? changes[0]
  })

  const activeDiffViewerLines = computed<DiffViewerLine[]>(() => buildDiffViewerLines(activeDiffViewerChange.value))

  function toggleFileChangeSummary(message: UiMessage): void {
    const next = new Set(expandedFileChangeSummaryIds.value)
    if (next.has(message.id)) next.delete(message.id)
    else next.add(message.id)
    expandedFileChangeSummaryIds.value = next
  }

  function isFileChangeSummaryExpanded(message: UiMessage): boolean {
    return expandedFileChangeSummaryIds.value.has(message.id)
  }

  function openDiffViewer(summary: TurnFileChangeSummary | null, change: UiFileChange): void {
    if (!summary) return
    activeDiffViewerSummary.value = summary
    activeDiffViewerChangeKey.value = fileChangeKey(change)
    isDiffViewerFileListOpen.value = false
  }

  function closeDiffViewer(): void {
    activeDiffViewerSummary.value = null
    activeDiffViewerChangeKey.value = ''
    isDiffViewerFileListOpen.value = false
  }

  function toggleDiffViewerFileList(): void {
    isDiffViewerFileListOpen.value = !isDiffViewerFileListOpen.value
  }

  function closeDiffViewerFileList(): void {
    isDiffViewerFileListOpen.value = false
  }

  function selectDiffViewerChange(change: UiFileChange): void {
    activeDiffViewerChangeKey.value = fileChangeKey(change)
    if (isMobile()) {
      isDiffViewerFileListOpen.value = false
    }
  }

  function readAnchoredFileChangeSummaryById(messageId: string): TurnFileChangeSummary | null {
    return anchoredFileChangeSummaryByAnchorId.value[messageId] ?? null
  }

  function isFileChangeSummaryExpandedById(messageId: string): boolean {
    return expandedFileChangeSummaryIds.value.has(messageId)
  }

  function toggleFileChangeSummaryById(messageId: string): void {
    const message = getMessages().find((candidate) => candidate.id === messageId)
    if (message) toggleFileChangeSummary(message)
  }

  function readAnchoredFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
    return readAnchoredFileChangeSummaryById(message.id)
  }

  function readStandaloneFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
    return standaloneFileChangeSummaryByMessageId.value[message.id] ?? null
  }

  function isFileChangeSummaryVisible(summary: TurnFileChangeSummary | null): boolean {
    if (!summary) return false
    const liveTurnId = getLiveTurnId()
    if (!liveTurnId) return true
    return (summary.turnId ?? '') !== liveTurnId
  }

  function pruneFileChangeSummaryIds(): void {
    const validIds = new Set([
      ...Object.keys(anchoredFileChangeSummaryByAnchorId.value),
      ...Object.keys(standaloneFileChangeSummaryByMessageId.value),
    ])
    expandedFileChangeSummaryIds.value = pruneIdSet(expandedFileChangeSummaryIds.value, validIds)
  }

  return {
    anchoredFileChangeSummaryByAnchorId,
    standaloneFileChangeSummaryByMessageId,
    hiddenFileChangeMessageIds,
    isDiffViewerFileListOpen,
    diffViewerChanges,
    activeDiffViewerChange,
    activeDiffViewerLines,
    toggleFileChangeSummary,
    isFileChangeSummaryExpanded,
    openDiffViewer,
    closeDiffViewer,
    toggleDiffViewerFileList,
    closeDiffViewerFileList,
    selectDiffViewerChange,
    readAnchoredFileChangeSummaryById,
    isFileChangeSummaryExpandedById,
    toggleFileChangeSummaryById,
    readAnchoredFileChangeSummary,
    readStandaloneFileChangeSummary,
    isFileChangeSummaryVisible,
    pruneFileChangeSummaryIds,
  }
}