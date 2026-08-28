# Chat Composer and Message Rendering

Composer controls, queued messages, plan mode, markdown parsing, file links, attachments, generated images, and visible message rows.

Return to the [manual test index](../../tests.md).

## Test Sections

| Section |
| --- |
| [Codex thread deep links render as local web thread URLs](codex-thread-deep-links-render-as-local-web-thread-urls.md) |
| [Composer @ file mention uses server fuzzy search with fallback](composer-at-file-mention-uses-server-fuzzy-search.md) |
| [Composer / slash command menu](composer-slash-command-menu.md) |
| [Composer realtime voice conversation button](composer-realtime-voice-conversation-button.md) |
| [Bold-wrapped Markdown links render without literal markers](bold-wrapped-markdown-links-render-without-literal-markers.md) |
| [Composer expands long drafts to full screen](composer-expands-long-drafts-to-full-screen.md) |
| [Composer mode scoping and Fast mode support](composer-mode-scoping-and-fast-mode-support.md) |
| [Composer controls stay editable during responses](composer-controls-stay-editable-during-responses.md) |
| [Feature: Markdown file links with backticked filename labels render correctly](markdown-file-links-with-backticked-filename-labels-render-correctly.md) |
| [Feature: Sandbox approval requests recognize newer Codex payloads](sandbox-approval-requests-recognize-newer-codex-payloads.md) |
| [Feature: MCP elicitation requests and thread status labels](mcp-elicitation-requests-and-thread-status-labels.md) |
| [Feature: Stop button interrupts active turn without missing turnId](stop-button-interrupts-active-turn-without-missing-turnid.md) |
| [Feature: Backticked HTTP(S) URL renders as clickable link](backticked-http-s-url-renders-as-clickable-link.md) |
| [Feature: Chat file-link context menu (open/copy/edit)](chat-file-link-context-menu-open-copy-edit.md) |
| [Feature: Restore composer drag-and-drop file attach on input field](restore-composer-drag-and-drop-file-attach-on-input-field.md) |
| [Feature: Restore clipboard image paste attachments in composer](restore-clipboard-image-paste-attachments-in-composer.md) |
| [Feature: Show user file attachments as visible chips in chat](show-user-file-attachments-as-visible-chips-in-chat.md) |
| [Feature: Approval request uses legacy in-conversation request card only](approval-request-uses-legacy-in-conversation-request-card-only.md) |
| [Feature: Thread RPC strips inline image/file payloads into links](thread-rpc-strips-inline-image-file-payloads-into-links.md) |
| [Feature: Inline thread image payloads are rewritten to renderable local file URLs](inline-thread-image-payloads-are-rewritten-to-renderable-local-file-urls.md) |
| [Feature: Markdown file links with spaces and parentheses in path](markdown-file-links-with-spaces-and-parentheses-in-path.md) |
| [Feature: Markdown link with backticked label renders as file link](markdown-link-with-backticked-label-renders-as-file-link.md) |
| [Feature: Windows absolute file links open through local browse](windows-absolute-file-links-open-local-browse.md) |
| [Feature: Backticked bare filenames render as file links](backticked-bare-filenames-render-as-file-links.md) |
| [Feature: Lazy message rendering (windowed conversation)](lazy-message-rendering-windowed-conversation.md) |
| [Assistant generated image rendering](assistant-generated-image-rendering.md) |
| [Stop button activates promptly for new threads](stop-button-activates-promptly-for-new-threads.md) |
| [New-thread plan mode persists and toggles correctly](new-thread-plan-mode-persists-and-toggles-correctly.md) |
| [Completed plan cards expose implement action](completed-plan-cards-expose-implement-action.md) |
| [Default mode can follow plan mode in the same thread](default-mode-can-follow-plan-mode-in-the-same-thread.md) |
| [Queue mode is default for in-progress messages](queue-mode-is-default-for-in-progress-messages.md) |
| [Backend-persisted queued messages and drag reorder](backend-persisted-queued-messages-and-drag-reorder.md) |
| [Backend-drained queue UI refresh](backend-drained-queue-ui-refresh.md) |
| [Persisted idle queue recovery](persisted-idle-queue-recovery.md) |
| [First user message is visible immediately in new chats](first-user-message-is-visible-immediately-in-new-chats.md) |
| [New chat live thinking and stop controls](new-chat-live-thinking-and-stop-controls.md) |
| [Bold URL trailing punctuation parsing](bold-url-trailing-punctuation-parsing.md) |
| [Composer plan panel, command step index, and H5 plus-popover controls](composer-plan-panel-command-steps-h5-popover.md) |
| [Work-step blocks, inline file changes, and separated work summaries](work-step-blocks-and-inline-file-changes.md) |
| [File-change block: collapse styles restored + per-file undo](file-change-collapse-styles-and-per-file-undo.md) |
| [Work-process feed, thinking blocks, plan-in-composer, preview tabs, and sidebar polish](work-process-thinking-and-preview-tabs.md) |
| [Composer policy buttons show selection, approval applies to app-server, Medium default effort, edit-message stops active turn](composer-policy-buttons-approval-effort-rollback-interrupt.md) |
| [Plan popover layout, reasoning turn placement, thinking font, live interleave](plan-popover-layout-reasoning-turn-thinking-toggle.md) |
| [ThreadConversation split refactor (3 utils + 8 child components)](thread-conversation-split-refactor.md) |
| [Process Fold phase A and streaming reasoning truncation](process-fold-phase-a-and-streaming-reasoning-truncation.md) |
| [Three-zone hot/warm/cold rendering (phase B)](three-zone-hot-warm-cold-rendering.md) |
| [Phase C: question-nav JumpBar, tool aggregation, partitionTurnItems split](phase-c-jumpbar-tool-aggregation.md) |
| [Composer popover keyboard nav + interrupt recover (requirement-9 UI)](composer-kb-nav-and-interrupt-recover.md) |
| [Command execution long lines wrap without horizontal overflow](command-output-long-line-no-horizontal-overflow.md) |
| [Round 16: message visual consistency, thinking blocks, rollback button, and interrupt cleanup](round16-message-visual-and-interrupt-cleanup.md) |
| [Round 23: message fonts, user toolbar, live overlay, plan popover, pending panel, stale request cleanup](round23-message-fonts-overlay-toolbar-plan-pending.md) |
| [Round 24: unified user toolbar, plain reasoning/tool rows, fileChange at round end, reasoning chronology, thread title truncation](round24-message-toolbar-reasoning-filechange-title-truncate.md) |
| [Client-side auto-compact: pre-send check + stash/resend](client-side-auto-compact-pre-send-stash-resend.md) |
| [Round 28: plan panel executed state after refresh + IME composition Enter guard](round28-plan-panel-state-refresh-ime-composition.md) |
| [Round 29: reasoning blocks interleave with work items after refresh](round29-reasoning-anchor-mismatch-distribution.md) |
| [Round 30: plan panel implemented state after refresh/single-turn + compaction block placement](round30-plan-state-refresh-compaction-placement.md) |
| [Round 34: process-fold ordering restored + file-change row layout moved left](round34-process-fold-order-and-file-change-layout.md) |
| [Round 35: file-change row delta/undo right-aligned + long-path ellipsis](round35-file-change-row-right-align-and-long-path-ellipsis.md) |
| [Componentization round-49: Composer + Conversation display-layer extraction](componentization-round-49-composer-conversation.md) |
| [Componentization round-62: Conversation markdown/code rendering hook](componentization-round-62-conversation-markdown-rendering.md) |
| [Round 40: completed agent message renders as final assistant block](round40-completed-agent-message-final-assistant.md) |
| [Componentization round-62: file-change summary + diff viewer hook](componentization-round-62-file-change-summaries-and-diff-viewer.md) |
