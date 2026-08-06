import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2, readThreadInProgressFromResponse } from './v2'
import type { ThreadReadResponse } from '../appServerDtos'

function threadReadResponseWithContent(content: ThreadReadResponse['thread']['turns'][number]['items'][number][]): ThreadReadResponse {
  return {
    thread: {
      id: 'thread-1',
      preview: 'Use a skill',
      modelProvider: 'openai',
      createdAt: 1,
      updatedAt: 2,
      path: null,
      cwd: '/tmp/project',
      cliVersion: 'test',
      source: 'appServer',
      gitInfo: null,
      turns: [{
        id: 'turn-1',
        status: 'completed',
        error: null,
        items: content,
      }],
    },
  }
}

describe('normalizeThreadMessagesV2', () => {
  it('preserves selected skill inputs on the rendered user message', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-1',
      content: [
        { type: 'text', text: 'Use the browser skill', text_elements: [] },
        { type: 'skill', name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      text: 'Use the browser skill',
      skills: [{ name: 'browser-use:browser', path: '/Users/igor/.codex/skills/browser/SKILL.md' }],
    })
  })

  it('renders skill-only user messages instead of dropping them as raw blocks', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-2',
      content: [
        { type: 'skill', name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' },
      ],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-2',
      role: 'user',
      text: '',
      skills: [{ name: 'composio-cli', path: '/Users/igor/.codex/skills/composio-cli/SKILL.md' }],
    })
    expect(messages[0].isUnhandled).toBeUndefined()
  })

  it('decodes escaped heartbeat instructions without exposing raw XML', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'automation-user-1',
      content: [{
        type: 'text',
        text: `<heartbeat>
<automation_id>automation-1</automation_id>
<current_time_iso>2026-05-09T00:00:00.000Z</current_time_iso>
<instructions>
Reply with &lt;/instructions&gt; and A &amp; B
</instructions>
</heartbeat>`,
        text_elements: [],
      }],
    }]))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'automation-user-1',
      role: 'user',
      text: 'Reply with </instructions> and A & B',
      isAutomationRun: true,
      automationDisplayName: 'automation-1',
    })
  })

  it('applies a base turn index for paged thread slices', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-3',
      content: [{ type: 'text', text: 'Paged message', text_elements: [] }],
    }]), 12)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'user-3',
      turnId: 'turn-1',
      turnIndex: 12,
    })
  })

  it('renders failed turn errors as chat system messages', () => {
    const response = threadReadResponseWithContent([{
      type: 'userMessage',
      id: 'user-4',
      content: [{ type: 'text', text: 'hi', text_elements: [] }],
    }])
    response.thread.turns[0].status = 'failed'
    response.thread.turns[0].error = {
      message: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header',
      codexErrorInfo: null,
      additionalDetails: null,
    }

    const messages = normalizeThreadMessagesV2(response)

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      id: 'turn-1-error',
      role: 'system',
      text: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header',
      messageType: 'turnError',
      turnId: 'turn-1',
      turnIndex: 0,
    })
  })

  it('uses turn index fallback ids for failed turns with blank ids', () => {
    const response = threadReadResponseWithContent([])
    response.thread.turns = [
      {
        id: '',
        status: 'failed',
        error: {
          message: 'first failed turn',
          codexErrorInfo: null,
          additionalDetails: null,
        },
        items: [],
      },
      {
        id: '   ',
        status: 'failed',
        error: {
          message: 'second failed turn',
          codexErrorInfo: null,
          additionalDetails: null,
        },
        items: [],
      },
    ]

    const messages = normalizeThreadMessagesV2(response, 8)

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'turn-8-error',
        text: 'first failed turn',
        turnId: undefined,
        turnIndex: 8,
      }),
      expect.objectContaining({
        id: 'turn-9-error',
        text: 'second failed turn',
        turnId: undefined,
        turnIndex: 9,
      }),
    ])
  })

  it('maps contextCompaction items to the done compaction message', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'contextCompaction',
      id: 'compaction-item-1',
    }]))

    expect(messages).toEqual([
      {
        id: 'compaction-item-1',
        role: 'system',
        text: '',
        messageType: 'compaction.done',
        turnId: 'turn-1',
        turnIndex: 0,
      },
    ])
  })

  it('keeps compaction.done rows after a message reload', () => {
    const first = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'contextCompaction',
      id: 'compaction-item-2',
    }]))
    const second = normalizeThreadMessagesV2(threadReadResponseWithContent([{
      type: 'contextCompaction',
      id: 'compaction-item-2',
    }]))

    expect(first[0]?.messageType).toBe('compaction.done')
    expect(second[0]?.id).toBe(first[0]?.id)
    expect(second[0]?.messageType).toBe('compaction.done')
  })

  it('keeps only the most recent compaction.done when several compactions happened', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      { type: 'agentMessage', id: 'agent-1', text: 'first reply' },
      { type: 'contextCompaction', id: 'compaction-1' },
      { type: 'agentMessage', id: 'agent-2', text: 'second reply' },
      { type: 'contextCompaction', id: 'compaction-2' },
      { type: 'agentMessage', id: 'agent-3', text: 'third reply' },
    ]))

    const compactionRows = messages.filter((message) => message.messageType === 'compaction.done')
    expect(compactionRows).toHaveLength(1)
    expect(compactionRows[0]?.id).toBe('compaction-2')
    expect(messages.map((message) => message.id)).toContain('agent-1')
    expect(messages.map((message) => message.id)).toContain('agent-2')
    expect(messages.map((message) => message.id)).toContain('agent-3')
  })

  it('moves work items (reasoning/commands/tools/plan) right after the user message', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'do the work', text_elements: [] }] },
      { type: 'agentMessage', id: 'agent-1', text: 'I will work on it' },
      { type: 'commandExecution', id: 'cmd-1', command: 'npm test', cwd: '/tmp/project', processId: null, status: 'completed', exitCode: 0, aggregatedOutput: 'ok', commandActions: [], durationMs: 10 },
      { type: 'agentMessage', id: 'agent-2', text: 'All tests pass' },
    ]))

    const order = messages.map((message) => message.id)
    expect(order.indexOf('user-1')).toBe(0)
    expect(order.indexOf('cmd-1')).toBe(1)
    expect(order.indexOf('cmd-1')).toBeLessThan(order.indexOf('agent-2'))
    expect(messages.find((message) => message.id === 'cmd-1')?.messageType).toBe('commandExecution')
  })

  it('renders persisted reasoning items with summary and content', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'think hard', text_elements: [] }] },
      { type: 'reasoning', id: 'reason-1', summary: ['step one'], content: ['line one', 'line two'] },
      { type: 'agentMessage', id: 'agent-1', text: 'done' },
    ]))

    expect(messages).toHaveLength(3)
    const reasoning = messages.find((message) => message.id === 'reason-1')
    expect(reasoning?.messageType).toBe('reasoning')
    expect(reasoning?.text).toBe('line one\nline two')
    expect(reasoning?.reasoning).toEqual({ summary: ['step one'], content: ['line one', 'line two'] })
    expect(messages.map((message) => message.id).indexOf('reason-1')).toBe(1)
  })

  it('renders persisted mcpToolCall items with a toolCall payload', () => {
    const messages = normalizeThreadMessagesV2(threadReadResponseWithContent([
      { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'use a tool', text_elements: [] }] },
      {
        type: 'mcpToolCall',
        id: 'tool-1',
        server: 'github',
        tool: 'create_issue',
        status: 'completed',
        arguments: {},
        result: { content: [], structuredContent: {} },
        error: null,
        durationMs: 42,
      },
      { type: 'agentMessage', id: 'agent-1', text: 'opened' },
    ]))

    const tool = messages.find((message) => message.id === 'tool-1')
    expect(tool?.messageType).toBe('toolCall')
    expect(tool?.toolCall).toMatchObject({ server: 'github', tool: 'create_issue', status: 'completed', durationMs: 42 })
    expect(messages.map((message) => message.id).indexOf('tool-1')).toBe(1)
  })
})

describe('readThreadInProgressFromResponse', () => {
  it('treats active thread status objects as in progress', () => {
    const response = threadReadResponseWithContent([])
    ;(response.thread as unknown as { status: { type: string } }).status = { type: 'active' }

    expect(readThreadInProgressFromResponse(response)).toBe(true)
  })
})
