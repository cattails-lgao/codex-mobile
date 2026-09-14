// Regression: a first turn carrying only a file attachment (no typed text) used to
// compose `# Files mentioned by the user: ... ## My request for Codex:\n\n\n`. app-server
// derives the thread row's preview/title/first_user_message from that first user message,
// so all three became '' and `thread/list` (filtered on `preview <> ''`) dropped the row —
// the thread vanished from the sidebar while its rollout kept growing. Verified against
// app-server 0.153.4; `thread/metadata/update` cannot write `preview` back, so the thread
// was unrecoverable. Assert the composed turn text always keeps a non-empty body.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRpcMock = vi.hoisted(() => vi.fn())

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return { ...actual, callRpc: callRpcMock }
})

import { startThreadTurn } from './threads'

const FILE_ATTACHMENT = { label: 'clip.mp4', path: 'C:/tmp/clip.mp4', fsPath: 'C:/tmp/clip.mp4' }

function composedTextFromLastTurnStart(): string {
  const call = callRpcMock.mock.calls.find(([method]) => method === 'turn/start')
  expect(call).toBeTruthy()
  const params = call?.[1] as { input?: Array<{ type: string; text?: string }> }
  const textBlock = params.input?.find((block) => block.type === 'text')
  return textBlock?.text ?? ''
}

function bodyAfterMarker(text: string): string {
  return text.split('## My request for Codex:')[1] ?? text
}

beforeEach(() => {
  callRpcMock.mockReset()
  callRpcMock.mockResolvedValue({ turn: { id: 'turn-1' } })
})

describe('startThreadTurn blank prompt', () => {
  it('keeps a non-empty body when only an attachment is sent', async () => {
    await startThreadTurn('thread-1', '', [], 'gpt-5.4', undefined, undefined, [FILE_ATTACHMENT])

    const text = composedTextFromLastTurnStart()
    expect(text).toContain('# Files mentioned by the user:')
    expect(text).toContain('## clip.mp4: C:/tmp/clip.mp4')
    expect(bodyAfterMarker(text).trim()).toBe('clip.mp4')
  })

  it('keeps a non-empty body for an image-only turn (local image becomes a file label)', async () => {
    await startThreadTurn(
      'thread-1',
      '   ',
      ['http://localhost/codex-local-image?path=C:/tmp/a.png'],
      'gpt-5.4',
    )

    const text = composedTextFromLastTurnStart()
    expect(text).toContain('## a.png: C:/tmp/a.png')
    expect(bodyAfterMarker(text).trim()).toBe('a.png')
  })

  it('keeps a non-empty body for a remote image-only turn', async () => {
    await startThreadTurn('thread-1', '', ['https://example.com/a.png'], 'gpt-5.4')

    expect(composedTextFromLastTurnStart().trim()).toBe('[Image]')
  })
})
