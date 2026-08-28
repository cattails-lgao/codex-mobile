import { ref } from 'vue'

export interface FileLinkContextMenuDeps {
  toEditUrlFromBrowseHref: (browseUrl: string) => string
}

export function createFileLinkContextMenu(deps: FileLinkContextMenuDeps) {
  const { toEditUrlFromBrowseHref } = deps

  const isFileLinkContextMenuVisible = ref(false)
  const fileLinkContextMenuX = ref(0)
  const fileLinkContextMenuY = ref(0)
  const fileLinkContextBrowseUrl = ref('')
  const fileLinkContextEditUrl = ref('')

  function handleConversationContextMenu(event: MouseEvent): void {
    // Guard ducks the DOM globals (Element/HTMLAnchorElement) so the handler can
    // be exercised under Vitest's node environment. The `a.message-file-link`
    // selector already guarantees an anchor, so the instanceof checks were redundant.
    const target = event.target as { closest?: (sel: string) => HTMLElement | null } | null
    const anchor = target?.closest?.('a.message-file-link')
    if (!anchor) return

    const href = (anchor.getAttribute?.('href') ?? '').trim()
    if (!href || href === '#') return

    event.preventDefault()
    event.stopPropagation()

    fileLinkContextBrowseUrl.value = href
    fileLinkContextEditUrl.value = toEditUrlFromBrowseHref(href)
    fileLinkContextMenuX.value = event.clientX
    fileLinkContextMenuY.value = event.clientY
    isFileLinkContextMenuVisible.value = true
  }

  function closeFileLinkContextMenu(): void {
    if (!isFileLinkContextMenuVisible.value) return
    isFileLinkContextMenuVisible.value = false
  }

  return {
    isFileLinkContextMenuVisible,
    fileLinkContextMenuX,
    fileLinkContextMenuY,
    fileLinkContextBrowseUrl,
    fileLinkContextEditUrl,
    handleConversationContextMenu,
    closeFileLinkContextMenu,
  }
}