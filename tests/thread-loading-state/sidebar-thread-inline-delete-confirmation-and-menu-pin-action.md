### Sidebar thread inline delete confirmation and menu pin action

#### Feature/Change Name
Thread rows show an inline delete button that morphs to `Confirm`, while pin/unpin moves to the thread context menu.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains at least two disposable test threads
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, hover a disposable thread row and verify the left-side action shows a delete icon instead of a pin icon
2. Click the delete icon once and verify it changes to a `Confirm` button without selecting the row
3. Click a different thread row and verify the pending `Confirm` state clears
4. Hover the disposable thread row again, click delete, then click `Confirm`
5. Verify the thread is removed from the sidebar immediately and, if it was pinned, removed from the `Pinned` section too
6. Open another thread row context menu and verify it contains `Pin thread` for an unpinned thread
7. Click `Pin thread`, reopen the same thread menu, and verify it now shows `Unpin thread`
8. Switch to dark theme and repeat steps 1 through 7 with another disposable thread

#### Expected Results
- The inline row action is delete, not pin
- Delete requires two clicks: delete icon, then `Confirm`
- Confirming archives/removes the correct thread immediately from the sidebar and clears any pinned state for that thread
- Pin/unpin is available from the thread context menu and updates the `Pinned` section immediately
- Delete icon, `Confirm` button, and context menu items are readable in both light theme and dark theme

#### Rollback/Cleanup
- Delete or unpin any disposable threads created only for this test

---
