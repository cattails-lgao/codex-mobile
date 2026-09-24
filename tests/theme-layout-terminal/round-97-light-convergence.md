# Feature: Light-theme convergence — one neutral palette, a11y fallbacks

**Area:** Theme, Layout, and Terminal
**Round:** 97

## What to check

1. Switch to light theme. Sidebar, content area, right panel and composer all read
   as one neutral grey family — no cool blue (slate) tint on the sidebar, no violet
   tinge (zinc) elsewhere. Amber/green/red appear only as machine status
   (running pip, OK/FAIL badges, destructive actions), never as decoration.
2. Secondary text (timestamps, placeholders, hints) is darker than before but still
   clearly secondary — and now meets 4.5:1 on white (zinc-400/500 sites moved to
   ink-3).
3. Keyboard-navigation (Tab) through the thread list, composer controls and dialog
   buttons: every focusable element shows the amber focus outline — either the
   component's own ring or the global fallback.
4. With "reduce motion" enabled in the OS, opening/closing panels and the breathing
   run-pip are instant (no animation).
5. Dark theme: visually unchanged from round-95 (the dark override layer was
   restored block-by-block; the equivalence gate measured 0 deltas on dark pages).
6. Contract: `node scripts/check-ui-contract.cjs` — light raw palette count 0
   (outside the dark override layer).

## Automated coverage

- `scripts/check-ui-contract.cjs` (33 items): light raw palette = 0.
- `scripts/check-token-equivalence.cjs`: dark pages 0 deltas; light-page deltas are
  the intended cool→neutral convergence (re-armed after review).
- Evidence: `docs/ui-audit/p2-light-sidebar-light.png`,
  `p2-light-conversation-light.png`, `p2-light-sidebar-dark.png` (dark unchanged).
