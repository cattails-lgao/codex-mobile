// useDesktopState「B 批」持久化层。所有 load*/save* 系列（thread read state /
// reasoning / plan / 模型 / 协作模式 / token usage / terminal / 项目序 等）统一
// 收口到 localStorage，供主 useDesktopState() 使用。A 批纯工具见
// useDesktopStateUtils.ts；本文件只依赖 A 批的纯函数与 codexGateway，不触碰
// 响应式 ref，避免闭包共享 ref 造成的循环依赖。
import type { UiMessage, UiThreadTokenUsage, CollaborationModeKind } from '../types/codex'
import { persistThreadReasoningArchive, persistThreadTurnDuration } from '../api/codexGateway'
import { toProjectName } from '../pathUtils.js'
import {
  createStringKeyedRecord,
  normalizeCollaborationMode,
  normalizeStoredModelId,
  NEW_THREAD_COLLABORATION_MODE_CONTEXT,
} from './useDesktopStateContext'
import { normalizeThreadTokenUsage } from './useDesktopStateUtils'
import { isModelSwitchMessage, MAX_MODEL_SWITCH_MARKERS_PER_THREAD } from '../utils/modelSwitchMessages'

const READ_STATE_STORAGE_KEY = 'codex-web-local.thread-read-state.v1'
const UNREAD_CUTOFF_STORAGE_KEY = 'codex-web-local.thread-unread-cutoff.v1'
const THREAD_TOKEN_USAGE_STORAGE_KEY = 'codex-web-local.thread-token-usage.v1'
const THREAD_REASONING_STORAGE_KEY = 'codex-web-local.thread-reasoning.v1'
const THREAD_TURN_DURATIONS_STORAGE_KEY = 'codex-web-local.thread-turn-durations.v1'
const THREAD_LAST_PLAN_STORAGE_KEY = 'codex-web-local.thread-last-plan.v1'
export const LIVE_REASONING_SNAPSHOT_STORAGE_KEY = 'codex-web-local.live-reasoning-snapshot.v1'
const THREAD_TERMINAL_OPEN_STORAGE_KEY = 'codex-web-local.thread-terminal-open.v1'
const SELECTED_THREAD_STORAGE_KEY = 'codex-web-local.selected-thread-id.v1'
const SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY = 'codex-web-local.selected-model-by-context.v1'
const LEGACY_SELECTED_MODEL_STORAGE_KEY = 'codex-web-local.selected-model-id.v1'
const PROJECT_ORDER_STORAGE_KEY = 'codex-web-local.project-order.v1'
const PROJECT_DISPLAY_NAME_STORAGE_KEY = 'codex-web-local.project-display-name.v1'
const COLLABORATION_MODE_STORAGE_KEY = 'codex-web-local.collaboration-mode-by-context.v1'
const LEGACY_COLLABORATION_MODE_STORAGE_KEY = 'codex-web-local.collaboration-mode.v1'

export function loadReadStateMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(READ_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function saveReadStateMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READ_STATE_STORAGE_KEY, JSON.stringify(state))
}

// app-server 不把 reasoning 持久化到 thread/read（仅流式通知），前端把 live
// thinking 存档到 localStorage，刷新后仍能在消息列表展示（reasoning-block）。
export function loadPersistedReasoningMap(): Record<string, UiMessage[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_REASONING_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, UiMessage[]>
  } catch {
    return {}
  }
}

export function savePersistedReasoningMap(state: Record<string, UiMessage[]>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THREAD_REASONING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
  // round-23：镜像到桥接层，换浏览器/刷新后仍能从同一台服务端恢复思考存档。
  for (const [threadId, messages] of Object.entries(state)) {
    if (threadId && messages.length > 0) {
      void persistThreadReasoningArchive(threadId, messages)
    }
  }
}

// round-65：轮耗时存档。app-server 不把 turn 完成耗时持久化到 thread/read
// （仅流式通知），前端把每轮耗时存到 localStorage（刷新本浏览器即恢复），
// 并镜像到桥接层 sidecar（换浏览器/刷新后也能从同一台服务端恢复）。
export type ThreadTurnDurationMap = Record<string, Record<string, number>>

