import { ref } from 'vue'
import { CODE_LANGUAGE_ALIASES } from '../../utils/conversationFileChanges'
import {
  headingClass,
  headingTag,
  parseFileReference,
  resolveRelativePath,
} from '../../utils/conversationPaths'
import {
  type InlineSegment,
  type ListItem,
  type MessageBlock,
  type TableAlignment,
  parseInlineSegmentsUncached,
  parseMessageBlocks,
} from '../../utils/conversationMarkdown'
import type { UiMessage } from '../../types/codex'
import { sanitizeHtml } from '../../utils/sanitizeHtml'

type HighlightJsModule = (typeof import('highlight.js/lib/common'))['default']

type MessageBlockCacheEntry = {
  text: string
  cwd: string
  blocks: MessageBlock[]
}

type MarkdownHtmlCacheEntry = {
  text: string
  cwd: string
  highlightVersion: number
  html: string
}

const MESSAGE_BLOCK_CACHE_LIMIT = 300
const INLINE_SEGMENT_CACHE_LIMIT = 1200
const MARKDOWN_HTML_CACHE_LIMIT = 300
const HIGHLIGHT_HTML_CACHE_LIMIT = 250

export interface MarkdownRenderingDeps {
  getCwd: () => string
  isVideoMediaUrl: (value: string) => boolean
}

