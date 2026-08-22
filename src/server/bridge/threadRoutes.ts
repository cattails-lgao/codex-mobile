// Thread read / SSE HTTP route family, sliced out of createCodexBridgeMiddleware.
// The routers are thin; the heavy AppServerProcess facade and the
// externalSessionTracker instance stay owned by the shell and are injected via
// ThreadRouteDeps through narrow structural interfaces so this slice never
// imports back into the bridge shell. The /codex-api/events SSE handler (which
// depends on the shell's middleware.subscribeNotifications self-reference)
// remains in the shell pending a subscription-source extraction.
import { isAbsolute } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asRecord, getErrorMessage, readNonEmptyString, STREAM_EVENT_BUFFER_LIMIT, THREAD_RESPONSE_TURN_LIMIT } from './core.js'
import { buildSessionFileChangeFallback, mergeSessionCommandsIntoThreadResult, mergeSessionCommandsIntoTurns, mergeSessionSkillInputsIntoThreadResult } from './session.js'
import type { ExternalSessionInfo } from '../externalSessionTracker.js'

type SetJson = (res: ServerResponse, statusCode: number, payload: unknown) => void

type StreamEventFrame = {
  method: string
  params: unknown
  atIso: string
}

export type ThreadReadAppServerFacade = {
  rpc(method: string, params: unknown): Promise<unknown>
  readThreadForTurnPage(threadId: string): Promise<unknown>
  getStreamEvents(threadId: string, limit: number): StreamEventFrame[]
  storeThreadReadSnapshot(threadId: string, snapshot: unknown): void
  getLastThreadReadSnapshot(threadId: string): unknown | null
  getCachedLiveState(threadId: string, turnCount: number, sessionSize: number): unknown | null
  cacheLiveState(threadId: string, data: unknown, turnCount: number, sessionSize: number): void
  mergeItemsIntoTurns(threadId: string, turns: unknown[]): unknown[]
}

export type ThreadRouteDeps = {
  setJson: SetJson
  appServer: ThreadReadAppServerFacade
  externalSessionTracker: { getExternalSession(threadId: string): ExternalSessionInfo | null }
  // Shared with the shell's rpc handler; kept in the shell, injected here to
  // avoid a threadRoutes -> shell import (cycle).
  sanitizeThreadTurnsInlinePayloads: (method: string, result: unknown) => Promise<unknown>
  isThreadMaterializationPendingError: (error: unknown) => boolean
}

function readStreamTurnId(params: Record<string, unknown>): string {
  const directTurnId = readNonEmptyString(params.turnId) || readNonEmptyString(params.turn_id)
  if (directTurnId) return directTurnId
  const turn = asRecord(params.turn)
  return readNonEmptyString(turn?.id)
}

function readStreamTurnErrorMessage(frame: StreamEventFrame): { turnId: string; message: string } | null {
  const params = asRecord(frame.params)
  if (!params) return null
  const turnId = readStreamTurnId(params)
  if (!turnId) return null

  if (frame.method === 'turn/completed') {
    const turn = asRecord(params.turn)
    if (turn?.status !== 'failed') return null
    const message = getErrorMessage(turn.error, '')
    return message ? { turnId, message } : null
  }

  if (frame.method === 'error' && params.willRetry !== true) {
    const message = getErrorMessage(params.error, '') || readNonEmptyString(params.message)
    return message ? { turnId, message } : null
  }

  return null
}

