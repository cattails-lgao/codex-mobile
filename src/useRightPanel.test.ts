import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRightPanel, type RightPanel } from './useRightPanel'

let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> }
let prevWindow: unknown
let addEventListenerSpy: ReturnType<typeof vi.fn>
let removeEventListenerSpy: ReturnType<typeof vi.fn>
let setTimeoutSpy: ReturnType<typeof vi.spyOn>

function installWindow(listeners: Record<string, () => void> = {}): void {
  addEventListenerSpy = vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
    listeners[type] = fn as () => void
  })
  removeEventListenerSpy = vi.fn(() => undefined)
  storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  }
  prevWindow = globalThis.window
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy,
  }
}

function teardownWindow(): void {
  if (prevWindow === undefined) delete (globalThis as unknown as { window: unknown }).window
  else ;(globalThis as unknown as { window: unknown }).window = prevWindow
}

function makePanel(overrides: Partial<Parameters<typeof createRightPanel>[0]> = {}): RightPanel {
  return createRightPanel({
    isMobile: () => false,
    canShowRightPanel: () => true,
    isVirtualKeyboardOpen: () => false,
    ...overrides,
  })
}

beforeEach(() => {
  setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
})

afterEach(() => {
  setTimeoutSpy.mockRestore()
  teardownWindow()
})