export function loadPersistedTurnDurationMap(): ThreadTurnDurationMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_TURN_DURATIONS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: ThreadTurnDurationMap = {}
    for (const [threadId, turns] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId || !turns || typeof turns !== 'object' || Array.isArray(turns)) continue
      const perTurn: Record<string, number> = {}
      for (const [turnId, durationMs] of Object.entries(turns as Record<string, unknown>)) {
        if (!turnId || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) continue
        perTurn[turnId] = Math.round(durationMs)
      }
      if (Object.keys(perTurn).length > 0) result[threadId] = perTurn
    }
    return result
  } catch {
    return {}
  }
}

// round-77：镜像到桥接层改为「只发增量」。此前每次保存都把全部线程的每一轮
// 逐条 PUT：启动时从服务端合并存档后又会把服务端已有的数据原样回写——一次启动
// 约 27 个 PUT，而每个 PUT 在桥接层都是一次「读整份 state 文件 + 写回」，既占满
// 浏览器的同源并发连接，又串行占用服务端文件 I/O，直接拖慢并发的 thread/list /
// thread/resume（实测 thread/resume 平均 224ms → 84ms）。这里记住「服务端已经有
// 哪些」，只 PUT 新增/变化的条目；从服务端载入的存档用 seedMirroredTurnDurations
// 标记为已知，不回写。
let mirroredTurnDurations: ThreadTurnDurationMap = {}

export function seedMirroredTurnDurations(state: ThreadTurnDurationMap): void {
  const snapshot: ThreadTurnDurationMap = {}
  for (const [threadId, turns] of Object.entries(state)) {
    if (threadId && Object.keys(turns).length > 0) snapshot[threadId] = { ...turns }
  }
  mirroredTurnDurations = snapshot
}

export function savePersistedTurnDurationMap(state: ThreadTurnDurationMap): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(THREAD_TURN_DURATIONS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THREAD_TURN_DURATIONS_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
  // round-65：镜像到桥接层，刷新/换浏览器后仍能从同一台服务端恢复轮耗时。
  // round-77：只镜像相对已知快照新增/变化的条目（见上）。
  for (const [threadId, turns] of Object.entries(state)) {
    if (!threadId) continue
    const alreadyMirrored = mirroredTurnDurations[threadId] ?? {}
    for (const [turnId, durationMs] of Object.entries(turns)) {
      if (!turnId || typeof durationMs !== 'number' || durationMs <= 0) continue
      if (alreadyMirrored[turnId] === durationMs) continue
      void persistThreadTurnDuration(threadId, turnId, durationMs)
    }
  }
  seedMirroredTurnDurations(state)
}

export function loadLastPlanMap(): Record<string, UiMessage> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_LAST_PLAN_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, UiMessage>
  } catch {
    return {}
  }
}

export function saveLastPlanMap(state: Record<string, UiMessage>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THREAD_LAST_PLAN_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
}

export type LiveReasoningSnapshot = { text: string; ts: number }

export function loadLiveReasoningSnapshotMap(): Record<string, LiveReasoningSnapshot> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LIVE_REASONING_SNAPSHOT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, LiveReasoningSnapshot> = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const row = value as { text?: unknown; ts?: unknown }
      if (typeof row?.text === 'string' && row.text.trim() && typeof row.ts === 'number') {
        result[threadId] = { text: row.text, ts: row.ts }
      }
    }
    return result
  } catch {
    return {}
  }
}

export function loadUnreadCutoffIso(): string {
  if (typeof window === 'undefined') return ''

  const existing = window.localStorage.getItem(UNREAD_CUTOFF_STORAGE_KEY)
  if (existing) return existing

  const initialCutoff = new Date().toISOString()
  window.localStorage.setItem(UNREAD_CUTOFF_STORAGE_KEY, initialCutoff)
  return initialCutoff
}

export function saveUnreadCutoffIso(cutoffIso: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UNREAD_CUTOFF_STORAGE_KEY, cutoffIso)
}

