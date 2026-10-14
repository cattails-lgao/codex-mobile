#!/usr/bin/env node
/**
 * 枚举本机所有 codex 安装并打印各自 `--version`，同时给出 `resolveCodexCommand()`
 * 实际会选中的那一套。
 *
 * 为什么需要它：本机常同时存在 3~4 套 codex（PATH 上的 pnpm 全局、桌面 App 的内容
 * 寻址缓存、桌面 App 托管的 app-server daemon releases），它们版本各不相同。
 * 一旦服务被 `CODEXUI_CODEX_COMMAND` 钉在某一套上，「闸门/复现记录里标注的版本」
 * 就未必是真正在跑的那一套。**测什么版本，先跑这个探针确认指向谁。**
 *
 * 用法：
 *   node scripts/probe-codex-installations.cjs
 *
 * 退出码：0 = 至少找到一套可运行；2 = 一套都没找到。
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const HOME = process.env.USERPROFILE || process.env.HOME || ''
const LOCALAPPDATA = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || ''

// Windows 上 `.cmd`/`.bat` 与裸名 `codex` 必须经 cmd.exe 包装 —— Node >= 20.12 直接
// spawn 会 EINVAL/ENOENT。口径复刻 src/utils/commandInvocation.ts#getSpawnInvocation
// （**只在含空白时才加引号**）。已知局限：路径含空格时 Node 会把内层引号转义成 `\"`，
// cmd 不认 ⇒ 该分支仍会失败；这与本仓解析器同源，不是本探针独有。
const CMD_WRAPPED_NAMES = new Set(['codex', 'npm', 'npx'])

function quoteCmdExeArg(value) {
  const normalized = value.replace(/"/g, '""')
  return /[\s"]/u.test(normalized) ? `"${normalized}"` : normalized
}

function needsCmdExeWrapper(command) {
  if (process.platform !== 'win32') return false
  const base = path.basename(command.toLowerCase())
  if (/\.(cmd|bat)$/i.test(base)) return true
  if (path.extname(base)) return false
  return CMD_WRAPPED_NAMES.has(base)
}

function spawnCodex(command, args) {
  if (needsCmdExeWrapper(command)) {
    const line = [quoteCmdExeArg(command), ...args.map(quoteCmdExeArg)].join(' ')
    return spawnSync('cmd.exe', ['/d', '/s', '/c', line], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  }
  return spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 })
}

function versionOf(exe) {
  if (!exe || !fs.existsSync(exe)) return null
  const r = spawnCodex(exe, ['--version'])
  const line = ((r.stdout || '') + (r.stderr || ''))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^WARNING: failed to clean up stale arg0/.test(s))[0]
  // 只认「形如 codex-cli X.Y.Z（含可选 -alpha.N / 预发布后缀）」的应答；
  // 其他 exe（code-mode-host / command-runner / sandbox-setup 等同目录辅助二进制）
  // 会把参数错误当输出，不能被当成版本号。
  if (!line) return null
  const m = line.match(/^codex-cli\s+(\S+)/)
  return m ? `codex-cli ${m[1]}` : null
}

function listDirSafe(p) {
  try { return fs.readdirSync(p) } catch { return [] }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

function walkFiles(p, acc = []) {
  for (const e of listDirSafe(p)) {
    const q = path.join(p, e)
    if (isDir(q)) walkFiles(q, acc)
    else acc.push(q)
  }
  return acc
}

const found = []

// --- A. PATH 上的 shim 与 pnpm/npm 全局包 -------------------------------------------------
function probePathShims() {
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((x) => x.trim().toLowerCase()).filter(Boolean)
  const seen = new Set()
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const d = dir.trim()
    if (!d) continue
    for (const ext of exts) {
      const shim = path.join(d, 'codex' + ext)
      if (!fs.existsSync(shim) || seen.has(shim)) continue
      seen.add(shim)
      found.push({ kind: 'PATH shim', label: shim, version: versionOf(shim), note: '' })
      // 从 shim 内容里解析出真实包目录，再按已知布局找 exe
      let pkgDir = null
      try {
        const m = fs.readFileSync(shim, 'utf8').match(/([^"'\r\n]*node_modules[\\/]@openai[\\/]codex)/i)
        if (m) {
          let raw = m[1].replace(/%(~?)dp0%?/gi, path.dirname(shim)).replace(/[\\/]/g, path.sep)
          const marker = ['node_modules', '@openai', 'codex'].join(path.sep)
          const i = raw.toLowerCase().indexOf(marker.toLowerCase())
          if (i >= 0) pkgDir = raw.slice(0, i) + marker
        }
      } catch { /* ignore */ }
      if (pkgDir && fs.existsSync(pkgDir)) {
        pkgDir = path.resolve(pkgDir) // 归一化 shim 里的 `%~dp0\..\` 片段，便于阅读
        found.push({ kind: 'pnpm/npm 全局包', label: pkgDir, version: null, note: 'shim 解析' })
        for (const layout of [
          path.join(pkgDir, 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
          path.join(pkgDir, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe'),
        ]) {
          const v = versionOf(layout)
          if (v) found.push({ kind: '全局包内 exe', label: layout, version: v, note: '直接布局' })
        }
        // pnpm：realpath 后同级找平台包
        try {
          const real = fs.realpathSync(pkgDir)
          const plat = path.join(path.dirname(path.dirname(real)), '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
          const v = versionOf(plat)
          if (v) found.push({ kind: '全局包内 exe', label: plat, version: v, note: 'pnpm store realpath' })
        } catch { /* ignore */ }
      }
    }
  }
}

