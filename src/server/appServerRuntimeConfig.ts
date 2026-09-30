import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveCodexCommand } from '../commandResolution.js'
import { spawnSyncCommand } from '../utils/commandInvocation.js'

const SANDBOX_MODES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const)

const APPROVAL_POLICIES = new Set([
  'untrusted',
  'on-failure',
  'on-request',
  'never',
] as const)

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

type AppServerRuntimeConfig = {
  sandboxMode: CodexSandboxMode
  approvalPolicy: CodexApprovalPolicy
  memories: boolean
  /** 最终决策：是否给 app-server 追加 `features.instant_interrupt=true`。 */
  instantInterrupt: boolean
}

/**
 * `features.instant_interrupt` 是 codex-cli **0.159.0** 才认识的 key（round-106）。
 * 低版本 app-server 只是忽略它、照常启动，但会在 stderr 打一条
 * `Codex is ignoring ... features.instant_interrupt is ignored` 的 ERROR 并发一个
 * `configWarning` 通知（0.158.0 实测，round-108）。桥把 stderr 显式丢弃、configWarning
 * 也在 KNOWN_IGNORED_NOTIFICATION_METHODS 里是 no-op，所以用户看不见——但它会污染
 * dev 日志，且「传一个无效参数」本身就不诚实。所以只对 >= 0.159 的 CLI 追加。
 */
const INSTANT_INTERRUPT_MIN_VERSION = '0.159.0'

const DEFAULT_RUNTIME_CONFIG = {
  sandboxMode: 'danger-full-access' as CodexSandboxMode,
  approvalPolicy: 'never' as CodexApprovalPolicy,
  memories: true,
}

const APPROVAL_POLICY_LABELS: Record<CodexApprovalPolicy, string> = {
  untrusted: 'Only untrusted commands',
  'on-failure': 'After a command fails',
  'on-request': 'When Codex requests it',
  never: 'Never',
}

function normalizeRuntimeValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function readSandboxModeFromEnv(): CodexSandboxMode {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_SANDBOX_MODE)
  if (SANDBOX_MODES.has(candidate as CodexSandboxMode)) {
    return candidate as CodexSandboxMode
  }
  return DEFAULT_RUNTIME_CONFIG.sandboxMode
}

function readApprovalPolicyFromEnv(): CodexApprovalPolicy {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_APPROVAL_POLICY)
  if (APPROVAL_POLICIES.has(candidate as CodexApprovalPolicy)) {
    return candidate as CodexApprovalPolicy
  }
  const filePolicy = readApprovalPolicyFromConfigFileSync()
  if (filePolicy) return filePolicy
  return DEFAULT_RUNTIME_CONFIG.approvalPolicy
}

function getCodexHomeDir(): string {
  const codexHome = process.env.CODEX_HOME?.trim() ?? ''
  return codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
}

function readApprovalPolicyFromConfigFileSync(): CodexApprovalPolicy | null {
  try {
    const configPath = join(getCodexHomeDir(), 'config.toml')
    if (!existsSync(configPath)) return null
    const raw = readFileSync(configPath, 'utf8')
    const lines = raw.split(/\r?\n/u)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
      const match = /^approval_policy\s*=\s*"([^"]+)"/u.exec(trimmed)
      if (!match) continue
      const policy = parseApprovalPolicy(match[1] ?? '')
      if (policy) return policy
    }
    return null
  } catch {
    return null
  }
}

function readMemoriesFromEnv(): boolean {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_MEMORIES)
  if (candidate === 'false' || candidate === '0' || candidate === 'no') {
    return false
  }
  if (candidate === 'true' || candidate === '1' || candidate === 'yes') {
    return true
  }
  return DEFAULT_RUNTIME_CONFIG.memories
}

export function parseVersionTriple(value: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(value)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersionTriples(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number)
  }
  return 0
}

/**
 * 版本无法解析（探测失败、非 `x.y.z` 输出）时返回 **true**，即保持 round-106 的
 * 原行为：宁可在旧版本上打一条无害日志，也不要把「探不到版本」误判成「不支持」
 * 而静默关掉新版本用户的即时中断。
 */
export function codexCliSupportsInstantInterrupt(cliVersion: string | null): boolean {
  if (!cliVersion) return true
  const parsed = parseVersionTriple(cliVersion)
  const minimum = parseVersionTriple(INSTANT_INTERRUPT_MIN_VERSION)
  if (!parsed || !minimum) return true
  return compareVersionTriples(parsed, minimum) >= 0
}

