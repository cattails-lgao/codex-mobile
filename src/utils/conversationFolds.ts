// Process Fold 分组：按 turnId 把同一轮次内连续的思考块 + 工作块 + 工具调用
// 包进可折叠容器（对应 DeepSeek-Reasonix `TurnCollapse` 的阶段 A 基础版）。
// 纯函数，无组件依赖；标签构建注入 `t`/`formatDuration` 便于单测。

import type { UiMessage } from '../types/codex'

// 单条工作消息不折叠：保持单命令轮次的平铺清晰（第七轮「像 trae-work 一样清晰」
// 的要求），仅对 ≥2 条工作项的轮次启用折叠去噪。
export const MIN_PROCESS_FOLD_ITEMS = 2

export type ProcessFoldItem = {
  turnId: string
  messages: UiMessage[]
  running: boolean
  toolCount: number
  thoughtCount: number
  commandCount: number
  durationMs: number
  hasOutsideContent: boolean
}

export type FoldLabelDeps = {
  t: (key: string, params?: Record<string, string | number>) => string
  formatDuration: (durationMs: number) => string
}

// 折叠成员：仅命令执行与工具调用。思考块（reasoning）刻意排除在折叠之外——
// 用户需要稳定看到「Thinking process」块（第十六轮反馈：思考过程块时有时无，
// 根因就是它被 Process Fold 折叠后只在展开时才可见），reasoning 始终平铺在
// 消息流中，宽度与普通消息一致、左对齐。
export function isFoldableProcessMessage(message: UiMessage): boolean {
  const type = message.messageType
  return type === 'commandExecution' || type === 'toolCall'
}

export function isRunningProcessMessage(message: UiMessage): boolean {
  if ((message.commandExecution?.status ?? '') === 'inProgress') return true
  if ((message.toolCall?.status ?? '') === 'inProgress') return true
  const type = message.messageType ?? ''
  return type.endsWith('.live')
}

// 把窗口内消息流拆成「消息行 + 折叠行」需要的折叠组。只折叠同轮（非空 turnId
// 相同）且连续的折叠类型消息；跨轮次的命令/工具/思考各自独立，不会被误并。
export function buildProcessFolds(messages: UiMessage[]): ProcessFoldItem[] {
  const groups: UiMessage[][] = []
  let current: UiMessage[] = []
  let currentTurn = ''
  const flush = (): void => {
    if (current.length > 0) {
      groups.push(current)
      current = []
    }
  }

  for (const message of messages) {
    const turnId = message.turnId ?? ''
    const foldable = isFoldableProcessMessage(message) && turnId !== ''
    if (!foldable || turnId !== currentTurn) {
      if (current.length > 0) flush()
      currentTurn = foldable ? turnId : ''
    }
    if (foldable) current.push(message)
  }
  flush()

  const turnDurations = new Map<string, number>()
  for (const message of messages) {
    if (message.messageType === 'worked' && message.turnId && typeof message.durationMs === 'number') {
      turnDurations.set(message.turnId, message.durationMs)
    }
  }

  const folds: ProcessFoldItem[] = []
  for (const group of groups) {
    if (group.length < MIN_PROCESS_FOLD_ITEMS) continue
    const turnId = group[0].turnId ?? ''
    let toolCount = 0
    let thoughtCount = 0
    let commandCount = 0
    let running = false
    for (const message of group) {
      if (message.messageType === 'toolCall') toolCount += 1
      else if (message.messageType === 'reasoning') thoughtCount += 1
      else if (message.messageType === 'commandExecution') commandCount += 1
      if (isRunningProcessMessage(message)) running = true
    }
    const hasOutsideContent = messages.some(
      (message) => message.turnId === turnId && !isFoldableProcessMessage(message),
    )
    folds.push({
      turnId,
      messages: group,
      running,
      toolCount,
      thoughtCount,
      commandCount,
      durationMs: turnDurations.get(turnId) ?? 0,
      hasOutsideContent,
    })
  }
  return folds
}

// 折叠条文案：`耗时 · N 工具 · M 思考`；运行中改为状态文案，无耗时/计数时回退「已处理」。
export function buildProcessFoldLabel(fold: ProcessFoldItem, deps: FoldLabelDeps): string {
  const { t, formatDuration } = deps
  const parts: string[] = []
  if (fold.running) {
    parts.push(t('Working…'))
  } else if (fold.durationMs > 0) {
    parts.push(formatDuration(fold.durationMs))
  } else {
    parts.push(t('Processed'))
  }
  if (fold.toolCount > 0) parts.push(t('{n} tools', { n: fold.toolCount }))
  if (fold.thoughtCount > 0) parts.push(t('{n} thoughts', { n: fold.thoughtCount }))
  if (fold.commandCount > 0) parts.push(t('{n} commands', { n: fold.commandCount }))
  return parts.join(' · ')
}
