import { computed, ref, type ComputedRef, type Ref } from 'vue'

export type RightPanelTab = 'git' | 'files' | 'terminal' | 'preview'
export type FilePreviewTab = { key: string; path: string; label: string }

const RIGHT_PANEL_WIDTH_KEY = 'codex-web-local.right-panel-width.v1'
const MIN_RIGHT_PANEL_WIDTH = 260
const MAX_RIGHT_PANEL_WIDTH = 640
const DEFAULT_RIGHT_PANEL_WIDTH = 320

export interface RightPanelDeps {
  isMobile: () => boolean
  canShowRightPanel: () => boolean
  isVirtualKeyboardOpen: () => boolean
}

export interface RightPanel {
  activeRightPanelTab: Ref<RightPanelTab>
  filePreviewTabs: Ref<FilePreviewTab[]>
  activeFilePreviewTabKey: Ref<string>
  activeFilePreviewTab: ComputedRef<FilePreviewTab | null>
  isRightPanelMenuOpen: Ref<boolean>
  isMobileRightPanelOpen: Ref<boolean>
  isRightPanelCollapsed: Ref<boolean>
  rightPanelWidth: Ref<number>
  isTerminalInputFocused: Ref<boolean>
  isTerminalKeyboardFocusFallbackActive: Ref<boolean>
  onRightResizeHandleMouseDown: (event: MouseEvent) => void
  toggleRightPanelTerminal: () => void
  selectRightPanelTab: (tab: RightPanelTab) => void
  onOpenFilePreview: (payload: { path: string; label: string }) => void
  selectFilePreviewTab: (key: string) => void
  closeFilePreviewTab: (key: string) => void
  onCloseRightPanel: () => void
  onToggleRightPanelToggle: () => void
  onHideRightPanelTerminal: () => void
  onTerminalFocusChange: (focused: boolean) => void
  resetTerminalKeyboardFocusState: () => void
  clearTerminalKeyboardFocusFallbackTimer: () => void
}

function clampRightPanelWidth(value: number): number {
  return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, value))
}

function loadRightPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_RIGHT_PANEL_WIDTH
  const raw = window.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_RIGHT_PANEL_WIDTH
  return clampRightPanelWidth(parsed)
}

function saveRightPanelWidth(value: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(value))
}

