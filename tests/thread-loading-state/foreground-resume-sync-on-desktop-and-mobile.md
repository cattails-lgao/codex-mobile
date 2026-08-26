# Foreground Resume Sync on Desktop and Mobile

Return to the [manual test index](index.md).

### Feature: Unified foreground resume synchronization

#### Prerequisites
- Run the app from this repository and open a thread with a completed response.
- Browser devtools Network panel is available.
- Test both a desktop-sized viewport and a mobile-sized viewport.

#### Steps
1. In the desktop-sized viewport, open a thread, move the tab to the background for at least one second, then return to it.
2. In Network, confirm the foreground return triggers the normal thread/list and selected-thread refresh path; repeat focus/pageshow events without backgrounding again.
3. Repeat steps 1–2 in a mobile-sized viewport.
4. Switch away and back in under 400 ms in either viewport.

#### Expected Results
- Desktop and mobile both refresh the thread list and selected thread after a background interval of at least 400 ms; the restored thread no longer remains stale or stuck.
- Visibility, focus, and persisted pageshow signals coalesce to one synchronization per background interval; no duplicate selected-thread message request is introduced.
- A brief focus/visibility fluctuation below 400 ms does not trigger the foreground refresh.

#### Rollback/Cleanup
- Close any test tabs and remove no persistent data; no server-side cleanup is required.
