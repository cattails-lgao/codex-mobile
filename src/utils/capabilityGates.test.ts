import { describe, expect, it } from 'vitest'

import { CAPABILITY_GATES, isCapabilitySupported } from './capabilityGates'

describe('capabilityGates', () => {
  it('每个门控都有非空且去重的方法清单', () => {
    for (const gate of Object.values(CAPABILITY_GATES)) {
      expect(gate.methods.length, gate.id).toBeGreaterThan(0)
      expect(new Set(gate.methods).size, gate.id).toBe(gate.methods.length)
      expect(gate.methods.every((m) => m.trim() === m && m.length > 0), gate.id).toBe(true)
    }
  })

  it('isCapabilitySupported：全部命中 ⇒ true', () => {
    const catalog = new Set(['hooks/list', 'thread/read'])
    expect(isCapabilitySupported(catalog, CAPABILITY_GATES.hooks)).toBe(true)
  })

  it('isCapabilitySupported：缺一个 ⇒ false', () => {
    const catalog = new Set(['remoteControl/status/read', 'remoteControl/enable'])
    expect(isCapabilitySupported(catalog, CAPABILITY_GATES.remoteControl)).toBe(false)
  })

  it('isCapabilitySupported：空目录 ⇒ false', () => {
    expect(isCapabilitySupported(new Set(), CAPABILITY_GATES.apps)).toBe(false)
  })

  it('isCapabilitySupported：多方法门控全中 ⇒ true（plugins 四件套）', () => {
    const catalog = new Set(CAPABILITY_GATES.plugins.methods)
    expect(isCapabilitySupported(catalog, CAPABILITY_GATES.plugins)).toBe(true)
  })

  it('门控 id 与键名一致（防止两处漂移）', () => {
    for (const [key, gate] of Object.entries(CAPABILITY_GATES)) {
      expect(gate.id).toBe(key)
    }
  })
})
