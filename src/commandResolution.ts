import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { spawnSyncCommand } from './utils/commandInvocation.js'

const require = createRequire(import.meta.url)

export type CommandInvocation = {
  command: string
  args: string[]
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const unique: string[] = []
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || unique.includes(normalized)) continue
    unique.push(normalized)
  }
  return unique
}

function isPathLike(command: string): boolean {
  return command.includes('/') || command.includes('\\') || /^[a-zA-Z]:/.test(command)
}

function isRunnableCommand(command: string, args: string[] = []): boolean {
  if (isPathLike(command) && !existsSync(command)) {
    return false
  }
  return canRunCommand(command, args)
}

function getWindowsAppDataNpmPrefix(): string | null {
  const appData = process.env.APPDATA?.trim()
  return appData ? join(appData, 'npm') : null
}

function getPotentialNpmPrefixes(): string[] {
  return uniqueStrings([
    process.env.npm_config_prefix,
    process.env.PREFIX,
    getUserNpmPrefix(),
    process.platform === 'win32' ? getWindowsAppDataNpmPrefix() : null,
  ])
}

function getPotentialCodexPackageDirs(prefix: string): string[] {
  const dirs = [join(prefix, 'node_modules', '@openai', 'codex')]
  if (process.platform !== 'win32') {
    dirs.push(join(prefix, 'lib', 'node_modules', '@openai', 'codex'))
  }
  return dirs
}

function getPotentialCodexExecutables(prefix: string): string[] {
  return getPotentialCodexPackageDirs(prefix).flatMap((packageDir) => {
    const candidates: string[] = []
    if (process.platform === 'win32') {
      candidates.push(
        join(packageDir, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe'),
        // Current @openai/codex layout: the binary lives directly under vendor/.
        join(packageDir, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
      )
    } else {
      candidates.push(join(packageDir, 'bin', 'codex'))
    }
    return candidates
  })
}

function getPotentialRipgrepExecutables(prefix: string): string[] {
  return getPotentialCodexPackageDirs(prefix).map((packageDir) => (
    process.platform === 'win32'
      ? join(
          packageDir,
          'node_modules',
          '@openai',
          'codex-win32-x64',
          'vendor',
          'x86_64-pc-windows-msvc',
          'path',
          'rg.exe',
        )
      : join(packageDir, 'bin', 'rg')
  ))
}

export function canRunCommand(command: string, args: string[] = []): boolean {
  // Route through the cmd.exe wrapper so Windows .cmd/.bat shims (pnpm/npm
  // global bins like codex.CMD) can be probed on Node >=20.12, which rejects
  // spawning them directly with EINVAL.
  const result = spawnSyncCommand(command, args, {
    stdio: 'ignore',
    windowsHide: true,
  })
  return !result.error && result.status === 0
}

export function getUserNpmPrefix(): string {
  return join(homedir(), '.npm-global')
}

export function getNpmGlobalBinDir(prefix: string): string {
  return process.platform === 'win32' ? prefix : join(prefix, 'bin')
}

export function prependPathEntry(existingPath: string, entry: string): string {
  const normalizedEntry = entry.trim()
  if (!normalizedEntry) return existingPath

  const parts = existingPath
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean)

  if (parts.includes(normalizedEntry)) {
    return existingPath
  }

  return existingPath ? `${normalizedEntry}${delimiter}${existingPath}` : normalizedEntry
}

const WINDOWS_CODEX_EXE_LAYOUTS = [
  'vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe',
  'node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe',
]

function findCodexShimPaths(): string[] {
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const names = exts.map((ext) => 'codex' + ext)
  const found: string[] = []
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const trimmed = dir.trim()
    if (!trimmed) continue
    for (const name of names) {
      const candidate = join(trimmed, name)
      if (existsSync(candidate)) {
        found.push(candidate)
        break
      }
    }
  }
  return found
}

