### Systemd stop finishes inside TimeoutStopSec

#### Feature/Change Name
`codex-mobile-re` shutdown terminates connected websocket clients and drops remaining idle/pending connections, so `server.close()` returns within the drain window instead of falling through to the 5s forced-exit (`exit 1`) that systemd reports as a failed stop.

#### Prerequisites/Setup
1. Linux host running the CLI under systemd, with `ExecStart` pointing at the packaged `dist-cli/index.js`.
2. Read access to the effective stop timeout: `systemctl show codexapp.service -p TimeoutStopUSec`.
3. A browser (or `wscat`) able to hold a `/codex-api/ws` connection open.

#### Steps
1. Start the service and open the web UI so a websocket connection is established.
2. Note the effective stop timeout (`systemctl show codexapp.service -p TimeoutStopUSec`).
3. Run `sudo systemctl restart codexapp.service`.
4. Inspect `journalctl -u codexapp.service -n 50` for the stop/start sequence.
5. Repeat steps 3-4 three to five times, and include one run with the UI closed (no websocket client).
6. Confirm the restart lands on `active` and the UI answers 200 on its port.

#### Expected Results
- No `Failed with result 'exit-code'` and no `Failed with result 'timeout'` line for the stop.
- The process exits with code 0 within roughly one second (the drain window; `server.close()` in the probe returned in ~2ms with only websocket clients and ~1s with a pending SSE response), with or without a connected websocket client.
- The unit reaches `inactive (dead)` before systemd's `TimeoutStopUSec` elapses, so no SIGKILL is needed.
- Steady-state behavior is unchanged: the restarted process serves HTTP 200 on the configured port.

#### Rollback/Cleanup
- None. If the app-side fix is reverted, keep the raised `TimeoutStopSec` drop-in so the stop does not reach SIGKILL.

---