export function loadSelectedModelMap(): Record<string, string> {
  if (typeof window === 'undefined') return createStringKeyedRecord<string>()

  try {
    const raw = window.localStorage.getItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return createStringKeyedRecord<string>()

      const next = createStringKeyedRecord<string>()
      for (const [contextId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof contextId !== 'string' || contextId.length === 0) continue
        const normalizedModelId = normalizeStoredModelId(value)
        if (normalizedModelId) {
          next[contextId] = normalizedModelId
        }
      }
      return next
    }
  } catch {
    // Fall back to the legacy global preference below.
  }

  const legacyModelId = normalizeStoredModelId(window.localStorage.getItem(LEGACY_SELECTED_MODEL_STORAGE_KEY))
  const next = createStringKeyedRecord<string>()
  if (legacyModelId) {
    next[NEW_THREAD_COLLABORATION_MODE_CONTEXT] = legacyModelId
  }
  return next
}

export function saveSelectedModelMap(state: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY)
    } else {
      window.localStorage.setItem(SELECTED_MODEL_BY_CONTEXT_STORAGE_KEY, JSON.stringify(state))
    }
    window.localStorage.removeItem(LEGACY_SELECTED_MODEL_STORAGE_KEY)
  } catch {
    // Keep in-memory selection working even if localStorage writes fail.
  }
}

export function loadSelectedCollaborationModeMap(): Record<string, CollaborationModeKind> {
  if (typeof window === 'undefined') return createStringKeyedRecord<CollaborationModeKind>()

  try {
    const raw = window.localStorage.getItem(COLLABORATION_MODE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return createStringKeyedRecord<CollaborationModeKind>()
      }

      const next = createStringKeyedRecord<CollaborationModeKind>()
      for (const [contextId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof contextId !== 'string' || contextId.length === 0) continue
        const normalizedMode = normalizeCollaborationMode(value)
        if (normalizedMode === 'plan') {
          next[contextId] = normalizedMode
        }
      }
      return next
    }
  } catch {
    // Fall back to the legacy global preference below.
  }

  return createStringKeyedRecord<CollaborationModeKind>()
}

export function saveSelectedCollaborationModeMap(state: Record<string, CollaborationModeKind>): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(COLLABORATION_MODE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(COLLABORATION_MODE_STORAGE_KEY, JSON.stringify(state))
    }
    window.localStorage.removeItem(LEGACY_COLLABORATION_MODE_STORAGE_KEY)
  } catch {
    // Keep in-memory mode selection working even if localStorage writes fail.
  }
}

