// Approval-policy slice, extracted from createCodexBridgeMiddleware.
// Resolves the effective Codex approval policy (env var authoritative, then
// config.toml, then 'never') and persists a policy back into config.toml as a
// top-level key. Pure module-level helpers; the /codex-api/approval-policy
// routes in the shell consume resolveEffectiveApprovalPolicy /
// writeApprovalPolicyToConfigFile.
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseApprovalPolicy, type CodexApprovalPolicy } from '../appServerRuntimeConfig.js'
import { getCodexHomeDir } from './core.js'

function getCodexConfigPath(): string {
  return join(getCodexHomeDir(), 'config.toml')
}

export async function resolveEffectiveApprovalPolicy(): Promise<CodexApprovalPolicy> {
  // The runtime env var is authoritative (it is what the app-server is
  // actually launched with), then the config file, then the default.
  const envPolicy = parseApprovalPolicy(process.env.CODEXUI_APPROVAL_POLICY ?? '')
  if (envPolicy) return envPolicy
  const filePolicy = readApprovalPolicyFromConfigFile()
  return filePolicy ?? 'never'
}

function readApprovalPolicyFromConfigFile(): CodexApprovalPolicy | null {
  try {
    if (!existsSync(getCodexConfigPath())) return null
    const raw = readFileSync(getCodexConfigPath(), 'utf8')
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

const APPROVAL_POLICY_ASSIGNMENT = /^approval_policy\s*=/u

export async function writeApprovalPolicyToConfigFile(policy: CodexApprovalPolicy): Promise<void> {
  const configPath = getCodexConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  const policyLine = `approval_policy = "${policy}"`
  if (!existsSync(configPath)) {
    await writeFile(configPath, `${policyLine}\n`, 'utf8')
    return
  }
  const raw = await readFile(configPath, 'utf8')
  // Drop every existing approval_policy assignment regardless of whitespace
  // around "=" (the previous writer only matched `approval_policy=` with no
  // spaces, so repeated saves appended duplicate keys and broke the TOML file).
  const kept = raw.split(/\r?\n/u).filter((line) => !APPROVAL_POLICY_ASSIGNMENT.test(line.trim()))
  // The key must stay top-level: any bare key written after a [table] header
  // would land inside that table, so put it at the very top of the file.
  const body = kept
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd()
  const nextContent = body.length > 0 ? `${policyLine}\n\n${body}\n` : `${policyLine}\n`
  await writeFile(configPath, nextContent, 'utf8')
}