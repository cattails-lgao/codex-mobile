// 真机可用性普查：把「schema 里有名字」与「服务端真的实现了」分开取证。
//
// 背景（round-158 §六.10① 的未闭环项）：round-157/158 只证明过「快照与真机 schema 文本一致」，
// 以及「3 个新方法里 2 个能用、1 个是 `-32601 未实现`」。但**用空参数普查是无效的** ——
// 空参会先撞参数校验（实测 170 个方法里 129 次回 `-32600 缺字段`，只有 37 次执行到实现分派），
// 于是「调用成功」既不能证明实现、失败也不能证明未实现。
//
// 本脚本的做法：**从 JSON schema 机械构造「含全部 required 字段」的合法参数**再调用，
// 于是错误文案才可解释。判定分五档（关键在把「反序列化失败」与「域错误」分开）：
//   - OK             有 result
//   - IMPLEMENTED    域错误（`thread not found` / `chatgpt authentication required` /
//                    `requires exactly one of …`）⇒ **已执行到实现内部**，是**已实现**的硬证据
//   - NOT_IMPLEMENTED `-32601` 或文案含 `not implemented yet` / `is not supported yet`
//   - UNDETERMINED   反序列化/参数校验失败（`Invalid request: …` / `missing field …` / `invalid type: …`）
//   - TIMEOUT        超过单次上限
//   **为什么 UNDETERMINED 不能算未实现**：`thread/prediction/request` 用 `{}` 会回
//   `-32600 missing field threadId`，而它是**未实现**的 ⇒ 参数校验发生在「未实现」闸门**之前**，
//   所以反序列化失败**不携带**实现与否的信息。
//
// 用法：
//   node scripts/probe-app-server-methods.cjs              # 全量普查
//   node scripts/probe-app-server-methods.cjs --dry-run    # 只打印构造出的参数，不起服务
//   node scripts/probe-app-server-methods.cjs --filter prediction
//   node scripts/probe-app-server-methods.cjs --out tmp/x.json
//
// 退出码：0 = 观测到的未实现集合与基线一致；1 = 集合有变化（新出现 / 已消失）或有超时；2 = 环境不足
//
// 隔离纪律（本仓踩过多次，逐条遵守）：
//   - **造全新空 CODEX_HOME**，只拷 `auth.json`（拷已有 home 不是隔离：state_*.sqlite 记 rollout 绝对路径）；
//   - 进程 **cwd 必须在仓外**（codex 按 cwd 发现 `<cwd>/.codex/config.toml` 并**覆盖**模型）；
//   - `%TEMP%` 不能当 CODEX_HOME（codex 拒绝在临时目录建 helper 二进制）。
//
// 有意不普查的方法（会触发外部副作用：OAuth / 浏览器 / 上传）见 SKIP：它们**不是**「未实现」，
// 只是不该由闸门去开火；名单与理由写进证据 JSON，属**诚实边界**。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { resolveCodex } = require('./regen-app-server-schemas.cjs')

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_JSON = path.join(REPO_ROOT, 'documentation', 'app-server-schemas', 'json', 'ClientRequest.json')
const REAL_HOME = path.join(os.homedir(), '.codex')

const REQUEST_TIMEOUT_MS = 15000
const GLOBAL_BUDGET_MS = 240000

// 会打开浏览器 / 走 OAuth / 上传数据的：不在闸门里开火（副作用不该由闸门产生）。
const SKIP = new Map([
  ['account/login/start', '可能打开浏览器或走 OAuth'],
  ['account/gatewayOAuth/login', '走网关 OAuth'],
  ['account/logout', '会清掉隔离 home 的 auth.json（影响后续调用）'],
  ['mcpServer/oauth/login', '走 MCP OAuth'],
  ['feedback/upload', '会向服务端上传反馈数据'],
])

// 基线：0.162.1 上**已知**「schema 里有名字、服务端却未实现」的方法（本脚本实测得出，见 round-159）。
// 闸门只在集合**发生变化**时红，否则会被这 4 个长期项永远染红而失去信号。
const KNOWN_UNIMPLEMENTED = [
  'thread/items/list', // "not supported yet"
  'thread/prediction/request', // "not implemented yet"
  'thread/searchOccurrences', // "not supported yet"
  'thread/timeline/list', // "not supported yet"
]

