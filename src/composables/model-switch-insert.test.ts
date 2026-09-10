import { describe, expect, it } from 'vitest'
import { insertModelSwitchMarkers } from './useDesktopState'
import type { UiMessage } from '../types/codex'

function realMessage(id: string): UiMessage {
  return { id, role: 'user', text: id }
}

function marker(id: string, insertAfterId?: string): UiMessage {
  return {
    id,
    role: 'system',
    text: '',
    messageType: 'modelSwitch',
    modelSwitchFrom: 'old',
    modelSwitchTo: 'new',
    ...(insertAfterId ? { modelSwitchInsertAfterId: insertAfterId } : {}),
  }
}

describe('insertModelSwitchMarkers', () => {
  const real = [realMessage('u1'), realMessage('u2'), realMessage('u3'), realMessage('u4')]

  it('returns the real messages unchanged when there are no markers', () => {
    expect(insertModelSwitchMarkers(real, [])).toEqual(real)
  })

  it('inserts a marker right after its anchored message instead of at the list end', () => {
    const out = insertModelSwitchMarkers(real, [marker('ms1', 'u2')])
    expect(out.map((m) => m.id)).toEqual(['u1', 'u2', 'ms1', 'u3', 'u4'])
  })

  it('attaches multiple markers in anchor order (latest new turn stays after the divider)', () => {
    const out = insertModelSwitchMarkers(real, [
      marker('old', 'u2'),
      marker('new', 'u4'),
    ])
    expect(out.map((m) => m.id)).toEqual(['u1', 'u2', 'old', 'u3', 'u4', 'new'])
  })

  it('appends a marker to the end when its anchor message is missing', () => {
    const out = insertModelSwitchMarkers(real, [marker('ms', 'missing')])
    expect(out.map((m) => m.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'ms'])
  })
})