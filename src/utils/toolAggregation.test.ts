import { describe, expect, it } from 'vitest'
import {
  aggregateToolMessages,
  buildToolBatchLabel,
  MIN_TOOL_BATCH_ITEMS,
  type ToolBatchKind,
} from './toolAggregation'
import type { UiMessage } from '../types/codex'

function tool(id: string, name: string, status: 'inProgress' | 'completed' | 'failed' = 'completed'): UiMessage {
  return {
    id,
    role: 'system',
    text: '',
    messageType: 'toolCall',
    turnId: 't1',
    turnIndex: 0,
    toolCall: { server: 's', tool: name, status },
  } as UiMessage
}

function other(id: string, messageType: string): UiMessage {
  return { id, role: 'system', text: '', messageType, turnId: 't1', turnIndex: 0 } as UiMessage
}

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? key.replace(/\{(\w+)\}/g, (_match, k: string) => String(params[k] ?? '')) : key

describe('aggregateToolMessages', () => {
  it('merges consecutive completed read-only tools into a readonly batch', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'read_file'),
      tool('tc2', 'read_file'),
      tool('tc3', 'ls'),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'batch', kind: 'readonly' })
    expect((items[0] as { messages: UiMessage[] }).messages.map((m) => m.id)).toEqual(['tc1', 'tc2', 'tc3'])
  })

  it('merges consecutive same-kind modify tools into a tool group', () => {
    const items = aggregateToolMessages([tool('tc1', 'edit_file'), tool('tc2', 'write_file')])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'batch', kind: 'modify' })
  })

  it('keeps a single tool unbatched', () => {
    const items = aggregateToolMessages([tool('tc1', 'read_file')])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'tool', message: { id: 'tc1' } })
  })

  it('flushes batches when the kind changes', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'read_file'),
      tool('tc2', 'read_file'),
      tool('tc3', 'edit_file'),
      tool('tc4', 'write_file'),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'batch', kind: 'readonly' })
    expect((items[0] as { messages: UiMessage[] }).messages.map((m) => m.id)).toEqual(['tc1', 'tc2'])
    expect(items[1]).toMatchObject({ type: 'batch', kind: 'modify' })
  })

  it('keeps running tools unbatched and breaks batches', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'read_file'),
      tool('tc2', 'read_file', 'inProgress'),
      tool('tc3', 'read_file'),
    ])
    expect(items).toHaveLength(3)
    for (const item of items) expect(item.type).toBe('tool')
  })

  it('breaks batches on non-tool messages', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'read_file'),
      tool('tc2', 'read_file'),
      other('c1', 'commandExecution'),
      tool('tc3', 'read_file'),
      tool('tc4', 'read_file'),
    ])
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ type: 'batch', kind: 'readonly' })
    expect(items[1]).toMatchObject({ type: 'tool', message: { id: 'c1' } })
    expect(items[2]).toMatchObject({ type: 'batch', kind: 'readonly' })
  })

  it('keeps unknown tool names unbatched', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'custom_mcp_call'),
      tool('tc2', 'custom_mcp_call'),
    ])
    expect(items).toHaveLength(2)
    for (const item of items) expect(item.type).toBe('tool')
  })

  it('keeps failed tools batchable (non-running statuses aggregate)', () => {
    const items = aggregateToolMessages([
      tool('tc1', 'edit_file', 'failed'),
      tool('tc2', 'write_file', 'completed'),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'batch', kind: 'modify' })
  })

  it('does not batch when fewer than MIN_TOOL_BATCH_ITEMS items', () => {
    expect(MIN_TOOL_BATCH_ITEMS).toBe(2)
    const items = aggregateToolMessages([tool('tc1', 'edit_file')])
    expect(items[0]?.type).toBe('tool')
  })
})

describe('buildToolBatchLabel', () => {
  it('counts read vs search in readonly batches', () => {
    const label = buildToolBatchLabel(
      'readonly',
      [tool('tc1', 'read_file'), tool('tc2', 'ls'), tool('tc3', 'grep'), tool('tc4', 'web_fetch')],
      { t },
    )
    expect(label).toBe('Read 2 files · Search 2 files')
  })

  it('reports other read calls in readonly batches', () => {
    const label = buildToolBatchLabel('readonly', [tool('tc1', 'read_skill'), tool('tc2', 'code_index')], { t })
    expect(label).toBe('Search 1 files · 1 read calls')
  })

  it('labels modify and delegate batches by count', () => {
    expect(buildToolBatchLabel('modify' as ToolBatchKind, [tool('tc1', 'write_file'), tool('tc2', 'edit_file')], { t })).toBe(
      'Modified 2 files',
    )
    expect(buildToolBatchLabel('delegate' as ToolBatchKind, [tool('tc1', 'task'), tool('tc2', 'review')], { t })).toBe(
      'Delegated 2 tasks',
    )
  })
})
