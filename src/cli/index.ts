import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Command } from 'commander'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'

const program = new Command()
  .name('codexui')
  .description('Web interface for Codex app-server')
  .option('-p, --port <port>', 'port to listen on', '3000')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .parse()

const opts = program.opts<{ port: string; password: string | boolean }>()
const port = parseInt(opts.port, 10)

function isTermuxRuntime(): boolean {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('/com.termux/'))
}

function canRun(command: string, args: string[] = []): boolean {
  const result = spawnSync(command, args, { stdio: 'ignore' })
  return result.status === 0
}

function runOrFail(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status ?? -1)}`)
  }
}

function hasCodexAuth(): boolean {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  return existsSync(join(codexHome, 'auth.json'))
}

function resolveCodexCommand(): string | null {
  if (canRun('codex', ['--version'])) {
    return 'codex'
  }
  const prefix = process.env.PREFIX?.trim()
  if (!prefix) {
    return null
  }
  const candidate = join(prefix, 'bin', 'codex')
  if (existsSync(candidate) && canRun(candidate, ['--version'])) {
    return candidate
  }
  return null
}

function bootstrapTermuxCodex(): void {
  if (!isTermuxRuntime()) {
    return
  }

  if (!canRun('git', ['--version'])) {
    console.log('\nGit not found. Installing git in Termux...\n')
    runOrFail('pkg', ['install', '-y', 'git'], 'Termux git install')
  }

  let codexCommand = resolveCodexCommand()
  if (!codexCommand) {
    console.log('\nCodex CLI not found. Installing Termux-compatible Codex CLI...\n')
    runOrFail('npm', ['install', '-g', 'git+https://github.com/DioNanos/codex-termux.git'], 'Codex CLI install')
    codexCommand = resolveCodexCommand()
    if (!codexCommand) {
      console.log('\nGitHub dependency installed, but `codex` binary was not found. Installing npm fallback...\n')
      runOrFail('npm', ['install', '-g', '@mmmbuto/codex-cli-termux'], 'Codex CLI fallback install')
      codexCommand = resolveCodexCommand()
    }
    if (!codexCommand) {
      console.log('\nTermux npm fallback did not expose `codex`. Installing official CLI fallback...\n')
      runOrFail('npm', ['install', '-g', '@openai/codex'], 'Codex CLI official fallback install')
      codexCommand = resolveCodexCommand()
    }
    if (!codexCommand) {
      throw new Error('Codex CLI install completed but binary is still not available in PATH')
    }
    console.log('\nCodex CLI installed.\n')
  }

  if (!hasCodexAuth()) {
    console.log('\nCodex is not logged in. Starting `codex login`...\n')
    runOrFail(codexCommand, ['login'], 'Codex login')
  }
}

function resolvePassword(input: string | boolean): string | undefined {
  if (input === false) {
    return undefined
  }
  if (typeof input === 'string') {
    return input
  }
  return generatePassword()
}

async function main() {
  bootstrapTermuxCodex()
  const password = resolvePassword(opts.password)
  const { app, dispose } = createApp({ password })
  const server = createServer(app)

  server.listen(port, () => {
    const lines = [
      '',
      'Codex Web Local is running!',
      '',
      `  Local:    http://localhost:${String(port)}`,
    ]

    if (password) {
      lines.push(`  Password: ${password}`)
    }

    if (isTermuxRuntime()) {
      lines.push('')
      lines.push('  Android/Termux keep-alive:')
      lines.push('  1) Keep this Termux session open (do not swipe it away).')
      lines.push('  2) Disable battery optimization for Termux in Android settings.')
      lines.push('  3) Optional: run `termux-wake-lock` in another shell.')
    }

    lines.push('')
    console.log(lines.join('\n'))
  })

  function shutdown() {
    console.log('\nShutting down...')
    server.close(() => {
      dispose()
      process.exit(0)
    })
    // Force exit after timeout
    setTimeout(() => {
      dispose()
      process.exit(1)
    }, 5000).unref()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nFailed to start codexui: ${message}`)
  process.exit(1)
})
