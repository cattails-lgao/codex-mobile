import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2 } from './v2'
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
})
