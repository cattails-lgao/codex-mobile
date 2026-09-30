import { describe, expect, it } from 'vitest'
import {
  buildAppServerArgs,
  codexCliSupportsInstantInterrupt,
  parseVersionTriple,
} from './appServerRuntimeConfig'

/**
 * Runs `buildAppServerArgs` with a stubbed CLI version and env, so the unit
 * tests never spawn the real `codex --version`.
 */
function buildArgsWith(cliVersion: string | null, env?: string): string[] {
  const previous = process.env.CODEXUI_INSTANT_INTERRUPT
  if (env === undefined) delete process.env.CODEXUI_INSTANT_INTERRUPT
  else process.env.CODEXUI_INSTANT_INTERRUPT = env
  try {
    return buildAppServerArgs({ cliVersion })
  } finally {
    if (previous === undefined) delete process.env.CODEXUI_INSTANT_INTERRUPT
    else process.env.CODEXUI_INSTANT_INTERRUPT = previous
  }
}

describe('app-server runtime config', () => {
  it('enables Codex memories by default for spawned app-server processes', () => {
    const args = buildArgsWith(null)
    const featureIndex = args.indexOf('features.memories=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('can disable Codex memories through runtime configuration', () => {
    process.env.CODEXUI_MEMORIES = 'false'
    try {
      const args = buildArgsWith(null)
      const featureIndex = args.indexOf('features.memories=false')

      expect(featureIndex).toBeGreaterThan(0)
      expect(args[featureIndex - 1]).toBe('-c')
      expect(args).not.toContain('features.memories=true')
    } finally {
      delete process.env.CODEXUI_MEMORIES
    }
  })

  it('enables instant_interrupt for a 0.159+ CLI (round-106 feature)', () => {
    const args = buildArgsWith('0.159.0')
    const featureIndex = args.indexOf('features.instant_interrupt=true')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
  })

  it('omits instant_interrupt entirely on a 0.158 CLI, where it is only log noise (round-108/109)', () => {
    const hasArg = (args: string[]) => args.some((arg) => arg.startsWith('features.instant_interrupt'))

    // Not merely "not =true": the key is not sent at all, because an old
    // app-server logs an ERROR for any unknown `features.*` key it is given.
    expect(hasArg(buildArgsWith('0.158.0'))).toBe(false)
    expect(hasArg(buildArgsWith('0.157.3'))).toBe(false)
    expect(hasArg(buildArgsWith('codex-cli 0.158.0'))).toBe(false)
    // ...while the same decorated string on a 0.159 CLI still opts in.
    expect(hasArg(buildArgsWith('codex-cli 0.159.0'))).toBe(true)
  })

  it('keeps sending instant_interrupt when the CLI version is unknown', () => {
    // Probe failed / unparseable output must not be read as "unsupported":
    // that would silently drop the feature for a 0.159 user we cannot inspect.
    expect(buildArgsWith(null)).toContain('features.instant_interrupt=true')
    expect(buildArgsWith('unknown')).toContain('features.instant_interrupt=true')
  })

  it('can force instant_interrupt on an older CLI through CODEXUI_INSTANT_INTERRUPT=true', () => {
    expect(buildArgsWith('0.158.0', 'true')).toContain('features.instant_interrupt=true')
  })

  it('can disable instant_interrupt through CODEXUI_INSTANT_INTERRUPT', () => {
    const args = buildArgsWith('0.159.0', 'false')
    const featureIndex = args.indexOf('features.instant_interrupt=false')

    expect(featureIndex).toBeGreaterThan(0)
    expect(args[featureIndex - 1]).toBe('-c')
    expect(args).not.toContain('features.instant_interrupt=true')
  })

  it('compares version triples numerically, not as strings', () => {
    expect(codexCliSupportsInstantInterrupt('0.159.0')).toBe(true)
    expect(codexCliSupportsInstantInterrupt('0.159.1')).toBe(true)
    expect(codexCliSupportsInstantInterrupt('0.160.0')).toBe(true)
    expect(codexCliSupportsInstantInterrupt('1.0.0')).toBe(true)
    expect(codexCliSupportsInstantInterrupt('0.158.0')).toBe(false)
    expect(codexCliSupportsInstantInterrupt('0.99.0')).toBe(false)
    expect(codexCliSupportsInstantInterrupt(null)).toBe(true)
    expect(codexCliSupportsInstantInterrupt('')).toBe(true)
    expect(codexCliSupportsInstantInterrupt('dev')).toBe(true)
  })

  it('parses a version triple out of decorated CLI output', () => {
    expect(parseVersionTriple('0.158.0')).toEqual([0, 158, 0])
    expect(parseVersionTriple('codex-cli 0.159.0')).toEqual([0, 159, 0])
    expect(parseVersionTriple('codex-cli 0.159.0 (build abc)')).toEqual([0, 159, 0])
    expect(parseVersionTriple('no version here')).toBeNull()
  })
})
