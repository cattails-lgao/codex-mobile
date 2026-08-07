import { describe, expect, it } from 'vitest'
import { displayReasoningText, STREAMING_REASONING_TAIL_CHARS, STREAMING_REASONING_TAIL_LINES } from './reasoningDisplay'

// 移植自 DeepSeek-Reasonix `__tests__/reasoning-display.test.ts`（改为 vitest 断言）。

describe('displayReasoningText', () => {
  it('keeps completed (non-streaming) reasoning intact', () => {
    expect(displayReasoningText('a\nb\nc', { streaming: false, maxLines: 2 })).toBe('a\nb\nc')
  })

  it('keeps only the tail lines while streaming', () => {
    expect(displayReasoningText('a\nb\nc', { streaming: true, maxLines: 2 })).toBe('...\nb\nc')
  })

  it('keeps only the tail characters while streaming', () => {
    expect(displayReasoningText('abcdef', { streaming: true, maxChars: 3, maxLines: 10 })).toBe('...\ndef')
  })

  it('can opt out of streaming truncation', () => {
    expect(displayReasoningText('abcdef', { streaming: true, truncateStreaming: false, maxChars: 3 })).toBe('abcdef')
  })

  it('applies char cap first then line cap, prefixing a single ellipsis marker', () => {
    const long = 'x'.repeat(13_000) + '\n' + 'y'.repeat(13_000)
    const out = displayReasoningText(long, { streaming: true })
    expect(out.startsWith('...\n')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(3 + STREAMING_REASONING_TAIL_CHARS + 1)
  })

  it('caps streamed reasoning to the configured line budget', () => {
    const manyLines = Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n')
    const out = displayReasoningText(manyLines, { streaming: true })
    const body = out.replace(/^\.\.\.\n/, '')
    expect(body.split('\n')).toHaveLength(STREAMING_REASONING_TAIL_LINES)
    expect(body.endsWith('line-499')).toBe(true)
  })
})