export function mergeStreamTurnErrorsIntoThreadResult(appServer: ThreadReadAppServerFacade, result: unknown): unknown {
  const record = asRecord(result)
  const thread = asRecord(record?.thread)
  const threadId = readNonEmptyString(thread?.id)
  const turns = Array.isArray(thread?.turns) ? thread.turns : null
  if (!record || !thread || !threadId || !turns || turns.length === 0) return result

  const errorsByTurnId = new Map<string, string>()
  for (const frame of appServer.getStreamEvents(threadId, STREAM_EVENT_BUFFER_LIMIT)) {
    const error = readStreamTurnErrorMessage(frame)
    if (error) errorsByTurnId.set(error.turnId, error.message)
  }
  if (errorsByTurnId.size === 0) return result

  let changed = false
  const mergedTurns = turns.map((turn) => {
    const turnRecord = asRecord(turn)
    const turnId = readNonEmptyString(turnRecord?.id)
    const message = turnId ? errorsByTurnId.get(turnId) : ''
    if (!turnRecord || !turnId || !message) return turn
    const existingErrorMessage = getErrorMessage(turnRecord.error, '')
    if (turnRecord.status === 'failed' && existingErrorMessage) return turn
    changed = true
    return {
      ...turnRecord,
      status: 'failed',
      error: {
        message,
        codexErrorInfo: null,
        additionalDetails: null,
      },
    }
  })

  if (!changed) return result
  return {
    ...record,
    thread: {
      ...thread,
      turns: mergedTurns,
    },
  }
}

