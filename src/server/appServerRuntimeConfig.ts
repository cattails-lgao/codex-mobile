import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
}

const DEFAULT_RUNTIME_CONFIG: AppServerRuntimeConfig = {
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
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

export function resolveAppServerRuntimeConfig(): AppServerRuntimeConfig {
  return {
    sandboxMode: readSandboxModeFromEnv(),
    approvalPolicy: readApprovalPolicyFromEnv(),
    memories: readMemoriesFromEnv(),
  }
}

export function buildAppServerArgs(): string[] {
  const config = resolveAppServerRuntimeConfig()
  return [
    'app-server',
    '-c',
    `approval_policy="${config.approvalPolicy}"`,
    '-c',
    `sandbox_mode="${config.sandboxMode}"`,
    '-c',
    `features.memories=${config.memories ? 'true' : 'false'}`,
  ]
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
