# Round 173: per-thread scroll state persists across sessions (reading position restore)

**Date**: 2026-10-16 · **Scope**: `ThreadConversation.vue`, `useDesktopStatePersistence.ts` · **Related**: `codex-mobile-handover/rounds/round-173-thread-scroll-state-persistence.md`

## What changed

The desktop app persists `{renderedWindow, turnHeightsByKey}` per thread (26.1013 asar
forensics, `xe` snapshot function in `virtualized-turn-list`) and replays it on reopen —
"no estimate-then-jump". Our side had nothing: reopening a thread always reset to
follow-the-bottom, losing both the reading position and any cold-page depth. Round-173
ports the mechanism to our architecture:

1. **Persistence** (`codex-web-local.thread-scroll-state.v1`, LRU 24 threads): per
   thread — warm-layer cold page depth, expanded warm turns, distance-from-bottom
   reading position, and hot measured-height seeds (the round-165 RO cache, ≤200 keys).
2. **Save** on scroll (throttled 2 s **with a trailing edge** — a plain throttle
   silently dropped the save when the thread-open bottom save owned the window, probe
   S1 proved it), plus flushes on thread switch (sync watcher, pre-DOM), `pagehide`,
   `visibilitychange→hidden`, and unmount.
3. **Restore** on thread open (both mount and switch paths): rebuild
   `warmLayerState` from the saved cold page depth (warm spacers are measured
   constants ⇒ no card needs expanding), seed the hot height cache (RO re-measures;
   stale seeds only nudge window boundaries), and if the saved distance exceeds the
   bottom threshold turn auto-follow **off** and write the scroll position back in
   distance-from-bottom coordinates (batch 3a API) over a few rAF frames. At-bottom
   saves keep today's follow-the-bottom behavior.

## Manual verification (real browser, isolated home, synthetic 60-turn thread)

Playwright (repo's own package, `msedge` channel, headless, 1440×950, dpr 1) against
the dev server (`scripts/dev.cjs`, port 5173, `CODEX_HOME=<isolated home>`). Probe:
`tmp/r173-verify.cjs` (not committed).

| # | Scenario | Assertion | Result |
| --- | --- | --- | --- |
| S1 | Mid-thread reading position | scroll to dist 800 → save → reload → dist restored to 800, drift 0, stays (no fall-back to bottom) | PASS |
| S2 | At-bottom reopen | reload → dist 0, follow-latest semantics unchanged | PASS |
| S3 | Cold-page depth | auto-page once (top fling) → save → reload → warm card count 18 = 18, scrollHeight 10027 = 10027 (drift 0) | PASS |
| S4 | `pagehide` flush | scroll to 1200 → synthetic pagehide within throttle window → reload → 1200 restored exactly | PASS |
| S5 | Corrupted storage | `'{corrupted'` injected pre-boot → falls back to bottom (dist 0), no pageerror, app rewrites a clean entry | PASS |

Full gate results: `vue-tsc` 0 · vitest **1060/1060** (93 files, +7 new persistence
tests) · `vite build` 0 · `check-ui-contract` 59/59.

## Notes

- Cross-scenario storage pollution: the previous page's `pagehide` flush lands
  **after** the new document's init scripts, so S5 must route through `about:blank`
  first; also `context.addInitScript` does not affect an existing page's future
  navigations in this channel — page-level registration is required (probe notes).
- Not covered: restore while a turn is actively streaming (auto-follow keeps the
  bottom behavior in that case; constructing a real streaming fixture is a registered
  boundary), multi-device semantics (state is browser-local by design).
