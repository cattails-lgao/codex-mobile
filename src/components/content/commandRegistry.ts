// Command palette catalog + matcher (round-150, desktop-parity batch 2).
//
// Two deliberate properties:
//
// 1. This file is PURE DATA + PURE FUNCTIONS. It never imports a handler, a store
//    or a component. App.vue maps `id` → an existing App.vue handler, so the
//    palette is nothing more than a *re-aggregation of capabilities that already
//    ship* (see codex-mobile-handover/sections/desktop-parity-decision.md §批 2).
//    That keeps the whole thing unit-testable without mounting the app.
//
// 2. Titles double as i18n keys — the English source string resolved through
//    useUiLanguage(). Adding a command therefore requires touching the zhCN table
//    in useUiLanguage.ts as well (the project convention: English string is the key).

export type PaletteCommandGroup = 'thread' | 'panel' | 'view' | 'navigate'

export type PaletteCommand = {
  id: string
  /** i18n key — the English source string, resolved through useUiLanguage(). */
  title: string
  group: PaletteCommandGroup
  /**
   * Extra recall terms. Intentionally NOT translated: they carry both English
   * synonyms and the Chinese words people actually type, so a zh-CN UI is still
   * reachable with English terms, and an en UI with Chinese ones.
   */
  keywords?: string[]
  /**
   * Display-only accelerator hint in the abstract form 'Mod+X'. App.vue rewrites
   * 'Mod' for the current platform before handing it to the view; this field is
   * never parsed back into a key binding.
   */
  shortcut?: string
  /**
   * True when the command operates on the currently selected thread. App.vue drops
   * these while no thread is selected, so the palette never offers a no-op.
   * Note `thread.new` deliberately does NOT set this: it is the one thread-group
   * command that is useful with nothing selected.
   */
  requiresThread?: boolean
}

export const PALETTE_GROUP_ORDER: PaletteCommandGroup[] = ['thread', 'panel', 'view', 'navigate']

/** Group headings are i18n keys too (resolved through useUiLanguage()). */
export const PALETTE_GROUP_LABELS: Record<PaletteCommandGroup, string> = {
  thread: 'Thread',
  panel: 'Panel',
  view: 'View',
  navigate: 'Navigate',
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  // ---------------------------------------------------------------- thread
  { id: 'thread.new', title: 'Start a new thread', group: 'thread', keywords: ['new', 'chat', '新建', '新线程'] },
  { id: 'thread.rename', title: 'Rename the current thread', group: 'thread', keywords: ['title', '重命名', '标题'], requiresThread: true },
  { id: 'thread.archive', title: 'Archive the current thread', group: 'thread', keywords: ['delete', '归档', '删除'], requiresThread: true },
  { id: 'thread.fork', title: 'Fork the current thread', group: 'thread', keywords: ['branch', 'copy', '派生', '分叉'], requiresThread: true },
  { id: 'thread.copy-markdown', title: 'Copy the conversation as Markdown', group: 'thread', keywords: ['export', 'md', '导出', '复制对话'], requiresThread: true },
  { id: 'thread.compact', title: 'Compact the current thread context', group: 'thread', keywords: ['compress', 'summarize', '压缩', '上下文'], requiresThread: true },
  { id: 'thread.interrupt', title: 'Stop the running turn', group: 'thread', keywords: ['cancel', 'abort', 'interrupt', '中断', '停止'], requiresThread: true },
  { id: 'thread.implement-plan', title: 'Implement the current plan', group: 'thread', keywords: ['execute', 'approve', '执行', '计划'], requiresThread: true },

  // ----------------------------------------------------------------- panel
  { id: 'panel.git', title: 'Open the Git panel', group: 'panel', keywords: ['diff', 'changes', 'git', '变更'] },
  { id: 'panel.files', title: 'Open the files panel', group: 'panel', keywords: ['explorer', 'files', '文件'] },
  { id: 'panel.terminal', title: 'Toggle the terminal panel', group: 'panel', keywords: ['shell', 'console', '终端'], shortcut: 'Mod+J' },
  { id: 'panel.toggle', title: 'Toggle the side panel', group: 'panel', keywords: ['right', 'layout', '侧边栏'] },
  { id: 'panel.close', title: 'Close the side panel', group: 'panel', keywords: ['hide', 'right', '关闭'] },

  // ------------------------------------------------------------------ view
  { id: 'view.toggle-sidebar', title: 'Toggle the sidebar', group: 'view', keywords: ['collapse', 'sidebar', '侧栏'], shortcut: 'Mod+B' },
  { id: 'view.search-threads', title: 'Search threads', group: 'view', keywords: ['filter', 'find', '搜索', '筛选'] },
  { id: 'view.cycle-theme', title: 'Cycle the color theme', group: 'view', keywords: ['dark', 'light', 'system', 'theme', '暗色', '亮色', '主题'] },
  { id: 'view.cycle-chat-width', title: 'Cycle the chat width', group: 'view', keywords: ['wide', 'layout', '宽度'] },
  { id: 'view.toggle-language', title: 'Switch the interface language', group: 'view', keywords: ['language', 'chinese', 'english', '语言', '中文'] },
  { id: 'view.send-with-enter', title: 'Toggle send with Enter', group: 'view', keywords: ['keyboard', 'enter', '回车'] },
  { id: 'view.in-progress-send-mode', title: 'Cycle the in-progress send mode', group: 'view', keywords: ['steer', 'queue', '队列'] },
  { id: 'view.shortcuts', title: 'Keyboard shortcuts', group: 'view', keywords: ['keys', 'bindings', 'help', '快捷键', '帮助'] },

  // -------------------------------------------------------------- navigate
  { id: 'nav.skills', title: 'Open the skills page', group: 'navigate', keywords: ['plugins', 'mcp', '技能'] },
  { id: 'nav.automations', title: 'Open the automations page', group: 'navigate', keywords: ['schedule', 'cron', '自动化'] },
  { id: 'nav.recycle-bin', title: 'Open the recycle bin', group: 'navigate', keywords: ['trash', 'deleted', '回收站'] },
  { id: 'nav.settings', title: 'Open settings', group: 'navigate', keywords: ['preferences', 'config', '设置'] },
]

