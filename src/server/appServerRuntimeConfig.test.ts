import { describe, expect, it } from 'vitest'
import { buildAppServerArgs } from './appServerRuntimeConfig'

describe('app-server runtime config', () => {
  it('enables Codex memories by default for spawned app-server processes', () => {
    const args = buildAppServerArgs()
    const featureIndex = args.indexOf('features.memories=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable Codex memories through runtime configuration', () => {
    process.env.CODEXUI_MEMORIES = 'false'
    try {
      const args = buildAppServerArgs()
      const featureIndex = args.indexOf('features.memories=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.memories=true')
    } finally {
      delete process.env.CODEXUI_MEMORIES
    }
  })

  it('enables instant_interrupt by default for spawned app-server processes (round-106)', () => {
    const args = buildAppServerArgs()
    const featureIndex = args.indexOf('features.instant_interrupt=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable instant_interrupt through CODEXUI_INSTANT_INTERRUPT', () => {
    process.env.CODEXUI_INSTANT_INTERRUPT = 'false'
    try {
      const args = buildAppServerArgs()
      const featureIndex = args.indexOf('features.instant_interrupt=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.instant_interrupt=true')
    } finally {
      delete process.env.CODEXUI_INSTANT_INTERRUPT
    }
  })
})
