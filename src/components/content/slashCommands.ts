// Slash command catalog for the composer input. The command set mirrors the
// official Codex TUI command names so users do not need to learn two vocabularies.
// Only commands with a concrete codex-mobile action are listed; TUI-only commands
// (/quit, /theme, /keymap, ...) are intentionally omitted to avoid misleading rows.

export type SlashCommandKind = 'rpc' | 'text' | 'local' | 'skill'

export type SlashCommandGroup = 'builtin' | 'skill'

export type SlashCommand = {
  id: string
  description: string
  kind: SlashCommandKind
  /** Text to replace the command token with when kind === 'text'. */
  insertText?: string
  /** Group used for sectioned rendering in the slash menu. */
  group?: SlashCommandGroup
  /** Skill path when kind === 'skill'; used to attach the skill to the message. */
  skillPath?: string
  /** Full display name when kind === 'skill' and it differs from the normalized id. */
  displayName?: string
}

export const SLASH_MENTION_REGEX = /(^|\s)(\/[a-zA-Z]*)$/

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'compact', description: 'Compact the current thread context', kind: 'rpc', group: 'builtin' },
  { id: 'review', description: 'Open the code review pane', kind: 'rpc', group: 'builtin' },
  { id: 'rename', description: 'Rename the current thread', kind: 'rpc', group: 'builtin' },
  { id: 'archive', description: 'Archive the current thread', kind: 'rpc', group: 'builtin' },
  { id: 'fork', description: 'Fork the current thread', kind: 'rpc', group: 'builtin' },
  { id: 'new', description: 'Start a new thread', kind: 'rpc', group: 'builtin' },
  { id: 'skills', description: 'Open the skills page', kind: 'rpc', group: 'builtin' },
  {
    id: 'init',
    description: 'Generate or update AGENTS.md',
    kind: 'text',
    group: 'builtin',
    insertText:
      'Create or update the AGENTS.md file for this project: include an overview, architecture notes, development conventions, and a workflow guide based on the codebase.',
  },
  {
    id: 'help',
    description: 'Show help about Codex',
    kind: 'text',
    group: 'builtin',
    insertText: 'How do I use Codex? Point me to the official documentation and explain the available commands.',
  },
  {
    id: 'mention',
    description: 'Mention files with @',
    kind: 'text',
    group: 'builtin',
    insertText: 'Please review the files I mention with @, starting with: ',
  },
  {
    id: 'diff',
    description: 'Show the current git diff',
    kind: 'text',
    group: 'builtin',
    insertText: 'Show the current git diff of this project and summarize the changes.',
  },
  { id: 'clear', description: 'Clear the input', kind: 'local', group: 'builtin' },
]

/** Builds skill slash commands from the installed skill list. */
export function buildSkillSlashCommands(skills: Array<{ name: string; description?: string; path: string; displayName?: string }>): SlashCommand[] {
  const commands: SlashCommand[] = []
  const seen = new Set<string>()
  for (const skill of skills) {
    const id = skill.name.trim().replace(/^\//u, '').toLowerCase().replace(/\s+/gu, '-')
    if (!id || seen.has(id)) continue
    seen.add(id)
    commands.push({
      id,
      description: skill.description?.trim() || 'Run this skill',
      kind: 'skill',
      group: 'skill',
      skillPath: skill.path,
      displayName: skill.displayName?.trim() || skill.name.trim(),
    })
  }
  return commands.sort((a, b) => a.id.localeCompare(b.id))
}

/** Parses the text before the cursor for a slash command token, e.g. "/comp". */
export function parseSlashQuery(beforeCursor: string): { query: string; token: string; startIndex: number } | null {
  const match = beforeCursor.match(SLASH_MENTION_REGEX)
  if (!match) return null
  const token = match[2] ?? ''
  return {
    query: token.slice(1).toLowerCase(),
    token,
    startIndex: beforeCursor.length - token.length,
  }
}

/** Prefix-matches commands against the typed query; exact match wins. */
export function matchSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return commands
  const exact = commands.filter((command) => command.id === normalized)
  if (exact.length > 0) return exact
  return commands.filter((command) => command.id.startsWith(normalized))
}
