### Active thread switches after delete

#### Feature/Change Name
Deleting the currently open thread immediately selects the next available thread.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar contains at least three disposable test threads
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the middle disposable thread
2. Click that thread's delete icon, then click `Confirm`
3. Verify the content area immediately switches to the next thread in the sidebar list
4. Open the last disposable thread
5. Delete and confirm it
6. Verify the content area immediately switches to the previous thread
7. Repeat steps 1 through 6 in dark theme

#### Expected Results
- Deleting the active thread does not leave the deleted thread selected
- The next thread is selected immediately; when there is no next thread, the previous thread is selected
- The browser route updates to the newly selected thread without waiting for a manual click
- A stale deleted-thread URL does not switch the UI back to the archived thread
- Light-theme and dark-theme sidebar selection states remain readable after the automatic switch

#### Rollback/Cleanup
- Delete any disposable threads created only for this test

---
