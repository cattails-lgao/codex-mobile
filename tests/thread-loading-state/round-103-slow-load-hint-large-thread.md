### Feature: Slow-load hint appears when a large history takes unusually long to open (round-103)

Context: round-101 measured that on codex-cli 0.158.0 the *first* open of a very
large old thread can take ~280s while app-server performs a one-time
migration/indexing. Before round-103 the UI only showed "Loading messages..."
for the whole wait. The hint is a delayed second line, not a new loading state.

#### Prerequisites
- Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`).
- A thread whose first open is slow enough to exceed 5s. Hard to arrange
  naturally: any thread works for the "does not appear" direction; for the
  "appears" direction use browser devtools throttling or temporarily raise
  `SLOW_LOAD_HINT_DELAY_MS` in `ThreadConversation.vue` to a small value
  (e.g. 300ms) while testing, then restore 5000.

#### Steps
1. Open a normal thread. Wait 10s.
2. Open a second thread and simulate a slow open (devtools network throttling
   on `/codex-api/rpc`, or the reduced delay above). Keep the thread open
   while loading continues past the threshold.
3. While the hint is visible, wait for the load to finish.
4. Switch to another thread while a slow load is still in flight.
5. Switch threads rapidly during normal (fast) loads.

#### Expected Results
- Step 1: only "Loading messages..." during load; no extra hint line appears
  at any time (loads finish well under 5s).
- Step 2: after ~5s of continued loading, a second line appears below the
  loading indicator: EN "Still loading — the first open of a large history can
  take a while." / ZH "仍在加载——较大的历史会话首次打开可能需要较长时间。"
  (check both UI languages). It renders in both shapes: the switching bar
  (older content still visible) and the empty-conversation loading line.
- Step 3: the hint disappears together with the loading indicator when the
  load finishes, and does not reappear until another load exceeds the delay.
- Step 4: switching threads restarts the hint timer — the new thread gets a
  full 5s of quiet loading before the hint may appear; the previous thread's
  wait is not carried over.
- Step 5: no hint flashes for fast loads; no console errors.

#### Rollback/Cleanup
- Restore `SLOW_LOAD_HINT_DELAY_MS` to 5000 if it was changed for testing.
