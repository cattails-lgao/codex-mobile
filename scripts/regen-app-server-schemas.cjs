// 重生成 app-server 协议快照（documentation/app-server-schemas/{json,typescript}）。
//
// 背景：src/api/appServerDtos.ts 直接 re-export 生成快照里的类型，所以「换快照 = 换类型
// 定义」，协议一旦漂移，vue-tsc 会报出契约漂移。因此快照的生成版本必须与真正在跑的
// codex 对得上，且升级动作要可复跑、可检测。
//
// 用法（在本仓根目录）：
//   node scripts/regen-app-server-schemas.cjs --check    # 只比对，漂移则 exit 1（CI/闸门友好）
//   node scripts/regen-app-server-schemas.cjs --dry-run  # 打印逐文件差异，不落盘
//   node scripts/regen-app-server-schemas.cjs --apply    # 镜像写入仓库（新增 + 覆盖 + 删除多余）
//
// 退出码：0 = 正常（--check 下表示「已同步」）；1 = 断言/漂移；2 = 环境不足（找不到可运行 codex）
//
// 选用的 codex 与 src/commandResolution.ts#resolveCodexCommand 保持同一优先级：
//   CODEXUI_CODEX_COMMAND > PATH 上的 shim 解析出的真实 exe > PATH 上的 codex。
// 注意：测什么版本，先确认用的是哪一套 codex（本机常同时存在 3 套，版本不同）。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_DIR = path.join(REPO_ROOT, 'documentation', 'app-server-schemas')
const SUBS = ['json', 'typescript']
const WARN_RE = /^WARNING: failed to clean up stale arg0 temp dirs.*$/gm

function fail(code, message) {
  console.error(message)
  process.exit(code)
}

function run(exe, args, opts = {}) {
  const r = spawnSync(exe, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300000,
    ...opts,
  })
  const stdout = (r.stdout || '').replace(WARN_RE, '').trim()
  const stderr = (r.stderr || '').replace(WARN_RE, '').trim()
  return { status: r.status, stdout, stderr, error: r.error }
}

// ---- 1) 解析 codex 可执行文件 ------------------------------------------------

const WINDOWS_TRIPLE = () => (process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc')
const PLATFORM_PKG = () => (process.arch === 'arm64' ? '@openai/codex-win32-arm64' : '@openai/codex-win32-x64')

/** 在一个已定位的 @openai/codex 包目录下按已知布局找原生 exe。 */
function exeFromPackageDir(pkgDir) {
  const triple = WINDOWS_TRIPLE()
  const direct = [
    ['vendor', triple, 'bin', 'codex.exe'],
    ['node_modules', '@openai', PLATFORM_PKG().split('/')[1], 'vendor', triple, 'bin', 'codex.exe'],
  ]
  for (const parts of direct) {
    const exe = path.join(pkgDir, ...parts)
    if (fs.existsSync(exe)) return exe
  }
  // JS 启动器布局：原生二进制在平台可选依赖里，且只有从 realpath 才能解析到 sibling 条目
  // （pnpm 的 store 里平台包与 @openai/codex 是同级实体）。与 src/commandResolution.ts 同法。
  try {
    const realDir = fs.realpathSync(pkgDir)
    const pkgJson = require.resolve(`${PLATFORM_PKG()}/package.json`, { paths: [realDir] })
    const exe = path.join(path.dirname(pkgJson), 'vendor', triple, 'bin', 'codex.exe')
    if (fs.existsSync(exe)) return exe
  } catch {
    // 不是 JS 启动器布局，继续探测其它 shim
  }
  return null
}

/** 在各 PATH 目录里找 codex 的 shim（.exe 直接用；.cmd/.bat 则解出真实 exe）。 */
function shimRealExeFromPath() {
  const exts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  const names = exts.map((ext) => `codex${ext}`)
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const trimmed = dir.trim()
    if (!trimmed) continue
    for (const name of names) {
      const candidate = path.join(trimmed, name)
      if (!fs.existsSync(candidate)) continue
      if (/\.exe$/i.test(candidate)) return candidate
      if (!/\.(cmd|bat)$/i.test(candidate)) continue
      let content = ''
      try {
        content = fs.readFileSync(candidate, 'utf8')
      } catch {
        continue
      }
      const m = content.match(/([^"'\r\n]*node_modules[\\/]@openai[\\/]codex)/i)
      if (!m) continue
      const pkgDir = m[1].replace(/%(~?)dp0%?/gi, path.dirname(candidate)).replace(/[\\/]/g, '\\')
      const exe = exeFromPackageDir(pkgDir)
      if (exe) return exe
    }
  }
  return null
}

/**
 * 探测版本。Node >= 20.12 会拒绝对 .cmd/.bat 直接 spawn（EINVAL/ENOENT），
 * 所以裸命令一律经 cmd.exe 包装（与 src/utils/commandInvocation.ts 同因）。
 */
function probeVersion(command) {
  const direct = run(command, ['--version'])
  if (direct.status === 0 && /codex/i.test(direct.stdout)) return direct.stdout
  if (!path.isAbsolute(command)) {
    const wrapped = run('cmd.exe', ['/d', '/s', '/c', `${command} --version`])
    if (wrapped.status === 0 && /codex/i.test(wrapped.stdout)) return wrapped.stdout
  }
  return null
}

function resolveCodex() {
  const candidates = [
    process.env.CODEXUI_CODEX_COMMAND?.trim() || null,
    shimRealExeFromPath(),
    'codex',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue
    const version = probeVersion(candidate)
    if (version) return { exe: candidate, version }
  }
  return null
}

// ---- 2) 生成 ----------------------------------------------------------------

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const q = path.join(dir, e.name)
    if (e.isDirectory()) walk(q, base, acc)
    else acc.push(path.relative(base, q).replace(/\\/g, '/'))
  }
  return acc.sort()
}

/** 执行 codex 子命令；裸命令走 cmd.exe 包装（见 probeVersion 的说明）。 */
function execCodex(exe, args, opts = {}) {
  if (path.isAbsolute(exe)) return run(exe, args, opts)
  const quoted = [exe, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(' ')
  return run('cmd.exe', ['/d', '/s', '/c', quoted], opts)
}

const sha1 = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  let n = 0
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name)
    const b = path.join(to, e.name)
    if (e.isDirectory()) n += copyTree(a, b)
    else {
      fs.copyFileSync(a, b)
      n++
    }
  }
  return n
}

