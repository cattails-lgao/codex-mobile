import { describe, expect, it } from 'vitest'
import { isModelSwitchMessage } from './modelSwitchMessages'
import type { UiMessage } from '../types/codex'

function rawMessage(overrides: Partial<UiMessage>): UiMessage {
  return { id: 'm1', role: 'system', text: '', ...overrides }
}

describe('isModelSwitchMessage', () => {
  it('detects a modelSwitch marker', () => {
    const marker = rawMessage({ messageType: 'modelSwitch', modelSwitchFrom: 'a', modelSwitchTo: 'b' })
    expect(isModelSwitchMessage(marker)).toBe(true)
  })

  it('does not flag other system message types', () => {
    expect(isModelSwitchMessage(rawMessage({ messageType: 'compaction.done' }))).toBe(false)
    expect(isModelSwitchMessage(rawMessage({ messageType: 'agentMessage' }))).toBe(false)
    expect(isModelSwitchMessage(rawMessage({}))).toBe(false)
  })
})