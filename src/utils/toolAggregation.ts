// 阶段 C 工具聚合：把同一折叠内「连续相邻」的工具调用按类别合并展示。
// 对应 DeepSeek-Reasonix 的 ReadOnlyBatch（连续只读工具）与 ToolGroup（同类工具，
// modify/delegate）在 classic 布局下的组合语义：只读工具合并成 ReadOnlyBatch，
// 非只读但可分类的同类工具合并成 ToolGroup，未知工具名保持单条。
// 纯函数，无组件依赖；标签构建注入 `t` 便于单测。

import type { UiMessage } from '../types/codex'

export type ToolBatchKind = 'readonly' | 'modify' | 'delegate'

// 只读工具（对应 Reasonix EXPLORE_TOOLS 的只读子集；本地 MCP 工具无 readOnly 元数据，
// 按内置工具名判定，未知工具不聚合）
export const READONLY_TOOL_NAMES = new Set([
  'read_file',
  'ls',
  'grep',
  'glob',
  'web_fetch',
  'read_skill',
  'code_index',
  'connect_tool_source',
])

export const MODIFY_TOOL_NAMES = new Set([
  'write_file',
  'edit_file',
  'multi_edit',
  'move_file',
  'delete_range',
  'delete_symbol',
  'notebook_edit',
])

export const DELEGATE_TOOL_NAMES = new Set([
  'task',
  'run_skill',
  'explore',
  'research',
  'review',
  'security_review',
])

export function toolBatchKindFor(message: UiMessage): ToolBatchKind | null {
  const tool = message.toolCall?.tool ?? ''
  if (READONLY_TOOL_NAMES.has(tool)) return 'readonly'
  if (MODIFY_TOOL_NAMES.has(tool)) return 'modify'
  if (DELEGATE_TOOL_NAMES.has(tool)) return 'delegate'
  return null
}

// 单条工具不聚合：保持 tool-call 行的平铺清晰（与 ProcessFold 的
// MIN_PROCESS_FOLD_ITEMS 同思路），仅对 ≥2 条的连续同类工具启用合并。
export const MIN_TOOL_BATCH_ITEMS = 2

export type ToolRenderItem =
  | { type: 'tool'; message: UiMessage }
  | { type: 'batch'; kind: ToolBatchKind; messages: UiMessage[] }

// 把消息序列拆成「单条 tool 行 + 聚合批」：只聚合连续相邻、已完成、可分类的
// toolCall；running 中、未知工具名、非 toolCall 消息都会打断聚合。
export function aggregateToolMessages(messages: UiMessage[]): ToolRenderItem[] {
  const out: ToolRenderItem[] = []
  let batch: UiMessage[] = []
  let batchKind: ToolBatchKind | null = null
  const flush = (): void => {
    if (batchKind !== null && batch.length >= MIN_TOOL_BATCH_ITEMS) {
      out.push({ type: 'batch', kind: batchKind, messages: batch })
    } else {
      for (const message of batch) out.push({ type: 'tool', message })
    }
    batch = []
    batchKind = null
  }

  for (const message of messages) {
    if (message.messageType !== 'toolCall' || message.toolCall?.status === 'inProgress') {
      flush()
      out.push({ type: 'tool', message })
      continue
    }
    const kind = toolBatchKindFor(message)
    if (kind === null) {
      flush()
      out.push({ type: 'tool', message })
      continue
    }
    if (batchKind !== null && batchKind !== kind) flush()
    batchKind = kind
    batch.push(message)
  }
  flush()
  return out
}

export type ToolBatchLabelDeps = {
  t: (key: string, params?: Record<string, string | number>) => string
}

// 聚合批标签：readonly 批按 read/search/other 细分计数（对应 Reasonix ReadOnlyBatch），
// modify/delegate 批按总条数。
export function buildToolBatchLabel(
  kind: ToolBatchKind,
  messages: UiMessage[],
  deps: ToolBatchLabelDeps,
): string {
  const { t } = deps
  if (kind === 'readonly') {
    const readCount = messages.filter(
      (m) => m.toolCall?.tool === 'read_file' || m.toolCall?.tool === 'ls',
    ).length
    const searchCount = messages.filter((m) => {
      const tool = m.toolCall?.tool ?? ''
      return tool === 'grep' || tool === 'glob' || tool === 'web_fetch' || tool === 'code_index'
    }).length
    const otherCount = messages.length - readCount - searchCount
    const parts: string[] = []
    if (readCount > 0) parts.push(t('Read {n} files', { n: readCount }))
    if (searchCount > 0) parts.push(t('Search {n} files', { n: searchCount }))
    if (otherCount > 0) parts.push(t('{n} read calls', { n: otherCount }))
    return parts.join(' · ')
  }
  if (kind === 'modify') return t('Modified {n} files', { n: messages.length })
  if (kind === 'delegate') return t('Delegated {n} tasks', { n: messages.length })
  return t('Explored {n} items', { n: messages.length })
}
