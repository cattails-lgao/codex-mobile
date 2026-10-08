import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAppServerArgs,
  codexCliSupportsInstantInterrupt,
  collectModelProviderIds,
  parseVersionTriple,
  readUserConfiguredProviderIds,
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

  it('collects model_providers ids from every TOML shape a user config can use (round-122)', () => {
    const ids = collectModelProviderIds([
      // `model_provider` 是「选哪个」，不是「定义了哪个」——不得被当成 provider id。
      'model = "deepseek-flash"',
      'model_provider = "custom"',
      '',
      '[model_providers.custom]',
      'name = "litellm"',
      'base_url = "http://127.0.0.1:4460/v1"',
      '',
      '[model_providers."my.provider"]',
      'base_url = "http://example.test/v1"',
      '',
      '[model_providers.nested.child]',
      'base_url = "http://example.test/v2"',
      '',
      'model_providers.dotted.base_url = "http://example.test/v3"',
      '',
      '[profiles.work.model_providers.profiled]',
      'base_url = "http://example.test/v4"',
      '',
      '[model_providers]',
      'inline_table = { base_url = "http://example.test/v5" }',
    ].join('\n'))

    expect([...ids].sort()).toEqual([
      'custom', 'dotted', 'inline_table', 'my.provider', 'nested', 'profiled',
    ])
  })

  it('does not mistake comments, strings or unrelated tables for provider definitions', () => {
    const ids = collectModelProviderIds([
      '# [model_providers.commented_out]',
      'note = "see [model_providers.in_a_string]"',
      'block = """',
      '[model_providers.in_a_multiline_string]',
      '"""',
      '[hooks]',
      'model_providers = "not-a-table"',
      '[model_providers.custom]',
      'name = "litellm"   # trailing comment',
    ].join('\n'))

    expect([...ids]).toEqual(['custom'])
  })

  it('reads the provider ids actually defined in $CODEX_HOME/config.toml', () => {
    const home = mkdtempSync(join(tmpdir(), 'r122-providers-'))
    const previousHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = home
    try {
      // 文件不存在时是空集合，而不是抛错（调用方会照常注入兼容占位）。
      expect([...readUserConfiguredProviderIds()]).toEqual([])

      writeFileSync(
        join(home, 'config.toml'),
        'model_provider = "custom"\n\n[model_providers.custom]\nbase_url = "http://127.0.0.1:4460/v1"\n',
        'utf8',
      )
      expect([...readUserConfiguredProviderIds()]).toEqual(['custom'])

      // 内容变了缓存必须失效：桥的配置签名比对靠它决定是否重启 app-server。
      writeFileSync(join(home, 'config.toml'), '[model_providers.other]\nbase_url = "http://example.test/v1"\n', 'utf8')
      expect([...readUserConfiguredProviderIds()]).toEqual(['other'])
    } finally {
      if (previousHome === undefined) delete process.env.CODEX_HOME
      else process.env.CODEX_HOME = previousHome
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('parses a version triple out of decorated CLI output', () => {
    expect(parseVersionTriple('0.158.0')).toEqual([0, 158, 0])
    expect(parseVersionTriple('codex-cli 0.159.0')).toEqual([0, 159, 0])
    expect(parseVersionTriple('codex-cli 0.159.0 (build abc)')).toEqual([0, 159, 0])
    expect(parseVersionTriple('no version here')).toBeNull()
  })
})
