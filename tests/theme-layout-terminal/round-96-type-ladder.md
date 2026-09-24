# Feature: Type ladder — arbitrary sizes are gone

**Area:** Theme, Layout, and Terminal
**Round:** 96

## What to check

1. Open a thread with conversation content. Body text reads comfortably at 15px
   (`--text-body`); control rows and panel text at 13px (`--text-ui`); group labels,
   timestamps and badges at 10/11/12px (`--text-nano/micro/xs`) — no text looks
   mis-sized relative to the pre-ladder build.
2. Open DevTools and run:
   `getComputedStyle(document.body.querySelector('.thread-composer textarea')).fontSize`
   — no element on the page should report a `text-[Npx]` arbitrary value; the ladder
   utilities resolve to the same pixel sizes as before (9px folds into 10px nano).
3. The empty-state hero (`sm:text-display`) renders 40px, same as before
   (2.5rem = 40px, exact).
4. Mono readings (tool-call metrics, thread-row time, plan counts) still align
   digit-for-digit while numbers update — `tabular-nums` is on those classes.
5. Contract: `node scripts/check-ui-contract.cjs` reports the ladder tokens
   (nano/micro/ui/body) and `text-[Npx]` count 0.

## Automated coverage

- `scripts/check-ui-contract.cjs` (33 items): ladder tokens defined, `text-[Npx]` = 0.
- `scripts/check-token-equivalence.cjs`: zero fontSize deltas on all sampled elements.
