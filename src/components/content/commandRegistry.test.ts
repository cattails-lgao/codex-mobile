import { describe, expect, it } from 'vitest'
import {
  groupPaletteCommands,
  isPaletteWordBoundary,
  matchPaletteCommands,
  PALETTE_COMMANDS,
  PALETTE_GROUP_LABELS,
  PALETTE_GROUP_ORDER,
  scorePaletteText,
  type PaletteCommand,
} from './commandRegistry'

/** Non-null score, so ordering assertions fail loudly instead of comparing null. */
function score(text: string, query: string): number {
  const value = scorePaletteText(text, query)
  if (value === null) throw new Error(`expected a match: ${JSON.stringify(query)} against ${JSON.stringify(text)}`)
  return value
}

describe('isPaletteWordBoundary', () => {
  it('treats the first character as a word start', () => {
    expect(isPaletteWordBoundary('Open the Git panel', 0)).toBe(true)
  })

  it('treats a character after a separator as a word start', () => {
    expect(isPaletteWordBoundary('Open the Git panel', 5)).toBe(true)
  })

  it('rejects a character inside a word', () => {
    expect(isPaletteWordBoundary('Open the Git panel', 3)).toBe(false)
  })
})

describe('scorePaletteText', () => {
  it('returns zero for an empty query', () => {
    expect(scorePaletteText('anything', '')).toBe(0)
    expect(scorePaletteText('anything', '   ')).toBe(0)
  })

  it('returns null when the query is not an ordered subsequence', () => {
    expect(scorePaletteText('Archive', 'az')).toBeNull()
    expect(scorePaletteText('', 'a')).toBeNull()
  })

  it('accepts a non-contiguous ordered subsequence', () => {
    expect(scorePaletteText('Compact the current thread context', 'ctt')).not.toBeNull()
  })

  it('rejects an out-of-order subsequence', () => {
    expect(scorePaletteText('ab', 'ba')).toBeNull()
  })

  it('is case insensitive', () => {
    expect(scorePaletteText('Open the Git panel', 'git')).toBe(scorePaletteText('Open the Git panel', 'GIT'))
  })

  it('ignores whitespace inside the query', () => {
    expect(scorePaletteText('Open the Git panel', 'git panel')).toBe(scorePaletteText('Open the Git panel', 'gitpanel'))
  })

  // The two properties below are the whole reason this scorer exists: prefix and
  // word-start hits must float to the top, otherwise typing the first letters of a
  // command buries it under unrelated substring matches.
  it('scores an early match above a late one', () => {
    expect(score('Alpha', 'a')).toBeGreaterThan(score('Beta alpha', 'a'))
  })

  it('scores a contiguous run above a scattered one', () => {
    expect(score('Rename the current thread', 're')).toBeGreaterThan(score('Search threads', 're'))
  })

  it('rewards a word-start hit', () => {
    // 'a' starts the second word in both strings; the only difference is position.
    expect(score('Toggle a', 'a')).toBeGreaterThan(score('Toggleba', 'a'))
  })
})