export function loadThreadTokenUsageMap(): Record<string, UiThreadTokenUsage> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(THREAD_TOKEN_USAGE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, UiThreadTokenUsage> = {}
    for (const [threadId, usage] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const normalizedUsage = normalizeThreadTokenUsage(usage)
      if (normalizedUsage) {
        normalizedMap[threadId] = normalizedUsage
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadTokenUsageMap(state: Record<string, UiThreadTokenUsage>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_TOKEN_USAGE_STORAGE_KEY, JSON.stringify(state))
}

const THREAD_MODEL_SWITCH_MARKERS_STORAGE_KEY = 'codex-web-local.thread-model-switch-markers.v1'

// ---------------------------------------------------------------------------
// round-173：按线程滚动状态持久化（桌面端 parity 表「滚动状态持久化」行，26.1013
// asar 取证同款机制：{renderedWindow, turnHeightsByKey} 跨会话恢复，重开不丢阅读位）。
// 我们侧的等价物：冷页深度（warmLayerState.coldPage）+ 展开的 warm 轮 + 距底读数
// （距底坐标系，round-153 批 3a）+ hot 实测高度种子（批 3c RO 缓存的跨会话播种）。
// warm 区 spacer 是实测常量 ⇒ 恢复 = 恢复冷页深度 + 按距底写一次 scrollTop，
// 不需要展开任何卡；高度种子只影响窗口边界选取（RO 会重测），脏种子无害。
// ---------------------------------------------------------------------------

export const THREAD_SCROLL_STATE_STORAGE_KEY = 'codex-web-local.thread-scroll-state.v1'
/** 最多保留多少个线程的滚动状态（按 savedAt LRU 淘汰）。 */
export const MAX_THREAD_SCROLL_STATE_ENTRIES = 24
/** 每线程最多播种多少个 hot 高度条目（窗口边界选取足够，控 localStorage 体积）。 */
export const MAX_THREAD_SCROLL_STATE_HEIGHTS = 200

export type ThreadScrollStateEntry = {
  /** 格式版本（结构不兼容时整体丢弃，不尝试迁移）。 */
  v: 1
  /** warm 层冷页深度（前端分页翻了多少页）。 */
  coldPage: number
  /** 展开过的 warm 轮号。 */
  expandedWarmTurns: number[]
  /** 保存时的距底距离（px，≥ 0）。 */
  distanceFromBottomPx: number
  /** hot 块实测高度种子（turn key → px），仅当前窗口已测块。 */
  hotHeights: Record<string, number>
  savedAt: number
}

export type ThreadScrollStateMap = Record<string, ThreadScrollStateEntry>

function normalizeThreadScrollStateEntry(input: unknown): ThreadScrollStateEntry | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const row = input as Record<string, unknown>
  if (row.v !== 1) return null
  const coldPage = row.coldPage
  if (typeof coldPage !== 'number' || !Number.isInteger(coldPage) || coldPage < 0) return null
  const distance = row.distanceFromBottomPx
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return null
  const savedAt = row.savedAt
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0) return null
  const rawExpanded = Array.isArray(row.expandedWarmTurns) ? row.expandedWarmTurns : []
  const expandedWarmTurns: number[] = []
  for (const value of rawExpanded) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && !expandedWarmTurns.includes(value)) {
      expandedWarmTurns.push(value)
    }
  }
  const rawHeights = row.hotHeights
  const hotHeights: Record<string, number> = {}
  if (rawHeights && typeof rawHeights === 'object' && !Array.isArray(rawHeights)) {
    for (const [key, value] of Object.entries(rawHeights as Record<string, unknown>)) {
      if (!key || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
      hotHeights[key] = value
      if (Object.keys(hotHeights).length >= MAX_THREAD_SCROLL_STATE_HEIGHTS) break
    }
  }
  return { v: 1, coldPage, expandedWarmTurns, distanceFromBottomPx: distance, hotHeights, savedAt }
}

export function loadThreadScrollStateMap(): ThreadScrollStateMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_SCROLL_STATE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: ThreadScrollStateMap = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId) continue
      const entry = normalizeThreadScrollStateEntry(value)
      if (entry) result[threadId] = entry
    }
    return result
  } catch {
    return {}
  }
}

export function saveThreadScrollStateMap(state: ThreadScrollStateMap): void {
  if (typeof window === 'undefined') return
  try {
    const entries = Object.entries(state)
      .filter((row): row is [string, ThreadScrollStateEntry] => Boolean(row[0]) && normalizeThreadScrollStateEntry(row[1]) !== null)
      // LRU：按 savedAt 保留最近 MAX_THREAD_SCROLL_STATE_ENTRIES 个线程。
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_THREAD_SCROLL_STATE_ENTRIES)
    if (entries.length === 0) {
      window.localStorage.removeItem(THREAD_SCROLL_STATE_STORAGE_KEY)
    } else {
      const trimmed: ThreadScrollStateMap = {}
      for (const [threadId, entry] of entries) trimmed[threadId] = entry
      window.localStorage.setItem(THREAD_SCROLL_STATE_STORAGE_KEY, JSON.stringify(trimmed))
    }
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
}


// round-73：本地持久化的「模型切换」分割栏消息。用户切模型时往线程消息列表追加一条
// `messageType === 'modelSwitch'` 的系统消息，仅存在本机 localStorage，不写入服务器。
export function loadModelSwitchMarkerMap(): Record<string, UiMessage[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_MODEL_SWITCH_MARKERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, UiMessage[]> = {}
    for (const [threadId, rows] of Object.entries(parsed as Record<string, unknown>)) {
      if (!threadId || !Array.isArray(rows)) continue
      const markers = (rows as unknown[])
        .filter((row): row is UiMessage => Boolean(row) && typeof row === 'object' && isModelSwitchMessage(row as UiMessage))
        .slice(0, MAX_MODEL_SWITCH_MARKERS_PER_THREAD)
      if (markers.length > 0) result[threadId] = markers
    }
    return result
  } catch {
    return {}
  }
}

