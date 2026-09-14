// The three shapes below mirror the live app-server 0.153.4 reproduction: an
// attachment-only first message and an empty text block both produced
// preview/title/first_user_message = '' and were dropped by `thread/list`'s
// `preview <> ''` filter, while a plain prompt kept its metadata.
import { describe, expect, it } from 'vitest'
import { resolveTurnPromptText } from './turnPromptText'

const VIDEO = [{ label: 'clip.mp4' }]

describe('resolveTurnPromptText', () => {
  it('keeps typed text untouched', () => {
    expect(resolveTurnPromptText('fix the bug', VIDEO, [])).toBe('fix the bug')
  })

  it('falls back to the first attachment label when the body is blank', () => {
    expect(resolveTurnPromptText('', VIDEO, [])).toBe('clip.mp4')
    expect(resolveTurnPromptText('   \n ', [{ label: ' ' }, { label: ' notes.txt ' }], [])).toBe('notes.txt')
  })

  it('falls back to [Image] for image-only turns', () => {
    expect(resolveTurnPromptText('', [], ['http://localhost/codex-local-image?path=/tmp/a.png']))
      .toBe('[Image]')
  })

  it('never returns a blank body for a payload-only turn', () => {
    // skills-only shape: no text, no files, no images — still must not be empty.
    expect(resolveTurnPromptText('', [], []).trim().length).toBeGreaterThan(0)
  })
})