function main() {
  const argv = process.argv.slice(2)
  const mode = argv.includes('--apply') ? 'apply' : argv.includes('--dry-run') ? 'dry-run' : 'check'

  const resolved = resolveCodex()
  if (!resolved) {
    fail(2, '找不到可运行的 codex（CODEXUI_CODEX_COMMAND / PATH 均不可用）→ SKIP')
  }
  console.log(`codex = ${resolved.exe}`)
  console.log(`version = ${resolved.version}`)

  const outDir = process.env.SCHEMA_OUT
    ? path.resolve(process.env.SCHEMA_OUT)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'codex-schema-'))
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`输出目录 = ${outDir}`)
  // cwd 必须离开本仓：codex 会按进程 cwd 发现 <cwd>/.codex/config.toml，
  // 其 model provider 会被「忽略为 unsupported」却仍覆盖运行参数。
  const cwd = process.env.LOCALAPPDATA || os.homedir()
  const jobs = [
    ['json', ['app-server', 'generate-json-schema', '--experimental', '-o', path.join(outDir, 'json')]],
    ['typescript', ['app-server', 'generate-ts', '--experimental', '-o', path.join(outDir, 'typescript')]],
  ]
  for (const [name, args] of jobs) {
    const r = execCodex(resolved.exe, args, { cwd })
    if (r.status !== 0 || !fs.existsSync(path.join(outDir, name))) {
      fail(2, `generate-${name} 失败（status=${r.status}）\n${r.stdout}\n${r.stderr}`)
    }
    console.log(`generate-${name}: OK`)
  }

  // ---- 3) 比对 ----
  let drift = 0
  const report = []
  for (const sub of SUBS) {
    const gen = walk(path.join(outDir, sub))
    const repoDir = path.join(SCHEMA_DIR, sub)
    const repo = fs.existsSync(repoDir) ? walk(repoDir) : []
    const g = new Set(gen)
    const r = new Set(repo)
    const added = gen.filter((x) => !r.has(x))
    const removed = repo.filter((x) => !g.has(x))
    const changed = gen.filter((x) => r.has(x) && sha1(path.join(outDir, sub, x)) !== sha1(path.join(repoDir, x)))
    drift += added.length + removed.length + changed.length
    report.push({ sub, gen: gen.length, repo: repo.length, added, removed, changed })
    console.log()
    console.log(`### ${sub}: 生成 ${gen.length} / 仓库 ${repo.length} | 新增 ${added.length} | 删除 ${removed.length} | 改写 ${changed.length}`)
    if (added.length) console.log('  +', added.join(', '))
    if (removed.length) console.log('  -', removed.join(', '))
    if (changed.length) console.log('  ~', changed.join(', '))
  }

  if (mode !== 'apply') {
    console.log()
    if (mode === 'check') {
      console.log(drift === 0 ? '结论：快照与当前 codex 已同步（drift = 0）' : `结论：快照已漂移（drift = ${drift}）`)
      process.exit(drift === 0 ? 0 : 1)
    }
    console.log(`dry-run 结束（未落盘）。drift = ${drift}`)
    return
  }

  // ---- 4) 镜像写入 ----
  let written = 0
  let deleted = 0
  for (const { sub, removed } of report) {
    const n = copyTree(path.join(outDir, sub), path.join(SCHEMA_DIR, sub))
    written += n
    for (const rel of removed) {
      fs.rmSync(path.join(SCHEMA_DIR, sub, rel))
      deleted++
    }
    console.log(`镜像 ${sub}/：写入 ${n} 文件，删除 ${removed.length}`)
  }
  console.log()
  console.log(`apply 完成：共写入 ${written} 个文件，删除 ${deleted} 个（镜像语义，仓库快照 == 生成结果）`)
  console.log(`生成版本 = ${resolved.version}`)
  console.log('提醒：documentation/APP_SERVER_DOCUMENTATION.md 顶部的生成版本号需同步更新。')
}

// 供其它 probe/gate 复用 codex 解析（本仓已有 3 处同类逻辑，别再添第 4 处）。
module.exports = { resolveCodex }

if (require.main === module) main()
