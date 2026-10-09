// Thread-domain error classification predicates, extracted from
// createCodexBridgeMiddleware. Pure string matching on normalized error
// messages; the shell injects isThreadMaterializationPendingError into
// threadRoutes and re-exports the set for its archive test. Zero closures.
import { getErrorMessage } from './core.js'

export function isUnauthenticatedRateLimitError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('authentication required') && message.includes('rate limits')
}

export function isEmptyThreadReadError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('failed to read thread') && message.includes('rollout') && message.includes('is empty')
}

export function isThreadMaterializationPendingError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('not materialized yet') && message.includes('includeturns is unavailable before first user message')
}

/**
 * The app-server cannot list this thread's turns yet --
 * `list_turns is not supported yet` (round-135).
 *
 * On codex-cli 0.160.1 / 0.161.0 a thread whose rollout carries no user
 * message has nothing to list, and `thread/read {includeTurns:true}` and
 * `thread/resume` both answer this text (measured 2026-10-09 against 0.161.0;
 * `thread/turns/list` answers it too, but `threadReadTurnPage` /
 * `threadResumeTurnPage` swallow that call and replay the unbounded request,
 * so it never reaches this predicate). Same situation as
 * `isThreadMaterializationPendingError` -- a thread that exists but has
 * nothing to render -- under a less descriptive message, so it earns the same
 * honest answer instead of a 502 for the client.
 *
 * Matched narrowly on `list_turns` plus an unsupported-method phrase, not the
 * bare `-32601|not supported` pattern of `threadTurnPage.ts`: a false positive
 * here would answer a thread that does have turns with an empty transcript.
 * codex-cli 0.158.0 cannot collide -- there the full read still succeeds and
 * only `thread/turns/list` reports the gap.
 */
export function isThreadTurnsNotListableError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('list_turns')
    && (message.includes('not supported') || message.includes('not implemented'))
}

/**
 * Payload for the shell's unmaterialized-thread fallbacks: materialization
 * pending on `thread/read` (round-134), and the turn-listing error on
 * `thread/read` / `thread/resume` (round-135).
 *
 * The thread exists but its rollout carries no user message yet, so there is
 * genuinely nothing to render. This payload used to also claim
 * `status: { type: 'inProgress' }`, which the client's normalizer
 * (`readThreadInProgressFromResponse`) turns into a phantom "Thinking" state --
 * so one response both emptied the conversation and put a Thinking overlay on a
 * thread that was not running (round-132 §10.4/§11.6).
 *
 * `status` is omitted on purpose. The client then keeps the last status it
 * learned from notifications, which is the honest answer for an endpoint that
 * cannot see this thread's state: "no turns to show", not "it is running".
 */
export function buildPendingMaterializationThreadReadResult(threadId: string): unknown {
  return { thread: { id: threadId, turns: [] } }
}

export function isThreadNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('thread not found') || message.includes('no rollout found for thread id')
}