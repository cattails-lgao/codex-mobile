### Feature: Account quota background refresh recovers from stale loading and inspection hangs

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Have multiple imported accounts in `~/.codex/accounts.json`.
- At least one account previously left with `quotaStatus: "loading"` for longer than 2 minutes, or one account that causes quota inspection to hang.

#### Steps
1. Open Settings and expand `Accounts`.
2. Trigger account list refresh by loading the page or clicking `Reload`.
3. Monitor `~/.codex/accounts.json` and confirm stale `loading` accounts are re-picked for refresh (not ignored indefinitely).
4. Wait at least 30 seconds when one account is slow/hanging.
5. Verify other accounts continue progressing instead of all remaining blocked.
6. Re-open the Accounts section and inspect final status labels for previously stuck accounts.

#### Expected Results
- `loading` states older than 2 minutes are retried automatically.
- A single hanging account inspection times out (about 25 seconds) and transitions to `error` rather than blocking the whole queue forever.
- Remaining accounts continue refreshing to `ready` as data becomes available.
- UI no longer stays indefinitely stuck waiting on one blocked account refresh.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Desktop rate-limit refresh controller preserves request behavior

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Use an account that exposes Codex rate-limit data.
- Open browser network inspection if request-count verification is needed.

#### Steps
1. Reload the app and open Settings > Usage & about; record the displayed quota snapshot.
2. Complete a turn that emits one or more rate-limit update notifications.
3. Confirm the quota refreshes after the notification burst and does not briefly reset to an empty state.
4. Temporarily make the rate-limit endpoint unavailable, trigger another refresh, and restore it.
5. Navigate away or stop the app while a debounced refresh is pending.

#### Expected Results
- Concurrent callers share one in-flight quota request, and rapid notifications collapse into one request after the 500 ms debounce window.
- A transient request failure preserves the last known quota snapshot.
- Stopping polling cancels pending debounced work; no later duplicate request is emitted.

#### Rollback/Cleanup
- Restore the rate-limit endpoint if it was temporarily made unavailable.
