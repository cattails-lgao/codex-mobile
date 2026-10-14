// Keyboard shortcut catalog for the shortcuts help panel (round-151,
// desktop-parity batch 1 #3).
//
// Every entry was read off THIS project's source, not copied from the desktop
// app — the desktop app's 123 commands and its key bindings do not apply here:
//
//   global      -> App.vue `onWindowKeyDown` (the only window-level key handler)
//   composer    -> ThreadComposer.vue `onInputKeydown`
//   navigation  -> AppDialog.vue / ComposerPopover.vue / SidebarThreadTree.vue
//
// The catalog is display-only. Nothing here is parsed back into a binding, so it
// cannot drift into a second source of truth for what the app actually does —
// it is a transcription of the bindings, and when a binding changes this file
// has to change with it (that is what the round-151 contract assertion watches).

export type ShortcutGroupId = 'global' | 'composer' | 'navigation'

export type ShortcutEntry = {
  id: string
  /**
   * Keys pressed together, in display order. Tokens are abstract: `Mod` is the
   * platform command modifier, resolved per platform by `formatShortcutTokens`.
   * Everything else is a literal key name (`Enter`, `Esc`, `↑`, …).
   */
  keys: string[]
  /**
   * An equivalent alternative combo, rendered after a slash (`Enter / Tab`).
   * Used for bindings the source treats identically, e.g. the menus that accept
   * both `Enter` and `Tab`.
   */
  alsoKeys?: string[]
  /** i18n key — the English source string, resolved through useUiLanguage(). */
  label: string
  /** Optional i18n key clarifying when the shortcut applies. */
  note?: string
}

export type ShortcutGroup = {
  id: ShortcutGroupId
  /** i18n key. */
  label: string
  entries: ShortcutEntry[]
}

export const SHORTCUT_MODIFIER_TOKEN = 'Mod'

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'global',
    label: 'Global',
    entries: [
      { id: 'global.palette', keys: ['Mod', '/'], label: 'Open the command palette' },
      { id: 'global.sidebar', keys: ['Mod', 'B'], label: 'Toggle the sidebar' },
      { id: 'global.terminal', keys: ['Mod', 'J'], label: 'Toggle the terminal panel' },
      { id: 'global.dismiss', keys: ['Esc'], label: 'Close dialogs and popovers' },
    ],
  },
  {
    id: 'composer',
    label: 'Composer',
    entries: [
      {
        id: 'composer.send-enter',
        keys: ['Enter'],
        label: 'Send the message',
        note: 'When "send with Enter" is on',
      },
      {
        id: 'composer.send-mod-enter',
        keys: ['Mod', 'Enter'],
        label: 'Send the message',
        note: 'When "send with Enter" is off',
      },
      { id: 'composer.newline', keys: ['Shift', 'Enter'], label: 'Insert a line break' },
      { id: 'composer.slash', keys: ['/'], label: 'Open the slash command menu' },
      { id: 'composer.mention', keys: ['@'], label: 'Mention a file' },
      { id: 'composer.move', keys: ['↑'], alsoKeys: ['↓'], label: 'Move through the menu' },
      {
        id: 'composer.accept',
        keys: ['Enter'],
        alsoKeys: ['Tab'],
        label: 'Accept the highlighted suggestion',
      },
      { id: 'composer.dismiss', keys: ['Esc'], label: 'Dismiss the menu' },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    entries: [
      { id: 'navigation.move', keys: ['↑'], alsoKeys: ['↓'], label: 'Move the selection' },
      {
        id: 'navigation.activate',
        keys: ['Enter'],
        alsoKeys: ['Space'],
        label: 'Activate the focused item',
      },
      {
        id: 'navigation.ends',
        keys: ['Home'],
        alsoKeys: ['End'],
        label: 'Jump to the first or last item',
      },
    ],
  },
]

/**
 * Maps abstract tokens to what the given platform prints on a key cap.
 * macOS gets the glyph forms (`⌘`, `⇧`); everything else gets the spelled-out
 * names, which is what those keyboards actually show.
 */
export function formatShortcutTokens(keys: string[], isMac: boolean): string[] {
  return keys.map((key) => {
    if (key === SHORTCUT_MODIFIER_TOKEN) return isMac ? '⌘' : 'Ctrl'
    if (isMac && key === 'Shift') return '⇧'
    return key
  })
}

/**
 * Renders one combo. macOS concatenates glyphs with no separator (`⌘B`), while
 * spelled-out names need one (`Ctrl + B`) or they read as a single word.
 */
export function formatShortcutCombo(keys: string[], isMac: boolean): string {
  return formatShortcutTokens(keys, isMac).join(isMac ? '' : ' + ')
}

/** Renders a primary combo plus its alternative, e.g. `Enter / Tab`. */
export function formatShortcutEntry(entry: ShortcutEntry, isMac: boolean): string {
  const combos = [formatShortcutCombo(entry.keys, isMac)]
  if (entry.alsoKeys && entry.alsoKeys.length > 0) {
    combos.push(formatShortcutCombo(entry.alsoKeys, isMac))
  }
  return combos.join(' / ')
}

/** Total number of catalogued shortcuts — used by the help panel header. */
export function countShortcuts(groups: ShortcutGroup[] = SHORTCUT_GROUPS): number {
  return groups.reduce((total, group) => total + group.entries.length, 0)
}
