# Round 23: message fonts, user toolbar, live overlay, plan popover, pending panel, stale request cleanup

Manual regression for the round-23 feedback batch. Automated smoke: `output/playwright/r23-verify.cjs` (mock thread, Edge channel).

## 1. Message font spec (正文/标题/加粗/工具/思考)

1. Open a thread whose assistant reply contains `## 标题` and `**加粗**` plus a `commandExecution` and a `reasoning` block.
2. Verify computed styles in light theme:
   - `.message-text` = `color rgb(23, 23, 23)`, `font-size 14px`
   - `.message-heading` = `color rgb(23, 24, 26)`, `font-size 16px`（h1–h6 统一 16px）
   - `.message-bold-text` = `color rgb(23, 24, 26)`
   - `.reasoning-block-title` / `.reasoning-block-summary` / `.reasoning-block-content` = `color rgb(115, 115, 115)`
   - `.work-block-command` / `.tool-call-name` / `.process-fold-label` / `.live-overlay-label` = `color rgb(115, 115, 115)`
3. Dark theme: colors fall back to the existing zinc overrides (no washed-out white text).

## 2. User message toolbar: always visible, icon-only rollback, copy button, right-aligned

1. Open a thread with at least one user message.
2. Without hovering: the user message's `.message-toolbar[data-role='user']` is `opacity 1`.
3. It contains two icon-only buttons:
   - rollback（`IconTablerArrowBackUp`，无文字 label）
   - copy（点击后复制用户消息文字 + 附件/图片列表，按钮短暂显示已复制态）
4. The toolbar is right-aligned with the user message card (right edges within 2px).
5. Assistant messages keep the old hover-to-reveal toolbar with labeled Rollback button.

## 3. Live overlay alignment and activity feedback (Thinking)

1. Send a message (or click the plan Implement button) so the turn starts.
2. The live overlay `.live-overlay-inline` appears at the bottom with:
   - label `Thinking` (left-aligned, same x as assistant message text, no horizontal centering)
   - an animated spinner next to the label while no reasoning content has arrived yet
   - detail chips (Mode / Model / Thinking / Speed)
3. Reasoning text streams under the same left-aligned column; expand/collapse toggle still works.

## 4. Plan popover: one-line summary, single-line steps, fixed Implement button

1. Open a plan thread; click the plan panel header to open the popover.
2. Summary shows only the first sentence (no second sentence); overflow is clamped.
3. Each step renders on a single line with ellipsis (`text-overflow: ellipsis`, `white-space: nowrap`); full step text in `title` tooltip.
4. The Implement button sits in a fixed footer (`.thread-composer-plan-panel-popover-footer`) below the scrollable content area — with many steps, the button stays visible while the steps list scrolls.

## 5. Approval / ask panel: width matches composer, command block scrolls

1. Trigger a command approval or an MCP elicitation request.
2. The fixed panel width equals the composer input width (min of `--chat-column-max` and the content column).
3. A very long command shows inside `.thread-pending-request-command-line` with internal scroll (`max-height 7rem`, `overflow-y auto`) instead of stretching the whole panel.

## 6. Ask-panel dropdown is clickable and selectable

1. Trigger an MCP elicitation request with a dropdown (`oneOf` enum).
2. Click the dropdown trigger: the menu opens with all options (it used to misplace because the panel centered with `transform: translateX(-50%)`, which hijacks fixed-position descendants).
3. Click a different option: the selected value updates and the panel can be submitted.

## 7. Stale approval request: reply failure closes the panel (no dead buttons)

1. Trigger an approval request, then resolve it server-side (another browser / timeout) so the reply RPC returns 400 while `/codex-api/server-requests/pending` no longer lists it.
2. Click Send: the client reconciles with the server pending list, removes the stale request, and the panel closes — instead of leaving unclickable Send/Skip buttons.
3. If the request is still pending server-side, a visible error line appears in the panel instead of failing silently.

## 8. Thinking chronology and cross-browser archive

1. In a long turn with `思考 -> 工具 -> 思考 -> 工具` interleaving, after the turn completes the archived thinking blocks appear at their real positions (before/after the corresponding tool rows), not all bunched at the start of the round.
2. Open the same thread in a second browser profile: archived thinking blocks are restored from the bridge archive (`/codex-api/thread-reasoning`) instead of only the local `localStorage` copy.
