### Feature: Bottom lock re-engages after late content growth (round-164)

#### Prerequisites
- App is running from this repository.
- A thread whose last turn contains an image, code block, or any content that grows the list after initial render.
- Gate equivalent: `PROFILE_BASE_URL=<url> node scripts/check-bottom-lock.cjs` (4 scenarios, incl. a negative run with the observer stubbed out).

#### Steps
1. Open the thread and confirm the list is pinned to the bottom (`dist = scrollHeight - scrollTop - clientHeight` is 0).
2. While pinned, trigger a late content growth: let a below-fold image finish loading, or inject `minHeight` growth on the last turn li (as the gate does).
3. Observe the viewport position.
4. Scroll upward (e.g. 400px), then trigger another growth and observe again.
5. Optional: run the gate script for the automated 4-scenario matrix including the stubbed-observer negative control.

#### Expected Results
- While pinned to bottom, any late content growth re-locks the view to the bottom (`dist` returns to 0) — via the ResizeObserver path, not only the initial 6-frame lock or pre-bound image load handlers.
- While scrolled away from bottom, growth does NOT yank the viewport; the manual reading position is preserved (distance-from-bottom grows by the growth amount).
- With the ResizeObserver stubbed out, the pinned case fails to re-lock (`dist` stays at the growth amount) — proving the guard is what closes the gap.

#### Rollback/Cleanup
- Revert the content-growth observer block in `src/components/content/ThreadConversation.vue` (functions `bindContentGrowthObserver` / `unbindContentGrowthObserver` / `onContentGrowth` / `syncObservedContent` and their mount/unmount wiring).
