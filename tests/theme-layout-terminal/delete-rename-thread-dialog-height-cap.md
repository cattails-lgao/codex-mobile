### Fix: Delete/rename thread dialog height cap

#### Prerequisites
- App is running from this repository.
- At least one thread exists with a long title (can be achieved by renaming a thread to a very long string).

#### Steps — Delete button visibility

1. Right-click (or long-press) a thread in the sidebar to open the context menu.
2. Click **Delete**.
3. Verify the confirmation dialog appears and the **Delete** / **Cancel** buttons are fully visible without scrolling the page.
4. Repeat with a thread whose title is very long (50+ characters); confirm buttons remain visible.
5. On a small viewport (e.g. browser DevTools device emulation at 375 × 667), repeat steps 1–4 and confirm the dialog never exceeds the screen height.

#### Steps — Long title wrapping

6. Rename a thread to a string with no spaces (e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`).
7. Open the Delete dialog for that thread.
8. Verify the long title in the subtitle area wraps onto multiple lines rather than overflowing or being clipped horizontally.
9. If the title is long enough to fill the subtitle area, verify a vertical scrollbar appears within the subtitle, and the title, input, and buttons remain visible outside the scroll area.

#### Steps — Rename dialog

10. Open the Rename dialog for a thread with a long title.
11. Confirm the rename input field, title text, and **Save** / **Cancel** buttons are all fully visible.
12. Type a very long string into the rename input and confirm it does not push the buttons off screen.

#### Expected Results
- Dialog is capped at 90 vh; action buttons are always pinned at the bottom.
- Long unbroken thread titles wrap within the subtitle area; no horizontal clipping.
- Vertical scrollbar appears in the subtitle region if the title exceeds available height.

#### Rollback/Cleanup
- Rename any test threads back to original names if desired.
