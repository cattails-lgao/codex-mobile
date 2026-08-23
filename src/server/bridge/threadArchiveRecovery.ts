// Thread archive-recovery slice, extracted from createCodexBridgeMiddleware. When
// archiving a thread fails with "no rollout found", the shell materializes a
// fallback title from the archived metadata and retries; it also carries the
// turn/start resume path and thread-list canonicalization shared with the rpc
// dispatcher. Pure helpers plus injected rpc executor (no shell closures).
import { asRecord, getErrorMessage, readNonEmptyString } from './core.js'
import { canonicalizeThreadListResponseForRead } from './workspaceRoots.js'
import { callRpcWithRateLimitDecodeRecovery } from '../rateLimitDecodeRecovery.js'
import { isThreadNotFoundError } from './threadErrors.js'

export type RpcExecutor = {
  rpc: (method: string, params: unknown) => Promise<unknown>
}

export function extractThreadMessageText(threadReadPayload: unknown): string {
  const payload = asRecord(threadReadPayload)
  const thread = asRecord(payload?.thread)
  const turns = Array.isArray(thread?.turns) ? thread.turns : []
  const parts: string[] = []

  for (const turn of turns) {
    const turnRecord = asRecord(turn)
    const items = Array.isArray(turnRecord?.items) ? turnRecord.items : []
    for (const item of items) {
      const itemRecord = asRecord(item)
      const type = typeof itemRecord?.type === 'string' ? itemRecord.type : ''
      if (type === 'agentMessage' && typeof itemRecord?.text === 'string' && itemRecord.text.trim().length > 0) {
        parts.push(itemRecord.text.trim())
        continue
      }
      if (type === 'userMessage') {
        const content = Array.isArray(itemRecord?.content) ? itemRecord.content : []
        for (const block of content) {
          const blockRecord = asRecord(block)
          if (blockRecord?.type === 'text' && typeof blockRecord.text === 'string' && blockRecord.text.trim().length > 0) {
            parts.push(blockRecord.text.trim())
          }
        }
        continue
      }
      if (type === 'commandExecution') {
        const command = typeof itemRecord?.command === 'string' ? itemRecord.command.trim() : ''
        const output = typeof itemRecord?.aggregatedOutput === 'string' ? itemRecord.aggregatedOutput.trim() : ''
        if (command) parts.push(command)
        if (output) parts.push(output)
      }
    }
  }

  return parts.join('\n').trim()
}

function readThreadArchiveFallbackName(threadReadResult: unknown): string {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  return (
    readNonEmptyString(thread?.name)
    || readNonEmptyString(thread?.title)
    || readNonEmptyString(thread?.preview)
    || 'Untitled thread'
  )
}

function isArchivedThreadReadResult(threadReadResult: unknown): boolean {
  const record = asRecord(threadReadResult)
  const thread = asRecord(record?.thread)
  const sessionPath = readNonEmptyString(thread?.path)
  return sessionPath.split(/[\\/]+/u).includes('archived_sessions')
}

export async function callRpcWithArchiveRecovery(
  appServer: RpcExecutor,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    const result = await callRpcWithRateLimitDecodeRecovery(appServer, method, params)
    return method === 'thread/list'
      ? await canonicalizeThreadListResponseForRead(result)
      : result
  } catch (error) {
    const paramsRecord = asRecord(params)
    const threadId = readNonEmptyString(paramsRecord?.threadId)

    if (method === 'turn/start' && threadId && isThreadNotFoundError(error)) {
      await appServer.rpc('thread/resume', { threadId })
      return appServer.rpc(method, params ?? null)
    }

    if (method !== 'thread/archive') {
      throw error
    }

    const errorMessage = getErrorMessage(error, '')
    if (!threadId || !errorMessage.includes('no rollout found')) {
      throw error
    }

    let threadReadResult: unknown = null
    try {
      threadReadResult = await appServer.rpc('thread/read', {
        threadId,
        includeTurns: false,
      })
      if (isArchivedThreadReadResult(threadReadResult)) {
        return null
      }
    } catch {
      // If metadata cannot be read, still try materializing a title before retrying archive.
    }

    await appServer.rpc('thread/name/set', {
      threadId,
      name: readThreadArchiveFallbackName(threadReadResult),
    })
    return appServer.rpc(method, params ?? null)
  }
}