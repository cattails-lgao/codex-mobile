# Round 24: unified user toolbar, plain reasoning/tool rows, live overlay details, fileChange at round end, reasoning chronology, thread title truncation

Manual regression for the round-24 feedback batch. Automated smoke: `output/playwright/r24-verify.cjs` (light theme, mock thread) and `output/playwright/r24-dark.cjs` (dark theme, mock thread), both Edge channel.

## 1. User message toolbar: unified icon-only style, larger hit area (Q1)

1. Open a thread with at least one user message.
2. Under the user message, both `.message-rollback-button` and `.message-copy-button` are plain icon-only buttons: `width >= 24px`, `height >= 20px`, no border (`border-width 0px`), no background (`rgba(0,0,0,0)`).
3. The two buttons look identical in style (same shape, same density); copy shows a brief green copied state after clicking.
4. Dark theme: rollback is amber-400 at 80% opacity, copy is zinc-400; both still borderless and backgroundless.

## 2. Reasoning block matches Running command row style (Q2)

1. Open a thread containing a `reasoning` block next to a `commandExecution` row.
2. `.reasoning-block` is a plain row: transparent background, no border, no border-radius (same de-carded look as `.work-block`).
3. Header row = icon + title + toggle, left-aligned; title/summary/content are `rgb(115,115,115)` (13px/12px scale, no card chrome).
4. Expand/collapse toggle still works and keeps the plain style when expanded.
5. Dark theme: title/content zinc-400, summary zinc-500, no card surface.

## 3. Live overlay details hidden for Running command (Q3)

1. Send a message that runs a shell command.
2. While streaming, the live overlay row under "Running command" shows only the label and command text in the work block; the `.live-overlay-details` element is NOT rendered for `activityLabel === 'Running command'` (the command text would otherwise be duplicated).
3. While Thinking (no command yet), the details chips (Mode / Model / Thinking / Speed) still appear as before.

## 4. fileChange summary rendered at the end of the round (Q4)

1. Open a thread whose round contains `user -> reasoning -> command -> tool -> reasoning -> fileChange -> agent reply`.
2. The `fileChange` summary block (`[data-message-type='fileChange']` / `.file-change-summary-block`) appears AFTER the assistant reply text of that round (last position in the round), not inline before it.
3. For folded (ProcessFold) rounds, the fileChange summary also renders at the tail of the fold.
4. No duplicate fileChange summary for the same round (standalone + anchored are mutually exclusive).

## 5. Thinking blocks keep chronological order after refresh (Q5)

1. In a long round with `思考 -> 命令 -> 思考 -> 工具 -> 思考` interleaving, note the reasoning blocks sit at their real positions.
2. Refresh the page (reasoning restored from the bridge archive `/codex-api/thread-reasoning`).
3. After refresh the reasoning blocks are still at their real positions (each with `reasoningAnchorMessageId` pointing to the preceding command/tool), not bunched at the start of the round.
4. New streaming reasoning that arrives via `item/reasoning/textDelta` (without an `item/started` reasoning item) is also recorded per-item and survives refresh at the right anchor.

## 6. Thread title truncated to 20 chars everywhere (Q6)

1. Create/open a thread whose name is the full first user message longer than 20 characters.
2. Check the sidebar `.thread-row-title`: displayed text length <= 20 (ends with truncation).
3. Check the thread header and any cached title path (`/codex-api/thread-titles`): all show the truncated title after refresh too.

## 7. Tool call rows de-carded, colors distinguishable (Q7)

1. Open a thread with `mcpToolCall`/tool rows next to command rows.
2. `.tool-call-block` is a plain row: transparent background, no border, no border-radius — visually consistent with `.work-block`.
3. Tool name and status are `rgb(115,115,115)`; running/ok/error status text keeps its status color (amber/emerald/rose) so states remain distinguishable.
4. Dark theme: tool name zinc-200, status zinc-400, running amber-400, ok emerald-400, error rose-400.

## Rollback / cleanup

- Verification uses mock threads on `127.0.0.1:4173`; no real project data is touched. Close the test browser contexts when done.
- Screenshots: `output/playwright/r24-q1-q2-q7.png`, `output/playwright/r24-q4-fonts.png`, `output/playwright/r24-dark-q1-q2-q7.png`.
