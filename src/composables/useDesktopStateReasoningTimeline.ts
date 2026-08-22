// Reasoning timeline + archive cluster sliced out of useDesktopState()'s closure.
// It owns the per-thread reasoning item timeline (itemId / kind ordering), the
// per-item accumulated text, and the persisted reasoning archive written back to
// localStorage when a turn completes (`clearLiveReasoningForThread`).
//
// Unlike the snapshot cluster (useDesktopStateReasoningWrites), the mutable Maps
// here stay owned by the composable closure (they are also touched by the realtime
// notification handler and by resetAllState), so this module is a plain set of
// functions that mutate the injected deps rather than a state-owning factory.
import type { Ref } from 'vue'
import type { RpcNotification } from '../api/codexGateway'
import type { UiMessage } from '../types/codex'
import { asRecord, extractThreadIdFromNotification, readString } from './useDesktopStateNormalizers'
import { omitKey } from './useDesktopStateUtils'

export interface ReasoningTimelineDeps {
  liveReasoningTextByThreadId: Ref<Record<string, string>>
  persistedReasoningByThreadId: Ref<Record<string, UiMessage[]>>
  turnIndexByTurnIdByThreadId: Ref<Record<string, Record<string, number>>>
  activeTurnIdByThreadId: Ref<Record<string, string>>
  activeReasoningTurnIdByThreadId: Map<string, string>
  reasoningItemTextByItemId: Map<string, string>
  reasoningAppendedTextByItemId: Map<string, string>
  turnItemSequenceByThreadId: Map<string, Array<{ itemId: string; kind: 'reasoning' | 'other' }>>
  appendLiveReasoningText: (threadId: string, delta: string) => void
  clearLiveReasoningSnapshot: (threadId: string) => void
  savePersistedReasoningMap: (map: Record<string, UiMessage[]>) => void
}

export function recordActiveReasoningTurn(deps: ReasoningTimelineDeps, threadId: string): void {
  if (!threadId) return
  const activeTurnId = deps.activeTurnIdByThreadId.value[threadId] ?? ''
  if (activeTurnId) deps.activeReasoningTurnIdByThreadId.set(threadId, activeTurnId)
}

// round-27：keepSequence=true 时（agent 内容事件触发的中途清理）保留
// turnItemSequenceByThreadId 时间线——此前每次 agent 内容事件都删掉时间线，
// 后续思考项丢失锚点（reasoningAnchorMessageId 为空）→ mergePersistedReasoning
// 全部回退插到该轮用户消息之后 → 最后一轮思考堆在「用户消息后、模型回答前」。
// 时间线只在轮次真正结束时删除；存档按稳定 id 原地更新，中途清理不产生重复块。
export function clearLiveReasoningForThread(
  deps: ReasoningTimelineDeps,
  threadId: string,
  keepSequence = false,
): void {
  if (!threadId) return
  const current = deps.liveReasoningTextByThreadId.value[threadId]
  if (current === undefined) {
    if (!keepSequence) {
      deps.turnItemSequenceByThreadId.delete(threadId)
      deps.reasoningAppendedTextByItemId.clear()
    }
    return
  }
  const turnId = deps.activeReasoningTurnIdByThreadId.get(threadId) ?? deps.activeTurnIdByThreadId.value[threadId] ?? ''
  deps.activeReasoningTurnIdByThreadId.delete(threadId)
  const turnIndex = turnId ? deps.turnIndexByTurnIdByThreadId.value[threadId]?.[turnId] : undefined
  // round-23：优先按 item 粒度按时序存档（思考项插回对应工具/命令之后），
  // 拿不到 item 时间线时退回整段文本存档（旧行为）。中途清理（keepSequence）
  // 时不走整段兜底，避免同一轮多次存档产生重复块，等轮末再兜底一次。
  const reasoningItems = buildTurnReasoningItems(deps, threadId)
  const resolvedTurnId = turnId || undefined
  if (reasoningItems.length > 0) {
    rememberPersistedReasoningItems(deps, threadId, reasoningItems, resolvedTurnId, turnIndex)
  } else if (!keepSequence) {
    rememberPersistedReasoning(deps, threadId, current, resolvedTurnId, turnIndex)
  }
  deps.liveReasoningTextByThreadId.value = omitKey(deps.liveReasoningTextByThreadId.value, threadId)
  if (!keepSequence) {
    deps.turnItemSequenceByThreadId.delete(threadId)
    deps.reasoningAppendedTextByItemId.clear()
    deps.clearLiveReasoningSnapshot(threadId)
  }
}

