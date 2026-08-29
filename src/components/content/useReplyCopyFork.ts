import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import type { UiMessage, UiPlanStep } from '../../types/codex'
import type { TurnFileChangeSummary } from '../../utils/conversationFileChanges'
import { readPlanData } from '../../utils/plan'
import { copyTextToClipboard, copyTextWithSelectionFallback } from '../../utils/clipboard'

export interface ReplyCopyForkDeps {
  getMessages: () => UiMessage[]
  isCopyableAssistantMessage: (message: UiMessage) => boolean
  isPlanMessage: (message: UiMessage) => boolean
  planStepCopyMarker: (status: UiPlanStep['status']) => string
  buildFileChangeCopyText: (summary: TurnFileChangeSummary | null) => string
  getAnchoredFileChangeSummaries: () => Record<string, TurnFileChangeSummary>
}

export function createReplyCopyFork(deps: ReplyCopyForkDeps) {
  const {
    getMessages,
    isCopyableAssistantMessage,
    isPlanMessage,
    planStepCopyMarker,
    buildFileChangeCopyText,
    getAnchoredFileChangeSummaries,
  } = deps

  const copiedResponseAnchorId = ref('')
  let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null

  function buildPlanCopyText(message: UiMessage): string {
    const planData = readPlanData(message)
    if (!planData) return ''

    const sections: string[] = []
    if (planData.explanation?.trim()) {
      sections.push(planData.explanation.trim())
    }

    if (planData.steps.length > 0) {
      sections.push(planData.steps.map((step) => `- ${planStepCopyMarker(step.status)} ${step.step}`.trim()).join('\n'))
    }

    return sections.join('\n\n').trim()
  }

  function buildCopyableMessageContent(message: UiMessage): string {
    const sections: string[] = []
    const rawTextContent = message.text.trim() || buildPlanCopyText(message)
    const textContent = isPlanMessage(message) && rawTextContent
      ? `Plan\n${rawTextContent}`
      : rawTextContent
    if (textContent) {
      sections.push(textContent)
    }

    const attachmentLines = (message.fileAttachments ?? [])
      .map((attachment) => attachment.path.trim())
      .filter((pathValue) => pathValue.length > 0)
    if (attachmentLines.length > 0) {
      sections.push(`Files:\n${attachmentLines.join('\n')}`)
    }

    const imageLines = (message.images ?? [])
      .map((imageUrl) => imageUrl.trim())
      .filter((imageUrl) => imageUrl.length > 0)
    if (imageLines.length > 0) {
      sections.push(`Images:\n${imageLines.join('\n')}`)
    }

    return sections.join('\n\n').trim()
  }

  const copyableResponseContentByAnchorId = computed<Record<string, string>>(() => {
    const groupedResponses = new Map<string, { anchorMessageId: string; parts: string[] }>()

    for (const message of getMessages()) {
      if (!isCopyableAssistantMessage(message)) continue

      const content = buildCopyableMessageContent(message)
      if (!content) continue

      const responseKey = typeof message.turnIndex === 'number'
        ? `turn:${message.turnIndex}`
        : `message:${message.id}`
      const existing = groupedResponses.get(responseKey)
      if (existing) {
        existing.anchorMessageId = message.id
        existing.parts.push(content)
        continue
      }

      groupedResponses.set(responseKey, {
        anchorMessageId: message.id,
        parts: [content],
      })
    }

    const next: Record<string, string> = {}
    for (const response of groupedResponses.values()) {
      const content = response.parts.join('\n\n').trim()
      if (!content) continue
      next[response.anchorMessageId] = content
    }

    for (const [anchorMessageId, summary] of Object.entries(getAnchoredFileChangeSummaries())) {
      if (summary.source !== 'metadata') continue
      const fileChangeCopy = buildFileChangeCopyText(summary)
      if (!fileChangeCopy) continue
      const existing = next[anchorMessageId]?.trim()
      next[anchorMessageId] = existing ? `${existing}\n\n${fileChangeCopy}` : fileChangeCopy
    }
    return next
  })

  const forkableTurnIndexByAnchorId = computed<Record<string, number>>(() => {
    const groupedTurns = new Map<string, { anchorMessageId: string; turnIndex: number }>()

    for (const message of getMessages()) {
      if (!isCopyableAssistantMessage(message) || typeof message.turnIndex !== 'number') continue

      const responseKey = `turn:${message.turnIndex}`
      const existing = groupedTurns.get(responseKey)
      if (existing) {
        existing.anchorMessageId = message.id
        existing.turnIndex = message.turnIndex
        continue
      }

      groupedTurns.set(responseKey, {
        anchorMessageId: message.id,
        turnIndex: message.turnIndex,
      })
    }

    const next: Record<string, number> = {}
    for (const groupedTurn of groupedTurns.values()) {
      next[groupedTurn.anchorMessageId] = groupedTurn.turnIndex
    }
    return next
  })

  function showCopyResponseButton(message: UiMessage): boolean {
    return typeof copyableResponseContentByAnchorId.value[message.id] === 'string'
  }

  // round-23：用户消息下新增复制按钮，复制用户消息内容（文字 + 附件 + 图片）
  function isCopyableUserMessage(message: UiMessage): boolean {
    return message.role === 'user' && buildCopyableMessageContent(message).length > 0
  }

  function markCopied(messageId: string): void {
    copiedResponseAnchorId.value = messageId
    if (copiedMessageResetTimer) {
      clearTimeout(copiedMessageResetTimer)
    }
    copiedMessageResetTimer = setTimeout(() => {
      if (copiedResponseAnchorId.value === messageId) {
        copiedResponseAnchorId.value = ''
      }
      copiedMessageResetTimer = null
    }, 1800)
  }

  // 直接在 hook 内清理复位计时器；单测在组件外调用工厂函数，需守卫无实例场景。
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (copiedMessageResetTimer) {
        clearTimeout(copiedMessageResetTimer)
        copiedMessageResetTimer = null
      }
    })
  }

  async function copyUserMessage(messageId: string): Promise<void> {
    const message = getMessages().find((candidate) => candidate.id === messageId)
    if (!message) return
    const content = buildCopyableMessageContent(message)
    if (!content) return

    let copied = false
    try {
      await copyTextToClipboard(content)
      copied = true
    } catch {
      copied = false
    }
    if (!copied) {
      copied = copyTextWithSelectionFallback(content)
    }
    if (!copied) return

    markCopied(messageId)
  }

  function showForkResponseButton(message: UiMessage): boolean {
    return typeof forkableTurnIndexByAnchorId.value[message.id] === 'number'
  }

  async function copyResponse(anchorMessageId: string): Promise<void> {
    const content = copyableResponseContentByAnchorId.value[anchorMessageId] ?? ''
    if (!content) return

    let copied = false
    try {
      await copyTextToClipboard(content)
      copied = true
    } catch {
      copied = false
    }

    if (!copied) {
      copied = copyTextWithSelectionFallback(content)
    }

    if (!copied) return

    markCopied(anchorMessageId)
  }

  return {
    copiedResponseAnchorId,
    copyableResponseContentByAnchorId,
    forkableTurnIndexByAnchorId,
    showCopyResponseButton,
    isCopyableUserMessage,
    copyUserMessage,
    showForkResponseButton,
    copyResponse,
  }
}