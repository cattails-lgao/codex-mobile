import { describe, expect, it } from 'vitest'
import type { UiFileChange, UiMessage } from '../../types/codex'
import { createFileChangeSummaries, type FileChangeSummariesDeps } from './useFileChangeSummaries'

function change(path: string): UiFileChange {
  return { path, operation: 'update', diff: `${path} diff`, addedLineCount: 1, removedLineCount: 0 }
}

function depsFor(messages: UiMessage[], liveTurnId = ''): { deps: FileChangeSummariesDeps; setLiveTurnId: (id: string) => void } {
  let currentLiveTurnId = liveTurnId
  const deps: FileChangeSummariesDeps = {
    getMessages: () => messages,
    getLiveTurnId: () => currentLiveTurnId,
    isFileChangeMessage: (m) => m.messageType === 'fileChange' && m.fileChangeStatus === 'completed' && (m.fileChanges?.length ?? 0) > 0,
    isCopyableAssistantMessage: (m) => m.role === 'assistant',
    isReasoningMessage: (m) => m.messageType === 'reasoning',
    isPlanMessage: (m) => m.messageType === 'plan',
    isFoldMember: () => false,
    getHiddenGroupedCommandIds: () => new Set<string>(),
    isMobile: () => false,
  }
  return { deps, setLiveTurnId: (id: string) => { currentLiveTurnId = id } }
}

function assistant(id: string, turnIndex: number, turnId: string): UiMessage {
  return { id, role: 'assistant', messageType: 'message', text: `reply ${id}`, turnIndex, turnId } as UiMessage
}

function fileChangeMessage(id: string, turnIndex: number, turnId: string, path: string): UiMessage {
  return { id, messageType: 'fileChange', fileChangeStatus: 'completed', fileChanges: [change(path)], turnIndex, turnId } as UiMessage
}

describe('useFileChangeSummaries', () => {
  it('anchors aggregated file changes to the last substantive message of each turn', () => {
    const { deps } = depsFor([
      assistant('a1', 0, 't1'),
      fileChangeMessage('f1', 0, 't1', '/repo/x.ts'),
      assistant('a2', 1, 't2'),
      fileChangeMessage('f2', 1, 't2', '/repo/y.ts'),
    ])
    const summaries = createFileChangeSummaries(deps)

    expect(Object.keys(summaries.anchoredFileChangeSummaryByAnchorId.value).sort()).toEqual(['a1', 'a2'])
    const turn0 = summaries.anchoredFileChangeSummaryByAnchorId.value['a1']
    expect(turn0.source).toBe('metadata')
    expect(turn0.sourceMessageIds).toEqual(['f1'])
    expect(turn0.turnId).toBe('t1')
    expect(turn0.changes).toHaveLength(1)
  })

  it('falls back to standalone summaries for turns with no anchor candidate', () => {
    const { deps } = depsFor([fileChangeMessage('f1', 0, 't1', '/repo/x.ts')])
    const summaries = createFileChangeSummaries(deps)

    expect(Object.keys(summaries.anchoredFileChangeSummaryByAnchorId.value)).toHaveLength(0)
    expect(Object.keys(summaries.standaloneFileChangeSummaryByMessageId.value)).toEqual(['f1'])
  })

  it('collects anchored source messages into the hidden set', () => {
    const { deps } = depsFor([
      assistant('a1', 0, 't1'),
      fileChangeMessage('f1', 0, 't1', '/repo/x.ts'),
      assistant('a2', 1, 't2'),
      fileChangeMessage('f2', 1, 't2', '/repo/y.ts'),
    ])
    const summaries = createFileChangeSummaries(deps)

    expect(Object.keys(summaries.standaloneFileChangeSummaryByMessageId.value)).toHaveLength(0)
    expect([...summaries.hiddenFileChangeMessageIds.value].sort()).toEqual(['f1', 'f2'])
  })

  it('toggles expanded state per message', () => {
    const { deps } = depsFor([assistant('a1', 0, 't1')])
    const summaries = createFileChangeSummaries(deps)

    const message = assistant('a1', 0, 't1')
    expect(summaries.isFileChangeSummaryExpanded(message)).toBe(false)
    summaries.toggleFileChangeSummary(message)
    expect(summaries.isFileChangeSummaryExpanded(message)).toBe(true)
    summaries.toggleFileChangeSummary(message)
    expect(summaries.isFileChangeSummaryExpanded(message)).toBe(false)
  })

  it('hides a summary while its own turn is live', () => {
    const { deps, setLiveTurnId } = depsFor([])
    const summaries = createFileChangeSummaries(deps)
    const summary = { changes: [], sourceMessageIds: [], source: 'metadata' as const, turnId: 't1' }

    expect(summaries.isFileChangeSummaryVisible(summary)).toBe(true)
    setLiveTurnId('t1')
    expect(summaries.isFileChangeSummaryVisible(summary)).toBe(false)
  })

  it('opens and closes the diff viewer', () => {
    const { deps } = depsFor([])
    const summaries = createFileChangeSummaries(deps)
    const fileChange = change('/repo/x.ts')
    const summary = { changes: [fileChange], sourceMessageIds: [], source: 'metadata' as const, turnId: 't1' }

    summaries.openDiffViewer(summary, fileChange)
    expect(summaries.diffViewerChanges.value).toHaveLength(1)
    expect(summaries.activeDiffViewerChange.value?.path).toBe('/repo/x.ts')

    summaries.closeDiffViewer()
    expect(summaries.diffViewerChanges.value).toHaveLength(0)
    expect(summaries.activeDiffViewerChange.value).toBeNull()
  })
})