import { nextTick, ref, type Ref } from 'vue'

const SIDEBAR_COLLAPSED_KEY = 'codex-web-local.sidebar-collapsed.v1'
const ACCOUNTS_SECTION_COLLAPSED_KEY = 'codex-web-local.accounts-section-collapsed.v1'

export interface SidebarUi {
  isSidebarCollapsed: Ref<boolean>
  isAccountsSectionCollapsed: Ref<boolean>
  sidebarSearchQuery: Ref<string>
  isSidebarSearchVisible: Ref<boolean>
  sidebarScrollableRef: Ref<HTMLElement | null>
  sidebarSearchInputRef: Ref<HTMLInputElement | null>
  setSidebarCollapsed: (nextValue: boolean) => void
  toggleSidebarSearch: () => void
  clearSidebarSearch: () => void
  onSidebarScroll: (event?: Event) => void
  onSidebarSearchKeydown: (event: KeyboardEvent) => void
  restoreSidebarScrollPosition: () => void
  toggleAccountsSectionCollapsed: () => void
}

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
}

function saveSidebarCollapsed(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0')
}

function loadAccountsSectionCollapsed(): boolean {
  if (typeof window === 'undefined') return true
  const value = window.localStorage.getItem(ACCOUNTS_SECTION_COLLAPSED_KEY)
  if (value === null) return true
  return value === '1'
}

export function createSidebarUi(): SidebarUi {
  const isSidebarCollapsed = ref(loadSidebarCollapsed())
  const isAccountsSectionCollapsed = ref(loadAccountsSectionCollapsed())
  const sidebarSearchQuery = ref('')
  const isSidebarSearchVisible = ref(false)
  const sidebarScrollableRef = ref<HTMLElement | null>(null)
  const sidebarSearchInputRef = ref<HTMLInputElement | null>(null)

  let sidebarScrollTop = 0
  let sidebarScrollRestoreRequestId = 0
  let isRestoringSidebarScroll = false

  function setSidebarCollapsed(nextValue: boolean): void {
    if (isSidebarCollapsed.value === nextValue) return
    if (nextValue) {
      const currentScrollTop = getSidebarScrollableElement()?.scrollTop
      if (typeof currentScrollTop === 'number' && (currentScrollTop > 0 || sidebarScrollTop === 0)) {
        sidebarScrollTop = currentScrollTop
      }
    }
    isSidebarCollapsed.value = nextValue
    saveSidebarCollapsed(nextValue)
    if (!nextValue) {
      restoreSidebarScrollPosition()
    }
  }

  function toggleSidebarSearch(): void {
    isSidebarSearchVisible.value = !isSidebarSearchVisible.value
    if (isSidebarSearchVisible.value) {
      nextTick(() => sidebarSearchInputRef.value?.focus())
    } else {
      sidebarSearchQuery.value = ''
    }
  }

  function clearSidebarSearch(): void {
    sidebarSearchQuery.value = ''
    sidebarSearchInputRef.value?.focus()
  }

  function getSidebarScrollableElement(): HTMLElement | null {
    if (sidebarScrollableRef.value) return sidebarScrollableRef.value
    if (typeof document === 'undefined') return null
    return document.querySelector<HTMLElement>('.mobile-drawer .sidebar-scrollable, .sidebar-scrollable')
  }

  function onSidebarScroll(event?: Event): void {
    if (isSidebarCollapsed.value) return
    if (isRestoringSidebarScroll) return
    // Duck-guard the DOM global so this runs under Vitest's node environment too;
    // a real Event here always carries an HTMLElement currentTarget in the browser.
    const hasElementCurrentTarget =
      event?.currentTarget &&
      typeof HTMLElement !== 'undefined' &&
      event.currentTarget instanceof HTMLElement
    const container = hasElementCurrentTarget ? event!.currentTarget : getSidebarScrollableElement()
    sidebarScrollTop = (container as { scrollTop?: number } | null)?.scrollTop ?? sidebarScrollTop
  }

  function restoreSidebarScrollPosition(): void {
    const requestId = ++sidebarScrollRestoreRequestId
    const targetScrollTop = sidebarScrollTop
    const maxRestoreAttempts = 90
    isRestoringSidebarScroll = true
    const finishRestore = () => {
      if (requestId === sidebarScrollRestoreRequestId) {
        sidebarScrollTop = targetScrollTop
        isRestoringSidebarScroll = false
      }
    }
    const restore = (attempt: number) => {
      if (requestId !== sidebarScrollRestoreRequestId) return
      if (isSidebarCollapsed.value) {
        finishRestore()
        return
      }

      const container = getSidebarScrollableElement()
      if (container) {
        container.scrollTop = targetScrollTop
        if (Math.abs(container.scrollTop - targetScrollTop) <= 1 || attempt >= maxRestoreAttempts) {
          finishRestore()
          return
        }
      }

      if (attempt >= maxRestoreAttempts || typeof window === 'undefined') {
        finishRestore()
        return
      }
      window.requestAnimationFrame(() => restore(attempt + 1))
    }

    void nextTick(() => restore(0))
  }

  function onSidebarSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      isSidebarSearchVisible.value = false
      sidebarSearchQuery.value = ''
    }
  }

  function toggleAccountsSectionCollapsed(): void {
    isAccountsSectionCollapsed.value = !isAccountsSectionCollapsed.value
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      ACCOUNTS_SECTION_COLLAPSED_KEY,
      isAccountsSectionCollapsed.value ? '1' : '0',
    )
  }

  return {
    isSidebarCollapsed,
    isAccountsSectionCollapsed,
    sidebarSearchQuery,
    isSidebarSearchVisible,
    sidebarScrollableRef,
    sidebarSearchInputRef,
    setSidebarCollapsed,
    toggleSidebarSearch,
    clearSidebarSearch,
    onSidebarScroll,
    onSidebarSearchKeydown,
    restoreSidebarScrollPosition,
    toggleAccountsSectionCollapsed,
  }
}