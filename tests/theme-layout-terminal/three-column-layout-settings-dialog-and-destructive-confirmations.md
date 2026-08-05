# Three-Column Layout, Settings Dialog, and Destructive Confirmations

Covers: right side panel (Git/Terminal tabs), removal of header terminal/branch buttons, settings as a modal dialog, skill chips removal, slash menu skill display names, and confirmation prompts for edit/rollback/undo.

Return to the [manual test index](../../tests.md).

## Test Sections

### Feature: Right side panel with Git/Terminal tabs (three-column layout)

#### Prerequisites
- Dev server running on `http://127.0.0.1:4173/`.
- A thread inside a Git worktree open in the chat area.

#### Steps
1. Open a thread and confirm the layout has three columns: left sidebar, messages, right side panel.
2. Verify the right panel header shows a Git tab (active by default) and a Terminal tab, plus a `+` button.
3. Click the `+` button and confirm a popover lists "Terminal panel" and "Git panel"; selecting one switches the active tab.
4. On the Git tab, verify branch list, checkout, commits, commit files, reset, and Review Worktree Changes still work as before.
5. Click the Terminal tab and confirm the xterm terminal attaches to the current thread cwd.
6. Press `Ctrl+J` (Windows) / `Cmd+J` (macOS) and confirm the active tab toggles between Git and Terminal.
7. Switch to a 375x812 viewport, open the right panel via the header toggle button (left of the title), and confirm the panel slides in as a drawer with a close button.

#### Expected Results
- Three columns render on desktop; no header terminal command dropdown or Detached HEAD/branch dropdown remains in the content header.
- Right panel defaults to Git; Terminal tab attaches a working xterm session; `+` popover switches tabs.
- On mobile the panel behaves as a fixed right drawer and never permanently shrinks the chat column.
- Light and dark themes both render the panel header/tabs legibly.

#### Rollback/Cleanup
- None; state is in-memory (active tab resets on reload).

### Feature: Settings opens as a modal dialog

#### Prerequisites
- Dev server running on `http://127.0.0.1:4173/`.

#### Steps
1. Click the Settings button at the bottom of the left sidebar.
2. Confirm the settings content opens as a centered modal dialog with a title bar and close button, not an inline sidebar popover.
3. Verify Accounts, Hooks, Marketplace, Plugin sharing, Remote control, and Approval policy sections are all present and functional (reload buttons, toggles, save actions).
4. Click the backdrop or press `Escape` and confirm the dialog closes; click the Settings button again to reopen.
5. Switch to dark theme and repeat step 2 to confirm readable contrast.

#### Expected Results
- Dialog is centered with a visible header and close affordance; scrolling inside the body works; backdrop click and Escape close it.

#### Rollback/Cleanup
- None.

### Feature: Skill chips removed from composer; slash menu shows full skill display names

#### Prerequisites
- Dev server running on `http://127.0.0.1:4173/`; at least one skill installed.

#### Steps
1. Type `/` in the composer and confirm the slash menu groups "Commands" and "Skills"; skill rows show the full display name (e.g. "Frontend Code Review" instead of "frontend-code-review").
2. Select a skill command and confirm it attaches the skill to the message (message sends with the `skills` payload).
3. Confirm no skill chip row appears under the composer input after selection.
4. Send the message and verify the sent message still carries the selected skill.

#### Expected Results
- Slash menu skill rows render display names; composer input area no longer shows skill chips; selected skills still attach on send.

#### Rollback/Cleanup
- None.

### Feature: Confirmation prompts for edit, rollback, and undo/redo file changes

#### Prerequisites
- Dev server running on `http://127.0.0.1:4173/`; a thread with at least one turn that changed files.

#### Steps
1. Click "Edit message" on a user message and confirm a confirmation dialog appears ("Edit this message?") with Cancel/Confirm.
2. Click Cancel and confirm nothing changes; click Edit message again then Confirm and verify the message text is loaded into the composer and the thread rolls back.
3. On a message with file changes, click Undo and confirm a confirmation dialog appears before the working tree is modified; Cancel leaves the files unchanged.
4. Repeat with Redo and confirm the same confirmation behavior.
5. Verify Escape/backdrop behavior is not required but Confirm/Cancel both work.

#### Expected Results
- Edit, rollback, undo, and redo file-change actions all require explicit confirmation before executing; Cancel aborts.

#### Rollback/Cleanup
- After confirming an undo, redo it via the same button to restore the working tree if needed.
