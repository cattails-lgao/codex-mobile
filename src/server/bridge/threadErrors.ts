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
 * Payload for the shell's materialization-pending `thread/read` fallback
 * (round-134).
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