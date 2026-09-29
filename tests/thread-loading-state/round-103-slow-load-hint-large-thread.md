### Feature: Slow-open hint appears when a large history takes unusually long to open (round-103, rewired in round-104)

Context: the *first* open of a very large old thread can take many seconds
while app-server hydrates it (round-104 measured 124MB / 173 turns = ~8s on
codex-cli 0.158.0; round-101 saw ~280s on a 32MB thread on an older CLI).
Before the hint the UI gave no explanation for long waits. The hint is a
delayed second line, not a new loading state.

Round-104 rewiring: **every** thread-open path calls `loadMessages` with
`silent: true`, so `isLoadingMessages` is never true during an initial open —
the round-103 component-local timer keyed on `isLoading` could never fire.
The 5s timer now lives in `useDesktopMessageHistoryLoading`
(`SLOW_OPEN_HINT_DELAY_MS`, exposes `slowOpenThreadId`), and
`ThreadConversation` renders the hint from the `isSlowOpen` prop.

#### Prerequisites
- Dev server fully restarted after any `src/server/**` change (a Vite
  "server restarted" hot reload does NOT reliably re-inject server modules
  into the running bridge — seen twice in round-104).
- A thread whose first open is slow enough to exceed 5s. Hard to arrange
  naturally: any thread works for the "does not appear" direction; for the
  "appears" direction use a genuinely huge thread (the 124MB one imported in
  round-104 fires it on a cold app-server) or temporarily lower
  `SLOW_OPEN_HINT_DELAY_MS` in `useDesktopMessageHistoryLoading.ts` to a
  small value (e.g. 300ms) while testing, then restore 5000.

#### Steps
1. Open a normal thread. Wait 10s.
2. Open the huge thread with a cold app-server (restart the dev server or
   kill the `codex.exe app-server` child first), or use the reduced delay.
   Keep the thread open while loading continues past the threshold.
3. While the hint is visible, wait for the load to finish.
4. Switch to another thread while a slow load is still in flight.
5. Switch threads rapidly during normal (fast) loads.

#### Expected Results
- Step 1: no hint line appears at any time (loads finish well under 5s).
- Step 2: after ~5s of continued loading, a second line appears below the
  loading indicator: EN "Still loading — the first open of a large history can
  take a while." / ZH "仍在加载——较大的历史会话首次打开可能需要较长时间。"
  (check both UI languages). `role="status"`.
- Step 3: the hint disappears when the load finishes (messages render), and
  does not reappear until another load exceeds the delay.
- Step 4: the new thread's load restarts the timer — the previous thread's
  wait is not carried over (`slowOpenThreadId` switches/clears).
- Step 5: no hint flashes for fast loads; no console errors.

#### Rollback/Cleanup
- Restore `SLOW_OPEN_HINT_DELAY_MS` to 5000 if it was changed for testing.
