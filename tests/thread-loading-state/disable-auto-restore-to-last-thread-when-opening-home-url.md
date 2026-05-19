### Feature: Disable auto-restore to last thread when opening home URL

#### Prerequisites
- App is running from this repository.
- At least one existing thread is available.
- Browser local storage may contain previous app state.

#### Steps
1. Open an existing thread route and confirm messages are visible.
2. Open `http://localhost:<port>/` (home route) in the same browser profile.
3. Refresh the home route once.
4. Close and re-open the app/tab at the home URL again.

#### Expected Results
- The app remains on the home/new-thread screen and does not auto-navigate to `/thread/<id>`.
- Refreshing home still keeps the user on home.

#### Rollback/Cleanup
- None.

#### Prerequisites
- App is running from this repository.
- A thread exists with enough messages to scroll.
- Test on a mobile-sized viewport (for example 375x812).

#### Steps
1. Open an existing thread and scroll up to the middle of the chat history.
2. Wait for an assistant response to stream while staying at the same scroll position.
3. Send a follow-up message and observe chat positioning when completion finishes.
4. Open the composer on mobile and drag within the composer area.
5. Open/close the on-screen keyboard on mobile and verify the page layout remains usable.

#### Expected Results
- Chat behavior matches pre-PR #16 baseline (no PR #16 scroll-preservation logic active).
- No regressions from reverting PR #16 changes in conversation rendering and composer behavior.
- Mobile layout no longer includes PR #16 visual-viewport sync changes.

#### Rollback/Cleanup
- Re-apply PR #16 commits if the reverted behavior is not desired.