describe('matchPaletteCommands', () => {
  const commands: PaletteCommand[] = [
    { id: 'rename', title: 'Rename the current thread', group: 'thread' },
    { id: 'search', title: 'Search threads', group: 'view' },
    { id: 'recycle', title: 'Open the recycle bin', group: 'navigate', keywords: ['trash'] },
  ]

  it('returns every command, in catalog order, for an empty query', () => {
    expect(matchPaletteCommands(commands, '').map((command) => command.id)).toEqual(['rename', 'search', 'recycle'])
    expect(matchPaletteCommands(commands, '   ').map((command) => command.id)).toEqual(['rename', 'search', 'recycle'])
  })

  it('ranks a contiguous word-start hit above a scattered one', () => {
    // 'rename' wins on a contiguous run at index 0. 'recycle' beats 'search'
    // because its 'r'/'e' sit inside one word start, while 'search' scatters them
    // across "Search" and "threads" — that is the word-boundary weight doing its job.
    expect(matchPaletteCommands(commands, 're').map((command) => command.id)).toEqual(['rename', 'recycle', 'search'])
  })

  it('returns no matches for an unmatched query', () => {
    expect(matchPaletteCommands(commands, 'zzzz')).toEqual([])
  })

  it('falls back to keywords when the title does not match', () => {
    expect(matchPaletteCommands(commands, 'trash').map((command) => command.id)).toEqual(['recycle'])
  })

  it('keeps a keyword-only hit below a title hit even when it scores higher', () => {
    // Deliberately constructed so the keyword hit scores MORE than the title hit:
    // the long title pays the length penalty. If the sort ever relied on score
    // alone this assertion would flip, and typing a command's name would start
    // surfacing unrelated rows above it.
    const fixture: PaletteCommand[] = [
      { id: 'title-hit', title: 'Zebra report of everything', group: 'thread' },
      { id: 'keyword-hit', title: 'Nothing related here', group: 'thread', keywords: ['zebra'] },
    ]
    const titleScore = scorePaletteText('Zebra report of everything', 'zebra')
    const keywordScore = scorePaletteText('zebra', 'zebra')
    expect(titleScore).not.toBeNull()
    expect(keywordScore).not.toBeNull()
    expect(titleScore ?? 0).toBeLessThan(keywordScore ?? 0)
    expect(matchPaletteCommands(fixture, 'zebra').map((command) => command.id)).toEqual(['title-hit', 'keyword-hit'])
  })

  it('keeps catalog order among equally scored commands', () => {
    const tied: PaletteCommand[] = [
      { id: 'first', title: 'Open the Git panel', group: 'panel' },
      { id: 'second', title: 'Open the Git panel', group: 'panel' },
    ]
    expect(matchPaletteCommands(tied, 'open').map((command) => command.id)).toEqual(['first', 'second'])
  })
})

describe('PALETTE_COMMANDS catalog', () => {
  it('has unique command ids', () => {
    const ids = PALETTE_COMMANDS.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses only known groups and non-empty titles', () => {
    for (const command of PALETTE_COMMANDS) {
      expect(PALETTE_GROUP_ORDER, `${command.id} has an unknown group`).toContain(command.group)
      expect(command.title.trim(), `${command.id} needs a title`).not.toBe('')
    }
  })

  it('covers every group so no heading is dead', () => {
    const used = new Set(PALETTE_COMMANDS.map((command) => command.group))
    for (const group of PALETTE_GROUP_ORDER) {
      expect(used, `group ${group} has no commands`).toContain(group)
    }
  })

  it('declares shortcuts in the abstract Mod+X form', () => {
    for (const command of PALETTE_COMMANDS) {
      if (!command.shortcut) continue
      expect(command.shortcut, `${command.id} shortcut must start with Mod+`).toMatch(/^Mod\+/)
    }
  })

  it('recalls a command by its English and Chinese keywords', () => {
    expect(matchPaletteCommands(PALETTE_COMMANDS, 'trash').map((command) => command.id)).toEqual(['nav.recycle-bin'])
    expect(matchPaletteCommands(PALETTE_COMMANDS, '暗色').map((command) => command.id)).toEqual(['view.cycle-theme'])
  })

  it('flags thread-scoped commands but leaves "new thread" usable with nothing selected', () => {
    for (const command of PALETTE_COMMANDS) {
      if (!command.requiresThread) continue
      expect(command.group, `${command.id} is thread-scoped but not in the thread group`).toBe('thread')
    }
    const newThread = PALETTE_COMMANDS.find((command) => command.id === 'thread.new')
    expect(newThread).toBeDefined()
    expect(newThread?.requiresThread).toBeUndefined()
  })
})

describe('groupPaletteCommands', () => {
  it('buckets into the fixed group order and drops empty groups', () => {
    const sections = groupPaletteCommands([
      { id: 'nav.settings', title: 'Open settings', group: 'navigate' },
      { id: 'thread.new', title: 'Start a new thread', group: 'thread' },
    ])
    expect(sections.map((section) => section.group)).toEqual(['thread', 'navigate'])
    expect(sections.map((section) => section.label)).toEqual([PALETTE_GROUP_LABELS.thread, PALETTE_GROUP_LABELS.navigate])
  })

  it('returns no sections for an empty list', () => {
    expect(groupPaletteCommands([])).toEqual([])
  })

  it('returns every command of a full catalog exactly once', () => {
    const sections = groupPaletteCommands(PALETTE_COMMANDS)
    const flattened = sections.flatMap((section) => section.commands)
    expect(flattened).toHaveLength(PALETTE_COMMANDS.length)
    expect(new Set(flattened.map((command) => command.id)).size).toBe(PALETTE_COMMANDS.length)
  })
})
