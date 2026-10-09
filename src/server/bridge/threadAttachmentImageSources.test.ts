import { describe, expect, it, vi } from 'vitest'
import {
  extractRenderableAttachmentSource,
  resolveFileIdImageBlocksInThreadResult,
  toRenderableMediaSource,
} from './threadAttachmentImageSources.js'

function threadWithFileIdImage(threadId: string, fileId: string): unknown {
  return {
    thread: {
      id: threadId,
      turns: [
        {
          id: 'turn-1',
          items: [
            {
              id: 'item-1',
              type: 'userMessage',
              content: [
                { type: 'text', text: 'look at this' },
                { type: 'image', fileId },
              ],
            },
          ],
        },
      ],
    },
  }
}

describe('toRenderableMediaSource', () => {
  it('passes through data: URLs for image and video', () => {
    expect(toRenderableMediaSource('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(toRenderableMediaSource('data:video/mp4;base64,AAAA')).toBe('data:video/mp4;base64,AAAA')
  })

  it('rejects data: URLs that are not media', () => {
    expect(toRenderableMediaSource('data:text/plain;base64,AAAA')).toBeNull()
    expect(toRenderableMediaSource('data:application/pdf;base64,AAAA')).toBeNull()
  })

  it('passes through http(s) URLs', () => {
    expect(toRenderableMediaSource('https://example.com/a.png')).toBe('https://example.com/a.png')
  })

  it('maps an absolute Windows image path onto the local-image proxy', () => {
    expect(toRenderableMediaSource('C:\\Users\\me\\shot.PNG'))
      .toBe('/codex-local-image?path=C%3A%5CUsers%5Cme%5Cshot.PNG')
  })

  it('maps an absolute posix image path onto the local-image proxy', () => {
    expect(toRenderableMediaSource('/tmp/shot.jpeg'))
      .toBe('/codex-local-image?path=%2Ftmp%2Fshot.jpeg')
  })

  it('maps a file:// URL onto the local-image proxy', () => {
    expect(toRenderableMediaSource('file:///tmp/shot.webp'))
      .toBe('/codex-local-image?path=%2Ftmp%2Fshot.webp')
  })

  it('rejects absolute paths whose extension is not in the local-image allowlist', () => {
    expect(toRenderableMediaSource('/tmp/notes.txt')).toBeNull()
    expect(toRenderableMediaSource('C:\\tmp\\payload.exe')).toBeNull()
    expect(toRenderableMediaSource('/etc/passwd')).toBeNull()
  })

  it('rejects relative paths and empty strings', () => {
    expect(toRenderableMediaSource('images/shot.png')).toBeNull()
    expect(toRenderableMediaSource('   ')).toBeNull()
  })
})

describe('extractRenderableAttachmentSource', () => {
  it('finds a nested data URL without relying on field names', () => {
    const payload = { a: { b: [{ irrelevant: 'nope' }, { x: 'data:image/png;base64,ZZZ' }] } }
    expect(extractRenderableAttachmentSource(payload)).toBe('data:image/png;base64,ZZZ')
  })

  it('finds an absolute image path nested in an array', () => {
    expect(extractRenderableAttachmentSource(['opaque', '/var/media/pic.png']))
      .toBe('/codex-local-image?path=%2Fvar%2Fmedia%2Fpic.png')
  })

  it('returns null when the payload carries nothing renderable', () => {
    expect(extractRenderableAttachmentSource({ blobRef: 'abc123', size: 42 })).toBeNull()
    expect(extractRenderableAttachmentSource(null)).toBeNull()
    expect(extractRenderableAttachmentSource(42)).toBeNull()
  })

  it('does not descend past the depth bound', () => {
    let deep: unknown = 'data:image/png;base64,DEEP'
    for (let i = 0; i < 10; i += 1) deep = { nested: deep }
    expect(extractRenderableAttachmentSource(deep)).toBeNull()
  })
})

describe('resolveFileIdImageBlocksInThreadResult', () => {
  it('sends no RPC when the result has no fileId image', async () => {
    const listAttachments = vi.fn(async () => [])
    const result = { thread: { id: 't1', turns: [{ items: [{ content: [{ type: 'image', url: 'data:image/png;base64,A' }] }] }] } }
    const out = await resolveFileIdImageBlocksInThreadResult(result, listAttachments)
    expect(out).toBe(result)
    expect(listAttachments).not.toHaveBeenCalled()
  })

  it('rewrites a block matched by attachment id', async () => {
    const result = threadWithFileIdImage('t1', 'file-1')
    const listAttachments = vi.fn(async () => [{ id: 'file-1', identityKey: 'k1', payload: { any: 'data:image/png;base64,AAA' } }])
    await resolveFileIdImageBlocksInThreadResult(result, listAttachments)
    expect(listAttachments).toHaveBeenCalledTimes(1)
    expect(listAttachments).toHaveBeenCalledWith('t1')
    const block = (result as any).thread.turns[0].items[0].content[1]
    expect(block).toEqual({ type: 'image', url: 'data:image/png;base64,AAA' })
    expect(block.fileId).toBeUndefined()
  })

  it('rewrites a block matched by attachment identityKey', async () => {
    const result = threadWithFileIdImage('t1', 'identity-1')
    await resolveFileIdImageBlocksInThreadResult(result, async () => [
      { id: 'other-id', identityKey: 'identity-1', payload: ['/tmp/a.png'] },
    ])
    expect((result as any).thread.turns[0].items[0].content[1])
      .toEqual({ type: 'image', url: '/codex-local-image?path=%2Ftmp%2Fa.png' })
  })

  it('leaves the block untouched when the attachment carries nothing renderable', async () => {
    const result = threadWithFileIdImage('t1', 'file-1')
    await resolveFileIdImageBlocksInThreadResult(result, async () => [
      { id: 'file-1', identityKey: 'k1', payload: { blobRef: 'opaque' } },
    ])
    expect((result as any).thread.turns[0].items[0].content[1]).toEqual({ type: 'image', fileId: 'file-1' })
  })

  it('leaves the result untouched when the attachment lookup throws', async () => {
    const result = threadWithFileIdImage('t1', 'file-1')
    const out = await resolveFileIdImageBlocksInThreadResult(result, async () => {
      throw new Error('list_turns is not supported yet')
    })
    expect(out).toBe(result)
    expect((result as any).thread.turns[0].items[0].content[1].fileId).toBe('file-1')
  })

  it('rewrites only the resolvable block out of several', async () => {
    const result = {
      thread: {
        id: 't1',
        turns: [{
          items: [{
            content: [
              { type: 'image', fileId: 'missing' },
              { type: 'image', fileId: 'present' },
              { type: 'text', text: 'hi' },
            ],
          }],
        }],
      },
    }
    await resolveFileIdImageBlocksInThreadResult(result, async () => [
      { id: 'present', identityKey: 'k', payload: { inner: 'data:image/gif;base64,R0lGOD' } },
    ])
    const content = (result as any).thread.turns[0].items[0].content
    expect(content[0]).toEqual({ type: 'image', fileId: 'missing' })
    expect(content[1]).toEqual({ type: 'image', url: 'data:image/gif;base64,R0lGOD' })
    expect(content[2]).toEqual({ type: 'text', text: 'hi' })
  })

  it('is idempotent: a rewritten result triggers no further lookup', async () => {
    const result = threadWithFileIdImage('t1', 'file-1')
    const listAttachments = vi.fn(async () => [{ id: 'file-1', identityKey: 'k', payload: 'data:image/png;base64,A' }])
    await resolveFileIdImageBlocksInThreadResult(result, listAttachments)
    await resolveFileIdImageBlocksInThreadResult(result, listAttachments)
    expect(listAttachments).toHaveBeenCalledTimes(1)
  })
})
