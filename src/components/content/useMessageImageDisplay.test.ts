import { describe, expect, it, vi } from 'vitest'
import { createMessageImageDisplay } from './useMessageImageDisplay'

function display(isVideo: (url: string) => boolean = (u) => u.endsWith('.mp4')) {
  return createMessageImageDisplay({ isVideo })
}

describe('useMessageImageDisplay', () => {
  it('starts with a closed modal and no failures', () => {
    const d = display()
    expect(d.modalImageUrl.value).toBe('')
    expect(d.modalIsVideo.value).toBe(false)
    expect(d.markdownImageFailureVersion.value).toBe(0)
    expect(d.isMarkdownImageFailed('m1', 0)).toBe(false)
  })

  it('opens the modal and flags video via the injected predicate', () => {
    const isVideo = vi.fn((u: string) => u.endsWith('.mp4'))
    const d = display(isVideo)

    d.openImageModal('/asset/photo.png')
    expect(d.modalImageUrl.value).toBe('/asset/photo.png')
    expect(d.modalIsVideo.value).toBe(false)

    d.openImageModal('/asset/clip.mp4')
    expect(d.modalImageUrl.value).toBe('/asset/clip.mp4')
    expect(d.modalIsVideo.value).toBe(true)
    expect(isVideo).toHaveBeenCalledWith('/asset/clip.mp4')
  })

  it('closes the modal and clears the video flag', () => {
    const d = display()
    d.openImageModal('/asset/clip.mp4')
    d.closeImageModal()
    expect(d.modalImageUrl.value).toBe('')
    expect(d.modalIsVideo.value).toBe(false)
  })

  it('tracks failed markdown images per message id + block and bumps the version', () => {
    const d = display()
    d.onMarkdownImageError('m1', 0)
    expect(d.isMarkdownImageFailed('m1', 0)).toBe(true)
    expect(d.isMarkdownImageFailed('m1', 1)).toBe(false)
    expect(d.isMarkdownImageFailed('m2', 0)).toBe(false)
    expect(d.markdownImageFailureVersion.value).toBe(1)

    d.onMarkdownImageError('m1', 0)
    expect(d.markdownImageFailureVersion.value).toBe(2)
  })
})