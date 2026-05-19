### Feature: No automatic restore of last active thread on startup

#### Prerequisites
- App is running from this repository.
- At least one existing thread is available.
- Browser local storage is enabled.

#### Steps
1. Open the app in a regular browser tab (`http://localhost:<port>/`), select any thread, then navigate back to home route (`#/`).
2. Refresh the browser tab.
3. Confirm the app remains on home route and does not auto-switch to `#/thread/:threadId`.
4. Install/open the app in PWA standalone mode, select any thread, navigate to `#/`, and relaunch the PWA.

#### Expected Results
- In regular browser-tab mode, startup does not restore and redirect to the last active thread.
- In PWA standalone mode, startup also does not restore and redirect to the last active thread.
- Existing `openProjectPath` startup behavior still opens the requested project on home.

#### Rollback/Cleanup
- Clear app local storage state if you need to reset startup behavior for retesting.

#### Prerequisites
- `pnpm` is installed globally (`npm i -g pnpm` or via corepack).
- Repository is cloned and `node_modules/` does not exist (or may be stale).

#### Steps
1. Remove `node_modules/` if present: `rm -rf node_modules`.
2. Run `pnpm run dev`.
3. Wait for Vite dev server to start and display the local URL.
4. Open the displayed URL in a browser.

#### Expected Results
- `pnpm install` runs automatically before Vite starts (dependencies are installed).
- Vite dev server starts successfully and serves the app.
- No `npm` commands are invoked.

#### Rollback/Cleanup
- None.
