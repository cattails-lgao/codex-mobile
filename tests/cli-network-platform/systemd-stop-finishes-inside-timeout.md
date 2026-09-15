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

#### Reference numbers (measured 2026-09-15)

Same two bundles, two websocket clients held across the stop, real `SIGTERM` on Linux (WSL2 Ubuntu 22.04.1, kernel 6.18.33.2, Node v22.23.2), unit `Type=simple` with `TimeoutStopSec=30`:

| bundle | `systemctl stop` | `Result` / `ExecMainStatus` | `systemctl restart` | journal |
| --- | --- | --- | --- | --- |
| v0.1.123 (pre-fix) | 5015ms | `exit-code` / `1` | 5092ms | `Failed with result 'exit-code'.` |
| post-fix | 14ms | `success` / `0` | 40ms | no failure line |
| post-fix, no client | — | `success` / `0` | — | no failure line |

Bundle-level exit timing with a real `SIGTERM`: pre-fix **exit 1 at 5009ms**, post-fix **exit 0 at 7ms** (8ms with no client). `signal=null` on exit is the evidence that the JS handler ran and called `exit(0)`, rather than the kernel killing the process with the default disposition.

#### Reproduce without a Linux host (WSL2)

Only the signal-delivery half is OS-specific, so WSL2 is a faithful stand-in for the stop path:

1. Install a Linux Node inside the distro's own `$HOME` (do not reuse the Windows binaries over `/mnt/c`): download `node-v22.23.2-linux-x64.tar.xz` from nodejs.org and extract it.
2. Send a real signal and time the exit: `node tmp/shutdown-signal-probe-linux.cjs dist-cli/index.js post-fix 2`. Expect `exit code=0 … in <20ms` with two websocket clients attached. A pre-fix copy must stay **inside `dist-cli/`**, otherwise `../dist` stops resolving and the banner never appears.
3. For the literal `systemctl` log line, enable systemd first. WSL ships systemd but leaves it off, and the default user usually has no passwordless sudo — `wsl.exe -d Ubuntu -u root -- …` needs no password. Write `[boot]` + `systemd=true` to `/etc/wsl.conf`, then `wsl --shutdown`, start the distro again, and confirm `cat /proc/1/comm` prints `systemd`.
4. Install a probe unit shaped like the real one (`Type=simple`, `TimeoutStopSec=30`, `ExecStart=<linux-node> <repo>/dist-cli/index.js --port 3099 --no-password --no-tunnel --no-open --no-login`). Start it, hold websockets (`node tmp/hold-ws.cjs 3099 2 &`, wait for its `READY` line), then `systemctl stop` / `systemctl restart` and check `systemctl show -p Result -p ExecMainStatus <unit>` plus `journalctl -u <unit> | grep -iE "Failed with result|Main process exited"`.
5. Revert: stop and delete the unit, `systemctl daemon-reload`, restore `/etc/wsl.conf` to its previous state (delete it if it did not exist), then `wsl --shutdown`. Make sure no staged pre-fix copy is left inside `dist-cli/`.

#### Rollback/Cleanup
- None. If the app-side fix is reverted, keep the raised `TimeoutStopSec` drop-in so the stop does not reach SIGKILL.

---