// ---- 1) 从 schema 机械构造合法参数 ------------------------------------------

const FIXED_UUID = '00000000-0000-4000-8000-000000000000'
const STR = 'r159-probe'

function deref(defs, schema) {
  let s = schema
  let name = null
  let guard = 0
  while (s && s.$ref && guard++ < 12) {
    name = s.$ref.replace('#/definitions/', '')
    const next = defs[name]
    if (!next) break
    s = next
  }
  return { schema: s || {}, name }
}

const SIMPLE = new Set(['string', 'number', 'integer', 'boolean'])

/** 依 schema 造一个「形状合法」的占位值。判据是**通过校验并到达实现分派**，不求语义正确。 */
function makeValue(defs, schema, fieldName, depth = 0) {
  if (!schema || depth > 8) return null
  // 一律**先解引用**：本快照里 `$ref` 指向枚举 / 联合体很常见，
  // 漏这一步会给枚举字段填垃圾串、把联合体当空对象 ⇒ 白撞 `-32600`。
  const { schema: s } = deref(defs, schema)

  if (s.default !== undefined) return s.default
  if (s.const !== undefined) return s.const
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0]

  for (const key of ['anyOf', 'oneOf']) {
    const branches = s[key]
    if (Array.isArray(branches) && branches.length) {
      const nonNull = branches.map((b) => deref(defs, b).schema).filter((b) => b && b.type !== 'null')
      const pool = nonNull.length ? nonNull : branches
      // 联合体优先挑**简单类型**分支：形如 `string | AbsolutePathBuf` 的字段里，
      // 服务端实测期望的是 string（挑 map 会得到 `invalid type: map, expected path string`）。
      const pick = pool.find((b) => SIMPLE.has(b.type)) || pool[0]
      return makeValue(defs, pick, fieldName, depth + 1)
    }
  }

  if (Array.isArray(s.allOf) && s.allOf.length) {
    const branches = s.allOf.map((b) => deref(defs, b).schema).filter(Boolean)
    // 形如 `allOf: [{$ref: AbsolutePathBuf}]` 的**单分支标量包装**：直接按该分支造，
    // 别硬按对象合并（否则会给「期望 string 的 path」塞一个 `{}`）。
    const scalar = branches.find((b) => b.type && b.type !== 'object')
    if (scalar) return makeValue(defs, scalar, fieldName, depth + 1)
    const merged = { type: 'object', properties: {}, required: [] }
    for (const bs of branches) {
      Object.assign(merged.properties, bs.properties || {})
      merged.required.push(...(bs.required || []))
    }
    if (!Object.keys(merged.properties).length && !merged.required.length) return null
    return makeObject(defs, merged, depth + 1)
  }

  if (!s.type) {
    if (s.properties) return makeObject(defs, s, depth + 1)
    return null
  }
  switch (s.type) {
    case 'object':
      return makeObject(defs, s, depth + 1)
    case 'array': {
      if (!s.items || (s.minItems || 0) === 0) return []
      return [makeValue(defs, s.items, fieldName, depth + 1)]
    }
    case 'string': {
      if (s.format === 'uuid') return FIXED_UUID
      if (s.pattern) return STR // 有 pattern 的一律交给服务端拒（仍会到达分派）
      if (/(^|[a-z])id$/i.test(fieldName) || /Id$/.test(fieldName)) return FIXED_UUID
      if (s.format === 'date-time') return '2026-10-14T00:00:00Z'
      return STR
    }
    case 'integer':
    case 'number':
      return s.minimum !== undefined ? s.minimum : 0
    case 'boolean':
      return false
    case 'null':
      return null
    default:
      return null
  }
}

function makeObject(defs, schema, depth = 0) {
  const out = {}
  const required = Array.isArray(schema.required) ? schema.required : []
  for (const field of required) {
    const prop = (schema.properties || {})[field]
    if (!prop) continue
    const v = makeValue(defs, prop, field, depth + 1)
    if (v !== undefined) out[field] = v
  }
  return out
}

