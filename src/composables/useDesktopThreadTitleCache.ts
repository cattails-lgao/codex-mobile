// Thread-title cache read request + ownership sliced out of
// useDesktopState()'s closure. This module owns the threadTitleById cache ref
// and the read/normalize helpers (applyCachedTitlesToGroups,
// loadThreadTitleCacheIfNeeded) plus the async title generation/fallback
// resolution. Title-generation also needs to refresh thread flags after a new
// title lands, so that write-side orchestration (applyThreadFlags) is injected
// via a narrow deps object to keep this module cycle-free. Rename write-sites
// in the main closure keep mutating the returned threadTitleById ref directly.
import { ref } from 'vue'
import { generateThreadTitle, getThreadTitleCache, persistThreadTitle } from '../api/codexGateway'
import type { UiProjectGroup } from '../types/codex'
import { OPTIMISTIC_THREAD_TITLE_MAX, toOptimisticThreadTitle } from './useDesktopStateUtils'
import type { FileAttachment } from './useDesktopQueueState'

export interface ThreadTitleCacheDeps {
  applyThreadFlags: () => void
}

export function createDesktopThreadTitleCache(deps: ThreadTitleCacheDeps) {
  const threadTitleById = ref<Record<string, string>>({})

  function applyCachedTitlesToGroups(groups: UiProjectGroup[]): UiProjectGroup[] {
    const titles = threadTitleById.value
    // round-24：无论缓存命中与否，展示层统一把线程名收口到 20 字以内——
    // app-server thread/list 返回的 title/preview 可能是第一轮用户消息全文，
    // 仅依赖 thread/name/updated 通知截断覆盖不到（无缓存/刷新后仍超长）。
    if (Object.keys(titles).length === 0) {
      return groups.map((group) => ({
        projectName: group.projectName,
        threads: group.threads.map((thread) => ({ ...thread, title: toOptimisticThreadTitle(thread.title) })),
      }))
    }
    return groups.map((group) => ({
      projectName: group.projectName,
      threads: group.threads.map((thread) => {
        const cached = titles[thread.id]
        return {
          ...thread,
          title: toOptimisticThreadTitle(cached ?? thread.title),
        }
      }),
    }))
  }

  async function loadThreadTitleCacheIfNeeded(options: { force?: boolean } = {}): Promise<void> {
    if (options.force !== true && Object.keys(threadTitleById.value).length > 0) return
    try {
      const cache = await getThreadTitleCache()
      if (Object.keys(cache.titles).length > 0) {
        // round-24：缓存里可能存着 app-server 推送的未截断标题（第一轮用户
        // 消息全文），加载时统一收口到 20 字，避免侧栏/标题展示超长。
        const normalizedTitles: Record<string, string> = {}
        for (const [threadId, title] of Object.entries(cache.titles)) {
          normalizedTitles[threadId] = toOptimisticThreadTitle(title)
        }
        threadTitleById.value = normalizedTitles
      }
    } catch {
      // Title cache is optional; keep UI functional.
    }
  }

  function resolveFallbackThreadTitle(prompt: string, imageUrls: string[], fileAttachments: FileAttachment[]): string {
    const trimmed = prompt.trim()
    if (trimmed) return toOptimisticThreadTitle(trimmed)

    const firstAttachmentLabel = fileAttachments
      .map((attachment) => attachment.label.trim())
      .find((label) => label.length > 0)
    if (firstAttachmentLabel) return toOptimisticThreadTitle(firstAttachmentLabel)

    if (imageUrls.length > 0) return toOptimisticThreadTitle('[Image]')
    return 'Untitled thread'
  }

  async function requestThreadTitleGeneration(
    threadId: string,
    prompt: string,
    cwd: string | null,
    imageUrls: string[] = [],
    fileAttachments: FileAttachment[] = [],
  ): Promise<void> {
    if (threadTitleById.value[threadId]) return
    const trimmed = prompt.trim()
    if (!trimmed) {
      const fallbackTitle = resolveFallbackThreadTitle(prompt, imageUrls, fileAttachments)
      threadTitleById.value = { ...threadTitleById.value, [threadId]: fallbackTitle }
      deps.applyThreadFlags()
      void persistThreadTitle(threadId, fallbackTitle)
      return
    }
    const truncated = trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed
    try {
      const title = await generateThreadTitle(truncated, cwd)
      if (!title || threadTitleById.value[threadId]) return
      // round-23：总结结果收口到 20 字以内再重命名
      const normalizedTitle = title.length > OPTIMISTIC_THREAD_TITLE_MAX ? title.slice(0, OPTIMISTIC_THREAD_TITLE_MAX) : title
      threadTitleById.value = { ...threadTitleById.value, [threadId]: normalizedTitle }
      deps.applyThreadFlags()
      void persistThreadTitle(threadId, normalizedTitle)
    } catch {
      // Title generation is best-effort.
    }
  }

  return {
    applyCachedTitlesToGroups,
    loadThreadTitleCacheIfNeeded,
    requestThreadTitleGeneration,
    resolveFallbackThreadTitle,
    threadTitleById,
  }
}