export function createRightPanel(deps: RightPanelDeps): RightPanel {
  const { isMobile, canShowRightPanel, isVirtualKeyboardOpen } = deps

  const activeRightPanelTab = ref<RightPanelTab>('git')
  const filePreviewTabs = ref<FilePreviewTab[]>([])
  const activeFilePreviewTabKey = ref('')
  const activeFilePreviewTab = computed<FilePreviewTab | null>(() =>
    filePreviewTabs.value.find((tab) => tab.key === activeFilePreviewTabKey.value) ?? null,
  )
  const isRightPanelMenuOpen = ref(false)
  const isMobileRightPanelOpen = ref(false)
  const isRightPanelCollapsed = ref(false)
  const rightPanelWidth = ref(loadRightPanelWidth())
  const isTerminalInputFocused = ref(false)
  const isTerminalKeyboardFocusFallbackActive = ref(false)
  let terminalKeyboardFocusFallbackTimer: ReturnType<typeof setTimeout> | null = null

  function clearTerminalKeyboardFocusFallbackTimer(): void {
    if (!terminalKeyboardFocusFallbackTimer) return
    clearTimeout(terminalKeyboardFocusFallbackTimer)
    terminalKeyboardFocusFallbackTimer = null
  }

  function resetTerminalKeyboardFocusState(): void {
    isTerminalInputFocused.value = false
    isTerminalKeyboardFocusFallbackActive.value = false
    clearTerminalKeyboardFocusFallbackTimer()
  }

  function onRightResizeHandleMouseDown(event: MouseEvent): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = rightPanelWidth.value

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX
      rightPanelWidth.value = clampRightPanelWidth(startWidth + delta)
    }

    const onMouseUp = () => {
      saveRightPanelWidth(rightPanelWidth.value)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function toggleRightPanelTerminal(): void {
    if (!canShowRightPanel()) return
    if (isMobile() && !isMobileRightPanelOpen.value) {
      isMobileRightPanelOpen.value = true
    }
    if (!isMobile()) {
      isRightPanelCollapsed.value = false
    }
    activeRightPanelTab.value = activeRightPanelTab.value === 'terminal' ? 'git' : 'terminal'
    if (activeRightPanelTab.value !== 'terminal') {
      resetTerminalKeyboardFocusState()
    }
  }

  function selectRightPanelTab(tab: RightPanelTab): void {
    activeRightPanelTab.value = tab
    isRightPanelMenuOpen.value = false
    if (!isMobile()) {
      isRightPanelCollapsed.value = false
    }
    if (isMobile()) {
      isMobileRightPanelOpen.value = true
    }
    if (tab !== 'terminal') {
      resetTerminalKeyboardFocusState()
    }
  }

  function onOpenFilePreview(payload: { path: string; label: string }): void {
    const existing = filePreviewTabs.value.find((tab) => tab.path === payload.path)
    if (existing) {
      activeFilePreviewTabKey.value = existing.key
    } else {
      const tab: FilePreviewTab = {
        key: `preview-${Date.now()}`,
        path: payload.path,
        label: payload.label,
      }
      filePreviewTabs.value = [...filePreviewTabs.value, tab]
      activeFilePreviewTabKey.value = tab.key
    }
    selectRightPanelTab('preview')
  }

  function selectFilePreviewTab(key: string): void {
    if (!filePreviewTabs.value.some((tab) => tab.key === key)) return
    activeFilePreviewTabKey.value = key
    selectRightPanelTab('preview')
  }

  function closeFilePreviewTab(key: string): void {
    const index = filePreviewTabs.value.findIndex((tab) => tab.key === key)
    if (index < 0) return
    const next = filePreviewTabs.value.filter((tab) => tab.key !== key)
    filePreviewTabs.value = next
    if (activeFilePreviewTabKey.value !== key) return
    if (next.length === 0) {
      activeFilePreviewTabKey.value = ''
      activeRightPanelTab.value = 'files'
      return
    }
    const fallback = next[Math.min(index, next.length - 1)]
    activeFilePreviewTabKey.value = fallback.key
  }

  function onCloseRightPanel(): void {
    if (isMobile()) {
      isMobileRightPanelOpen.value = false
      return
    }
    isRightPanelCollapsed.value = true
    isRightPanelMenuOpen.value = false
    resetTerminalKeyboardFocusState()
  }

  function onToggleRightPanelToggle(): void {
    if (isMobile()) {
      isMobileRightPanelOpen.value = !isMobileRightPanelOpen.value
      return
    }
    isRightPanelCollapsed.value = !isRightPanelCollapsed.value
    if (isRightPanelCollapsed.value) {
      isRightPanelMenuOpen.value = false
      resetTerminalKeyboardFocusState()
    }
  }

  function onHideRightPanelTerminal(): void {
    activeRightPanelTab.value = 'git'
    if (isMobile()) {
      isMobileRightPanelOpen.value = false
    }
    resetTerminalKeyboardFocusState()
  }

  function onTerminalFocusChange(focused: boolean): void {
    isTerminalInputFocused.value = focused
    if (!focused) {
      isTerminalKeyboardFocusFallbackActive.value = false
      clearTerminalKeyboardFocusFallbackTimer()
      return
    }
    isTerminalKeyboardFocusFallbackActive.value = true
    clearTerminalKeyboardFocusFallbackTimer()
    terminalKeyboardFocusFallbackTimer = setTimeout(() => {
      terminalKeyboardFocusFallbackTimer = null
      if (!isVirtualKeyboardOpen()) {
        isTerminalKeyboardFocusFallbackActive.value = false
      }
    }, 1500)
  }

  return {
    activeRightPanelTab,
    filePreviewTabs,
    activeFilePreviewTabKey,
    activeFilePreviewTab,
    isRightPanelMenuOpen,
    isMobileRightPanelOpen,
    isRightPanelCollapsed,
    rightPanelWidth,
    isTerminalInputFocused,
    isTerminalKeyboardFocusFallbackActive,
    onRightResizeHandleMouseDown,
    toggleRightPanelTerminal,
    selectRightPanelTab,
    onOpenFilePreview,
    selectFilePreviewTab,
    closeFilePreviewTab,
    onCloseRightPanel,
    onToggleRightPanelToggle,
    onHideRightPanelTerminal,
    onTerminalFocusChange,
    resetTerminalKeyboardFocusState,
    clearTerminalKeyboardFocusFallbackTimer,
  }
}