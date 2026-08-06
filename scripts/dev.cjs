const { execFileSync, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function isAndroidRuntime() {
  if (process.platform === 'android') return true
  if (process.env.TERMUX_VERSION) return true
  if (process.env.PREFIX?.includes('/com.termux/')) return true
  if (existsSync('/system/build.prop')) return true
  try {
    return execFileSync('uname', ['-r'], { encoding: 'utf8' }).toLowerCase().includes('android')
  } catch {
    return false
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // Windows .cmd/.bat shims (e.g. vite.cmd) require a shell since Node 20.12,
    // otherwise spawnSync fails with EINVAL.
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CODEXUI_SANDBOX_MODE: process.env.CODEXUI_SANDBOX_MODE || 'danger-full-access',
      // Do not force a default here: with no env value the runtime falls back
      // to the `approval_policy` in CODEX_HOME/config.toml (defaulting to
      // 'never' only when the file is absent), so policy changes made in the
      // settings UI actually take effect on the running app-server.
      ...(process.env.CODEXUI_APPROVAL_POLICY ? { CODEXUI_APPROVAL_POLICY: process.env.CODEXUI_APPROVAL_POLICY } : {}),
    },
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const passthroughArgs = process.argv.slice(2)
const viteBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const vueTscBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vue-tsc.cmd' : 'vue-tsc')

if (isAndroidRuntime()) {
  const cliPath = join(process.cwd(), 'dist-cli', 'index.js')
  if (!existsSync(cliPath)) {
    run('pnpm', ['run', 'build:cli'])
  }
  run('node', [
    cliPath,
    '--no-open',
    '--no-tunnel',
    '--no-login',
    '--no-password',
    ...passthroughArgs,
  ])
}

if (!existsSync(viteBinPath) || !existsSync(vueTscBinPath)) {
  const install = spawnSync('pnpm', ['install'], { stdio: 'inherit', env: process.env })
  if (install.error) {
    throw install.error
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1)
  }
}

run(viteBinPath, passthroughArgs)