function extractCodexPackageDir(shimContent: string, shimPath: string): string | null {
  const match = shimContent.match(/([^"'\r\n]*node_modules[\\/]@openai[\\/]codex)/i)
  if (!match) return null
  let rawPath = match[1]
  // npm/pnpm shims use `%~dp0\` (npm legacy `%dp0%`); the trailing `%` is optional.
  // Replace only the `%dp0` token and keep the following `\` separator.
  rawPath = rawPath.replace(/%(~?)dp0%?/gi, dirname(shimPath))
  const normalized = rawPath.replace(/[\\/]/g, '\\')
  const markerPath = 'node_modules\\@openai\\codex'
  const markerIndex = normalized.toLowerCase().indexOf(markerPath.toLowerCase())
  if (markerIndex === -1) return null
  const packageDir = normalized.slice(0, markerIndex) + markerPath
  return existsSync(packageDir) ? packageDir : null
}

function getWindowsCodexTargetTriple(): string {
  return process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
}

/**
 * On Windows the bare `codex` on PATH is usually a .cmd/.bat shim (npm/pnpm
 * global bin). Spawning those through cmd.exe corrupts arguments that contain
 * both quotes and spaces (e.g. -c model_providers.*="OpenCode Zen"), so the
 * app-server dies at startup. Resolve the real codex.exe and run it directly
 * instead.
 */
function resolveWindowsRealCodexExecutable(): string | null {
  for (const shimPath of findCodexShimPaths()) {
    if (/\.exe$/i.test(shimPath)) {
      return shimPath
    }
    if (!/\.(cmd|bat)$/i.test(shimPath)) continue
    let packageDir: string | null = null
    try {
      packageDir = extractCodexPackageDir(readFileSync(shimPath, 'utf8'), shimPath)
    } catch {
      packageDir = null
    }
    if (!packageDir) continue
    for (const layout of WINDOWS_CODEX_EXE_LAYOUTS) {
      const candidate = join(packageDir, layout)
      if (isRunnableCommand(candidate, ['--version'])) {
        return candidate
      }
    }
    // Modern @openai/codex ships a JS launcher whose native binary lives in
    // the platform optional dependency (@openai/codex-win32-x64). Resolve it
    // the same way the launcher does: from the real (symlink-resolved) package
    // dir, which for pnpm points into the store where the platform package is
    // a sibling.
    try {
      const realDir = realpathSync(packageDir)
      const platformPackage = process.arch === 'arm64' ? '@openai/codex-win32-arm64' : '@openai/codex-win32-x64'
      const platformPackageJson = require.resolve(`${platformPackage}/package.json`, { paths: [realDir] })
      const candidate = join(dirname(platformPackageJson), 'vendor', getWindowsCodexTargetTriple(), 'bin', 'codex.exe')
      if (isRunnableCommand(candidate, ['--version'])) {
        return candidate
      }
    } catch {
      // Not a JS-launcher layout; keep probing other shims.
    }
  }
  return null
}

export function resolveCodexCommand(): string | null {
  const explicit = process.env.CODEXUI_CODEX_COMMAND?.trim()
  const packageCandidates = getPotentialNpmPrefixes().flatMap(getPotentialCodexExecutables)
  const shimRealExe = process.platform === 'win32' ? resolveWindowsRealCodexExecutable() : null
  const fallbackCandidates = process.platform === 'win32'
    ? [shimRealExe, ...packageCandidates, 'codex']
    : ['codex', ...packageCandidates]

  for (const candidate of uniqueStrings([explicit, ...fallbackCandidates])) {
    if (candidate && isRunnableCommand(candidate, ['--version'])) {
      return candidate
    }
  }

  return null
}

export function resolveRipgrepCommand(): string | null {
  const explicit = process.env.CODEXUI_RG_COMMAND?.trim()
  const packageCandidates = getPotentialNpmPrefixes().flatMap(getPotentialRipgrepExecutables)
  const fallbackCandidates = process.platform === 'win32'
    ? [...packageCandidates, 'rg']
    : ['rg', ...packageCandidates]

  for (const candidate of uniqueStrings([explicit, ...fallbackCandidates])) {
    if (isRunnableCommand(candidate, ['--version'])) {
      return candidate
    }
  }

  return null
}

export function resolvePythonCommand(): CommandInvocation | null {
  const candidates: CommandInvocation[] = process.platform === 'win32'
    ? [
        { command: 'python', args: [] },
        { command: 'py', args: ['-3'] },
        { command: 'python3', args: [] },
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] },
      ]

  for (const candidate of candidates) {
    if (isRunnableCommand(candidate.command, [...candidate.args, '--version'])) {
      return candidate
    }
  }

  return null
}

export function resolveSkillInstallerScriptPath(codexHome?: string): string | null {
  const normalizedCodexHome = codexHome?.trim()
  const candidates = uniqueStrings([
    normalizedCodexHome
      ? join(normalizedCodexHome, 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py')
      : null,
    process.env.CODEX_HOME?.trim()
      ? join(process.env.CODEX_HOME.trim(), 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py')
      : null,
    join(homedir(), '.codex', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
    join(homedir(), '.cursor', 'skills', '.system', 'skill-installer', 'scripts', 'install-skill-from-github.py'),
  ])

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
