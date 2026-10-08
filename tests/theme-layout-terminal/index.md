# Theme, Layout, and Terminal

Light/dark theme regressions, responsive layout, terminal UI, mobile keyboard behavior, dialog sizing, and visual alignment.

Return to the [manual test index](../../tests.md).

## Test Sections

| Section |
| --- |
| [Revert PR 131 project recency and mobile move mode](revert-pr-131-project-recency-and-mobile-move-mode.md) |
| [Feature: Dark theme for worktree runtime selector and Skills Hub](dark-theme-for-worktree-runtime-selector-and-skills-hub.md) |
| [Feature: Dark theme states for runtime mode toggle](dark-theme-states-for-runtime-mode-toggle.md) |
| [Feature: Revert PR #16 mobile viewport and chat scroll behavior changes](revert-pr-16-mobile-viewport-and-chat-scroll-behavior-changes.md) |
| [Feature: Revert Renat scrolling/input-layout behavior (without Fast mode changes)](revert-renat-scrolling-input-layout-behavior-without-fast-mode-changes.md) |
| [Feature: Dark theme command rows in chat remain readable](dark-theme-command-rows-in-chat-remain-readable.md) |
| [Feature: Home composer vertical alignment matches reference layout](home-composer-vertical-alignment-matches-reference-layout.md) |
| [Fix: Delete/rename thread dialog height cap](delete-rename-thread-dialog-height-cap.md) |
| [Integrated terminal mobile keyboard avoidance](integrated-terminal-mobile-keyboard-avoidance.md) |
| [Codex.app-style integrated terminal](codex-app-style-integrated-terminal.md) |
| [Integrated terminal manager edge cases](integrated-terminal-manager-edge-cases.md) |
| [Content header actions remain right aligned](content-header-actions-remain-right-aligned.md) |
| [Dark theme plan card contrast](dark-theme-plan-card-contrast.md) |
| [Terminal focus does not fullscreen panel](terminal-focus-does-not-fullscreen-panel.md) |
| [Terminal quick commands from project files](terminal-quick-commands-from-project-files.md) |
| [Mobile terminal command dropdown stays on screen](mobile-terminal-command-dropdown-stays-on-screen.md) |
| [Composer popover shared surface, dark theme coverage, and placeholder parity](composer-popover-dark-and-placeholder-parity.md) |
| [Three-column layout, settings dialog, and destructive confirmations](three-column-layout-settings-dialog-and-destructive-confirmations.md) |
| [Right panel resize/collapse, composer approval policy tabs, skills chips, and slash skill names](right-panel-resize-collapse-and-composer-approval-tabs.md) |
| [Composer control layout, collaboration mode menu, approval policy menu, and slash skill rows](composer-control-layout-and-collaboration-mode-menu.md) |
| [Composer fifth-round feedback: shared popover, approval tip, slash skill rows, pill controls, and Files panel](composer-fifth-round-feedback.md) |
| [H5 right-sidebar compatibility and inline image preview in the Files tab](h5-right-sidebar-files-inline-preview.md) |
| [Settings group navigation, pending-request scroll, and thinking persistence](settings-group-navigation-pending-scroll-thinking-persistence.md) |
| [R13: settings fixed height, live thinking, floating pending panel, plan panel fixes](r13-settings-height-live-thinking-floating-pending-plan-panel.md) |
| [Feature: Design tokens reach the component styles too (dark layer complete)](round-90-dark-token-layer-completion.md) — the dark theme must look unchanged; ships the runnable contract and equivalence checks |
| [Feature: Sidebar tool entries use distinct glyphs and quiet tiles](round-91-sidebar-entry-symbols.md) — the two entries must stay distinguishable with colour removed; plates measure 22×22 / 6px / 15% tint, and the selected rail is neutral |
| [Feature: Composer controls — model first, secondary switches grouped, one primary button](round-92-composer-controls.md) — the four config controls must no longer be four identical pills; the model wears `--model` and leads, the other three are neutral mono chips in one shared box, and the send button uses the brightest ink (outline when disabled) |
| [Feature: Tool-call rows — mono command, honest metrics, OK/RUN badge](round-93-tool-call-row.md) — command and MCP tool rows share one card language: a status pip, the real command in monospace, a byte/duration reading, and an uppercase mono status badge; colour comes only from the status tokens |
| [Feature: Code floors — language label and copy control](round-94-code-floor.md) — code blocks follow the theme tokens (no permanent dark slab), a bar carries the language left and a copy control right, and copy works identically on both render paths with a 1.6s acknowledgement |
| [Feature: Heading ladder and thread rows](round-95-headings-thread-rows.md) — markdown headings step 20/18/16/14px in ink-1 (no hardcoded grey), thread rows read the time in mono with tabular numerals, the selected row carries a neutral 2px rail on the s2 surface, and a running row turns the rail amber with a breathing pip |
| [Feature: Type ladder — no arbitrary sizes](round-96-type-ladder.md) — every text-[Npx] is replaced by a ladder token (nano 10 / micro 11 / ui 13 / body 15 / display 40; 12px stays text-xs), sizes are byte-identical to before, and the contract asserts the arbitrary-value count is zero |
| [Feature: Light convergence — one neutral palette](round-97-light-convergence.md) — the light theme reads as one neutral grey family (raw zinc/slate/sky/status classes are gone), secondary text meets 4.5:1, every focusable element shows the amber focus ring, reduced motion zeroes all animation, and the dark theme is measured unchanged |
| [Regression: Review pane must not evict the conversation](round-125-review-pane-independent-overlay.md) — the review pane is a fixed full-screen overlay, so opening it must not unmount the message list: the list keeps its scroll position (2018 → 2018, not → 0), its loaded earlier-message pages and its auto-follow flag, and a contract assertion plus `scripts/verify-review-pane-scroll.cjs` pin the invariant |
| [Regression: The conversation list survives a slow reload](round-126-conversation-list-persists.md) — the message list is the only scroll container, so a message reload taking longer than the 5s slow-open threshold must not unmount it: the list stays in the DOM with its items and keeps its scroll position (2307 → 2307, not → 0), and a contract assertion plus `scripts/verify-conversation-list-persists.cjs` pin the invariant |
| [Regression: The conversation keeps its scroll position across a re-mount](round-127-conversation-mount-scroll.md) — leaving a thread for a non-thread route (`#/`, `#/directory`, `#/settings`, `#/automations`) unmounts the whole conversation, so coming back must not leave the list pinned at the top: it lands on the latest output (438 → 438, not → 0), and a contract assertion plus `scripts/verify-conversation-mount-scroll.cjs` pin the invariant |
| [Regression: A new command block must not flash when the turn finishes](round-128-command-block-handoff.md) — the live command block is now cleared in the same tick the persisted copy lands instead of eagerly on `turn/completed`, so the row no longer disappears for ~250ms and comes back (the reported "闪一下"): it stays on screen throughout (pre-fix FAILED 1/6 with a 250ms vacuum, post-fix ALL GREEN 6/6), and a contract assertion plus `scripts/verify-command-block-handoff.cjs` pin the invariant |
