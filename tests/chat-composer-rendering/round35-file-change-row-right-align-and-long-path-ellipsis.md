# Round 35: File-Change Row Layout (delta + undo to the far right) + Long-Path Ellipsis

Follow-up on round-34: the per-file change row now puts the signed delta and the undo button at the far right of the row, and long file paths truncate with an ellipsis instead of wrapping.

#### Background / Root Cause
- Round-34 moved the delta count and undo button to the far left of each `file-change-item`, but the requested layout is the opposite: the change numbers and the undo button belong at the far right of the row (mirroring the summary status position).
- File paths are absolute and often very long; the row used `flex-wrap`, so long paths wrapped to multiple lines instead of being truncated.

#### Changes
- `FileChangeSummaryBlock.vue` template: per-row element order is now `badge → path group (path → arrow → moved path) → delta → undo button`.
- `FileChangeSummaryBlock.vue` styles:
  - `.file-change-item` drops `flex-wrap`, keeps `min-w-0` so the row stays on one line.
  - New `.file-change-path-group` (`flex min-w-0 flex-1`) gives the path the available space while staying shrinkable.
  - `.file-change-path-button` gets `truncate` (ellipsis) + `min-w-0`.
  - `.file-change-delta` gets `ml-auto` so the delta and the undo button sit at the far right; the undo button no longer carries its own `ml-auto`.

#### Steps
1. Open a thread with a file-change block (apply_patch), expand the block, and inspect a row.
2. Verify the `+N/-N` delta and the undo icon are the rightmost elements of the row, immediately after the path (or after the moved path when present).
3. Verify that an abnormally long file path is truncated with `…` on a single line and the delta/undo stay pinned at the right edge.
4. Switch to dark theme and re-check the same row.

#### Expected Results
- Step 2: delta and undo are right-aligned; order is badge → path → delta → undo.
- Step 3: `text-overflow: ellipsis`, single-line row, delta/undo remain at the far right.
- Step 4: same layout in dark theme (computed styles: delta/undo at right, undo adjacent to delta).
- `vue-tsc --noEmit` passes; unit suite unaffected (no logic change).
