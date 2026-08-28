import { describe, expect, it, vi } from 'vitest'
import { createFileLinkContextMenu } from './useFileLinkContextMenu'

// The guard is duck-typed (no DOM globals), so plain-object mocks suffice under
// Vitest's node environment.
function fakeAnchor(href: string | null): Record<string, unknown> {
  return {
    getAttribute: (name: string) => (name === 'href' ? href : null),
  }
}

function fakeTarget(closestResult: unknown): Record<string, unknown> {
  return {
    closest: (sel: string) => (sel === 'a.message-file-link' ? closestResult : null),
  }
}

function eventAgainst(target: unknown): MouseEvent {
  return {
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 120,
    clientY: 340,
  } as unknown as MouseEvent
}

function menu() {
  const deps = { toEditUrlFromBrowseHref: (href: string) => `edit:${href}` }
  const { handleConversationContextMenu, closeFileLinkContextMenu, ...rest } = createFileLinkContextMenu(deps)
  return { handleConversationContextMenu, closeFileLinkContextMenu, ...rest, deps }
}

describe('useFileLinkContextMenu', () => {
  it('is closed by default', () => {
    expect(menu().isFileLinkContextMenuVisible.value).toBe(false)
  })

  it('opens on a message-file-link anchor and fills browse/edit urls + coords', () => {
    const m = menu()
    const event = eventAgainst(fakeTarget(fakeAnchor('/repo/src/foo.ts')))

    m.handleConversationContextMenu(event)

    expect(m.isFileLinkContextMenuVisible.value).toBe(true)
    expect(m.fileLinkContextBrowseUrl.value).toBe('/repo/src/foo.ts')
    expect(m.fileLinkContextEditUrl.value).toBe('edit:/repo/src/foo.ts')
    expect(m.fileLinkContextMenuX.value).toBe(120)
    expect(m.fileLinkContextMenuY.value).toBe(340)
    expect((event as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalled()
    expect((event as unknown as { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation).toHaveBeenCalled()
  })

  it('ignores targets that do not resolve to a message-file-link', () => {
    const m = menu()
    m.handleConversationContextMenu(eventAgainst(fakeTarget(null)))
    expect(m.isFileLinkContextMenuVisible.value).toBe(false)
  })

  it('ignores empty or placeholder hrefs', () => {
    const m = menu()
    m.handleConversationContextMenu(eventAgainst(fakeTarget(fakeAnchor(''))))
    m.handleConversationContextMenu(eventAgainst(fakeTarget(fakeAnchor('#'))))
    expect(m.isFileLinkContextMenuVisible.value).toBe(false)
  })

  it('closes the menu when visible; no-ops otherwise', () => {
    const m = menu()
    m.handleConversationContextMenu(eventAgainst(fakeTarget(fakeAnchor('/repo/src/foo.ts'))))
    m.closeFileLinkContextMenu()
    expect(m.isFileLinkContextMenuVisible.value).toBe(false)

    // closing again does not throw and stays closed
    m.closeFileLinkContextMenu()
    expect(m.isFileLinkContextMenuVisible.value).toBe(false)
  })
})