// 把完整 thinking 文本存档为 reasoning 消息（本地持久化，刷新后仍展示）。
export function rememberPersistedReasoning(
  deps: ReasoningTimelineDeps,
  threadId: string,
  text: string,
  turnId?: string,
  turnIndex?: number,
): void {
  if (!threadId) return
  const normalized = text.trim()
  if (!normalized) return
  const previous = deps.persistedReasoningByThreadId.value[threadId] ?? []
  if (previous.some((message) => message.text === normalized)) return
  const nextMessage: UiMessage = {
    id: `reasoning:local:${threadId}:${Date.now()}`,
    role: 'system',
    text: normalized,
    messageType: 'reasoning',
    reasoning: { summary: [], content: [normalized] },
    turnId: turnId || undefined,
    turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
  }
  // ponytail: 每线程最多保留 20 条，防止 localStorage 无限增长；如需更多
  // 历史可改为按容量或按天裁剪。
  const next = [...previous, nextMessage].slice(-20)
  deps.persistedReasoningByThreadId.value = {
    ...deps.persistedReasoningByThreadId.value,
    [threadId]: next,
  }
  deps.savePersistedReasoningMap(deps.persistedReasoningByThreadId.value)
}

// round-23：按 item 粒度按时序存档思考（每条带 reasoningAnchorMessageId，
// 合并时插到对应工具/命令之后，实现「提问 -> 思考 -> 工具 -> 思考 -> …」顺序）。
// round-27：改用按 itemId 的稳定 id（reasoning:item:*）。同一推理项在流式
// 过程中文本增长时原地更新而不是新增条目——此前按 text+turnId 去重，部分文本
// 先被归档、全量文本再插一条会形成重复思考块。
export function rememberPersistedReasoningItems(
  deps: ReasoningTimelineDeps,
  threadId: string,
  items: Array<{ text: string; anchorMessageId: string; itemId: string }>,
  turnId?: string,
  turnIndex?: number,
): void {
  if (!threadId || items.length === 0) return
  const previous = deps.persistedReasoningByThreadId.value[threadId] ?? []
  const next = [...previous]
  for (const item of items) {
    const normalized = item.text.trim()
    if (!normalized) continue
    const stableId = `reasoning:item:${threadId}:${item.itemId}`
    const existingIndex = next.findIndex((message) => message.id === stableId)
    if (existingIndex >= 0) {
      const existing = next[existingIndex]
      const nextAnchor = item.anchorMessageId || existing.reasoningAnchorMessageId
      const nextTurnIndex = typeof turnIndex === 'number' ? turnIndex : existing.turnIndex
      if (existing.text === normalized && existing.turnIndex === nextTurnIndex && existing.reasoningAnchorMessageId === nextAnchor) {
        continue
      }
      next[existingIndex] = {
        ...existing,
        text: normalized,
        reasoning: { summary: [], content: [normalized] },
        turnId: turnId || existing.turnId,
        turnIndex: nextTurnIndex,
        reasoningAnchorMessageId: nextAnchor,
      }
      continue
    }
    // 兼容旧存档：同文本已存在（reasoning:local:* 旧 id 或另一条推理）则跳过，
    // 避免新旧两种存档格式在同一轮并存造成重复块。
    if (next.some((message) => message.text === normalized)) continue
    next.push({
      id: stableId,
      role: 'system',
      text: normalized,
      messageType: 'reasoning',
      reasoning: { summary: [], content: [normalized] },
      turnId: turnId || undefined,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : undefined,
      reasoningAnchorMessageId: item.anchorMessageId || undefined,
    })
  }
  const pruned = next.slice(-20)
  deps.persistedReasoningByThreadId.value = {
    ...deps.persistedReasoningByThreadId.value,
    [threadId]: pruned,
  }
  deps.savePersistedReasoningMap(deps.persistedReasoningByThreadId.value)
}

