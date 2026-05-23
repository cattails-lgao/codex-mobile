### Thread open always autoscrolls to latest

#### Feature/Change Name
Opening a thread always scrolls the conversation to the latest messages, with no per-thread scroll restore.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one thread with enough messages to require scrolling
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open a thread and scroll to the middle of its history
2. Switch to another thread
3. Open the first thread again
4. Verify the viewport opens at the bottom (latest messages), not the previous middle position
5. Refresh the browser tab, open the same thread again, and verify it still opens at the bottom
6. Repeat steps 1 through 5 in dark theme

#### Expected Results
- Opening a thread always lands on the latest messages
- Previously viewed scroll positions are not restored when revisiting a thread
- Browser refresh does not restore a previously viewed conversation scroll position
- Behavior is the same in light theme and dark theme

#### Rollback/Cleanup
- None

---
