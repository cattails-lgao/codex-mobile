import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createSidebarUi } from './useSidebarUi'

let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }
let prevWindow: unknown

function installWindow(): void {
  storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  } as unknown as { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }
  prevWindow = globalThis.window
  ;(globalThis as unknown as { window: unknown }).window = { localStorage: storage }
}

function teardownWindow(): void {
  if (prevWindow === undefined) delete (globalThis as unknown as { window: unknown }).window
  else ;(globalThis as unknown as { window: unknown }).window = prevWindow
}

async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('createSidebarUi', () => {
  it('uses server-safe defaults when window is absent', () => {
    const ui = createSidebarUi()
    expect(ui.isSidebarCollapsed.value).toBe(false)
    expect(ui.isAccountsSectionCollapsed.value).toBe(true)
    expect(ui.isSidebarSearchVisible.value).toBe(false)
    expect(ui.sidebarSearchQuery.value).toBe('')
  })

  it('loads collapsed and accounts-collapsed prefs from localStorage', () => {
    installWindow()
    try {
      storage.getItem = vi.fn((key: string) => (key === 'codex-web-local.sidebar-collapsed.v1' ? '1' : '0'))
      const ui = createSidebarUi()
      expect(ui.isSidebarCollapsed.value).toBe(true)
      expect(ui.isAccountsSectionCollapsed.value).toBe(false)
    } finally {
      teardownWindow()
    }
  })

  it('toggles the sidebar and persists collapsed state', () => {
    installWindow()
    try {
      const ui = createSidebarUi()
      ui.setSidebarCollapsed(true)
      expect(ui.isSidebarCollapsed.value).toBe(true)
      expect(storage.setItem).toHaveBeenCalledWith('codex-web-local.sidebar-collapsed.v1', '1')

      // same value is a no-op
      storage.setItem.mockClear()
      ui.setSidebarCollapsed(true)
      expect(storage.setItem).not.toHaveBeenCalled()
    } finally {
      teardownWindow()
    }
  })

  it('records scroll while open and restores it after expand', async () => {
    const ui = createSidebarUi()
    const container = { scrollTop: 0 } as HTMLElement
    ui.sidebarScrollableRef.value = container

    // user scrolls while the sidebar is open
    container.scrollTop = 1234
    ui.onSidebarScroll({ currentTarget: container } as unknown as Event)

    ui.setSidebarCollapsed(true)
    container.scrollTop = 0
    ui.setSidebarCollapsed(false)
    await flush()
    expect(container.scrollTop).toBe(1234)
  })

  it('toggles search visibility and resets query when hidden', () => {
    const ui = createSidebarUi()
    ui.sidebarSearchQuery.value = 'foo'
    ui.toggleSidebarSearch()
    expect(ui.isSidebarSearchVisible.value).toBe(true)
    ui.toggleSidebarSearch()
    expect(ui.isSidebarSearchVisible.value).toBe(false)
    expect(ui.sidebarSearchQuery.value).toBe('')
  })

  it('clearSidebarSearch empties the query', () => {
    const ui = createSidebarUi()
    ui.sidebarSearchQuery.value = 'abc'
    ui.clearSidebarSearch()
    expect(ui.sidebarSearchQuery.value).toBe('')
  })

  it('Escape closes and clears the search bar', () => {
    const ui = createSidebarUi()
    ui.isSidebarSearchVisible.value = true
    ui.sidebarSearchQuery.value = 'term'
    ui.onSidebarSearchKeydown({ key: 'Escape' } as KeyboardEvent)
    expect(ui.isSidebarSearchVisible.value).toBe(false)
    expect(ui.sidebarSearchQuery.value).toBe('')
  })

  it('ignores non-Escape keys in the search bar', () => {
    const ui = createSidebarUi()
    ui.isSidebarSearchVisible.value = true
    ui.sidebarSearchQuery.value = 'term'
    ui.onSidebarSearchKeydown({ key: 'Enter' } as KeyboardEvent)
    expect(ui.isSidebarSearchVisible.value).toBe(true)
    expect(ui.sidebarSearchQuery.value).toBe('term')
  })

  it('toggles accounts section and persists it', () => {
    installWindow()
    try {
      const ui = createSidebarUi()
      ui.toggleAccountsSectionCollapsed()
      expect(ui.isAccountsSectionCollapsed.value).toBe(false)
      expect(storage.setItem).toHaveBeenCalledWith('codex-web-local.accounts-section-collapsed.v1', '0')
      ui.toggleAccountsSectionCollapsed()
      expect(ui.isAccountsSectionCollapsed.value).toBe(true)
    } finally {
      teardownWindow()
    }
  })
})