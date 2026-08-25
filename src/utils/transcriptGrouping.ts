// hot/warm/cold 三区消息分组（阶段 B：移植自 DeepSeek-Reasonix `lib/transcriptGrouping.ts`）。
// 纯函数，无组件依赖。轮次（turn）以 user 消息为界；warm 区按轮折叠为摘要卡，
// cold 区按页分页（coldPage 单调递增、只增不降）。分组逻辑与本地 UiMessage 模型对齐。

import type { UiMessage } from '../types/codex'

export interface TurnGroup {
  userItem: UiMessage
  assistantPreview: string
  toolCount: number
  startIdx: number
  endIdx: number
}

export type TurnRenderItemKind =
  | 'user'
  | 'reasoning'
  | 'process'
  | 'assistant'
  | 'final-assistant'
  | 'plan'
  | 'file-change'

export type TurnRenderItem = {
  message: UiMessage
  kind: TurnRenderItemKind
}

export type TurnRenderGroup = {
  key: string
  items: TurnRenderItem[]
}

function renderItemKind(message: UiMessage): TurnRenderItemKind {
  if (message.role === 'user') return 'user'
  if (message.messageType === 'reasoning') return 'reasoning'
  if (message.messageType === 'plan' || message.messageType === 'plan.live') return 'plan'
  if (message.messageType === 'fileChange') return 'file-change'
  if (message.messageType === 'commandExecution' || message.messageType === 'toolCall' || message.messageType === 'worked') {
    return 'process'
  }
  return 'assistant'
}

function isFinalAssistantItem(message: UiMessage): boolean {
  return message.role === 'assistant'
    && message.messageType !== 'reasoning'
    && message.messageType !== 'commandExecution'
    && message.messageType !== 'toolCall'
    && message.messageType !== 'worked'
    && message.messageType !== 'plan'
    && message.messageType !== 'plan.live'
    && message.messageType !== 'fileChange'
    && !message.messageType?.endsWith('.live')
    && message.text.trim().length > 0
}

/**
 * Build the Hot-zone display model one user turn at a time without changing the
 * underlying message order. The final assistant answer is marked for emphasis,
 * while earlier assistant text and process records retain their exact position.
 */
export function buildTurnRenderGroups(
  messages: UiMessage[],
  options?: { liveOverlayActive?: boolean; liveTurnId?: string },
): TurnRenderGroup[] {
  const groups: TurnRenderGroup[] = []
  let current: TurnRenderGroup | null = null

  for (const message of messages) {
    if (message.role === 'user' || !current) {
      current = { key: `turn-${message.id}`, items: [] }
      groups.push(current)
    }
    current.items.push({ message, kind: renderItemKind(message) })
  }

  const lastGroupIndex = groups.length - 1
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    // 活跃轮最终回答尚未落定：live overlay 仍在生成该轮最终内容（真实最终还没进入 messages），
    // 此时该轮末尾只可能是已完成的中间消息，提升为 final 会被拉出过程区、显示成"本轮过程外的最终答案"。
    // 有稳定 turnId 时按它精确定位活跃轮；旧调用方未提供时才回退为最后一轮。
    const groupTurnId = group.items.find((item) => item.message.turnId?.trim())?.message.turnId?.trim()
    const isUnsettledLiveTurn = options?.liveOverlayActive === true
      && (options.liveTurnId ? groupTurnId === options.liveTurnId : index === lastGroupIndex)
    if (isUnsettledLiveTurn) continue

    const lastContentItem = [...group.items].reverse().find((item) => item.kind !== 'file-change')
    if (lastContentItem && isFinalAssistantItem(lastContentItem.message)) {
      const streamingInTurn = group.items.some(
        (item) => typeof item.message.messageType === 'string' && item.message.messageType.endsWith('.live'),
      )
      // 本轮仍属于活跃/流式（本组内有 .live，或整轮尚未落定仍由 live overlay 生成）时，末尾这条
      // 已完成的 agentMessage 只可能是流式过程中的中间消息（例如多代理场景下子代理先于主代理汇总
      // 完成），不应被提升为 final 拉出过程区。真正的最终回复待其进入 messages 后再提升。
      if (!streamingInTurn) {
        lastContentItem.kind = 'final-assistant'
      }
    }
  }

  return groups
}