export function saveModelSwitchMarkerMap(state: Record<string, UiMessage[]>): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(THREAD_MODEL_SWITCH_MARKERS_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THREAD_MODEL_SWITCH_MARKERS_STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // Keep in-memory markers working even if localStorage writes fail.
  }
}

export function loadThreadTerminalOpenMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(THREAD_TERMINAL_OPEN_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const normalizedMap: Record<string, boolean> = {}
    for (const [threadId, isOpen] of Object.entries(parsed as Record<string, unknown>)) {
      if (threadId && typeof isOpen === 'boolean') {
        normalizedMap[threadId] = isOpen
      }
    }
    return normalizedMap
  } catch {
    return {}
  }
}

export function saveThreadTerminalOpenMap(state: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THREAD_TERMINAL_OPEN_STORAGE_KEY, JSON.stringify(state))
}

export function loadSelectedThreadId(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.localStorage.getItem(SELECTED_THREAD_STORAGE_KEY)
  return raw ?? ''
}

export function saveSelectedThreadId(threadId: string): void {
  if (typeof window === 'undefined') return
  if (!threadId) {
    window.localStorage.removeItem(SELECTED_THREAD_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SELECTED_THREAD_STORAGE_KEY, threadId)
}

export function loadProjectOrder(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const order: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string' || item.length === 0) continue
      const normalizedItem = toProjectName(item)
      if (normalizedItem.length > 0 && !order.includes(normalizedItem)) {
        order.push(normalizedItem)
      }
    }
    return order
  } catch {
    return []
  }
}

export function saveProjectOrder(order: string[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(order))
}

export function loadProjectDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROJECT_DISPLAY_NAME_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const displayNames: Record<string, string> = {}
    for (const [projectName, displayName] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedProjectName = typeof projectName === 'string' ? toProjectName(projectName) : ''
      if (normalizedProjectName.length > 0 && typeof displayName === 'string') {
        displayNames[normalizedProjectName] = displayName
      }
    }
    return displayNames
  } catch {
    return {}
  }
}

export function saveProjectDisplayNames(displayNames: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_DISPLAY_NAME_STORAGE_KEY, JSON.stringify(displayNames))
}

// ===== round-178：线程消息快照（「先上屏」缓存） =====
//
// 消息正文此前没有任何本地持久化（localStorage 只存 reasoning/耗时/已读等元数据），
// 每次打开线程都要等 thread/resume RPC + 全量归一化 + 渲染全部完成才画第一帧
// （170 轮真实形态实测 ≈1.8s，其中 RPC 期 + 归一化期零上屏）。本快照让重开线程时
// 先把上一次加载的内容立即画出来，RPC 静默刷新覆盖——ChatGPT 桌面端同款体感。
//
// 预算：每线程条目裁到 MAX_THREAD_MESSAGE_SNAPSHOT_BYTES（超出从最旧消息开始丢，
// 保最新——首屏贴底看到的就是最新），全表按 savedAt LRU 保留
// MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES 个线程。条目损坏 / 版本不符 → 整表丢弃。

export const THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY = 'codex-web-local.thread-message-snapshot.v1'
export const MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES = 6
export const MAX_THREAD_MESSAGE_SNAPSHOT_BYTES = 384 * 1024

export type ThreadMessageSnapshotEntry = {
  /** 格式版本（结构不兼容时整体丢弃，不尝试迁移）。 */
  v: 1
  savedAt: number
  /** 保存时服务端是否还有更早轮次（仅信息性；以真实加载结果为准）。 */
  hasMoreOlder: boolean
  messages: UiMessage[]
  /** turnId → turnIndex，供轮次耗时/摘要在快照上屏期间可查。 */
  turnIndexByTurnId: Record<string, number>
}

export type ThreadMessageSnapshotMap = Record<string, ThreadMessageSnapshotEntry>

