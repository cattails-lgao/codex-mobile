# Manual Test: Round-106 Upstream Field Adoption (0.157-0.159)

Covers the UI-visible additions from the codex 0.159.0 upgrade round: turn
timestamps on message rows, thread creator identity in the sidebar, and the
`instant_interrupt` feature flag passed to spawned app-server processes.

## Feature: Turn timestamps on message rows (0.157 #47114)

#### Prerequisites
- Dev server running against codex-cli 0.159.0+.
- A thread with at least one completed turn from today, and one from a previous day.

#### Steps
1. Open the thread and hover any message row.
2. Observe the toolbar row under the message.
3. Repeat on a message from a previous day.

#### Expected Results
- Hovered messages show a muted timestamp before the action buttons.
- Same-day messages show `HH:mm`; older messages show `MM-dd HH:mm`.
- Rows without a parseable `turn.startedAt` show no timestamp (toolbar unchanged).

## Feature: Thread creator identity in sidebar (0.157 #47113)

#### Prerequisites
- Sidebar contains threads created by different clients (web, TUI) if available.

#### Steps
1. Hover a thread row title in the sidebar.

#### Expected Results
- A small `originator` label appears after the title (e.g. `codex_cli_rs`),
  and the row tooltip shows the same identity. Threads without a server-provided
  originator show nothing extra.

## Feature: instant_interrupt flag on spawned app-server

#### Prerequisites
- Dev server cold-started (server-side modules are not hot-reloaded).
- `codex --version` is 0.159.0+.

#### Steps
1. Start a turn that streams a long model response.
2. Send a new message while it is streaming (steer mode).

#### Expected Results
- The spawned app-server command line contains
  `-c features.instant_interrupt=true` (check via process inspection or the
  bridge startup log).
- New input preempts the in-flight response instead of waiting for it to stop
  gracefully. `CODEXUI_INSTANT_INTERRUPT=false` restores the legacy behaviour.

#### Rollback/Cleanup
- None; environment variable toggles the flag per run.