let cachedCliVersionProbe: string | null | undefined

function probeCodexCliVersion(): string | null {
  try {
    const command = resolveCodexCommand()
    if (!command) return null
    // Explicit stdio array, not the `encoding`-implied default: on Windows the
    // default pipe + windowsHide combination fails with EBUSY in this repo's
    // environment, while ['ignore','pipe','pipe'] reads the same output fine.
    const result = spawnSyncCommand(command, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    })
    if (result.error || result.status !== 0) return null
    const output = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    return output || null
  } catch {
    return null
  }
}

/**
 * 进程级缓存：`codex --version` 只探一次（含失败，不重试），因为本模块的
 * 调用点都在 app-server 启动/配置比对路径上。
 */
export function readCodexCliVersion(): string | null {
  if (cachedCliVersionProbe === undefined) {
    cachedCliVersionProbe = probeCodexCliVersion()
  }
  return cachedCliVersionProbe
}

/**
 * 显式 opt-in/opt-out 的三态：`'true'` / `'false'` / `null`（未设置，交给版本门控）。
 * 显式设置时一定发送——`false` 也发，让 CLI 侧的 feature 状态是明确的，而不是靠默认值。
 */
function readExplicitInstantInterruptEnv(): 'true' | 'false' | null {
  const candidate = normalizeRuntimeValue(process.env.CODEXUI_INSTANT_INTERRUPT)
  if (candidate === 'false' || candidate === '0' || candidate === 'no') return 'false'
  if (candidate === 'true' || candidate === '1' || candidate === 'yes') return 'true'
  return null
}

function resolveInstantInterrupt(explicit: 'true' | 'false' | null, cliVersion: string | null): boolean {
  if (explicit) return explicit === 'true'
  return codexCliSupportsInstantInterrupt(cliVersion)
}

/**
 * `cliVersionOverride` 仅供测试注入：`undefined` 表示去探测本机 CLI，
 * `null` 表示「已探测但未知」。
 */
export function resolveAppServerRuntimeConfig(cliVersionOverride?: string | null): AppServerRuntimeConfig {
  const cliVersion = cliVersionOverride === undefined ? readCodexCliVersion() : cliVersionOverride
  return {
    sandboxMode: readSandboxModeFromEnv(),
    approvalPolicy: readApprovalPolicyFromEnv(),
    memories: readMemoriesFromEnv(),
    instantInterrupt: resolveInstantInterrupt(readExplicitInstantInterruptEnv(), cliVersion),
  }
}

export function buildAppServerArgs(options: { cliVersion?: string | null } = {}): string[] {
  const config = resolveAppServerRuntimeConfig(options.cliVersion)
  const args = [
    'app-server',
    '-c',
    `approval_policy="${config.approvalPolicy}"`,
    '-c',
    `sandbox_mode="${config.sandboxMode}"`,
    '-c',
    `features.memories=${config.memories ? 'true' : 'false'}`,
  ]
  // round-109：0.159 opt-in 特性——新输入到达时立即抢占模型响应，中断不再等流式
  // 优雅停止。未显式配置时按 CLI 版本门控：0.158 及更早根本不认识这个 key，传了
  // 只有一条 stderr ERROR（round-108 实测），所以老版本干脆不发。
  const explicit = readExplicitInstantInterruptEnv()
  if (explicit) {
    args.push('-c', `features.instant_interrupt=${explicit}`)
  } else if (config.instantInterrupt) {
    args.push('-c', 'features.instant_interrupt=true')
  }
  return args
}

export function parseSandboxMode(value: string): CodexSandboxMode | null {
  const candidate = value.trim().toLowerCase()
  return SANDBOX_MODES.has(candidate as CodexSandboxMode) ? candidate as CodexSandboxMode : null
}

export function parseApprovalPolicy(value: string): CodexApprovalPolicy | null {
  const candidate = value.trim().toLowerCase()
  return APPROVAL_POLICIES.has(candidate as CodexApprovalPolicy) ? candidate as CodexApprovalPolicy : null
}

export function approvalPolicyLabel(policy: CodexApprovalPolicy): string {
  return APPROVAL_POLICY_LABELS[policy] ?? policy
}

export function approvalPolicyOptions(): Array<{ value: CodexApprovalPolicy; label: string }> {
  return Array.from(APPROVAL_POLICIES).map((value) => ({
    value,
    label: APPROVAL_POLICY_LABELS[value] ?? value,
  }))
}
