import { describe, expect, it } from 'vitest'
import { dedupeThreadGroupsById } from './threadGroups'
import type { UiProjectGroup, UiThread } from '../types/codex'

function thread(id: string, updatedAtIso: string, projectName = 'proj'): UiThread {
  return {
    id,
    title: id,
    projectName,
    cwd: `/workspace/${projectName}`,
    hasWorktree: false,
    createdAtIso: updatedAtIso,
    updatedAtIso,
    preview: '',
    unread: false,
    inProgress: false,
  }
}

function group(projectName: string, threads: UiThread[]): UiProjectGroup {
  return { projectName, threads }
}

describe('dedupeThreadGroupsById', () => {
  it('returns the same reference when no id repeats', () => {
    const groups = [group('proj', [thread('a', '2026-09-11T00:00:00.000Z'), thread('b', '2026-09-10T00:00:00.000Z')])]

    expect(dedupeThreadGroupsById(groups)).toBe(groups)
  })

  it('keeps the newest row per id and preserves its first-seen position', () => {
    const groups = [
      group('proj', [
        thread('dup', '2026-09-08T00:00:00.000Z'),
        thread('other', '2026-09-09T00:00:00.000Z'),
        thread('dup', '2026-09-11T00:00:00.000Z'),
      ]),
    ]

    const deduped = dedupeThreadGroupsById(groups)

    expect(deduped[0].threads.map((row) => row.id)).toEqual(['dup', 'other'])
    expect(deduped[0].threads[0].updatedAtIso).toBe('2026-09-11T00:00:00.000Z')
  })

  it('dedupes each project group independently and leaves clean groups untouched', () => {
    const cleanGroup = group('clean', [thread('x', '2026-09-11T00:00:00.000Z', 'clean')])
    const groups = [
      group('proj', [
        thread('dup', '2026-09-10T00:00:00.000Z'),
        thread('dup', '2026-09-11T00:00:00.000Z'),
      ]),
      cleanGroup,
    ]

    const deduped = dedupeThreadGroupsById(groups)

    expect(deduped[0].threads).toHaveLength(1)
    expect(deduped[0].threads[0].updatedAtIso).toBe('2026-09-11T00:00:00.000Z')
    expect(deduped[1]).toBe(cleanGroup)
  })

  it('falls back to the first row when the newer duplicate has an unparsable timestamp', () => {
    const groups = [
      group('proj', [
        thread('dup', '2026-09-11T00:00:00.000Z'),
        thread('dup', 'not-a-date'),
      ]),
    ]

    const deduped = dedupeThreadGroupsById(groups)

    expect(deduped[0].threads).toHaveLength(1)
    expect(deduped[0].threads[0].updatedAtIso).toBe('2026-09-11T00:00:00.000Z')
  })
})