export function appendReasoningItemProgress(
  deps: ReasoningTimelineDeps,
  threadId: string,
  itemId: string,
  text: string,
): void {
  if (!threadId || !text) return
  // round-23：记录每个推理项的完整文本，供轮次结束后按 item 粒度按时序存档。
  if (text.trim()) deps.reasoningItemTextByItemId.set(itemId, text.trim())
  const current = deps.liveReasoningTextByThreadId.value[threadId] ?? ''
  const previous = deps.reasoningAppendedTextByItemId.get(itemId) ?? ''
  if (current.endsWith(text) || (previous && text === previous)) {
    deps.reasoningAppendedTextByItemId.set(itemId, text)
    return
  }
  if (previous && text.startsWith(previous)) {
    const delta = text.slice(previous.length)
    if (delta) deps.appendLiveReasoningText(threadId, delta)
    deps.reasoningAppendedTextByItemId.set(itemId, text)
    return
  }
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n\n' : ''
  deps.appendLiveReasoningText(threadId, `${separator}${text}`)
  deps.reasoningAppendedTextByItemId.set(itemId, text)
}

// round-23：记录 item/started|item/completed 的到达顺序（推理项与工具项），
// 供思考存档按真实时序插回消息流。
// round-24：real 环境 reasoning 常走 item/reasoning/textDelta / summaryTextDelta
// 增量通道（不伴随 item/started 的 reasoning 项）。若不记录，buildTurnReasoningItems
// 拿不到 reasoning 项 → 回退整段存档（无 reasoningAnchorMessageId）→ 刷新后
// 全部思考按 turnIndex 插到轮首。这里把增量通道的 itemId 也按 reasoning 记录。
export function recordTurnItemOrder(deps: ReasoningTimelineDeps, notification: RpcNotification): void {
  const params = asRecord(notification.params)
  if (!params) return

  const isItemLifecycle = notification.method === 'item/started' || notification.method === 'item/completed'
  const isReasoningDelta =
    notification.method === 'item/reasoning/textDelta' ||
    notification.method === 'item/reasoning/summaryTextDelta'
  if (!isItemLifecycle && !isReasoningDelta) return

  const item = asRecord(params.item)
  const itemId = isReasoningDelta ? readString(params.itemId) : readString(item?.id)
  if (!itemId) return
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return
  const kind = isReasoningDelta
    ? 'reasoning'
    : readString(item?.type).toLowerCase() === 'reasoning'
      ? 'reasoning'
      : 'other'
  const sequence = deps.turnItemSequenceByThreadId.get(threadId) ?? []
  if (sequence.some((entry) => entry.itemId === itemId)) return
  deps.turnItemSequenceByThreadId.set(threadId, [...sequence, { itemId, kind }])
}

// 从本轮时间线构建「按真实顺序排列的思考项」，每项带时序锚点：
// anchor = 该思考项之前最近一个工具/命令/agent 项的 id（插到它后面）。
// round-27：返回项带 itemId，供存档用稳定 id 原地更新（流式文本增长去重）。
export function buildTurnReasoningItems(
  deps: ReasoningTimelineDeps,
  threadId: string,
): Array<{ text: string; anchorMessageId: string; itemId: string }> {
  const sequence = deps.turnItemSequenceByThreadId.get(threadId) ?? []
  const items: Array<{ text: string; anchorMessageId: string; itemId: string }> = []
  let lastOtherItemId = ''
  for (const entry of sequence) {
    if (entry.kind === 'reasoning') {
      const text = deps.reasoningItemTextByItemId.get(entry.itemId)?.trim() ?? ''
      if (text) items.push({ text, anchorMessageId: lastOtherItemId, itemId: entry.itemId })
    } else {
      lastOtherItemId = entry.itemId
    }
  }
  return items
}

// round-24：item/reasoning/textDelta 增量通道（不伴随 item/started 全量项）。
// 把增量累积到 reasoningItemTextByItemId，让 buildTurnReasoningItems 在轮末能
// 生成带 anchor 的思考存档；此前该 map 无文本 → 回退整段存档 → 刷新后思考
// 全部插到轮首。前缀重复（服务端重发同一段）时跳过，避免文本膨胀。
export function accumulateReasoningTextDelta(deps: ReasoningTimelineDeps, itemId: string, delta: string): void {
  if (!itemId || !delta) return
  const previousItemText = deps.reasoningItemTextByItemId.get(itemId) ?? ''
  if (previousItemText.endsWith(delta)) return
  deps.reasoningItemTextByItemId.set(itemId, `${previousItemText}${delta}`)
}

// 轮次结束（turn/completed）时清空本轮推理项文本缓存，避免跨轮残留。
export function clearReasoningItemTextCache(deps: ReasoningTimelineDeps): void {
  deps.reasoningItemTextByItemId.clear()
}