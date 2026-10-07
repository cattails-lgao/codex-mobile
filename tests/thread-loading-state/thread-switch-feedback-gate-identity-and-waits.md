# Thread Switch Feedback Gate: Identity Targets and Condition Waits

### Feature: sidebar switch feedback gate (`scripts/check-thread-switch-feedback.cjs`)

Verifies the round-89 behaviour (the selected-row highlight is painted before the
switch work finishes) and that the highlight, route and content agree once a
switch settles - including a rapid A -> B -> C -> A tour. The gate identifies
sidebar threads by `data-thread-id` and waits on conditions, because the sidebar
re-sorts by `updatedAt` and opening a thread can move its row.

#### Prerequisites

- A production build served **with** the `/codex-api` bridge (`vite preview` has none):
  `CODEX_HOME=<项目>/.codex node dist-cli/index.js --no-tunnel --no-open --no-login --no-password -p 4173`
- Rebuild both artifacts before running (`vite build` **and** `tsup`); a stale `dist` misses `data-thread-id`.
- The `CODEX_HOME` used by that service must contain **at least 2 threads with messages**.
  The project sandbox is thin; `tmp/r118-seed-sandbox.cjs --apply` copies a few small
  real rollouts in as copies if needed. The gate prints `with-messages=N` and exits with a
  clear message when it cannot find two.

#### Steps

1. `node scripts/check-thread-switch-feedback.cjs`
2. Optional: `PROFILE_HEADLESS=false` to watch, `FREEZE_BUDGET_MS` to change the frame budget,
   `SETTLE_TIMEOUT_MS` to change the per-switch settle budget (default 15000).
3. Read the trailing `note  sidebar order:` line - it reports how many row indices changed
   thread during the run, which is expected behaviour and not a failure.

#### Expected Results

- 12 `ok` lines and `all checks passed`; exit code 0.
- The line `every sidebar row exposes data-thread-id  (missing=0/N)` passes - if it fails the
  served build is stale.
- `with-messages=` is at least 2; the run bails out early otherwise.
- Freeze readings stay under the budget (`first-open freeze` / `switch freeze`).
- Run it twice in a row: results must be identical even when the `note` line reports a
  non-zero index drift (that is the regression this gate is now immune to).

#### Rollback/Cleanup

- Stop the port-4173 service when done.
- If `tmp/r118-seed-sandbox.cjs --apply` was used, delete the copied `rollout-*.jsonl` files
  under `.codex/sessions/` to restore the sandbox (`.codex/` is gitignored).
