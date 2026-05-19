### Queue mode is default for in-progress messages

#### Feature/Change Name
When a turn is already running, the in-progress message path defaults to `Queue` for new sessions and existing users without a saved preference.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open any existing thread with message composer enabled
3. Start from a clean setting state by clearing localStorage key `codex-web-local.in-progress-send-mode` if present
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. Open a thread and ensure no previous turn is running
2. Confirm settings shows `When busy` line labeled as `Queue`
3. Send a message that triggers an in-progress response
4. While the response is running, submit a second message and observe submit mode label / destination behavior
5. Open the queue list and confirm the second message is queued
6. Switch to dark theme and repeat step 4 using another thread

#### Expected Results
- The in-progress setting defaults to `Queue` when no saved preference exists
- A second message sent during an active turn is queued, not used as steer
- Queue order and queued item actions remain functional in both light theme and dark theme

#### Rollback/Cleanup
- Clear the queue by sending/steering queued items or deleting queued rows

---
