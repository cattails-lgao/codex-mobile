# Round 172: prepend scroll anchoring keeps the viewport stable (anchor + incremental settlement)

**Date**: 2026-10-16 · **Scope**: `ThreadConversation.vue` · **Related**: `codex-mobile-handover/rounds/round-172-prepend-scroll-anchoring.md`

## What changed

Prepend insertions (persisted "load earlier" and cold pagination) used to keep the
viewport stable with two different mechanisms: a whole-page `scrollHeight` diff for
`loadMoreAbove` (wrong when streaming grows the bottom concurrently), and **nothing at
all** for `nextColdPage` (the browser's native scroll anchoring was silently covering
it). Round-172 replaces both with one explicit mechanism:

1. `.conversation-list` sets `overflow-anchor: none` — position keeping has exactly
   one owner (matches the desktop app, which does the same on
   `.reply-chain-transcript` / `.thread-scroll-container`).
2. An anchor element (the always-rendered hot sentinel `li.conversation-hot-anchor`,
   falling back to the first content `li.conversation-item`) is captured before the
   insertion, and its viewport `top` is re-settled **incrementally** at
   `nextTick` → `rAF ×2` → `nextTick`, because the warm windowing splits a cold
   prepend into two render flushes (a single settle reads an intermediate layout).

## Manual verification (real browser, isolated home, synthetic 60-turn thread)

Playwright (repo's own package, `msedge` channel, headless, 1440×950, dpr 1) against
the dev server (`scripts/dev.cjs`, port 5173, `CODEX_HOME=<isolated home>`). Probe:
`tmp/r172-verify.cjs` (not committed).

| # | Scenario | Assertion | Result |
| --- | --- | --- | --- |
| P0 | `overflow-anchor` | computed style = `none` | PASS |
| S1 | Cold-page button click at `scrollTop=300` | pinned sentinel drift ≤2px; `scrollTop` end = 300 + inserted(805) = 1105 | PASS (drift −0.5px, st 300→1105, sh 9222→10027) |
| S2 | Fling to top in a fresh context (auto cold page via scroll threshold) | sentinel drift = inserted − ΔscrollTop (user scrolled 400→0); `scrollTop` end = inserted(805) | PASS (drift 399.5 ≈ 400, st 805, sh 9222→10027) |
| S3 | 5 rapid scroll events (cold exhausted, no insert) | no layout change, no spurious scroll writes | PASS |
| S4 | Jump-to-latest | distance from bottom = 0 | PASS |
| — | Page errors / console errors across all scenarios | 0 | PASS |

## Regression gates

- `vue-tsc --noEmit` → 0
- `vitest run` → 1053/1053 (92 files)
- `vite build` → 0
