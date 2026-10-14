import { describe, expect, it } from 'vitest'
import {
  SHORTCUT_GROUPS,
  SHORTCUT_MODIFIER_TOKEN,
  countShortcuts,
  formatShortcutCombo,
  formatShortcutEntry,
  formatShortcutTokens,
  type ShortcutEntry,
} from './keyboardShortcuts'

const entry = (keys: string[], alsoKeys?: string[]): ShortcutEntry => ({
  id: 'test',
  keys,
  ...(alsoKeys ? { alsoKeys } : {}),
  label: 'Test',
})

describe('formatShortcutTokens', () => {
  it('maps the modifier token to the platform glyph', () => {
    expect(formatShortcutTokens(['Mod', 'B'], true)).toEqual(['⌘', 'B'])
    expect(formatShortcutTokens(['Mod', 'B'], false)).toEqual(['Ctrl', 'B'])
  })

  it('maps Shift to a glyph on macOS only', () => {
    expect(formatShortcutTokens(['Shift', 'Enter'], true)).toEqual(['⇧', 'Enter'])
    expect(formatShortcutTokens(['Shift', 'Enter'], false)).toEqual(['Shift', 'Enter'])
  })

  it('leaves literal key names untouched', () => {
    expect(formatShortcutTokens(['Esc', '↑', '/'], true)).toEqual(['Esc', '↑', '/'])
    expect(formatShortcutTokens(['Esc', '↑', '/'], false)).toEqual(['Esc', '↑', '/'])
  })

  it('returns an empty list for an empty combo', () => {
    expect(formatShortcutTokens([], false)).toEqual([])
  })

  it('only treats the exact token as the modifier', () => {
    // Guards against a substring match sneaking in: 'Modifier' is not 'Mod'.
    expect(formatShortcutTokens(['Modifier'], true)).toEqual(['Modifier'])
  })
})

describe('formatShortcutCombo', () => {
  it('concatenates glyphs with no separator on macOS', () => {
    expect(formatShortcutCombo(['Mod', 'B'], true)).toBe('⌘B')
    expect(formatShortcutCombo(['Shift', 'Enter'], true)).toBe('⇧Enter')
  })

  it('separates spelled-out names on other platforms', () => {
    expect(formatShortcutCombo(['Mod', 'B'], false)).toBe('Ctrl + B')
    expect(formatShortcutCombo(['Shift', 'Enter'], false)).toBe('Shift + Enter')
  })

  it('renders a single key without a dangling separator', () => {
    expect(formatShortcutCombo(['Esc'], true)).toBe('Esc')
    expect(formatShortcutCombo(['Esc'], false)).toBe('Esc')
  })
})

describe('formatShortcutEntry', () => {
  it('omits the alternative slot when there is none', () => {
    expect(formatShortcutEntry(entry(['Mod', '/']), false)).toBe('Ctrl + /')
  })

  it('renders the alternative after a slash', () => {
    expect(formatShortcutEntry(entry(['Enter'], ['Tab']), false)).toBe('Enter / Tab')
    expect(formatShortcutEntry(entry(['↑'], ['↓']), true)).toBe('↑ / ↓')
  })

  it('treats an empty alternative as absent', () => {
    expect(formatShortcutEntry(entry(['Esc'], []), false)).toBe('Esc')
  })
})

describe('SHORTCUT_GROUPS catalog', () => {
  it('carries the three documented groups', () => {
    expect(SHORTCUT_GROUPS.map((group) => group.id)).toEqual(['global', 'composer', 'navigation'])
  })

  it('uses unique entry ids across every group', () => {
    const ids = SHORTCUT_GROUPS.flatMap((group) => group.entries.map((item) => item.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry keys and an i18n label', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.entries) {
        expect(item.keys.length, `${item.id} has no keys`).toBeGreaterThan(0)
        expect(item.label.length, `${item.id} has no label`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every entry key token non-empty', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.entries) {
        for (const key of [...item.keys, ...(item.alsoKeys ?? [])]) {
          expect(key.length, `${item.id} has an empty key token`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('counts the full catalog', () => {
    expect(countShortcuts()).toBe(
      SHORTCUT_GROUPS.reduce((total, group) => total + group.entries.length, 0),
    )
  })

  it('counts zero for an empty catalog', () => {
    expect(countShortcuts([])).toBe(0)
  })

  it('exposes the modifier token the renderer switches on', () => {
    expect(SHORTCUT_MODIFIER_TOKEN).toBe('Mod')
  })

  it('renders every catalogued shortcut without throwing', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.entries) {
        expect(formatShortcutEntry(item, true).length).toBeGreaterThan(0)
        expect(formatShortcutEntry(item, false).length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the documented global bindings exactly as App.vue implements them', () => {
    const globalEntries = SHORTCUT_GROUPS.find((group) => group.id === 'global')?.entries ?? []
    const combos = globalEntries.map((item) => formatShortcutCombo(item.keys, false))
    // If a binding changes in App.vue, this list is what has to change with it.
    expect(combos).toEqual(['Ctrl + /', 'Ctrl + B', 'Ctrl + J', 'Esc'])
  })
})