// --- B. 桌面 App 内容寻址缓存 -------------------------------------------------------------
function probeDesktopCache() {
  const base = path.join(LOCALAPPDATA, 'OpenAI', 'Codex', 'bin')
  for (const d of listDirSafe(base)) {
    const dir = path.join(base, d)
    if (!isDir(dir)) continue
    for (const f of listDirSafe(dir)) {
      // 同目录还有 codex-code-mode-host.exe / codex-command-runner.exe /
      // codex-windows-sandbox-setup.exe 等辅助二进制，只取主程序。
      if (f.toLowerCase() !== 'codex.exe') continue
      found.push({ kind: '桌面 App 缓存', label: path.join(dir, f), version: versionOf(path.join(dir, f)), note: `<hash> = ${d}` })
    }
  }
}

// --- C. 桌面 App 托管的 app-server daemon releases ----------------------------------------
function probeDaemonReleases() {
  const base = path.join(HOME, '.codex', 'packages', 'app-server-daemon', 'releases')
  for (const d of listDirSafe(base)) {
    const dir = path.join(base, d)
    if (!isDir(dir)) continue
    const exe = path.join(dir, 'bin', 'codex.exe')
    let declared = null
    const pj = path.join(dir, 'codex-package.json')
    if (fs.existsSync(pj)) {
      try { declared = JSON.parse(fs.readFileSync(pj, 'utf8')).version || null } catch { /* ignore */ }
    }
    found.push({ kind: 'daemon release', label: exe, version: versionOf(exe), note: `目录名 ${d}${declared ? ` / package.json ${declared}` : ''}` })
  }
}

probePathShims()
probeDesktopCache()
probeDaemonReleases()

console.log('# codex 安装枚举')
console.log()
if (!found.length) {
  console.log('(一套都没找到)')
} else {
  const kinds = [...new Set(found.map((f) => f.kind))]
  for (const k of kinds) {
    console.log(`## ${k}`)
    for (const f of found.filter((x) => x.kind === k)) {
      console.log(`  ${f.version || (f.kind === 'pnpm/npm 全局包' ? '(包目录)' : '(不可运行)')}`.padEnd(24), f.label)
      if (f.note) console.log(' '.repeat(26) + '↑ ' + f.note)
    }
    console.log()
  }
}

// --- D. 本仓解析器会选中谁 ----------------------------------------------------------------
console.log('## 本仓 `resolveCodexCommand()` 的口径')
const explicit = (process.env.CODEXUI_CODEX_COMMAND || '').trim()
console.log('  CODEXUI_CODEX_COMMAND =', explicit ? explicit : '(未设置)')
if (explicit) {
  console.log('  -> 显式强制，优先级最高；其版本 =', versionOf(explicit) || '(不可运行)')
  console.log('     ⚠️ 服务实际跑的未必是 PATH 上那一套，闸门/复现记录里的版本标注需以此为准。')
} else {
  const runnable = found.filter((f) => f.version)
  const pathWinners = runnable.filter((f) => f.kind === 'PATH shim' || f.kind === '全局包内 exe')
  if (pathWinners.length) {
    console.log('  -> 未设置：走 PATH 上的 pnpm/npm 全局那套，实测版本 =')
    for (const w of pathWinners) console.log('       ', w.version, '|', w.label)
  } else if (runnable.length) {
    console.log('  -> 未设置且 PATH 上没有可用 shim；可能的落点：')
    for (const w of runnable) console.log('       ', w.version, '|', w.kind, '|', w.label)
  } else {
    console.log('  -> 未设置，且没有可运行候选 ⇒ 服务会报「Codex CLI not found」')
  }
}
console.log()
console.log('CODEX_HOME =', process.env.CODEX_HOME || '(未设置)')
console.log()
console.log('提示：升级 codex 后，PATH 上的版本会**静默变化**（pnpm 全局 shim 会被重建）。')
console.log('      任何写进文档的版本号都只是「读数时刻的真值」，跨会话使用前请重跑本探针。')

process.exit(found.some((f) => f.version) ? 0 : 2)
