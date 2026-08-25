// RPC response post-processing pipeline (O batch). The central /codex-api/rpc
// handler ran an 8-step thread/session post-pipeline inline; that pure chain
// moves here so the dispatcher stays thin. Steps that are entagled with the
// shell's own state are injected (mergeImportedThreadsIntoThreadListResult
// reads the shell-owned session-index cache; sanitizeThreadTurnsInlinePayloads
// stays in the shell shared with the threadRoutes slice). Only self-contained
// helpers move here.
import { asRecord, getErrorMessage, readNonEmptyString, THREAD_METHODS_WITH_THREAD_SNAPSHOT, THREAD_METHODS_WITH_TURNS, THREAD_RESPONSE_TURN_LIMIT } from './core.js'
import { mergeSessionCommandsIntoThreadResult, mergeSessionSkillInputsIntoThreadResult } from './session.js'
import type { ExternalSessionInfo } from '../externalSessionTracker.js'
import { mergeStreamTurnErrorsIntoThreadResult, type ThreadReadAppServerFacade } from './threadRoutes.js'

export type RpcPipelineDeps = {
  appServer: ThreadReadAppServerFacade
  externalSessionTracker: {
    getExternalSession(threadId: string): ExternalSessionInfo | null
    getUserFacingSubagentThreadIds(): ReadonlySet<string>
  }
  sanitizeThreadTurnsInlinePayloads: (method: string, result: unknown) => Promise<unknown>
  // Shell-owned: reads the session-index cache held by the shell module state.
  mergeImportedThreadsIntoThreadListResult: (result: unknown) => unknown
}

function trimThreadTurnsInRpcResult(method: string, result: unknown): unknown {
  if (!THREAD_METHODS_WITH_TURNS.has(method)) return result

  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !turns || turns.length <= THREAD_RESPONSE_TURN_LIMIT) return result
  const startTurnIndex = Math.max(0, turns.length - THREAD_RESPONSE_TURN_LIMIT)

  return {
    ...record,
    threadTurnStartIndex: startTurnIndex,
    thread: {
      ...thread,
      turns: turns.slice(startTurnIndex),
    },
  }
}

function readExternalSessionForThread(tracker: RpcPipelineDeps['externalSessionTracker'], threadId: string): ExternalSessionInfo | null {
  if (!threadId) return null
  return tracker.getExternalSession(threadId)
}

function overlayExternalSessionOnThreadList(
  tracker: RpcPipelineDeps['externalSessionTracker'],
  result: unknown,
): unknown {
  const record = asRecord(result)
  if (!record || !Array.isArray(record.data)) return result
  let changed = false
  const data = record.data.map((row) => {
    const rowRecord = asRecord(row)
    if (!rowRecord) return row
    const threadId = readNonEmptyString(rowRecord.id)
    const externalSession = readExternalSessionForThread(tracker, threadId)
    if (!externalSession) return row
    changed = true
    return { ...rowRecord, externalSession }
  })
  return changed ? { ...record, data } : result
}

/**
 * Drop thread-list rows whose id is in `threadIdsToExclude` (e.g. subagent
 * sessions, which the app-server materializes with an interactive source and
 * therefore shows in `thread/list`). Returns the input unchanged when nothing
 * is excluded.
 */
function filterThreadListByIds(result: unknown, threadIdsToExclude: ReadonlySet<string>): unknown {
  const record = asRecord(result)
  const data = Array.isArray(record?.data) ? record.data : null
  if (!record || !data || threadIdsToExclude.size === 0) return result
  const filtered = data.filter((row) => {
    const id = readNonEmptyString(asRecord(row)?.id)
    return !(id.length > 0 && threadIdsToExclude.has(id))
  })
  return filtered.length === data.length ? result : { ...record, data: filtered }
}

function filterSubagentThreadsFromThreadListResult(
  tracker: RpcPipelineDeps['externalSessionTracker'],
  result: unknown,
): unknown {
  // The tracker owns periodic discovery. thread/list reads its last completed
  // snapshot so a recursive session scan cannot stall the RPC response.
  return filterThreadListByIds(result, tracker.getUserFacingSubagentThreadIds())
}

function overlayExternalSessionOnThreadResult(
  tracker: RpcPipelineDeps['externalSessionTracker'],
  result: unknown,
): unknown {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  if (!record || !thread) return result
  const threadId = readNonEmptyString(thread.id)
  const externalSession = readExternalSessionForThread(tracker, threadId)
  if (!externalSession) return result
  return { ...record, thread: { ...thread, externalSession } }
}

export async function runRpcResponsePipeline(deps: RpcPipelineDeps, method: string, rpcResult: unknown): Promise<unknown> {
  const { appServer, externalSessionTracker, sanitizeThreadTurnsInlinePayloads, mergeImportedThreadsIntoThreadListResult } = deps

  const trimmedResult = trimThreadTurnsInRpcResult(method, rpcResult)
  const errorMergedResult = THREAD_METHODS_WITH_TURNS.has(method)
    ? mergeStreamTurnErrorsIntoThreadResult(appServer, trimmedResult)
    : trimmedResult
  const listMergedResult = method === 'thread/list'
    ? mergeImportedThreadsIntoThreadListResult(errorMergedResult)
    : errorMergedResult
  const subagentFilteredResult = method === 'thread/list'
    ? filterSubagentThreadsFromThreadListResult(externalSessionTracker, listMergedResult)
    : listMergedResult
  const sanitizedResult = await sanitizeThreadTurnsInlinePayloads(method, subagentFilteredResult)
  const skillMergedResult = THREAD_METHODS_WITH_TURNS.has(method)
    ? await mergeSessionSkillInputsIntoThreadResult(sanitizedResult)
    : sanitizedResult
  const mergedResult = THREAD_METHODS_WITH_TURNS.has(method)
    ? await mergeSessionCommandsIntoThreadResult(skillMergedResult)
    : skillMergedResult

  if (THREAD_METHODS_WITH_THREAD_SNAPSHOT.has(method)) {
    const rpcRecord = asRecord(mergedResult)
    const rpcThread = asRecord(rpcRecord?.thread)
    const rpcThreadId = typeof rpcThread?.id === 'string' ? rpcThread.id : ''
    if (rpcThreadId) appServer.storeThreadReadSnapshot(rpcThreadId, mergedResult)
  }

  return method === 'thread/list'
    ? overlayExternalSessionOnThreadList(externalSessionTracker, mergedResult)
    : THREAD_METHODS_WITH_TURNS.has(method)
      ? overlayExternalSessionOnThreadResult(externalSessionTracker, mergedResult)
      : mergedResult
}

export function getRpcPipelineErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
