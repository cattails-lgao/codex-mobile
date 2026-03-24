import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'

const WINDOWS_CMD_NAMES = new Set(['codex', 'npm', 'npx'])

function quoteCmdExeArg(value: string): string {
  const normalized = value.replace(/"/g, '""')
  if (!/[\s"]/u.test(normalized)) {
    return normalized
  }
  return `"${normalized}"`
}

function needsCmdExeWrapper(command: string): boolean {
  if (process.platform !== 'win32') {
    return false
  }

  const lowerCommand = command.toLowerCase()
  const baseName = basename(lowerCommand)
  if (/\.(cmd|bat)$/i.test(baseName)) {
    return true
  }

  if (extname(baseName)) {
    return false
  }

  return WINDOWS_CMD_NAMES.has(baseName)
}

export function getSpawnInvocation(command: string, args: string[] = []): { command: string; args: string[] } {
  if (needsCmdExeWrapper(command)) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', [quoteCmdExeArg(command), ...args.map((arg) => quoteCmdExeArg(arg))].join(' ')],
    }
  }

  return { command, args }
}

export function spawnSyncCommand(
  command: string,
  args: string[] = [],
  options: Parameters<typeof spawnSync>[2] = {},
) {
  const invocation = getSpawnInvocation(command, args)
  return spawnSync(invocation.command, invocation.args, options)
}

export function canRunCommand(command: string, args: string[] = []): boolean {
  const result = spawnSyncCommand(command, args, { stdio: 'ignore' })
  return result.status === 0
}

export function getUserNpmPrefix(): string {
  return join(homedir(), '.npm-global')
}

export function resolveCodexCommand(): string | null {
  if (canRunCommand('codex', ['--version'])) {
    return 'codex'
  }

  if (process.platform === 'win32') {
    const windowsCandidates = [
      process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'codex.cmd') : '',
      join(homedir(), '.local', 'bin', 'codex.cmd'),
      join(getUserNpmPrefix(), 'bin', 'codex.cmd'),
    ].filter(Boolean)

    for (const candidate of windowsCandidates) {
      if (existsSync(candidate) && canRunCommand(candidate, ['--version'])) {
        return candidate
      }
    }
  }

  const userCandidate = join(getUserNpmPrefix(), 'bin', 'codex')
  if (existsSync(userCandidate) && canRunCommand(userCandidate, ['--version'])) {
    return userCandidate
  }

  const prefix = process.env.PREFIX?.trim()
  if (!prefix) {
    return null
  }

  const candidate = join(prefix, 'bin', 'codex')
  if (existsSync(candidate) && canRunCommand(candidate, ['--version'])) {
    return candidate
  }

  return null
}
