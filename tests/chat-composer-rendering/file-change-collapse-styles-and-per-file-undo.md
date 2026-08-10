# File-Change Summary Block: Collapse Styles Restored + Per-File Undo

Two related fixes for the `data-message-type="fileChange"` block in the message list.

#### Background
- **Collapse/styles broken:** after the round-15 component split, `FileChangeSummaryBlock` reused `cmd-row` / `cmd-chevron` / `cmd-group-wrap` / `cmd-group-visible` classes whose definitions stayed in `ThreadConversation.vue` scoped styles, so the child component never received them. The fold animation (`grid-template-rows: 0fr→1fr`) and row/chevron styling silently vanished, making the block look broken and non-collapsible.
- **Undo granularity:** the turn-level Undo button reverted the whole turn's file changes; there was no way to revert a single file.

#### Changes
- `FileChangeSummaryBlock.vue` now carries its own `cmd-*` collapse styles; the now-unused `cmd-*` rules were removed from `ThreadConversation.vue`.
- Backend `/codex-api/thread/rollback-files` accepts a new `filePaths` array (absolute paths matched against each change's path and movedToPath), scoping undo/redo to specific files while keeping the existing `patchIds` (apply_patch call id) and `scope` semantics.
- Each file row in the summary block has a small undo button; it opens a confirm dialog naming the file, then calls `updateThreadFileChanges(..., filePaths)`.

#### Steps
1. Open a thread whose turn changed multiple files (apply_patch touching 2+ files).
2. Expand the file-change block; each file row now shows an undo icon on the right.
3. Click the icon on one file and confirm.
4. Re-open the diff/working tree and check the other file is untouched.
5. Use the block-level Undo button and verify all files of the turn revert.

#### Expected Results
- Step 2: the block renders with the normal row styling and the chevron rotates on expand/collapse.
- Step 3-4: only the chosen file is reverted; the other file keeps its edited content; the redo state applies to the same file scope.
- Step 5: whole-turn undo still works as before.
- Dark theme and mobile widths keep the undo icon visible and aligned.

#### Rollback/Cleanup
- Single-file scope is opt-in: omitting `filePaths` behaves exactly like before (whole-turn undo/redo).