/** 读取快照里的「客户端方法 → 该构造的参数」。 */
function loadSurface() {
  const j = JSON.parse(fs.readFileSync(SCHEMA_JSON, 'utf8'))
  const defs = j.definitions || {}
  const methods = new Map()
  for (const entry of j.oneOf || []) {
    const method = entry.properties && entry.properties.method && entry.properties.method.enum && entry.properties.method.enum[0]
    if (!method || methods.has(method)) continue
    const paramsSchema = entry.properties && entry.properties.params
    if (!paramsSchema) {
      methods.set(method, { params: {}, required: [], note: '无 params' })
      continue
    }
    const { schema, name } = deref(defs, paramsSchema)
    const objectLike = schema && (schema.type === 'object' || schema.properties !== undefined || schema.required !== undefined)
    if (!objectLike) {
      methods.set(method, { params: {}, required: [], note: 'params 非对象形态（内联联合），只能发 {}', defName: name })
      continue
    }
    methods.set(method, { params: makeObject(defs, schema), required: schema.required || [], defName: name })
  }
  return methods
}

// ---- 2) 判定 ----------------------------------------------------------------

const NOT_IMPL_RE = /not implemented yet|is not supported yet|not supported yet|method not found/i
const UNDETERMINED_RE = /^(Invalid request|invalid request)|missing field|invalid type:|invalid value:|did not match any variant|invalid digit found|deserialized without a base path/i

function classify(resp, err) {
  if (err) return { verdict: 'TIMEOUT', detail: String(err.message || err), reason: '单次调用超时' }
  if (resp.result !== undefined) return { verdict: 'OK', detail: '', reason: '有 result' }
  const code = resp.error && resp.error.code
  const msg = String((resp.error && resp.error.message) || '')
  if (code === -32601 || NOT_IMPL_RE.test(msg)) return { verdict: 'NOT_IMPLEMENTED', detail: msg, reason: `code=${code}` }
  if (code === -32600 && UNDETERMINED_RE.test(msg)) return { verdict: 'UNDETERMINED', detail: msg, reason: '反序列化/参数校验失败（发生在未实现闸门之前，不携带实现与否的信息）' }
  if (UNDETERMINED_RE.test(msg)) return { verdict: 'UNDETERMINED', detail: msg, reason: `code=${code}（文案是 serde/参数校验失败）` }
  return { verdict: 'IMPLEMENTED', detail: msg, reason: `code=${code}（域错误 ⇒ 已进入实现内部）` }
}

