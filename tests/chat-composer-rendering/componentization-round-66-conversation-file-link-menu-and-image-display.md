# Componentization round-66: Conversation file-link context menu + image display hooks

Refactor of `ThreadConversation.vue` (no user-visible behavior change). Two tiny, cohesive UI-state clusters were extracted as factory hooks:

- **`useFileLinkContextMenu.ts`** — `createFileLinkContextMenu(deps)`: owns `isFileLinkContextMenuVisible` / `fileLinkContextMenuX` / `fileLinkContextMenuY` / `fileLinkContextBrowseUrl` / `fileLinkContextEditUrl`, plus `handleConversationContextMenu` (the `@contextmenu.capture` handler that opens the menu on an `a.message-file-link`) and `closeFileLinkContextMenu`. Single narrow dependency `toEditUrlFromBrowseHref`.
- **`useMessageImageDisplay.ts`** — `createMessageImageDisplay(deps)`: owns `modalImageUrl` / `modalIsVideo` / `markdownImageFailureVersion` / `failedMarkdownImages`, plus `openImageModal` / `closeImageModal` and the `markdownImageKey` / `isMarkdownImageFailed` / `onMarkdownImageError` helpers. Single dependency `isVideo` (the component-local `isVideoMediaUrl` predicate is kept as the source for template use at the two `<img>/<video>` sites and injected). The `isVideoMediaUrl` predicate + `VIDEO_MEDIA_EXTENSIONS` regex stay in the component.

The `activeThreadId` watcher's `modalImageUrl.value = ''` reset now writes the hook-owned ref; `FileLinkContextMenu`'s `@close` still calls the hook's `closeFileLinkContextMenu`.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation whose assistant messages reference local/absolute file links (`a.message-file-link`) and contain at least one markdown image and one image/video link.

## Actions and Expected Results

### File-link context menu
1. Right-click a file link rendered in a message. Expected: the contextual menu appears at the cursor with Browse and Edit entries derived from the link's href (Edit uses `toEditUrlFromBrowseHref`); the underlying link navigation is suppressed.
2. Click outside the menu (or an "Edit"/"Close" affordance that emits `close`). Expected: the menu hides; state returns to closed.
3. Right-click a non-link region of the conversation. Expected: no menu opens and no default context menu is captured for the file-link case.

### Image modal
4. Click a markdown image. Expected: the image modal opens full-screen centered on `modalImageUrl`; clicking the backdrop closes it.
5. Click a media link whose URL looks like a video (`*.mp4`/`webm`/etc. or `data:video/`). Expected: the modal renders as a `<video>` player; other images render as `<img>`.
6. Switch to another thread and back while a modal is open. Expected: the modal closes (the `activeThreadId` watcher resets the modal ref).

### Failed markdown image fallback
7. Point a markdown image at a broken URL. Expected: on load error the block falls back to raw markdown text (`v-if="isMarkdownImageFailed"`) and `markdownImageFailureVersion` bumps so the memoized block re-renders.

## Verification / Cleanup Notes

- No behavior change; guards against extracting the file-link context menu and image display state clusters.
- Rollback: covered by `useFileLinkContextMenu.test.ts` (5 cases: default-closed, open + urls/coords/fills, non-link ignore, empty/`#` href, close + idempotent close) and `useMessageImageDisplay.test.ts` (4 cases: default state, modal open + video flag via injected predicate, close clears flag, failed-image tracking per `messageId:blockIndex` + version bump), plus `vue-tsc`, the 49-case ThreadConversation hook suite, and production build; revert the two `createX` wirings and the template `@contextmenu.capture="handleConversationContextMenu"` if any surface above misbehaves.
- Note: the file-link guard duck-types the `closest`/`getAttribute` methods instead of `instanceof Element/HTMLAnchorElement` so the handler can run under Vitest's node environment; the `a.message-file-link` selector already guarantees an anchor, so browser behavior is unchanged.