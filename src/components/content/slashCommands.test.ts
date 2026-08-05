import { describe, expect, it } from 'vitest'
import {
  buildSkillSlashCommands,
  matchSlashCommands,
  parseSlashQuery,
  SLASH_COMMANDS,
  SLASH_MENTION_REGEX,
} from './slashCommands'

describe('parseSlashQuery', () => {
  it('matches a leading slash command token', () => {
    expect(parseSlashQuery('/comp')).toEqual({ query: 'comp', token: '/comp', startIndex: 0 })
  })

  it('matches a bare slash to show the full command list', () => {
    expect(parseSlashQuery('/')).toEqual({ query: '', token: '/', startIndex: 0 })
  })

  it('matches a bare slash after whitespace', () => {
    expect(parseSlashQuery('please /')).toEqual({ query: '', token: '/', startIndex: 7 })
  })

  it('matches a slash command after whitespace', () => {
    expect(parseSlashQuery('please /rev')).toEqual({ query: 'rev', token: '/rev', startIndex: 7 })
  })

  it('rejects a slash token in the middle of a word', () => {
    expect(parseSlashQuery('foo/bar')).toBeNull()
  })

  it('rejects a mention token', () => {
    expect(parseSlashQuery('@comp')).toBeNull()
  })

  it('lowercases the typed query', () => {
    expect(parseSlashQuery('/COMPACT')).toEqual({ query: 'compact', token: '/COMPACT', startIndex: 0 })
  })

  it('matches against the regex directly for multiline safety', () => {
    expect('line one\n/init'.match(SLASH_MENTION_REGEX)).not.toBeNull()
    expect('/nope foo'.match(SLASH_MENTION_REGEX)).toBeNull()
  })
})

describe('matchSlashCommands', () => {
  it('returns every command for an empty query', () => {
    expect(matchSlashCommands(SLASH_COMMANDS, '')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('prefix-matches commands', () => {
    const matches = matchSlashCommands(SLASH_COMMANDS, 'comp')
    expect(matches.map((command) => command.id)).toEqual(['compact'])
  })

  it('returns multiple prefix matches in catalog order', () => {
    const matches = matchSlashCommands(SLASH_COMMANDS, 'c')
    expect(matches.map((command) => command.id)).toEqual(['compact', 'clear'])
  })

  it('prefers an exact match over prefix matches', () => {
    const matches = matchSlashCommands(SLASH_COMMANDS, 'new')
    expect(matches.map((command) => command.id)).toEqual(['new'])
  })

  it('returns no matches for an unknown prefix', () => {
    expect(matchSlashCommands(SLASH_COMMANDS, 'zzz')).toEqual([])
  })
})

describe('SLASH_COMMANDS catalog', () => {
  it('has unique command ids', () => {
    const ids = SLASH_COMMANDS.map((command) => command.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('requires insertText for text commands and forbids it elsewhere', () => {
    for (const command of SLASH_COMMANDS) {
      if (command.kind === 'text') {
        expect(command.insertText, `/${command.id} should expand to text`).toBeTruthy()
      } else {
        expect(command.insertText, `/${command.id} must not carry insertText`).toBeUndefined()
      }
    }
  })

  it('does not list TUI-only commands', () => {
    const ids = SLASH_COMMANDS.map((command) => command.id)
    for (const tuiOnly of ['quit', 'theme', 'keymap', 'vim', 'statusline', 'pets']) {
      expect(ids).not.toContain(tuiOnly)
    }
  })

  it('marks builtin commands with the builtin group', () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.group).toBe('builtin')
    }
  })
})

describe('buildSkillSlashCommands', () => {
  it('builds a skill command per skill with normalized ids', () => {
    const commands = buildSkillSlashCommands([
      { name: 'Frontend Code Review', description: 'Review frontend code', path: 'c:/skills/frontend-code-review/SKILL.md' },
      { name: 'HTML Report', description: 'Create HTML reports', path: 'c:/skills/html-report/SKILL.md' },
    ])
    expect(commands.map((command) => command.id)).toEqual(['frontend-code-review', 'html-report'])
    for (const command of commands) {
      expect(command.kind).toBe('skill')
      expect(command.group).toBe('skill')
      expect(command.skillPath).toBeTruthy()
    }
  })

  it('deduplicates skills with the same normalized id', () => {
    const commands = buildSkillSlashCommands([
      { name: 'My Skill', path: 'a/SKILL.md' },
      { name: 'my-skill', path: 'b/SKILL.md' },
    ])
    expect(commands).toHaveLength(1)
  })

  it('matches skill commands through the shared matcher', () => {
    const commands = buildSkillSlashCommands([{ name: 'PDF', description: 'PDF tooling', path: 'c:/skills/pdf/SKILL.md' }])
    const matches = matchSlashCommands(commands, 'pdf')
    expect(matches.map((command) => command.id)).toEqual(['pdf'])
  })

  it('carries the full display name and falls back to the raw name', () => {
    const commands = buildSkillSlashCommands([
      { name: 'frontend-code-review', description: 'Review frontend code', path: 'a/SKILL.md', displayName: 'Frontend Code Review' },
      { name: 'HTML Report', description: 'Create HTML reports', path: 'b/SKILL.md' },
    ])
    expect(commands.map((command) => command.displayName)).toEqual(['Frontend Code Review', 'HTML Report'])
    for (const command of commands) {
      expect(command.id).toBeTruthy()
    }
  })
})
