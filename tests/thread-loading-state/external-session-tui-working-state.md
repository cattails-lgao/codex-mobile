# External Session (TUI) Working State

External-session liveness detection: threads written directly by a standalone `codex` TUI session are overlaid with an `externalSession` field so the web UI shows "working" and guards the composer without mutating app-server state.

#### Prerequisites
- `codexapp` running with a real Codex TUI (`codex`) available on the same machine / `CODEX_HOME`.
- A TUI session started in a terminal, e.g. `cd <project> && codex` then send it a long-running prompt.
- Optional config: `CODEXUI_EXTERNAL_WINDOW_MS` (default `30000`), `CODEXUI_EXTERNAL_POLL_MS` (default `3000`), `CODEXUI_EXTERNAL_ORIGINS` (default `codex-tui,codex_cli_rs`), `CODEXUI_EXTERNAL_SESSION_TRACKING=0` to disable.

#### Steps
1. Start a long-running turn inside the TUI (e.g. ask it to run a slow command).
2. Open the `codexapp` web UI and look at the sidebar row for that thread.
3. Open the thread and inspect the composer and the stop button.
4. Let the TUI finish the turn (task completes and the log stops being written).
5. Restart the TUI with a turn, then kill the TUI process mid-turn (simulated crash: no `task_complete`/`turn_aborted` is written).
6. Reload the web UI while the TUI turn is running.

#### Expected Results
- Step 2: the sidebar shows an amber working indicator (distinct from the web UI's own spinner) while the TUI turn is running; the row is `externalSession.active=true` in the `/codex-api/rpc` `thread/list` response.
- Step 3: a banner reads "This thread is running in the Codex TUI"; the composer input and the stop button are disabled; sending a message is blocked by the disabled composer.
- Step 4: within one poll cycle after the write window elapses, the amber indicator disappears and the thread returns to idle; the banner and disabled state clear.
- Step 5: the thread stays "working" for at most `CODEXUI_EXTERNAL_WINDOW_MS` (default 30 s) after the last file write, then returns to idle — it must never be permanently working.
- Step 6: the working state appears immediately after load (startup full scan) and stays consistent across multiple browser tabs.
- Web UI-owned threads (originator `codex-web-local`) never show the external indicator; archived sessions under `archived_sessions/` are ignored.

#### Rollback/Cleanup
- Set `CODEXUI_EXTERNAL_SESSION_TRACKING=0` and restart `codexapp` to disable detection entirely.
- No app-server state is mutated; restarting the TUI or web UI clears in-memory tracker state.