/** Word starts (index 0, or after a separator) earn a bonus when matched. */
export function isPaletteWordBoundary(text: string, index: number): boolean {
  if (index <= 0) return true
  const previous = text[index - 1] ?? ''
  return previous === ' ' || previous === '-' || previous === '/' || previous === '.' || previous === '_'
}

/**
 * Ordered-subsequence score of `query` against `text`, or null when the query's
 * characters cannot be found in order. Higher is better. Everything is integer
 * arithmetic so the ordering is exactly reproducible in tests.
 *
 * Weighting: each hit 10, a consecutive run pays 6 more per extra character,
 * a hit at a word start pays 12 more, and starting further into the text costs
 * 2 per skipped character. Length is only a tie-breaker-grade nudge.
 */
export function scorePaletteText(text: string, query: string): number | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const haystack = text.toLowerCase()
  if (!haystack) return null
  let score = 0
  let cursor = 0
  let run = 0
  let firstHit = -1
  for (let i = 0; i < needle.length; i += 1) {
    const character = needle[i] as string
    if (character === ' ') continue
    let hit = -1
    for (let j = cursor; j < haystack.length; j += 1) {
      if (haystack[j] === character) {
        hit = j
        break
      }
    }
    if (hit < 0) return null
    if (firstHit < 0) firstHit = hit
    run = hit === cursor ? run + 1 : 1
    score += 10 + run * 6
    if (isPaletteWordBoundary(text, hit)) score += 12
    cursor = hit + 1
  }
  score -= firstHit * 2
  score -= Math.floor((haystack.length - needle.length) / 4)
  return score
}

type PaletteCandidate = { command: PaletteCommand; score: number; keywordOnly: boolean; index: number }

/**
 * Filters + ranks commands for a typed query.
 *
 * A command survives when the query is an ordered subsequence of its title, or of
 * one of its keywords. Title hits ALWAYS outrank keyword-only hits — that is the
 * only rule that cannot be expressed by the score alone, so it is an explicit
 * sort key rather than a magic penalty.
 *
 * An empty query returns every command in catalog order (the palette's default view).
 */
export function matchPaletteCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim()
  if (!needle) return [...commands]
  const candidates: PaletteCandidate[] = []
  commands.forEach((command, index) => {
    const titleScore = scorePaletteText(command.title, needle)
    if (titleScore !== null) {
      candidates.push({ command, score: titleScore, keywordOnly: false, index })
      return
    }
    let bestKeywordScore: number | null = null
    for (const keyword of command.keywords ?? []) {
      const keywordScore = scorePaletteText(keyword, needle)
      if (keywordScore === null) continue
      if (bestKeywordScore === null || keywordScore > bestKeywordScore) bestKeywordScore = keywordScore
    }
    if (bestKeywordScore !== null) {
      candidates.push({ command, score: bestKeywordScore, keywordOnly: true, index })
    }
  })
  candidates.sort((a, b) => (
    Number(a.keywordOnly) - Number(b.keywordOnly)
    || b.score - a.score
    || a.index - b.index
  ))
  return candidates.map((candidate) => candidate.command)
}

export type PaletteCommandSection = {
  group: PaletteCommandGroup
  label: string
  commands: PaletteCommand[]
}

/** Buckets commands into the fixed group order, dropping empty groups. */
export function groupPaletteCommands(commands: PaletteCommand[]): PaletteCommandSection[] {
  return PALETTE_GROUP_ORDER
    .map((group) => ({
      group,
      label: PALETTE_GROUP_LABELS[group],
      commands: commands.filter((command) => command.group === group),
    }))
    .filter((section) => section.commands.length > 0)
}
