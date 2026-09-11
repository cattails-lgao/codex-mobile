# Feature: Turn-duration mirror sends only deltas (no write-amplification storm)

Round-77 (unreleased). Verifies that the per-turn duration archive is mirrored to the bridge **incrementally** instead of re-PUTting every thread's every turn on each save, and that boot no longer rewrites what it just read from the server.

## Why

`savePersistedTurnDurationMap` mirrored the whole archive to `/codex-api/thread-turn-durations` one PUT per `(threadId, turnId)`. It was called after the startup merge of the server archive, so every page load re-PUT everything the server already had — 27 PUTs on the reference machine — and each PUT is a full read-modify-write of the bridge's `codex-global-state.json`. Those writes saturated the browser's ~6 same-origin connections and the server's file I/O, delaying the concurrent `thread/list` / `thread/resume`.

## Prerequisites

- Dev server running on the handover's dev port (`pnpm run dev --host 127.0.0.1 --port 4173`).
- DevTools Network panel filtered to `/codex-api`, plus a Performance panel recording for long tasks.
- At least a handful of threads with completed turns so the archive is non-trivial.

## Steps

1. Load the home route (`#/`) in a fresh browser profile (empty `localStorage`, so nothing local needs mirroring).
2. Count the requests to `/codex-api/thread-turn-durations` (method `PUT`) during boot.
3. Click through 3–4 threads and watch `thread/resume` in the Network panel.
4. Complete one turn in any thread (send a message and let it finish), then watch how many `PUT /codex-api/thread-turn-durations` requests fire.
5. Reload the page and confirm the durations still restore (badge next to the per-turn process header).

## Expected Results

- Step 2: **one** `GET /codex-api/thread-turn-durations` and **zero** PUTs on a fresh profile — the archive just came from the server, so nothing is mirrored back. Reference measurement: 28 requests → **1** on the home route.
- Step 3: `thread/resume` stays in the low tens/one hundred ms. Reference measurement: average **224ms → 81ms** (max 283ms → 121ms), −64%.
- Step 3: thread switch (steady state, after the first click) is roughly 2–3× faster. Reference: 455/258/243ms → **240/90/125ms**.
- Step 4: a completed turn produces **exactly one** PUT for that turn (`{ threadId, turnId, durationMs }`), not one per known turn.
- Step 5: the duration badges still render after reload (the mirrored value round-trips).
- Total `/codex-api` requests on boot drop accordingly (reference: 85 → 53 across the same scripted flow).

## Notes / boundaries

- The first thread click right after boot can still be slower than later clicks: the boot-time request set (`provider-models`, `git/*`, `free-mode/status`) still occupies the connection pool while it is in flight. That part is out of scope here (and partly environmental — a local provider that is down, or `git` failing with 500, widens it).
- Mirroring remains best-effort (fire-and-forget `void`); only the *volume* changed.

## Rollback/Cleanup

- No files are written outside the bridge's own `codex-global-state.json` (under `CODEX_HOME`).
- Reverting `savePersistedTurnDurationMap` / `loadThreadTurnDurationsIfNeeded` restores the previous full-mirror behavior; no data migration is needed because the archive format is unchanged.