function loadThreadMessageSnapshotMap(): ThreadMessageSnapshotMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: ThreadMessageSnapshotMap = {}
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<ThreadMessageSnapshotEntry> | null
      if (
        !threadId
        || !entry
        || typeof entry !== 'object'
        || entry.v !== 1
        || !Array.isArray(entry.messages)
        || entry.messages.length === 0
        || typeof entry.savedAt !== 'number'
        || !Number.isFinite(entry.savedAt)
      ) continue
      result[threadId] = {
        v: 1,
        savedAt: entry.savedAt,
        hasMoreOlder: entry.hasMoreOlder === true,
        messages: entry.messages as UiMessage[],
        turnIndexByTurnId: entry.turnIndexByTurnId && typeof entry.turnIndexByTurnId === 'object'
          ? (entry.turnIndexByTurnId as Record<string, number>)
          : {},
      }
    }
    return result
  } catch {
    return {}
  }
}

export function readThreadMessageSnapshot(threadId: string): ThreadMessageSnapshotEntry | null {
  if (!threadId) return null
  return loadThreadMessageSnapshotMap()[threadId] ?? null
}

/**
 * 丢弃单线程快照。回退/中断等「服务端已删轮次」的本地操作后必须调用：
 * 否则刷新重开会先用含已删轮次的旧快照垫底，出现「回退掉了、刷新又回来」
 * （round-143 同类现象，只是窗口从「一直」缩成「上屏后 1 秒内」）。
 */
export function clearThreadMessageSnapshot(threadId: string): void {
  if (!threadId || typeof window === 'undefined') return
  try {
    const map = loadThreadMessageSnapshotMap()
    if (!(threadId in map)) return
    delete map[threadId]
    window.localStorage.setItem(THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore localStorage failures.
  }
}

/**
 * 保存线程消息快照。超预算条目从最旧消息开始裁（保最新 = 首屏所需）；全表 LRU。
 * 任何 localStorage 异常（配额/隐私模式）静默忽略——快照是纯优化，失败即退回旧加载路径。
 */
export function saveThreadMessageSnapshot(
  threadId: string,
  messages: UiMessage[],
  turnIndexByTurnId: Record<string, number>,
  hasMoreOlder: boolean,
): void {
  if (!threadId || messages.length === 0 || typeof window === 'undefined') return
  try {
    const map = loadThreadMessageSnapshotMap()
    const entryMessages = trimSnapshotMessagesToBudget(messages)
    if (entryMessages.length === 0) return
    map[threadId] = {
      v: 1,
      savedAt: Date.now(),
      hasMoreOlder,
      messages: entryMessages,
      turnIndexByTurnId,
    }
    const entries = Object.entries(map)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_THREAD_MESSAGE_SNAPSHOT_ENTRIES)
    const trimmed: ThreadMessageSnapshotMap = {}
    for (const [id, entry] of entries) trimmed[id] = entry
    window.localStorage.setItem(THREAD_MESSAGE_SNAPSHOT_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore localStorage failures (quota/private mode).
  }
}

/**
 * 从最旧端丢消息直到序列化体积进预算；单条超预算时保底保留该条（后续轮仍在）。
 *
 * round-179：旧实现对**每条**消息各 stringify 一次（大线程 9360 条 ≈ 146ms，且在
 * loadMessages 返回路径上同步跑 ⇒ 直接推迟首屏）。现在**从尾部往前累加，够了就停**：
 * 首屏只需要最新约 384KB ⇒ 大线程通常只序列化尾部一百来条。
 * 注意不要改用「整表 stringify 一次」做快路径 —— 实测更慢（4MB 单串分配 ~270ms
 * 且触发大对象 GC，比逐条累加还贵）。
 */
function trimSnapshotMessagesToBudget(messages: UiMessage[]): UiMessage[] {
  const kept: UiMessage[] = []
  let total = 2 // 外层 `[]` 的序列化开销
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    let part = ''
    try {
      part = JSON.stringify(messages[index]) ?? ''
    } catch {
      continue // 序列化失败的单条跳过（旧实现同样不保留它）
    }
    const size = part.length + 1
    // 第一条（最新）无论如何保留，避免「单条超预算 ⇒ 空快照」。
    if (kept.length > 0 && total + size > MAX_THREAD_MESSAGE_SNAPSHOT_BYTES) break
    total += size
    kept.push(messages[index])
  }
  kept.reverse()
  return kept.length > 0 ? kept : messages.slice(-1)
}
