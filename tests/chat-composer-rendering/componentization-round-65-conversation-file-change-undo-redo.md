# Componentization round-65: Conversation file-change undo/redo state machine

Refactor of `ThreadConversation.vue` (no user-visible behavior change): the asynchronous file-change undo/redo cluster — the `fileChangeActionState` / `fileChangeActionError` / `fileChangeRedoPatchIds` refs, the `fileChangeActionKey` / `isFileChangeActionable` / `fileChangeActionStatus` / `fileChangeActionErrorText` / `fileChangeNextAction` / `fileChangeActionLabel` helpers, `runFileChangeAction` (with idle→undoing/redoing→undone/redone transitions and the cached redo patch-ids), and `resetFileChangeActions` — was extracted into `useFileChangeActionMachine.ts` via dependency injection (`getActiveThreadId`, `getCwd`, `onFileChangesChanged`, `updateThreadFileChanges`, `t`). The shared confirm-dialog orchestration (`pendingConfirm` + the emit that opens the dialog) stays in the component. This page is a smoke regression of the moved undo/redo surface.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation with at least one completed turn that applied file changes via `apply_patch`, and one whose changes you can revert on disk.
- Optional second client on the same workspace to exercise the "already reverted elsewhere" case.

## Actions and Expected Results

### Turn-level Undo / Redo
1. Expand a completed turn's file-change summary and click the action button. Expected: the button shows a pending `Undoing…` label while the request runs, then flips to `Redo` on success; the disk contents of the changed files are restored (compare with `git checkout -- .` baseline or a saved copy).
2. Click `Redo` on the same row. Expected: label shows `Redoing…`, then returns to `Undo`; the files are reapplied from the previously captured patch inputs.
3. Exactly one action button is visible at a time: `Undo` before rollback, `Redo` after undo, `Undo` again after redo.

### Confirmation dialog still gates the action
4. Click Undo (and Redo) and confirm the existing confirmation dialog appears before the working tree is modified; Cancel aborts and leaves the files unchanged. The dialog wiring is unchanged by this refactor (the machine only runs after the shared confirm resolves).

### Error and no-op handling
5. Force an undo that fails partway (or pre-empt it from a second client). Expected: the inline error message surfaces; a partial undo keeps the row on `Redo` so it stays re-appliable; if nothing actually changed, a "No file changes to undo."-style message appears and the button does not falsely flip to a new undone state.

### Thread switch resets the machine
6. Undo a turn, then switch to another thread and back. Expected: the action state (pending label / stale redo cache) is cleared per-thread via `resetFileChangeActions()`; switching threads no longer leaks the previous thread's undo state.

## Verification / Cleanup Notes

- No behavior change; this guards against extracting the undo/redo state machine.
- Rollback: covered by `useFileChangeActionMachine.test.ts` (11 cases: action key/actionability, default idle + null fallback, undo + reverted patch-id capture, redo feeding cached patch-ids back, in-flight pending labels, server-error partial-undo keeps redoable, no-change with/without server message, thrown-error state restore, no-op guards, full reset) plus `vue-tsc` and production build; revert `ThreadConversation.vue`'s `createFileChangeActionMachine` wiring and the watcher's `resetFileChangeActions()` call if any surface above misbehaves.
- Cleanup: Redo any file changes intentionally reverted during the test (or `git checkout` the affected files) to restore the worktree.