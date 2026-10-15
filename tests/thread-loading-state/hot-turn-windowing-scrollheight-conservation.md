### Feature: Hot turn windowing keeps scrollHeight conserved (round-165)

#### Prerequisites
- App is running from this repository.
- A thread with more than ~2 viewports of content in the last 30 turns (hot zone).
- Gate equivalent: `PROFILE_BASE_URL=<url> node scripts/check-hot-window.cjs` (6 scenarios incl. a reverse run with ResizeObserver stubbed out).

#### Steps
1. Open the thread pinned to the bottom. The hot zone should render only the turns near the viewport (windowed), with spacer `<li>` elements compensating skipped heights.
2. Scroll upward by a known amount (e.g. 2000px) and read `dist = scrollHeight - scrollTop - clientHeight`.
3. Scroll to the top of the list, then back to the bottom; compare `scrollHeight` across positions.
4. Use the question jump bar to jump to the first (oldest hot) turn.
5. Optional: run the gate script for the automated matrix including the stubbed-observer reverse run.

#### Expected Results
- While pinned, fewer than all hot turns are rendered and `dist` stays 0.
- After scrolling up by S px, `dist` increases by exactly S (no scrollHeight drift under the viewport).
- `scrollHeight` is identical (±2px) at bottom / middle / top positions — window sliding must not change the total height.
- Jumping to a windowed-out hot turn force-renders it; the inner anchor (`#question-anchor-<n>`) lands ≈12px below the container top.
- With ResizeObserver stubbed out, all hot turns render (no windowing) and its scrollHeight matches the windowed state (±2px) — proving conservation is real, not vacuous.

#### Rollback/Cleanup
- Revert the hot-window block in `src/components/content/ThreadConversation.vue` (sentinel/spacer `<li>`s, `hotBlockSpecs` / `recomputeHotWindow` / `scheduleHotMeasure` / `onContentResize` measurement wiring) and delete `src/utils/hotTurnWindow.ts` + `scripts/check-hot-window.cjs`. `recomputeWarmWindow`'s anchor should then be switched back to `li.conversation-turn`.
