### Unread thread cutoff state

#### Feature/Change Name
Unread thread state uses a local cutoff timestamp so existing threads are not all marked unread after first load.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`).
2. Browser localStorage is available for the app origin.
3. At least two existing threads are present.
4. Light theme and dark theme are available from the appearance switcher.

#### Steps
1. Clear only `codex-web-local.thread-unread-cutoff.v1` from localStorage for the app origin.
2. Load the app in light theme.
3. Confirm existing threads are not all marked unread on first load.
4. Create or receive an update in a different thread after the app has loaded.
5. Confirm that updated thread can show unread when it is not selected or in progress.
6. Create or receive an update in a second unselected thread.
7. Open the first updated thread and confirm only that thread's unread indicator clears.
8. Confirm the second updated thread remains unread until it is opened.
9. Switch to dark theme and repeat steps 4 through 8.

#### Expected Results
- Missing cutoff state initializes to the current time instead of treating every thread as unread.
- Threads updated after the cutoff can still become unread.
- Opening a thread updates only that thread's read state and clears only that thread's unread indicator.
- Unread indicators remain readable in both light theme and dark theme.

#### Rollback/Cleanup
- Remove any disposable test threads created for this validation.

---
