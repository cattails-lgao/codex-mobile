// round-113: bounded collection of the two facts `/codex-api/thread/rollback-files`
// needs — the session-log path, and the ids of the target turn plus every turn
// after it (or just the target turn, for `scope: "single_turn"`).
//
// The route used to call `thread/read {includeTurns: true}` and walk the hydrated
// turns for those ids. Measured on the local 0.158.0 app-server against a
// 12.12MB / 16-turn rollout:
//
//   thread/read {includeTurns:true}                     2634ms / 12.12MB
//   thread/read {includeTurns:false}                       6ms /  0.00MB  <- holds thread.path
//   thread/turns/list {notLoaded, desc} cursor chain      11ms /   625B  <- holds the ids
//
// On three real threads, the id sequence from the chain compared equal to the
// one from the hydrated read (order and value), and the `single_turn` /
// `turn_and_later` selections derived from it matched for the oldest, a middle,
// and the newest turn — plus a not-found anchor, which both routes render as
// "No turns to revert".
//
// The metadata read's `thread` object carries the same 32 fields as the hydrated
// one with `path` identical, so nothing else the route reads changes. (Two
// threads did show a different `createdAt`/`updatedAt` between the two reads;
// this route never reads either, and the difference appears to be a side effect
// of reading rather than of hydrating.)
//
// Everything here is best-effort: any surprise returns null and the caller runs
// the unbounded read, which is byte-for-byte what used to happen. That matters
// because the fallback is itself the old behaviour, so this module can only make
// the route cheaper, never less correct.
import { asRecord, readNonEmptyString } from './core.js'
import { readThreadTurnIds } from './threadTurnPage.js'

export type RollbackTurnContext = {
  /** `thread.path`, verbatim. `''` means "no session log available". */
  sessionPath: string
  /** Turn ids oldest-first, exactly the order `thread.turns` had. */
  turnIds: string[]
}

export type RollbackTurnContextRpc = {
  rpc(method: string, params: unknown): Promise<unknown>
}

/**
 * The metadata read plus the `notLoaded` id chain, or null when either half
 * cannot be trusted so the caller should hydrate instead.
 *
 * An empty `sessionPath` is returned as `{ sessionPath: '', turnIds: [] }`
 * rather than null: it is a real answer the route reports as "No session log
 * available", not a reason to hydrate.
 */
export async function readRollbackTurnContext(
  appServer: RollbackTurnContextRpc,
  threadId: string,
): Promise<RollbackTurnContext | null> {
  if (!threadId) return null

  let metadata: unknown
  try {
    metadata = await appServer.rpc('thread/read', { threadId, includeTurns: false })
  } catch {
    return null
  }
  const sessionPath = readNonEmptyString(asRecord(asRecord(metadata)?.thread)?.path)
  if (!sessionPath) return { sessionPath: '', turnIds: [] }

  let turnIds: string[] | null
  try {
    turnIds = await readThreadTurnIds((method, params) => appServer.rpc(method, params), threadId)
  } catch {
    // `thread/turns/list` is unimplemented on older builds (round-102 saw
    // `-32601: list_turns is not supported yet`). Fall back rather than answer
    // from a half-derived id set.
    return null
  }
  if (!turnIds) return null
  return { sessionPath, turnIds }
}
