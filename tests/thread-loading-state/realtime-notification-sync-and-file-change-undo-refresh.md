# Manual Test: Realtime notification sync and file-change undo refresh

Return to the [manual test index](index.md).

### Feature: P1-3 notification surface (realtime sync)

#### Prerequisites
- Dev server running on `127.0.0.1:4173` (`pnpm run dev --host 127.0.0.1 --port 4173`).
- A local Codex CLI available so the app-server notification stream is live.
- Two browser tabs open on the same app URL (tab A and tab B) to simulate multi-client operations.

#### Steps
1. Open the Apps panel in tab A (`#/?tab=apps` or via the Directory route).
2. In tab B, run a chat action that changes the app list (for example install/enable a plugin-app from the Plugins tab).
3. Open the Skills panel in tab A, then in tab B force a skill sync (`Skills` tab → sync action).
4. In tab A, start a chat thread. In tab B, archive that thread from the sidebar (context menu → Archive), then unarchive it.
5. Open the MCP section of the Skills panel in tab A, then in tab B toggle an MCP server reload.

#### Expected Results
- Step 2: the Apps list in tab A refreshes automatically after `app/list/updated` without a manual reload.
- Step 3: the installed-skills list in tab A refreshes after `skills/changed`.
- Step 4: the thread list in tab A reflects the archive/unarchive without a manual refresh, and no console error is thrown.
- Step 5: the MCP server status rows in tab A refresh after `mcpServer/startupStatus/updated`.
- Browser devtools console may show `[codex-notify] ignore <method>` debug lines for known notifications without a UI consumer (for example `model/rerouted`, `item/mcpToolCall/progress`); these must not be errors.

#### Rollback/Cleanup
- Unarchive any threads archived during the test.

### Feature: File-change undo/redo state refresh

#### Prerequisites
- A thread with at least one completed turn that produced file changes (for example ask Codex to edit a file).
- A second client (another browser tab, or the Codex TUI) that can also edit the same files.

#### Steps
1. In the thread, locate the file-change summary block of a completed turn and click Undo.
2. Immediately verify the summary/diff stays consistent after the re-read (the Undo/Redo button label reflects the refreshed state).
3. Repeat the same undo from the second client first, then click Undo in tab A.
4. Refresh tab A after a successful undo and verify the file-change summary matches the on-disk state.

#### Expected Results
- Step 2: undo succeeds with a real change; the message list re-reads once (verify no duplicate requests in the Network panel) and the summary is not stale.
- Step 3: if the other client already reverted the changes, tab A shows "No file changes to undo."-style feedback instead of falsely flipping the button to Redo.
- Step 4: after refresh, the file-change summary matches the disk state (multi-client consistency).

#### Rollback/Cleanup
- Re-do any intentionally reverted file changes, or `git checkout` the affected files to restore.
