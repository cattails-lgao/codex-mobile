### Thread context compaction button

#### Feature/Change Name
Manual context compaction entry point next to the sidebar Context badge, wired to `thread/compact/start` and refreshed by the `thread/compacted` notification.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Codex CLI available on `PATH`
3. A thread whose remaining context percent is low enough to reach the warning state (<= 25%) — or temporarily lower `CONTEXT_WINDOW_BASELINE_TOKENS` locally to force the badge into warning/danger
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open a thread whose Context badge shows warning (<= 25% remaining) or danger (<= 10% remaining).
2. Confirm a `Compact` button appears on the Context row in the sidebar settings panel.
3. Click `Compact`; confirm the button flips to `Compacting…` and is disabled.
4. Wait for the `thread/compacted` notification; confirm the button disappears and the Context usage numbers refresh.
5. Open a thread whose Context badge shows healthy (ok) state; confirm no `Compact` button is shown.
6. Switch to dark theme and repeat steps 1-4; confirm the button renders with dark-theme colors and stays readable.

#### Expected Results
- The `Compact` button is only visible when the Context badge is warning or danger.
- Clicking it calls `thread/compact/start` once for the selected thread and keeps the button pending until the `thread/compacted` notification arrives (with a 60s timeout guard).
- After compaction, the message list refreshes with the compaction summary and the Context usage reflects the new token count.
- The pending state self-clears on failure (error surfaced) and on the timeout guard if the notification is lost.
- Behavior is consistent in light and dark themes.

#### Rollback/Cleanup
- None; compaction is server-side and reversible only through normal thread history.