export type WarmLayerState = {
  sessionKey: string
  expandedWarmTurns: ReadonlySet<number>
  coldPage: number
}

// ---------------------------------------------------------------------------
// 文本压缩（折叠卡摘要字段来源）
// ---------------------------------------------------------------------------

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 硬截断 80 字符（无省略号） */
export function compactQuestionText(text: string): string {
  const cleaned = collapseWhitespace(text)
  return cleaned.length <= 80 ? cleaned : cleaned.slice(0, 80)
}

/** 80 字内原样、超 80 截 77 + "..." */
export function warmUserPreview(text: string): string {
  const cleaned = collapseWhitespace(text)
  return cleaned.length <= 80 ? cleaned : cleaned.slice(0, 77) + '...'
}

// ---------------------------------------------------------------------------
// WarmLayerState 纯状态函数（按 sessionKey 隔离，不可变更新）
// ---------------------------------------------------------------------------

export function createWarmLayerState(sessionKey: string): WarmLayerState {
  return { sessionKey, expandedWarmTurns: new Set(), coldPage: 0 }
}

export function warmLayerForSession(state: WarmLayerState, sessionKey: string): WarmLayerState {
  return state.sessionKey === sessionKey ? state : createWarmLayerState(sessionKey)
}

export function warmLayerWithNextColdPage(state: WarmLayerState, sessionKey: string): WarmLayerState {
  const current = warmLayerForSession(state, sessionKey)
  return { ...current, coldPage: current.coldPage + 1 }
}

export function warmLayerWithColdPageAtLeast(
  state: WarmLayerState,
  sessionKey: string,
  coldPage: number,
): WarmLayerState {
  const current = warmLayerForSession(state, sessionKey)
  const safeColdPage = Math.max(0, Math.floor(coldPage))
  if (current.coldPage >= safeColdPage) return current
  return { ...current, coldPage: safeColdPage }
}

export function warmLayerWithExpandedTurn(
  state: WarmLayerState,
  sessionKey: string,
  turn: number,
  expand: boolean,
): WarmLayerState {
  const current = warmLayerForSession(state, sessionKey)
  const expandedWarmTurns = new Set(current.expandedWarmTurns)
  if (expand) expandedWarmTurns.add(turn)
  else expandedWarmTurns.delete(turn)
  return { ...current, expandedWarmTurns }
}

// ---------------------------------------------------------------------------
// turn 分组（单趟扫描）
// ---------------------------------------------------------------------------

function isUserMessage(message: UiMessage): boolean {
  return message.role === 'user'
}

function isStreamingAssistant(message: UiMessage): boolean {
  return message.messageType?.endsWith('.live') === true
}

/**
 * 按 user 消息为界把消息流切成轮次组。组内：
 * - `assistantPreview` = 最后一个非流式、有文本的 assistant 回答（warmUserPreview 压缩）
 * - `toolCount` = 组内 toolCall 消息数（本地消息无嵌套 parentId 概念，全量计数）
 * 前导的非 user 消息并入第一组（userItem 为第一条消息）；无 user 消息时整组一个。
 */
export function buildTurnGroups(messages: UiMessage[]): TurnGroup[] {
  const groups: TurnGroup[] = []
  let start = -1
  let pendingStart = 0

  const pushGroup = (userItem: UiMessage, groupStart: number): void => {
    groups.push({
      userItem,
      assistantPreview: '',
      toolCount: 0,
      startIdx: groupStart,
      endIdx: messages.length,
    })
  }

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (isUserMessage(message)) {
      if (start >= 0) {
        groups[groups.length - 1].endIdx = i
      } else {
        // 前导非 user 消息并入该组：userItem 用第一条 user，startIdx 回退到 0
        groups.push({
          userItem: message,
          assistantPreview: '',
          toolCount: 0,
          startIdx: pendingStart,
          endIdx: messages.length,
        })
        start = i
        pendingStart = i
        continue
      }
      start = i
      pushGroup(message, i)
    } else if (start >= 0 && groups.length > 0) {
      const group = groups[groups.length - 1]
      const text = message.text?.trim() || ''
      if (message.role === 'assistant' && !isStreamingAssistant(message) && text) {
        group.assistantPreview = warmUserPreview(text)
      }
      if (message.messageType === 'toolCall') {
        group.toolCount += 1
      }
    }
  }
  return groups
}

