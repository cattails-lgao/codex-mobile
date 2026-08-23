// Thread search index building (AE batch), extracted from createCodexBridgeMiddleware.
// Purely funcitonal helpers that assemble the search index by paging thread/list and
// batch-reading top-N threads for full text. They rely only on the injected rpc facade,
// core.asRecord, and extractThreadMessageText (threadArchiveRecovery). The shell keeps
// the cached getThreadSearchIndex closure and consumes ThreadSearchIndex / the
// THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT constant from here.
import { asRecord } from './core.js'
import { extractThreadMessageText } from './threadArchiveRecovery.js'
import type { RpcExecutor } from './models.js'

export type ThreadSearchDocument = {
  id: string
  title: string
  preview: string
  messageText: string
  searchableText: string
}

export type ThreadSearchIndex = {
  docsById: Map<string, ThreadSearchDocument>
}

export const THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT = 100

export async function loadAllThreadsForSearch(appServer: RpcExecutor): Promise<ThreadSearchDocument[]> {
  const threads: Array<{ id: string; title: string; preview: string }> = []
  let cursor: string | null = null

  do {
    const response = asRecord(await appServer.rpc('thread/list', {
      archived: false,
      limit: 100,
      sortKey: 'updated_at',
      modelProviders: [],
      cursor,
    }))
    const data = Array.isArray(response?.data) ? response.data : []
    for (const row of data) {
      const record = asRecord(row)
      const id = typeof record?.id === 'string' ? record.id : ''
      if (!id) continue
      const title = typeof record?.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : (typeof record?.preview === 'string' && record.preview.trim().length > 0 ? record.preview.trim() : 'Untitled thread')
      const preview = typeof record?.preview === 'string' ? record.preview : ''
      threads.push({ id, title, preview })
    }
    cursor = typeof response?.nextCursor === 'string' && response.nextCursor.length > 0 ? response.nextCursor : null
  } while (cursor)

  const docs: ThreadSearchDocument[] = threads.map((thread) => {
    const searchableText = [thread.title, thread.preview].filter(Boolean).join('\n')
    return {
      id: thread.id,
      title: thread.title,
      preview: thread.preview,
      messageText: '',
      searchableText,
    } satisfies ThreadSearchDocument
  })

  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  const fullTextThreads = threads.slice(0, THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT)
  const concurrency = 4
  for (let offset = 0; offset < fullTextThreads.length; offset += concurrency) {
    const batch = fullTextThreads.slice(offset, offset + concurrency)
    const loaded = await Promise.all(batch.map(async (thread) => {
      try {
        const readResponse = await appServer.rpc('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        })
        const messageText = extractThreadMessageText(readResponse)
        const searchableText = [thread.title, thread.preview, messageText].filter(Boolean).join('\n')
        return [thread.id, {
          id: thread.id,
          title: thread.title,
          preview: thread.preview,
          messageText,
          searchableText,
        } satisfies ThreadSearchDocument] as const
      } catch {
        return null
      }
    }))
    for (const row of loaded) {
      if (!row) continue
      docsById.set(row[0], row[1])
    }
  }

  return Array.from(docsById.values())
}

export async function buildThreadSearchIndex(appServer: RpcExecutor): Promise<ThreadSearchIndex> {
  const docs = await loadAllThreadsForSearch(appServer)
  const docsById = new Map<string, ThreadSearchDocument>(docs.map((doc) => [doc.id, doc]))
  return { docsById }
}