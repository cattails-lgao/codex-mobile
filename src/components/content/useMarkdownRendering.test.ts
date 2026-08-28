import { describe, expect, it } from 'vitest'
import type { UiMessage } from '../../types/codex'
import { createMarkdownRendering } from './useMarkdownRendering'

function renderFor(cwd: string) {
  return createMarkdownRendering({
    getCwd: () => cwd,
    isVideoMediaUrl: () => false,
  })
}

function message(id: string, text: string): UiMessage {
  return { id, text } as UiMessage
}

describe('useMarkdownRendering', () => {
  it('renders inline bold inside a paragraph', () => {
    const rendering = renderFor('/repo')
    expect(rendering.renderMarkdownBlocksAsHtml('Hello **world**')).toBe(
      '<p class="message-text">Hello <strong class="message-bold-text">world</strong></p>',
    )
  })

  it('returns cached blocks for a message regardless of cwd change', () => {
    const rendering = renderFor('/repo')
    const blocks = rendering.getMessageBlocks(message('m1', '# Title'))
    const [first] = blocks
    expect(first.kind).toBe('heading')
    if (first.kind === 'heading') {
      expect(first.level).toBe(1)
    }

    const again = rendering.getMessageBlocks(message('m1', '# Title'))
    expect(again).toBe(blocks)
  })

  it('keys the message block cache by message text and cwd', () => {
    const rendering = renderFor('/repo')
    rendering.getMessageBlocks(message('m1', '# Title'))
    const changedText = rendering.getMessageBlocks(message('m1', 'other'))
    expect(changedText[0].kind).not.toBe('heading')

    const reverted = rendering.getMessageBlocks(message('m1', '# Title'))
    expect(reverted[0].kind).toBe('heading')
  })

  it('escapes raw code blocks when highlighting is not loaded', () => {
    const rendering = renderFor('/repo')
    const html = rendering.renderMarkdownBlocksAsHtml('```ts\nconst a = 1 < 2\n```')
    expect(html).toContain('&lt;')
  })

  it('clears caches and still renders', () => {
    const rendering = renderFor('/repo')
    expect(rendering.renderMarkdownBlocksAsHtml('x')).toContain('message-text')
    rendering.clearRenderCaches()
    expect(rendering.renderMarkdownBlocksAsHtml('x')).toContain('message-text')
  })
})