// ---------------------------------------------------------------------------
// 三区边界计算
// ---------------------------------------------------------------------------

/**
 * hot 区 = 最后 `hotTurns` 轮全量渲染；其前的轮次进入 warm/cold。
 * warm 区每页 `pageSize` 轮，coldPage 每 +1 多展示一页（warm 起点前移）。
 */
export function warmPagination({
  turnCount,
  hotTurns,
  pageSize,
  coldPage,
}: {
  turnCount: number
  hotTurns: number
  pageSize: number
  coldPage: number
}): { warmStartTurn: number; warmEndTurn: number; coldTurnCount: number } {
  const safeTurnCount = Math.max(0, turnCount)
  const safeHotTurns = Math.max(0, hotTurns)
  const warmEndTurn = Math.max(0, safeTurnCount - Math.min(safeTurnCount, safeHotTurns))
  if (warmEndTurn === 0) return { warmStartTurn: 0, warmEndTurn: 0, coldTurnCount: 0 }

  const safePageSize = Math.max(0, pageSize)
  const safeColdPage = Math.max(0, Math.floor(coldPage))
  const shownWarmCount = Math.min(warmEndTurn, safePageSize * (safeColdPage + 1))
  return {
    warmStartTurn: warmEndTurn - shownWarmCount,
    warmEndTurn,
    coldTurnCount: warmEndTurn - shownWarmCount,
  }
}

/** 跳转到 cold 区某轮次所需的 coldPage（下限 0） */
export function warmColdPageForTurn({
  turn,
  turnCount,
  hotTurns,
  pageSize,
}: {
  turn: number
  turnCount: number
  hotTurns: number
  pageSize: number
}): number {
  const safeTurnCount = Math.max(0, turnCount)
  const safeHotTurns = Math.max(0, hotTurns)
  const warmEndTurn = Math.max(0, safeTurnCount - Math.min(safeTurnCount, safeHotTurns))
  if (warmEndTurn === 0 || turn >= warmEndTurn) return 0

  const safePageSize = Math.max(1, pageSize)
  const targetTurn = Math.max(0, Math.floor(turn))
  const shownTurnsNeeded = warmEndTurn - targetTurn
  return Math.max(0, Math.ceil(shownTurnsNeeded / safePageSize) - 1)
}

/** 用于 memo 依赖的"结构版本"指纹：assistant 只关心是否流式、tool 关心 status */
export function scrollVersion(messages: UiMessage[]): string {
  return messages
    .map((message) => {
      const id = message.id
      if (message.messageType === 'assistant' || message.role === 'assistant') {
        return `${id}:a:${isStreamingAssistant(message) ? 1 : 0}`
      }
      if (message.messageType === 'toolCall') {
        return `${id}:t:${message.toolCall?.status ?? ''}`
      }
      return `${id}:${message.messageType ?? message.role}`
    })
    .join('|')
}

// ---------------------------------------------------------------------------
// 轮次 ↔ 消息下标换算（hot 区渲染所需）
// ---------------------------------------------------------------------------

/** 从消息数组按轮次组提取「hot 区消息」：turnIndex >= warmEndTurn 的全部消息（保持原序）。
 * 无轮次组（全为非 user 消息）时回退全量，保证消息不被吞。 */
export function messagesForTurnsFrom(
  messages: UiMessage[],
  groups: TurnGroup[],
  warmEndTurn: number,
): UiMessage[] {
  if (groups.length === 0) return messages.slice(0)
  if (warmEndTurn >= groups.length) return []
  const startIdx = groups[warmEndTurn].startIdx
  return messages.slice(startIdx)
}
