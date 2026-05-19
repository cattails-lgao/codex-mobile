### Browser runtime profiling with Playwright

#### Feature/Change Name
Playwright browser runtime profiler captures route timing, Codex API network counts, screenshots, and trace files.

#### Prerequisites/Setup
1. Dev server running at `http://localhost:5173`
2. Dependencies installed (`pnpm install`)
3. Target route available, such as `#/thread/019da7c0-4e12-7a91-837c-f7c11cc8ab6c`

#### Steps
1. Run `pnpm run profile:browser`
2. Run `PROFILE_ROUTE='#/thread/019da7c0-4e12-7a91-837c-f7c11cc8ab6c' pnpm run profile:browser`
3. Inspect console output for duplicate counts and slowest API rows
4. Open the generated `output/playwright/browser-runtime-profile-*.json`
5. Open the generated `output/playwright/browser-runtime-profile-*-trace.zip` with `npx playwright show-trace`

#### Expected Results
- The profiler prints final URL, title, total observed time, duplicate request counts, and slowest Codex API calls
- JSON report includes raw API rows, grouped summaries, Performance API data, and artifact paths
- JSON report includes `pageState.stillLoadingThreads`; the profiler exits non-zero if the page still contains `Loading threads...` after the thread-loading timeout
- Screenshot is saved under `output/playwright/browser-runtime-profile-*.png`
- Trace is saved under `output/playwright/browser-runtime-profile-*-trace.zip`

#### Rollback/Cleanup
- Delete generated files under `output/playwright/` if local artifacts are no longer needed

---
