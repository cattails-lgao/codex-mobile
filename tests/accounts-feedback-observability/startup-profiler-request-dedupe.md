### Startup profiler request dedupe

#### Feature/Change Name
Startup thread-list and skills-list refreshes reuse fresh in-memory results, and the profiler distinguishes pinned-thread summary hydration from duplicate full thread reads.

#### Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Ensure the browser profiler is available from this repository.

#### Steps
1. In light theme, run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
2. Open the generated `output/playwright/browser-runtime-profile-home-*.json`.
3. Confirm `duplicateCounts.threadListFirstPage` is `1`, `duplicateCounts.skillsList` is `1`, and `warnings` is empty.
4. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:thread`.
5. Open the generated `output/playwright/browser-runtime-profile-thread-*.json`.
6. Confirm `duplicateCounts.threadReadWithTurns` is `0`, `duplicateCounts.threadReadDuplicateKeys` is `0`, and `warnings` is empty.
7. Repeat the home route in dark theme and confirm the page finishes loading without `pageState.stillLoadingThreads`.

#### Expected Results
- Startup event bursts do not issue duplicate first-page `thread/list` requests.
- Startup event bursts do not issue duplicate same-cwd `skills/list` requests.
- Pinned-thread summaries may appear as `thread/read:*:summary` rows, but they do not trigger duplicate full-read warnings.
- Light and dark themes both complete thread loading.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.

---