// ---- 3) 起真机 app-server 并逐方法调用 --------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 裸命令 / .cmd shim 一律经 cmd.exe 包装（Node >= 20.12 不能直接 spawn .cmd）。 */
function spawnCodex(exe, args, opts) {
  if (path.isAbsolute(exe) && !/\.(cmd|bat)$/i.test(exe)) return spawn(exe, args, opts)
  const quoted = [exe, ...args].map((a) => (/[\s"]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a)).join(' ')
  return spawn('cmd.exe', ['/d', '/s', '/c', quoted], opts)
}

function apiKeyFromAuth() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(REAL_HOME, 'auth.json'), 'utf8'))
    return j.OPENAI_API_KEY || j.api_key || (j.tokens && j.tokens.access_token) || null
  } catch {
    return null
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const filter = argv.includes('--filter') ? new RegExp(argv[argv.indexOf('--filter') + 1], 'i') : null
  const outPath = argv.includes('--out') ? path.resolve(argv[argv.indexOf('--out') + 1]) : path.join(REPO_ROOT, 'tmp', 'probe-app-server-methods.json')

  if (!fs.existsSync(SCHEMA_JSON)) {
    console.error('找不到快照 ' + path.relative(REPO_ROOT, SCHEMA_JSON) + ' → SKIP')
    process.exit(2)
  }

  const surface = loadSurface()
  let targets = [...surface.keys()].sort()
  if (filter) targets = targets.filter((m) => filter.test(m))

  // 离线预览：只打印构造出的参数，不起服务（便于人工复核判据本身对不对）
  if (argv.includes('--dry-run')) {
    for (const m of targets) {
      const s = surface.get(m)
      console.log(`${m}  required=${JSON.stringify(s.required)}  params=${JSON.stringify(s.params)}${s.note ? '  [' + s.note + ']' : ''}`)
    }
    console.log(`共 ${targets.length} 个（离线预览，未起服务）`)
    process.exit(0)
  }

  const resolved = resolveCodex()
  if (!resolved) {
    console.error('找不到可运行的 codex（CODEXUI_CODEX_COMMAND / PATH 均不可用）→ SKIP')
    process.exit(2)
  }
  console.log(`快照客户端方法 = ${surface.size}｜本次普查 ${targets.length}（codex ${resolved.version.trim()}）`)

  // 隔离 home：全新空目录 + 只拷 auth.json
  const home = path.join(REPO_ROOT, 'tmp', 'r159-census-home')
  const scratch = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'r159-scratch')
  fs.rmSync(home, { recursive: true, force: true })
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(scratch, { recursive: true })
  const copied = []
  const authSrc = path.join(REAL_HOME, 'auth.json')
  if (fs.existsSync(authSrc)) {
    fs.copyFileSync(authSrc, path.join(home, 'auth.json'))
    copied.push('auth.json')
  }

  const env = { ...process.env, CODEX_HOME: home }
  delete env.CODEXUI_CODEX_COMMAND
  const key = apiKeyFromAuth()
  if (key) env.OPENAI_API_KEY = key

  const child = spawnCodex(resolved.exe, ['app-server', '-c', 'approval_policy="never"', '-c', 'sandbox_mode="danger-full-access"'], {
    cwd: scratch,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let buf = ''
  let nextId = 1
  const pending = new Map()
  const notifications = []
  let stderr = ''

  child.stdout.on('data', (d) => {
    buf += d.toString('utf8')
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        p.resolve(msg)
      } else if (msg.method) {
        notifications.push(msg.method)
      }
    }
  })
  child.stderr.on('data', (d) => { stderr += d.toString('utf8') })

  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')) } }, REQUEST_TIMEOUT_MS)
  })

  const results = []
  const startedAt = Date.now()
  let negativeMessage = ''
  try {
    await rpc('initialize', { clientInfo: { name: 'codex-mobile-r159-census', version: '0.1.132' }, capabilities: { experimentalApi: true } })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n')
    await sleep(300)

    // 负控：不存在的方法 → 错误文案里带服务端认可的全部方法名。
    // 注意两种都要看：带 `/` 的名（v2 世代）与**不带 `/` 的名**（`initialize` / `fuzzyFileSearch`
    // 这类仍活在 v2 联合里）⇒ 前者用于「服务端多出来的方法」，后者靠「快照名是否出现在文案里」判定。
    try {
      const neg = await rpc('thread/doesNotExistR159', {})
      negativeMessage = String((neg.error && neg.error.message) || '')
    } catch { /* 负控失败不影响普查 */ }

    for (const method of targets) {
      if (Date.now() - startedAt > GLOBAL_BUDGET_MS) {
        results.push({ method, verdict: 'BUDGET_EXHAUSTED', detail: '超出全局预算，未调用', reason: '全局预算' })
        continue
      }
      const spec = surface.get(method)
      if (SKIP.has(method)) {
        results.push({ method, verdict: 'SKIPPED', detail: SKIP.get(method), reason: '有意不普查', params: spec.params, required: spec.required })
        continue
      }
      let resp = null
      let err = null
      try {
        resp = await rpc(method, spec.params)
      } catch (e) {
        err = e
      }
      const c = classify(resp, err)
      results.push({
        method,
        verdict: c.verdict,
        detail: (c.detail || '').slice(0, 260),
        reason: c.reason,
        params: spec.params,
        required: spec.required,
        ...(spec.note ? { note: spec.note } : {}),
      })
      process.stdout.write('.')
    }
  } catch (e) {
    console.error('\n普查中断: ' + e.message)
  } finally {
    process.stdout.write('\n')
    try { child.stdin.end() } catch { /* ignore */ }
    await sleep(300)
    try { child.kill() } catch { /* ignore */ }
    await sleep(200)
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(scratch, { recursive: true, force: true })
  }

  const tally = {}
  for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1

  const snapshotSet = new Set(surface.keys())
  const serverTokens = new Set(negativeMessage.match(/[a-zA-Z][a-zA-Z0-9_]*(?:\/[a-zA-Z0-9_]+)+/g) || [])
  // 服务端认可、但快照联合里没有的（排除探针自己造的那个不存在的方法名）
  const serverOnly = negativeMessage
    ? [...serverTokens].filter((t) => !snapshotSet.has(t) && !t.includes('doesNotExist')).sort()
    : null
  // 快照里有、但负控文案没列出的（无斜杠名如 `initialize` 靠这一条才看得出）
  const snapshotOnly = negativeMessage ? [...snapshotSet].filter((m) => !negativeMessage.includes(m)).sort() : null

  const evidence = {
    codexVersion: resolved.version.trim(),
    isolatedHomeCopied: copied,
    cwdOutsideRepo: true,
    snapshotMethods: surface.size,
    probed: results.length,
    tally,
    results,
    serverMethodTokens: negativeMessage ? [...serverTokens].sort() : null,
    serverOnly,
    snapshotOnly,
    skipped: [...SKIP].map(([m, why]) => ({ method: m, why })),
    negativeControlMessage: negativeMessage.slice(0, 6000),
    notificationsSeen: [...new Set(notifications)],
    stderrHead: stderr.slice(0, 800),
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 1), 'utf8')

  console.log('')
  console.log('== 普查结果 ==')
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`)
  const notImpl = results.filter((r) => r.verdict === 'NOT_IMPLEMENTED')
  console.log('')
  console.log(`== NOT_IMPLEMENTED（已发布但未实现，${notImpl.length}）==`)
  if (!notImpl.length) console.log('  （无）')
  for (const r of notImpl) console.log(`  ${r.method}  ← ${r.detail}`)
  const undet = results.filter((r) => r.verdict === 'UNDETERMINED')
  console.log('')
  console.log(`== UNDETERMINED（判据不足，${undet.length}）==`)
  for (const r of undet) console.log(`  ${r.method}  ← ${r.detail.slice(0, 90)}`)
  const hard = results.filter((r) => r.verdict === 'TIMEOUT' || r.verdict === 'BUDGET_EXHAUSTED')
  if (hard.length) {
    console.log('')
    console.log(`== TIMEOUT / BUDGET（${hard.length}）==`)
    for (const r of hard) console.log(`  ${r.verdict.padEnd(16)} ${r.method}`)
  }
  console.log('')
  console.log(`服务端认可但不进快照的方法（${serverOnly ? serverOnly.length : '负控失败'}）: ${serverOnly ? serverOnly.join(', ') || '（无）' : '-'}`)
  console.log(`快照里有但服务端负控没列出的方法（${snapshotOnly ? snapshotOnly.length : '-'}）: ${snapshotOnly ? snapshotOnly.join(', ') || '（无）' : '-'}`)
  console.log(`证据已写出：${path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')}`)

  // 与基线比对：本机 0.162.1 上**已知**「已发布但未实现」的 4 个方法。
  // 闸门只有在**集合发生变化**时才应该红 —— 否则它会因为 4 个长期未实现而永远红，失去信号。
  const observed = notImpl.map((r) => r.method).sort()
  const known = [...KNOWN_UNIMPLEMENTED].sort()
  const appeared = observed.filter((m) => !known.includes(m))
  const disappeared = known.filter((m) => !observed.includes(m))
  console.log('')
  console.log(`== 与基线比对（基线 ${known.length} 个）==`)
  console.log(`  新出现的未实现：${appeared.join(', ') || '（无）'}`)
  console.log(`  已消失（可能已实现，值得复核）：${disappeared.join(', ') || '（无）'}`)
  if (hard.length) console.log(`  另外有 ${hard.length} 个 TIMEOUT/BUDGET 未取到结论`)

  process.exit(appeared.length === 0 && disappeared.length === 0 && hard.length === 0 ? 0 : 1)
}

main()