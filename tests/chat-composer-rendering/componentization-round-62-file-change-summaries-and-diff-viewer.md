# Componentization round-62: File-change summary + diff viewer hook

Refactor of `ThreadConversation.vue` (no user-visible behavior change): the file-change summary aggregation (anchored/standalone), hide-source-message set, and diff-viewer selection state were extracted into `useFileChangeSummaries.ts` via dependency injection (`getMessages`/`getLiveTurnId`/predicates/`getHiddenGroupedCommandIds`/`isMobile`). The async file-change action cluster (undo/redo, patch IDs, pending-confirm) stays in the component. This page is a smoke regression of the moved summary/diff-viewer surface.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation containing at least one completed `fileChange` turn so a `FileChangeSummaryBlock` (anchored to the last substantive message of its turn) appears.

## Actions and Expected Results

### File-change summary blocks
1. Open the conversation. Expected: file-change summary blocks (`FileChangeSummaryBlock`) still render anchored at the end of their turn, listing the changed files aggregated by path (no `fileChange` source rows visible separately — `hiddenFileChangeMessageIds` suppresses them).
2. Click the summary block's toggle/expand control. Expected: the block expands/collapses and the expanded state persists until the thread reloads.
3. After a reload (refresh), verify the expanded-state pruning still drops stale ids without throwing (expansion collapses gracefully to the valid summary set).

### Visibility gating on the live turn
4. With a turn still in progress (live overlay present), confirm its file-change summary is not rendered; immediately after the turn completes (`liveTurnId` clears) the same summary reappears.

### Diff viewer
5. In an expanded summary block, click a file change row. Expected: `DiffViewer` opens showing that diff; `:changes`/`:change`/`:lines` render; the file-list toggle button opens/closes the file list; on mobile viewport the list auto-closes after selecting a change.
6. Close the diff viewer; re-open from a different summary and confirm the selected change is the one you clicked.

### Standalone fallback (edge case)
7. In a thread whose a `fileChange` turn has no anchorable message (only fileChange rows, no assistant/command text in that turn), verify the change still surfaces as a standalone summary block.

## Verification / Cleanup Notes

- No behavior change; this guards against extracting the summary/diff-viewer compute path and state.
- Rollback: covered by `useFileChangeSummaries.test.ts` (6 cases: anchored aggregation, standalone fallback, hidden-source set, toggle expanded state, live-turn visibility gating, diff viewer open/close) plus `vue-tsc` and production build; revert `ThreadConversation.vue` wiring if a surface above misbehaves.