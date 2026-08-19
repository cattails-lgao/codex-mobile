# Thread Context-Menu Persistence, Reusable Thread Rows, and Thread Recycle Bin

Round-7 work: right-click context menus in the sidebar no longer disappear when the mouse moves off the row (hover-opened menus still close on leave), and deleted threads can be restored from a recycle bin.

## Feature: Right-click thread menu stays open after the mouse leaves the row

#### Prerequisites
- Dev server at `127.0.0.1:4173`, at least one thread in the sidebar

#### Steps
1. Right-click a thread row and move the mouse away (off the row / into the content area).
2. Confirm the menu remains open.
3. Click on blank space and confirm the menu closes.
4. Open the menu again via the row's dots (hover) trigger, then move the mouse away.
5. Confirm this hover-opened menu closes when the mouse leaves (previous hover behavior preserved).

#### Expected Results
- Right-click menus persist until a click elsewhere; hover-opened menus still close on leave.
- Menu positioning (`.thread-menu-panel-fixed`) stays within the viewport.

#### Rollback/Cleanup
- None required.

## Feature: Shared sidebar thread row across all list sections

#### Prerequisites
- Dev server at `127.0.0.1:4173`, with at least one pinned thread, project thread, and projectless chat when available

#### Steps
1. Expand Pinned, Projects, and Chats in the sidebar; switch the Projects organizer between project and chronological views.
2. Select a thread in each visible list and verify its active state, timestamp, title truncation, worktree marker, automation badge, and pending-request indicator when applicable.
3. Hover each row and use its ellipsis trigger; right-click a row and move the pointer away from it.
4. Trigger inline delete confirmation on one row, then click elsewhere to cancel it without deleting the thread.

#### Expected Results
- Pinned, project, chronological, and chat lists render the same row behavior and visual states through the shared row component.
- Hover menus close on row leave, while right-click menus remain open until dismissed; the fixed menu remains anchored to its trigger.
- Selection, badges, inline delete confirmation, and status indicators remain correct in light and dark themes.

#### Rollback/Cleanup
- Dismiss any open menu and cancel inline deletion. Restore any thread if deletion was confirmed during testing.

## Feature: Thread recycle bin with restore

#### Prerequisites
- Dev server at `127.0.0.1:4173`, at least one thread in the sidebar

#### Steps
1. Right-click a thread → "Delete thread" → confirm in the dialog.
2. Confirm the thread disappears from the sidebar.
3. Click the organize (ellipsis) button in the sidebar header → "Recycle bin".
4. Confirm the recycle-bin dialog lists the deleted thread with its title and removal time.
5. Click "Restore" on that row.
6. Confirm the thread reappears in the sidebar (list refreshed) and the record is removed from the recycle bin.
7. Delete the thread again, reopen the recycle bin, and click "Delete permanently"; confirm the record is gone and cannot be restored.

#### Expected Results
- Deleted threads are recoverable from the recycle bin.
- Restore re-archives nothing: the thread returns to the sidebar via the `thread/unarchive` RPC.
- Empty state shows "Recycle bin is empty."; dark theme renders the dialog correctly.

#### Rollback/Cleanup
- Recycle-bin records live in `localStorage` key `codex-web-local.recycle-bin.v1`; clearing it empties the bin. Server-side threads are archived via `thread/archive` and restored via `thread/unarchive`.

## Feature: Recycle bin records keep the deleted thread title (round-37)

#### Prerequisites
- Dev server at `127.0.0.1:4173`, at least one thread with a real title in the sidebar

#### Steps
1. Right-click a titled thread (e.g. a chat whose first message became its name) → "Delete thread" → confirm.
2. Open the recycle bin (sidebar recycle-bin button or organize menu → "Recycle bin").
3. Confirm the row shows the thread's actual title (not `(untitled)`) and its project name.

#### Expected Results
- The recycle-bin record stores the title read before the thread is marked optimistically archived; previously the title was captured after the archive mark, so the lookup returned `null` and fell back to `(untitled)` with an empty path.
- Restore still works and the title/path round-trip back to the sidebar.

#### Rollback/Cleanup
- Recycle-bin records live in `localStorage` key `codex-web-local.recycle-bin.v1`; clearing it empties the bin.
