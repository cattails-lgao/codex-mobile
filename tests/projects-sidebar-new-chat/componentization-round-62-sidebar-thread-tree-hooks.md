# Componentization round-62: Sidebar thread tree drag + automation hooks

Refactor of `SidebarThreadTree.vue` (no user-visible behavior change): the project-group drag-and-drop layout engine and the automation dialog logic were extracted into `useProjectDragAndDrop.ts` and `useAutomationDialog.ts`, wired back through factory injection. This page is a smoke regression of the two moved surfaces.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- At least 2–3 project groups visible in the sidebar with unpinned chats, and at least one workflow thread.

## Actions and Expected Results

### Drag reorder
1. Hover a project header and drag its title (the `.project-main-button` handle) vertically past another project group.
2. Expected: the dragged group follows the cursor as a fixed-position ghost; the remaining groups animate to open the drop slot; on release, the project order is reordered and persisted (check after refresh).
3. Press `Escape` mid-drag: the drag cancels, ghosts disappear, order is unchanged.
4. Click (without dragging) a project header's collapse area: it still collapses/expands the group; a click immediately after a finished drag does not accidentally toggle the group (drag-trigger suppression still works).

### Automation dialog
1. Open a thread's automation editor (heartbeat automation): create, edit, and delete flows work exactly as before (target picker, schedule mode toggles, RRULE preview, save/run/delete buttons).
2. Open a project automation from a project menu: project-scope dialog, attachment, save, and panel refresh work as before.
3. Archive a thread that owns automations: its automations are removed from the API and the local map (the row's automation chip disappears).

## Verification / Cleanup Notes

- Behavior is unchanged from before the refactor; this doc only guards against a regression from the extraction.
- Rollback: the extraction is covered by `useProjectDragAndDrop.test.ts` (drop-index projection) and `useAutomationDialog` type/build checks; if a surface above misbehaves, revert the `SidebarThreadTree.vue` wiring to the inline implementation.