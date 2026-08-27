# Live Agent Turn Ownership and Resume Responsiveness

Two regressions are covered together: delayed live agent content must remain in the turn that owns it, and returning from a backgrounded tab must not wait for non-critical refresh work before the visible thread/list state is usable.

#### Prerequisites
- Run the app from this repository with a thread containing at least two user turns.
- For the ownership case, be able to emit or replay an `item/agentMessage/delta` / `item/completed` notification carrying a prior turn's `turnId` while a newer turn is present or live.
- For the resume case, use a browser that can background and restore the app tab; browser devtools Network is available.

#### Steps
1. Load persisted messages containing two turns, `u1` and later `u2`.
2. Deliver a live or completed agent message whose notification `turnId` belongs to `u1`, after `u2` is already present; then make `u2` the active live turn.
3. Send a new message after `u1` has a completed final; while the live overlay has appeared but `liveTurnId` is still `undefined`, inspect the final assistant block for `u1`.
4. Inspect the rendered turn structure and final assistant blocks.
5. Open a populated thread in a mobile-sized viewport, put the browser tab in the background beyond the resume-refresh threshold, then return to it.
6. In Network, inspect the resume-triggered `thread/list` request and the selected thread's requests. Keep the tracker/session source populated if subagent filtering can run.
7. Confirm the sidebar and selected conversation become usable, then observe ancillary metadata such as skills, rate limits, and collaboration modes finish independently.

#### Expected Results
- The prior-turn agent message stays between `u1` and `u2`; it is never appended into the newer turn.
- A supplied `turnId` resolves to the saved turn index for both delta and completed agent messages. Only the actual `liveTurnId` suppresses final-answer promotion; when a new live overlay exists but `liveTurnId` has not returned yet, the previous completed answer remains a dedicated final assistant block without flashing into the process area.
- On foreground resume, `thread/list` filters using the external-session tracker's last completed cache snapshot and does not wait for a recursive tracker scan.
- The visible selected thread/list refresh completes without awaiting ancillary metadata. Ancillary requests still settle afterward, and no duplicate selected-thread message load is introduced.
- Targeted checks pass: `pnpm exec vitest run src/composables/useDesktopState.test.ts src/utils/transcriptGrouping.repro.test.ts src/server/bridge/rpcPipeline.test.ts` and `pnpm exec vue-tsc --noEmit`.

#### Rollback/Cleanup
- Revert `2f9643b` to remove live agent `turnId`/turn-index ownership propagation and active-turn-specific final suppression.
- Revert `e74ab73` to restore synchronous tracker scanning in `thread/list` and blocking ancillary refreshes after mobile resume.
- Remove any synthetic notification or temporary test thread used for verification; no persistent app-server state is required by these checks.
