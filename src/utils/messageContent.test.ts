import { describe, expect, it } from 'vitest'
import { hasMessageBodyContent, shouldOmitEmptyGenericMessage } from './messageContent'
import type { UiMessage } from '../types/codex'

function rawMessage(partial: Partial<UiMessage>): UiMessage {
  return {
    id: 'm1',
    role: 'assistant',
    messageType: 'agentMessage',
    text: '',
    turnId: 't1',
    ...partial,
  } as UiMessage
}

describe('shouldOmitEmptyGenericMessage', () => {
  it('omits a generic message with no text/images/attachments/skills', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({}))).toBe(true)
  })

  it('keeps a generic message with non-empty text', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ text: 'working…' }))).toBe(false)
  })

  it('keeps a generic message that only has images', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ images: ['https://example/x.png'] }))).toBe(false)
  })

  it('keeps a generic message that only has file attachments', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ fileAttachments: [{ path: '/a', label: 'a' }] }))).toBe(false)
  })

  it('keeps a generic message that only has unresolved image attachments (round-137)', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ imageAttachmentIds: ['file-abc'] }))).toBe(false)
    expect(hasMessageBodyContent(rawMessage({ imageAttachmentIds: ['file-abc'] }))).toBe(true)
  })

  it('keeps a generic message that only has audio (round-138)', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ audioSources: ['data:audio/wav;base64,A'] }))).toBe(false)
  })

  it('keeps a generic message that only has mentions (round-138)', () => {
    expect(shouldOmitEmptyGenericMessage(rawMessage({ mentions: [{ name: 'm', path: '/tmp/m.ts' }] }))).toBe(false)
  })

  it('omits when content is empty (hasMessageBodyContent mirrors)', () => {
    expect(hasMessageBodyContent(rawMessage({}))).toBe(false)
    expect(hasMessageBodyContent(rawMessage({ text: 'x' }))).toBe(true)
  })
})