### New-thread plan mode persists and toggles correctly

#### Feature/Change Name
New threads started from the home composer honor the selected plan mode for the first turn, and turning plan mode off on the created thread switches later turns back to default mode.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Home route available with a writable project/folder selected
3. At least one model is available for plan mode

#### Steps
1. Open `http://127.0.0.1:4173/#/`
2. Enable `Plan mode` in the new-thread composer
3. Send a prompt that produces a visible plan response
4. After routing into the new thread, confirm the composer still shows `Plan mode` enabled
5. Toggle `Plan mode` off in that thread
6. Send another prompt in the same thread
7. Confirm the next turn runs in default mode rather than generating another plan-first response

#### Expected Results
- The very first turn of a newly created thread uses the plan-mode setting chosen on the home composer
- The newly created thread retains that plan-mode selection after route transition
- Turning plan mode off updates the thread-scoped mode, and later turns in that thread no longer use plan mode

#### Rollback/Cleanup
- Archive or delete any test thread created only for this check

---