export function handleThreadHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: ThreadRouteDeps,
): Promise<boolean> {
  const { setJson, appServer, externalSessionTracker, sanitizeThreadTurnsInlinePayloads, isThreadMaterializationPendingError } = deps

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-turn-page') {
    return (async () => {
      try {
        const threadId = url.searchParams.get('threadId')?.trim() ?? ''
        const beforeTurnId = url.searchParams.get('beforeTurnId')?.trim() ?? ''
        const limitRaw = url.searchParams.get('limit')?.trim() ?? String(THREAD_RESPONSE_TURN_LIMIT)
        const limit = Math.max(1, Math.min(50, Number.parseInt(limitRaw, 10) || THREAD_RESPONSE_TURN_LIMIT))
        if (!threadId) {
          setJson(res, 400, { error: 'Missing threadId' })
          return true
        }

        const threadReadResult = mergeStreamTurnErrorsIntoThreadResult(appServer, await appServer.readThreadForTurnPage(threadId))
        const record = asRecord(threadReadResult)
        const thread = asRecord(record?.thread)
        if (!record || !thread) {
          setJson(res, 502, { error: 'thread/read returned an invalid thread response' })
          return true
        }

        const turns = Array.isArray(thread.turns) ? thread.turns : []
        const beforeIndex = beforeTurnId
          ? turns.findIndex((turn) => asRecord(turn)?.id === beforeTurnId)
          : turns.length
        if (beforeTurnId && beforeIndex < 0) {
          setJson(res, 200, {
            result: {
              ...record,
              thread: {
                ...thread,
                turns: [],
              },
            },
            startTurnIndex: 0,
            hasMoreOlder: false,
          })
          return true
        }

        const endIndex = beforeIndex
        const startIndex = Math.max(0, endIndex - limit)
        const pageTurns = turns.slice(startIndex, endIndex)
        const pagedResult = {
          ...record,
          thread: {
            ...thread,
            turns: pageTurns,
          },
        }
        const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', pagedResult)
        const skillMerged = await mergeSessionSkillInputsIntoThreadResult(sanitized)
        const result = await mergeSessionCommandsIntoThreadResult(skillMerged)

        setJson(res, 200, {
          result,
          startTurnIndex: startIndex,
          hasMoreOlder: startIndex > 0,
        })
      } catch (error) {
        setJson(res, 500, { error: getErrorMessage(error, 'Failed to load earlier thread messages') })
      }
      return true
    })()
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-file-change-fallback') {
    return (async () => {
      const threadId = url.searchParams.get('threadId')?.trim() ?? ''
      if (!threadId) {
        setJson(res, 400, { error: 'Missing threadId' })
        return true
      }

      const threadReadResult = await appServer.rpc('thread/read', {
        threadId,
        includeTurns: true,
      })
      const threadReadRecord = asRecord(threadReadResult)
      const threadRecord = asRecord(threadReadRecord?.thread)
      const sessionPath = readNonEmptyString(threadRecord?.path)
      if (!sessionPath || !isAbsolute(sessionPath)) {
        setJson(res, 200, { data: [] })
        return true
      }

      try {
        const sessionLogRaw = await readFile(sessionPath, 'utf8')
        setJson(res, 200, { data: buildSessionFileChangeFallback(threadReadResult, sessionLogRaw) })
      } catch {
        setJson(res, 200, { data: [] })
      }
      return true
    })()
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-stream-events') {
    return (async () => {
      const threadId = url.searchParams.get('threadId')?.trim() ?? ''
      const limitRaw = url.searchParams.get('limit')?.trim() ?? '80'
      const limit = Math.max(1, Math.min(400, Number.parseInt(limitRaw, 10) || 80))
      if (!threadId) {
        setJson(res, 400, { error: 'Missing threadId' })
        return true
      }
      const events = appServer.getStreamEvents(threadId, limit)
      setJson(res, 200, { events })
      return true
    })()
  }

  if (req.method === 'GET' && url.pathname === '/codex-api/thread-live-state') {
    return (async () => {
      const threadId = url.searchParams.get('threadId')?.trim() ?? ''
      if (!threadId) {
        setJson(res, 400, { error: 'Missing threadId' })
        return true
      }

      try {
        const threadReadResult = mergeStreamTurnErrorsIntoThreadResult(appServer, await appServer.rpc('thread/read', {
          threadId,
          includeTurns: true,
        }))
        const sanitized = await sanitizeThreadTurnsInlinePayloads('thread/read', threadReadResult)
        appServer.storeThreadReadSnapshot(threadId, sanitized)

        const record = asRecord(sanitized)
        const thread = asRecord(record?.thread)
        const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []

        const sessionPath = readNonEmptyString(thread?.path)
        let sessionSize = 0
        if (sessionPath && isAbsolute(sessionPath)) {
          try {
            const s = await stat(sessionPath)
            sessionSize = s.size
          } catch { /* missing */ }
        }

        const externalSession = externalSessionTracker.getExternalSession(threadId)
        const cached = appServer.getCachedLiveState(threadId, rawTurns.length, sessionSize)
        if (cached) {
          setJson(res, 200, externalSession ? { ...cached, externalSession } : cached)
          return true
        }

        let turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)

        if (sessionPath && isAbsolute(sessionPath) && sessionSize > 0) {
          try {
            const sessionLogRaw = await readFile(sessionPath, 'utf8')
            turns = mergeSessionCommandsIntoTurns(turns, sessionLogRaw)
          } catch {
            // Session log not available — continue without command recovery
          }
        }

        const lastTurn = turns.length > 0 ? asRecord(turns[turns.length - 1]) : null
        const isInProgress = lastTurn?.status === 'inProgress' || externalSession?.active === true

        const responseData = {
          threadId,
          conversationState: {
            turns,
          },
          ownerClientId: null,
          liveStateError: null,
          isInProgress,
          ...(externalSession ? { externalSession } : {}),
        }

        if (!isInProgress) {
          appServer.cacheLiveState(threadId, responseData, rawTurns.length, sessionSize)
        }

        setJson(res, 200, responseData)
      } catch (error) {
        if (isThreadMaterializationPendingError(error)) {
          setJson(res, 200, {
            threadId,
            conversationState: { turns: [] },
            ownerClientId: null,
            liveStateError: null,
            isInProgress: true,
          })
          return true
        }

        const snapshot = appServer.getLastThreadReadSnapshot(threadId)
        if (snapshot) {
          const record = asRecord(snapshot)
          const thread = asRecord(record?.thread)
          const rawTurns = Array.isArray(thread?.turns) ? thread.turns : []
          const turns = appServer.mergeItemsIntoTurns(threadId, rawTurns)
          setJson(res, 200, {
            threadId,
            conversationState: { turns },
            ownerClientId: null,
            liveStateError: {
              kind: 'readFailed',
              message: getErrorMessage(error, 'thread/read failed'),
            },
            isInProgress: false,
          })
        } else {
          setJson(res, 200, {
            threadId,
            conversationState: null,
            ownerClientId: null,
            liveStateError: {
              kind: 'readFailed',
              message: getErrorMessage(error, 'thread/read failed'),
            },
            isInProgress: false,
          })
        }
      }
      return true
    })()
  }

  return Promise.resolve(false)
}