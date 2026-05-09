import { describe, expect, it } from 'vitest'
import {
  chatCompletionToResponsesFormat,
  responsesInputToMessages,
} from './unifiedResponsesProxy'

describe('unified responses proxy reasoning_content translation', () => {
  it('preserves DeepSeek reasoning_content in translated Responses output', () => {
    const response = chatCompletionToResponsesFormat({
      id: 'chatcmpl-test',
      created: 123,
      choices: [{
        message: {
          role: 'assistant',
          reasoning_content: 'thinking trace',
          content: 'Hello.',
        },
      }],
    }, 'big-pickle')

    expect(response.output).toEqual([
      {
        type: 'reasoning',
        id: expect.stringMatching(/^rs_/),
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking trace' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello.' }],
        status: 'completed',
      },
    ])
  })

  it('passes prior reasoning items back as assistant reasoning_content', () => {
    const messages = responsesInputToMessages([
      {
        type: 'reasoning',
        id: 'rs_test',
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking trace' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello.' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'again' }],
      },
    ])

    expect(messages).toEqual([
      { role: 'assistant', content: 'Hello.', reasoning_content: 'thinking trace' },
      { role: 'user', content: 'again' },
    ])
  })

  it('passes reasoning_content back on assistant tool-call messages', () => {
    const messages = responsesInputToMessages([
      {
        type: 'reasoning',
        id: 'rs_test',
        summary: [],
        content: [{ type: 'reasoning_text', text: 'thinking before tool' }],
      },
      {
        type: 'function_call',
        call_id: 'call_test',
        name: 'exec_command',
        arguments: '{"cmd":"pwd"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_test',
        output: 'ok',
      },
    ])

    expect(messages).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning_content: 'thinking before tool',
        tool_calls: [{
          id: 'call_test',
          type: 'function',
          function: { name: 'exec_command', arguments: '{"cmd":"pwd"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_test',
        content: 'ok',
      },
    ])
  })
})