describe('createRightPanel', () => {
  it('starts with default desktop state', () => {
    const panel = makePanel()
    expect(panel.activeRightPanelTab.value).toBe('git')
    expect(panel.filePreviewTabs.value).toEqual([])
    expect(panel.activeFilePreviewTab.value).toBeNull()
    expect(panel.isRightPanelMenuOpen.value).toBe(false)
    expect(panel.isMobileRightPanelOpen.value).toBe(false)
    expect(panel.isRightPanelCollapsed.value).toBe(false)
    expect(panel.rightPanelWidth.value).toBe(320)
    expect(panel.isTerminalInputFocused.value).toBe(false)
    expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)
  })

  it('loads right panel width from localStorage and clamps it', () => {
    installWindow()
    try {
      storage.getItem = vi.fn(() => '9999')
      let panel = makePanel()
      expect(panel.rightPanelWidth.value).toBe(640)

      storage.getItem = vi.fn(() => '10')
      panel = makePanel()
      expect(panel.rightPanelWidth.value).toBe(260)

      storage.getItem = vi.fn(() => '400')
      panel = makePanel()
      expect(panel.rightPanelWidth.value).toBe(400)
    } finally {
      teardownWindow()
    }
  })

  it('selectRightPanelTab switches the tab, closes the menu and expands the panel', () => {
    const panel = makePanel()
    panel.isRightPanelMenuOpen.value = true
    panel.isRightPanelCollapsed.value = true
    panel.selectRightPanelTab('files')
    expect(panel.activeRightPanelTab.value).toBe('files')
    expect(panel.isRightPanelMenuOpen.value).toBe(false)
    expect(panel.isRightPanelCollapsed.value).toBe(false)
    // non-terminal switching resets keyboard focus fallback
    panel.isTerminalKeyboardFocusFallbackActive.value = true
    panel.selectRightPanelTab('git')
    expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)
  })

  it('selectRightPanelTab on mobile keeps collapsed and opens the mobile panel', () => {
    const panel = makePanel({ isMobile: () => true })
    panel.selectRightPanelTab('terminal')
    expect(panel.activeRightPanelTab.value).toBe('terminal')
    expect(panel.isMobileRightPanelOpen.value).toBe(true)
  })

  it('toggleRightPanelTerminal toggles between terminal and git', () => {
    const panel = makePanel()
    panel.toggleRightPanelTerminal()
    expect(panel.activeRightPanelTab.value).toBe('terminal')
    panel.toggleRightPanelTerminal()
    expect(panel.activeRightPanelTab.value).toBe('git')
  })

  it('toggleRightPanelTerminal is a no-op when the panel cannot be shown', () => {
    const panel = makePanel({ canShowRightPanel: () => false })
    panel.toggleRightPanelTerminal()
    expect(panel.activeRightPanelTab.value).toBe('git')
  })

  it('opens an existing preview tab without adding a duplicate', () => {
    const panel = makePanel()
    panel.onOpenFilePreview({ path: '/a.ts', label: 'a.ts' })
    panel.onOpenFilePreview({ path: '/b.ts', label: 'b.ts' })
    expect(panel.filePreviewTabs.value).toHaveLength(2)
    panel.onOpenFilePreview({ path: '/a.ts', label: 'a.ts' })
    expect(panel.filePreviewTabs.value).toHaveLength(2)
    expect(panel.activeRightPanelTab.value).toBe('preview')
    expect(panel.activeFilePreviewTab.value?.path).toBe('/a.ts')
  })

  it('closeFilePreviewTab picks a fallback active tab and falls back to files on empty', () => {
    vi.useFakeTimers()
    try {
      const panel = makePanel()
      panel.onOpenFilePreview({ path: '/a.ts', label: 'a.ts' })
      vi.advanceTimersByTime(1)
      panel.onOpenFilePreview({ path: '/b.ts', label: 'b.ts' })
      const keyA = panel.filePreviewTabs.value[0].key
      const keyB = panel.filePreviewTabs.value[1].key
      expect(keyA).not.toBe(keyB)

      panel.closeFilePreviewTab(keyA)
      expect(panel.filePreviewTabs.value).toHaveLength(1)
      expect(panel.activeFilePreviewTabKey.value).toBe(keyB)

      panel.closeFilePreviewTab(keyB)
      expect(panel.filePreviewTabs.value).toEqual([])
      expect(panel.activeRightPanelTab.value).toBe('files')
      expect(panel.activeFilePreviewTab.value).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closeFilePreviewTab ignores unknown keys', () => {
    const panel = makePanel()
    panel.onOpenFilePreview({ path: '/a.ts', label: 'a.ts' })
    const key = panel.filePreviewTabs.value[0].key
    panel.closeFilePreviewTab('nope')
    expect(panel.filePreviewTabs.value[0].key).toBe(key)
  })

  it('onCloseRightPanel collapses on desktop and closes on mobile', () => {
    const panel = makePanel()
    panel.onCloseRightPanel()
    expect(panel.isRightPanelCollapsed.value).toBe(true)

    const mobile = makePanel({ isMobile: () => true })
    mobile.onCloseRightPanel()
    expect(mobile.isMobileRightPanelOpen.value).toBe(false)
  })

  it('onToggleRightPanelToggle toggles collapse/mobile open state', () => {
    const panel = makePanel()
    panel.onToggleRightPanelToggle()
    expect(panel.isRightPanelCollapsed.value).toBe(true)
    panel.onToggleRightPanelToggle()
    expect(panel.isRightPanelCollapsed.value).toBe(false)

    const mobile = makePanel({ isMobile: () => true })
    mobile.onToggleRightPanelToggle()
    expect(mobile.isMobileRightPanelOpen.value).toBe(true)
  })

  it('onHideRightPanelTerminal returns to git tab and closes the mobile panel', () => {
    const panel = makePanel({ isMobile: () => true })
    panel.selectRightPanelTab('terminal')
    panel.onHideRightPanelTerminal()
    expect(panel.activeRightPanelTab.value).toBe('git')
    expect(panel.isMobileRightPanelOpen.value).toBe(false)
  })

  it('onTerminalFocusChange raises the fallback and clears it when virtual keyboard is closed', () => {
    vi.useFakeTimers()
    try {
      const panel = makePanel()
      panel.onTerminalFocusChange(true)
      expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(true)
      vi.advanceTimersByTime(1500)
      expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)

      panel.onTerminalFocusChange(true)
      vi.advanceTimersByTime(500)
      const staysWhileKeyboard = makePanel({ isVirtualKeyboardOpen: () => true })
      staysWhileKeyboard.onTerminalFocusChange(true)
      vi.advanceTimersByTime(1500)
      expect(staysWhileKeyboard.isTerminalKeyboardFocusFallbackActive.value).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('onTerminalFocusChange(false) resets the fallback state and timer', () => {
    vi.useFakeTimers()
    try {
      const panel = makePanel()
      panel.onTerminalFocusChange(true)
      panel.onTerminalFocusChange(false)
      expect(panel.isTerminalInputFocused.value).toBe(false)
      expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)
      // expired timer must not resurrect the fallback flag
      vi.advanceTimersByTime(2000)
      expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resetTerminalKeyboardFocusState clears focus fallback state', () => {
    const panel = makePanel()
    panel.onTerminalFocusChange(true)
    panel.resetTerminalKeyboardFocusState()
    expect(panel.isTerminalInputFocused.value).toBe(false)
    expect(panel.isTerminalKeyboardFocusFallbackActive.value).toBe(false)
  })

  it('onRightResizeHandleMouseDown resizes the width and persists on release', () => {
    installWindow()
    try {
      const panel = makePanel()
      panel.rightPanelWidth.value = 320
      const addHandlers: Record<string, (e: { clientX: number }) => void> = {}
      addEventListenerSpy.mockImplementation((type: string, fn: (e: { clientX: number }) => void) => {
        addHandlers[type] = fn
      })

      panel.onRightResizeHandleMouseDown({ clientX: 400, preventDefault: vi.fn() } as unknown as MouseEvent)
      addHandlers.mousemove({ clientX: 300 }) // delta -100
      expect(panel.rightPanelWidth.value).toBe(420)
      addHandlers.mousemove({ clientX: 0 }) // delta -400 → clamp to max 640
      expect(panel.rightPanelWidth.value).toBe(640)

      addHandlers.mouseup({ clientX: 400 }) // triggers the remove-listeners + persist path
      expect(storage.setItem).toHaveBeenCalledWith('codex-web-local.right-panel-width.v1', '640')
    } finally {
      teardownWindow()
    }
  })
})