export function createMarkdownRendering(deps: MarkdownRenderingDeps) {
  const { getCwd, isVideoMediaUrl } = deps

  const highlightJsModule = ref<HighlightJsModule | null>(null)
  const highlightCacheVersion = ref(0)
  let highlightJsLoader: Promise<void> | null = null

  const messageBlockCache = new Map<string, MessageBlockCacheEntry>()
  const inlineSegmentCache = new Map<string, InlineSegment[]>()
  const markdownHtmlCache = new Map<string, MarkdownHtmlCacheEntry>()
  const highlightHtmlCache = new Map<string, string>()

  function setBoundedCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)
    while (cache.size > limit) {
      const oldestKey = cache.keys().next().value as K | undefined
      if (oldestKey === undefined) break
      cache.delete(oldestKey)
    }
    return value
  }

  function ensureHighlightJsLoaded(): Promise<void> {
    if (highlightJsModule.value) return Promise.resolve()
    if (!highlightJsLoader) {
      highlightJsLoader = import('highlight.js/lib/common')
        .then((module) => {
          highlightJsModule.value = module.default
          highlightHtmlCache.clear()
          markdownHtmlCache.clear()
          highlightCacheVersion.value += 1
        })
        .finally(() => {
          highlightJsLoader = null
        })
    }

    return highlightJsLoader
  }

  function hasHighlightLoaded(): boolean {
    return Boolean(highlightJsModule.value)
  }

  function getInlineSegments(text: string): InlineSegment[] {
    const cached = inlineSegmentCache.get(text)
    if (cached) {
      inlineSegmentCache.delete(text)
      inlineSegmentCache.set(text, cached)
      return cached
    }
    return setBoundedCacheEntry(inlineSegmentCache, text, parseInlineSegmentsUncached(text), INLINE_SEGMENT_CACHE_LIMIT)
  }

  function toBrowseUrl(pathValue: string): string {
    const normalized = pathValue.trim()
    if (!normalized) return '#'
    const looksLikeAbsolutePath = (candidate: string): boolean => (
      candidate.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(candidate)
    )

    const parsed = parseFileReference(normalized)
    const candidatePath = parsed?.path ?? normalized
    const resolved = resolveRelativePath(candidatePath, getCwd())

    if (looksLikeAbsolutePath(resolved)) {
      const normalizedResolved = resolved.startsWith('/') ? resolved : `/${resolved}`
      return `/codex-local-browse${encodeURI(normalizedResolved)}`
    }

    return '#'
  }

  function toEditUrlFromBrowseHref(href: string): string {
    const normalizedHref = href.trim()
    if (!normalizedHref) return ''
    try {
      const resolved = new URL(normalizedHref, window.location.href)
      if (!resolved.pathname.startsWith('/codex-local-browse')) return ''
      const editPath = `/codex-local-edit${resolved.pathname.slice('/codex-local-browse'.length)}`
      return `${editPath}${resolved.search}${resolved.hash}`
    } catch {
      return ''
    }
  }

  function getMessageBlocks(message: UiMessage): MessageBlock[] {
    const cached = messageBlockCache.get(message.id)
    if (cached && cached.text === message.text && cached.cwd === getCwd()) {
      messageBlockCache.delete(message.id)
      messageBlockCache.set(message.id, cached)
      return cached.blocks
    }
    const blocks = parseMessageBlocks(message.text)
    return setBoundedCacheEntry(
      messageBlockCache,
      message.id,
      { text: message.text, cwd: getCwd(), blocks },
      MESSAGE_BLOCK_CACHE_LIMIT,
    ).blocks
  }

  function escapeHtml(value: string): string {
    return value
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
      .replace(/"/gu, '&quot;')
      .replace(/'/gu, '&#39;')
  }

  function normalizeCodeLanguage(language: string): string {
    const token = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
    if (!token) return ''
    return CODE_LANGUAGE_ALIASES[token] ?? token
  }

  function renderHighlightedCodeAsHtmlUncached(language: string, value: string): string {
    const normalizedLanguage = normalizeCodeLanguage(language)
    if (!normalizedLanguage) return escapeHtml(value)
    const highlighter = highlightJsModule.value
    if (!highlighter) return escapeHtml(value)

    try {
      if (highlighter.getLanguage(normalizedLanguage)) {
        return highlighter.highlight(value, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value
      }
    } catch {
      // Fall back to plain escaped code when highlighting fails.
    }

    return escapeHtml(value)
  }

  function renderCachedHighlightedCodeAsHtml(language: string, value: string): string {
    return sanitizeHtml(_renderCachedHighlightedCodeAsHtml(language, value))
  }

  function _renderCachedHighlightedCodeAsHtml(language: string, value: string): string {
    const cacheKey = `${highlightCacheVersion.value}\u0000${normalizeCodeLanguage(language)}\u0000${language}\u0000${value}`
    const cached = highlightHtmlCache.get(cacheKey)
    if (cached !== undefined) {
      highlightHtmlCache.delete(cacheKey)
      highlightHtmlCache.set(cacheKey, cached)
      return cached
    }
    return setBoundedCacheEntry(
      highlightHtmlCache,
      cacheKey,
      renderHighlightedCodeAsHtmlUncached(language, value),
      HIGHLIGHT_HTML_CACHE_LIMIT,
    )
  }

  function renderInlineSegmentsAsHtml(text: string): string {
    return getInlineSegments(text)
      .map((segment) => {
        if (segment.kind === 'text') {
          return escapeHtml(segment.value)
        }
        if (segment.kind === 'bold') {
          return `<strong class="message-bold-text">${escapeHtml(segment.value)}</strong>`
        }
        if (segment.kind === 'italic') {
          return `<em class="message-italic-text">${escapeHtml(segment.value)}</em>`
        }
        if (segment.kind === 'strikethrough') {
          return `<s class="message-strikethrough-text">${escapeHtml(segment.value)}</s>`
        }
        if (segment.kind === 'file') {
          return `<a class="message-file-link" href="${escapeHtml(toBrowseUrl(segment.path))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.path)}">${escapeHtml(segment.displayPath)}</a>`
        }
        if (segment.kind === 'url') {
          return `<a class="message-file-link" href="${escapeHtml(segment.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(segment.href)}">${escapeHtml(segment.value)}</a>`
        }
        return `<code class="message-inline-code">${escapeHtml(segment.value)}</code>`
      })
      .join('')
  }

  function renderListItemParagraphsAsHtml(item: ListItem): string {
    return item.paragraphs
      .map((paragraph) => `<div class="message-list-item-text message-list-item-paragraph">${renderInlineSegmentsAsHtml(paragraph)}</div>`)
      .join('')
  }

  function renderListItemContentAsHtml(item: ListItem): string {
    const paragraphsHtml = renderListItemParagraphsAsHtml(item)
    const childrenHtml = item.children?.map((block) => renderMessageBlockAsHtml(block)).join('') ?? ''
    return sanitizeHtml(paragraphsHtml + childrenHtml)
  }

  function tableCellAlignmentStyle(alignment: TableAlignment): string {
    if (!alignment) return ''
    return ` style="text-align:${alignment}"`
  }

  function renderMessageBlockAsHtml(block: MessageBlock): string {
    if (block.kind === 'paragraph') {
      return `<p class="message-text">${renderInlineSegmentsAsHtml(block.value)}</p>`
    }
    if (block.kind === 'heading') {
      const level = Math.min(6, Math.max(1, Math.trunc(block.level)))
      const tag = headingTag(level)
      const classes = `message-heading ${headingClass(level)}`
      return `<${tag} class="${classes}">${renderInlineSegmentsAsHtml(block.value)}</${tag}>`
    }
    if (block.kind === 'blockquote') {
      return `<blockquote class="message-blockquote">${renderInlineSegmentsAsHtml(block.value)}</blockquote>`
    }
    if (block.kind === 'unorderedList') {
      const items = block.items
        .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
        .join('')
      return `<ul class="message-list message-list-unordered">${items}</ul>`
    }
    if (block.kind === 'taskList') {
      const items = block.items
        .map((item) => (
          `<li class="message-task-item">` +
          `<span class="message-task-checkbox" data-checked="${item.checked ? 'true' : 'false'}">${item.checked ? '☑' : '☐'}</span>` +
          `<div class="message-list-item-text">${renderInlineSegmentsAsHtml(item.text)}</div>` +
          `</li>`
        ))
        .join('')
      return `<ul class="message-list message-task-list">${items}</ul>`
    }
    if (block.kind === 'orderedList') {
      const items = block.items
        .map((item) => `<li class="message-list-item"><div class="message-list-item-content">${renderListItemContentAsHtml(item)}</div></li>`)
        .join('')
      return `<ol class="message-list message-list-ordered" start="${block.start}">${items}</ol>`
    }
    if (block.kind === 'table') {
      const headerCells = block.headers
        .map((cell, index) => `<th class="message-table-head-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</th>`)
        .join('')
      const rows = block.rows
        .map((row) => (
          `<tr class="message-table-body-row">` +
          row.map((cell, index) => `<td class="message-table-cell"${tableCellAlignmentStyle(block.alignments[index] ?? null)}>${renderInlineSegmentsAsHtml(cell)}</td>`).join('') +
          `</tr>`
        ))
        .join('')
      const body = rows ? `<tbody>${rows}</tbody>` : ''
      return `<div class="message-table-wrap"><table class="message-table"><thead><tr>${headerCells}</tr></thead>${body}</table></div>`
    }
    if (block.kind === 'codeBlock') {
      const language = block.language
        ? `<div class="message-code-language">${escapeHtml(block.language)}</div>`
        : ''
      return `<div class="message-code-block">${language}<pre class="message-code-pre"><code class="hljs">${renderCachedHighlightedCodeAsHtml(block.language, block.value)}</code></pre></div>`
    }
    if (block.kind === 'thematicBreak') {
      return '<hr class="message-divider">'
    }
    if (isVideoMediaUrl(block.url)) {
      return `<video class="message-image-preview message-video-preview message-markdown-image" src="${escapeHtml(block.url)}" controls preload="metadata"></video>`
    }
    return `<img class="message-image-preview message-markdown-image" src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || 'Embedded message image')}" loading="lazy">`
  }

  function renderMarkdownBlocksAsHtml(text: string): string {
    const cacheKey = `${getCwd()}\u0000${highlightCacheVersion.value}\u0000${text}`
    const cached = markdownHtmlCache.get(cacheKey)
    if (cached && cached.text === text && cached.cwd === getCwd() && cached.highlightVersion === highlightCacheVersion.value) {
      markdownHtmlCache.delete(cacheKey)
      markdownHtmlCache.set(cacheKey, cached)
      return cached.html
    }
    const rawHtml = parseMessageBlocks(text)
      .map((block) => renderMessageBlockAsHtml(block))
      .join('')
    const html = sanitizeHtml(rawHtml)
    return setBoundedCacheEntry(
      markdownHtmlCache,
      cacheKey,
      {
        text,
        cwd: getCwd(),
        highlightVersion: highlightCacheVersion.value,
        html,
      },
      MARKDOWN_HTML_CACHE_LIMIT,
    ).html
  }

  function clearRenderCaches(): void {
    messageBlockCache.clear()
    inlineSegmentCache.clear()
    markdownHtmlCache.clear()
    highlightHtmlCache.clear()
  }

  return {
    highlightCacheVersion,
    hasHighlightLoaded,
    ensureHighlightJsLoaded,
    getInlineSegments,
    toBrowseUrl,
    toEditUrlFromBrowseHref,
    getMessageBlocks,
    renderListItemContentAsHtml,
    renderCachedHighlightedCodeAsHtml,
    renderMarkdownBlocksAsHtml,
    clearRenderCaches,
  }
}