### Feature: Deferred ancillary startup refreshes

#### Prerequisites
- App is running from this repository.
- At least one large existing thread is available in the sidebar.
- Browser runtime profiler can run with Playwright from this repository.

#### Steps
1. Open a large thread route directly, for example `#/thread/<thread-id>`.
2. Confirm the thread message history appears before non-critical metadata finishes refreshing.
3. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE="#/thread/<thread-id>" PROFILE_WAIT_MS=7000 node scripts/profile-browser-runtime.cjs`.
4. Open the generated JSON report under `output/playwright/`.
5. Inspect `slowestApiRows` and `duplicateCounts`.

#### Expected Results
- The selected thread uses exactly one `thread/resume` and zero `thread/read` calls during initial load.
- Direct thread route hydration has one owner and does not trigger duplicate selected-thread message loads from route watchers.
- Thread history loading is not blocked by waiting for `skills/list`, `account/rateLimits/read`, or `collaborationMode/list`.
- Skills, model metadata, rate limits, and collaboration modes still populate shortly after the thread is visible.
- The profiler report has no duplicate-load warnings.

#### Rollback/Cleanup
- Remove generated `output/playwright/browser-runtime-profile-*` artifacts if they are not needed for comparison evidence.
