### Feature: Deferred ancillary startup and mobile-resume refreshes

#### Prerequisites
- App is running from this repository.
- At least one large existing thread is available in the sidebar.
- Browser runtime profiler can run with Playwright from this repository.

#### Steps
1. Open a large thread route directly, for example `#/thread/<thread-id>`, and confirm the thread message history appears before non-critical metadata finishes refreshing.
2. In a mobile viewport, keep the same route in the background for longer than the resume-refresh threshold, then return to the app.
3. Confirm the sidebar thread list and current conversation resynchronize before non-critical metadata finishes refreshing.
4. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE="#/thread/<thread-id>" PROFILE_WAIT_MS=7000 node scripts/profile-browser-runtime.cjs`.
5. Open the generated JSON report under `output/playwright/` and inspect `slowestApiRows` and `duplicateCounts`.

#### Expected Results
- The selected thread uses exactly one `thread/resume` and zero `thread/read` calls during initial load or eligible mobile resume.
- Route synchronization still keeps the selected thread aligned with the route, without duplicate selected-thread message loads.
- Thread history loading is not blocked by waiting for `skills/list`, `account/rateLimits/read`, or `collaborationMode/list`.
- Skills, model metadata, rate limits, and collaboration modes still populate shortly after the thread is visible.
- The profiler report has no duplicate-load warnings.

#### Rollback/Cleanup
- Remove generated `output/playwright/browser-runtime-profile-*` artifacts if they are not needed for comparison evidence.
