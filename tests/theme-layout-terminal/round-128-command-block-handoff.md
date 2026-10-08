### Regression: A new command block must not flash when the turn finishes

#### Prerequisites
- A running server that has the `/codex-api` bridge **and** a model that can actually run a shell command (`approval_policy = "never"` + a usable provider). On this machine that means an isolated `CODEX_HOME` built by `node tmp/setup-r128-home.cjs` (`tmp/r128-codex-home`, only `auth.json` is copied — the real `~/.codex` is never touched) plus a `dist/` or dev service started from a **cwd outside the repo** (see the round-128 handover note about the project-local `config.toml` override).
- A thread where you can send a message that triggers a command (e.g. `请执行 shell 命令 node -e "console.log(6*7)"，然后用一句话报告输出。`).

#### Steps
1. Open a thread and send a message that makes the assistant **run a shell command**.
2. Watch the command block (the tool-call row) while the assistant streams its output and the turn finishes.
3. In particular, watch the moment the turn completes — the spinner/overlay clears and the final answer appears.

#### Expected Results
- Step 3: as the turn finishes, the command block **stays on screen the whole time**. It must not disappear for a fraction of a second and then come back (the reported "闪一下" — the row blinks, the content below jumps up and back).
- Not-regressed: after the turn completes, exactly **one** command block is shown for that command — the live copy must not linger next to the persisted copy (duplicate row).
- Not-regressed: finishing a turn in one thread must not leave a stale command block in another thread you are not looking at.
- Not-regressed: a turn that fails (rolled back) still clears its live command block; forking a thread still clears the forked thread's live command block; resetting a thread still clears it.

#### Automation
- `node scripts/verify-command-block-handoff.cjs` (needs `PROFILE_BASE_URL`) drives a **real streaming turn** through the app's own composer (it warms up one plain turn first so the app-server is ready, then sends a command-triggering prompt) and samples `[data-message-type="commandExecution"]` counts frame by frame. It fails if the command-block count ever drops from `>0` to `0` and then returns to `>0` within 5s (that is the flicker). It also asserts non-vacuity: the turn really did produce a command block, a `thread/read` with `lastStatus=completed` really did land, and at least 60 frames were sampled — otherwise it exits **2 (SKIP)**, never a silent pass. On the pre-round-128 code it fails **1/6** with `@+11635ms 消失，持续 250ms`; after the fix it is **ALL GREEN 6/6** with no vacuum event.
- `node scripts/check-ui-contract.cjs` statically asserts the invariant (item: "命令块 live→持久化交接延迟清空，不出现真空（round-128）"). It requires the deferred-clear set, the `LIVE_COMMAND_HANDOFF_FALLBACK_MS` bound, a `flushDeferredLiveCommands` that clears the live commands, `finishTurnForThread` being called from **both** notification paths, deferral being limited to the **selected** thread, and — crucially — the `turn/completed` branch **no longer clearing live commands eagerly** and `applyRealtimeUpdates` **no longer calling `setThreadInProgress(completedTurn.threadId, false)` directly**. On the pre-round-128 code it reports **41/42** with both `…仍急切清空=YES(退化了)` and `…直接 setThreadInProgress=YES(退化了)`; after the fix **42/42**.

#### Rollback/Cleanup
- No state is written by the checks — they only read. Close the thread when done.
- The isolated `CODEX_HOME` (`tmp/r128-codex-home`) is disposable; delete it if you no longer need to run the gate. It never contains the real `~/.codex` database.
- If the gate exits **2 (SKIP)**, that means the model did not produce a command block or the turn did not finish — check the provider/relay, not the product code.
