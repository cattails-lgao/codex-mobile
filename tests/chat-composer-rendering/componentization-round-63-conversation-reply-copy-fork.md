# Componentization round-63: Conversation reply copy/fork hook

Refactor of `ThreadConversation.vue` (no user-visible behavior change): the reply copy/fork surface — cluster content building (`buildCopyableMessageContent`/`buildPlanCopyText`), the `copyableResponseContentByAnchorId` / `forkableTurnIndexByAnchorId` computeds, the `copiedResponseAnchorId` state, and the copy/fork methods — was extracted into `useReplyCopyFork.ts` via dependency injection (`getMessages`, `isCopyableAssistantMessage`, `isPlanMessage`, `planStepCopyMarker`, `buildFileChangeCopyText`, `getAnchoredFileChangeSummaries`). The `forkResponse` emit orchestration stays in the component. This page is a smoke regression of the moved copy/fork surface.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation (across multiple turns) whose assistant replies include a plain reply, a plan-mode reply, and a reply followed by file changes.

## Actions and Expected Results

### Copy a user message
1. Hover a user message row and click its copy button (or right-click clipboard affordance). Expected: `copiedResponseAnchorId` shows the transient "copied" affordance for ~1.8s, then clears; pasting yields the message text (plus `Files:`/`Images:` lines when attachments/images exist).

### Copy an assistant reply
2. Click copy on an assistant message. Expected: the copy content fuses all copyable assistant segments of that turn (joined by a blank line), so a multi-part turn copies as one block; "copied" affordance appears and clears on its own.
3. For a plan-mode message, expected: copy text begins with `Plan` and lists steps with `[x]`/`[~]`/`[ ]` markers matching step status.
4. When a turn has file changes anchored to its last assistant message, copying that reply also appends the file-change copy text.

### Fork a reply
5. On an assistant message with a fork button, click it. Expected: the thread forks at that turn's index and a new thread opens from that point.

### Toolbar visibility
6. Verify copy appears only on messages with copyable content, and fork appears only on assistant messages that have a deterministic turn index (no fork button on user/plain non-turn messages).

## Verification / Cleanup Notes

- No behavior change; this guards against extracting the copy/fork surface.
- Rollback: covered by `useReplyCopyFork.test.ts` (10 cases: turn grouping/anchor, empty-content pruning, metadata file-change append, fork-index mapping, visibility predicates, copy success + timer reset, clipboard-unavailable failure) plus `vue-tsc` and production build; revert `ThreadConversation.vue`'s `createReplyCopyFork` wiring if any surface above misbehaves.