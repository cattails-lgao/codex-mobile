// 重生成 documentation/APP_SERVER_DOCUMENTATION.md 里「可从快照派生」的部分。
//
// 为什么单独一个脚本（而不是并进 regen-app-server-schemas.cjs）：
//   那个脚本要调 codex 二进制才能重生成快照（慢、且无 codex 时 exit 2）；
//   而本文档的派生部分**只依赖仓库里已经落盘的快照**，可以离线、瞬时校验。
//
// 本文档的三类内容被区别对待：
//   1. 手写的「历史方法表」→ 保留（含人工标注的 UI-зона 列，不可派生），但**链接由本脚本兜底**：
//      目标存在就保留、同名文件搬了家就改路径、目标确实没了就把链接降级成行内代码
//      （历史条目仍然可读，但不再产生死链）。
//   2. 目录清单（Полный индекс materialized schema-файлов）→ 整体从目录重建。
//   3. 完整性计数（Проверка полноты）与「当前协议面」→ 从目录 + json 各 ClientRequest/
//      ServerRequest/ServerNotification 的 oneOf 生成。
//
// 用法（仓根）：
//   node scripts/regen-app-server-doc.cjs --check   # 只比对（0 = 一致 / 1 = 漂移 / 2 = 快照缺失）
//   node scripts/regen-app-server-doc.cjs --dry-run # 打印差异摘要，不落盘
//   node scripts/regen-app-server-doc.cjs --apply   # 写回文档
//
// 注意：**response schema 不派生**。实测「方法名 → XxxResponse.json」的命名法只中
// 142/170（如 `app/list` → 实际是 `AppsListResponse`），快照里没有权威的 method→response
// 映射源，硬套命名法会往文档里写错链接，所以派生清单只给 params（来自 oneOf 的 $ref）。

const fs = require('node:fs')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_DIR = path.join(REPO_ROOT, 'documentation', 'app-server-schemas')
const DOC_PATH = path.join(REPO_ROOT, 'documentation', 'APP_SERVER_DOCUMENTATION.md')
const DOC_DIR = path.dirname(DOC_PATH)
const REL_PREFIX = 'app-server-schemas/'

const INDEX_HEADING = '## Полный индекс materialized schema-файлов'
const COUNTS_HEADING = '## Проверка полноты'
const SURFACE_START = '<!-- regen:protocol-surface:start -->'
const SURFACE_END = '<!-- regen:protocol-surface:end -->'

function fail(code, message) {
  console.error(message)
  process.exit(code)
}

// ---- 目录事实 ---------------------------------------------------------------

/** 列出 schema 目录：{ json: { root: [...], v1: [...], ... }, typescript: {...} }（键与文件名均排序）。 */
function listSchemaTree() {
  const out = {}
  const dirs = fs.readdirSync(SCHEMA_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const name of dirs) {
    const topDir = path.join(SCHEMA_DIR, name)
    const files = (d) => fs.readdirSync(d, { withFileTypes: true })
      .filter((e) => e.isFile()).map((e) => e.name).sort()
    const entry = { root: files(topDir) }
    for (const sub of fs.readdirSync(topDir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
      entry[sub] = files(path.join(topDir, sub))
    }
    out[name] = entry
  }
  return out
}

/** 相对 documentation/ 的可达目标集合 + basename 反查。 */
function buildTargetIndex(tree) {
  const existing = new Set()
  const byBase = new Map()
  for (const [top, subs] of Object.entries(tree)) {
    for (const [sub, names] of Object.entries(subs)) {
      const dir = sub === 'root' ? top : `${top}/${sub}`
      for (const n of names) {
        const rel = REL_PREFIX + dir + '/' + n
        existing.add(rel)
        if (!byBase.has(n)) byBase.set(n, [])
        byBase.get(n).push(rel)
      }
    }
  }
  return { existing, byBase }
}

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, rel), 'utf8'))

/** 从 ClientRequest / ServerRequest / ServerNotification 的 oneOf 抽方法名与 params 引用。 */
function readProtocolSurface() {
  const spec = [
    ['client', 'json/ClientRequest.json'],
    ['serverRequest', 'json/ServerRequest.json'],
    ['notification', 'json/ServerNotification.json'],
  ]
  const out = {}
  for (const [key, rel] of spec) {
    const j = readJson(rel)
    const rows = []
    const seen = new Set()
    for (const e of j.oneOf || []) {
      const m = e.properties && e.properties.method && e.properties.method.enum
      const method = m ? m[0] : null
      if (!method || seen.has(method)) continue
      seen.add(method)
      const ref = e.properties && e.properties.params && e.properties.params.$ref
      rows.push({ method, params: ref ? ref.replace('#/definitions/', '') : null })
    }
    rows.sort((a, b) => a.method.localeCompare(b.method))
    out[key] = rows
  }
  return out
}

// ---- 链接兜底 ---------------------------------------------------------------

const isInternal = (t) => !/^(https?:|mailto:|#)/.test(t)
const targetExists = (link, existing) => {
  const clean = decodeURIComponent(link.split('#')[0])
  if (!clean) return true
  if (clean.startsWith(REL_PREFIX)) return existing.has(clean)
  return fs.existsSync(path.resolve(DOC_DIR, clean))
}

/**
 * 逐链接处理：可达则原样保留；同名文件在快照里搬了家则改写路径；确实不存在则把
 * `[Label](target)` 降级成行内代码 `Label`。
 * 返回 { text, relocated: [...], delinked: [...] }。
 */
function stabilizeLinks(text, byBase, existing) {
  const relocated = []
  const delinked = []
  const out = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, target) => {
    if (!isInternal(target) || targetExists(target, existing)) return whole
    const base = path.basename(decodeURIComponent(target.split('#')[0]))
    const hits = byBase.get(base) || []
    if (hits.length === 1) {
      relocated.push({ from: target, to: hits[0] })
      return `[${label}](${hits[0]})`
    }
    delinked.push({ label, target })
    return '`' + label + '`'
  })
  return { text: out, relocated, delinked }
}

// ---- 派生区块 ---------------------------------------------------------------

function renderIndex(tree) {
  const lines = [INDEX_HEADING, '']
  for (const [top, subs] of Object.entries(tree)) {
    const label = top === 'json' ? 'JSON' : 'TypeScript'
    for (const [sub, names] of Object.entries(subs)) {
      const dir = sub === 'root' ? top : `${top}/${sub}`
      lines.push(`### ${label} ${sub === 'root' ? 'Root' : sub}`, '')
      for (const n of names) lines.push(`- [${n}](${REL_PREFIX}${dir}/${n})`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

function renderCounts(tree, surface) {
  const lines = [COUNTS_HEADING, '']
  lines.push(`- Client methods: ${surface.client.length}`)
  lines.push(`- Server requests: ${surface.serverRequest.length}`)
  lines.push(`- Server notifications: ${surface.notification.length}`)
  for (const [top, subs] of Object.entries(tree)) {
    const label = top === 'json' ? 'JSON' : 'TypeScript'
    for (const [sub, names] of Object.entries(subs)) {
      lines.push(`- Materialized ${label} ${sub === 'root' ? 'root' : sub} schemas: ${names.length}`)
    }
  }
  return lines.join('\n')
}

function renderSurface(surface, tree, removedMethods) {
  const { byBase } = buildTargetIndex(tree)
  const find = (name) => {
    const hits = byBase.get(name + '.json') || []
    return hits.length === 1 ? hits[0] : null
  }
  const block = (title, rows) => {
    const out = [`### ${title} (${rows.length})`, '']
    for (const r of rows) {
      const target = r.params ? find(r.params) : null
      out.push(`- \`${r.method}\`${target ? ` — [${r.params}](${target})` : r.params ? ` — \`${r.params}\`` : ''}`)
    }
    out.push('')
    return out.join('\n')
  }
  const lines = [
    SURFACE_START,
    '',
    '## Current protocol surface (generated from the JSON snapshot)',
    '',
    'Derived from the `oneOf` entries of `json/ClientRequest.json`, `json/ServerRequest.json` and',
    '`json/ServerNotification.json`. Regenerate with `node scripts/regen-app-server-doc.cjs --apply`,',
    'verify with `--check` (0 = in sync, 1 = drifted, 2 = snapshot missing). **Do not edit by hand.**',
    '',
    'Only params schemas are derived (they come from each entry\'s `$ref`). Response schemas are',
    '**not** derived on purpose: there is no authoritative method→response mapping in the snapshot,',
    'and the `XxxResponse` naming convention only matches 142/170 client methods (`app/list` →',
    '`AppsListResponse`), so deriving them would write wrong links.',
    '',
    'The three tables above (relabeled as a historical snapshot) are an inventory from an earlier',
    'protocol generation: they predate most of the current surface and still list methods that no',
    'longer exist. Their links are kept alive by the generator where the target still exists, and are',
    'downgraded to plain code where it does not.',
    '',
    block('Client -> Server', surface.client),
    block('Server -> Client Requests', surface.serverRequest),
    block('Server Notifications', surface.notification),
    '### Methods present only in the historical tables above',
    '',
    `No longer part of the current unions (${removedMethods.length}): ` +
      removedMethods.map((m) => '`' + m + '`').join(', '),
    '',
    SURFACE_END,
    '',
  ]
  return lines.join('\n')
}

// ---- 组装 -------------------------------------------------------------------

const EOL = '\r\n'

function buildDocument(current) {
  const tree = listSchemaTree()
  const { byBase, existing } = buildTargetIndex(tree)
  const surface = readProtocolSurface()

  const norm = current.replace(/\r\n/g, '\n')
  const idxAt = norm.indexOf(INDEX_HEADING)
  const cntAt = norm.indexOf(COUNTS_HEADING)
  if (idxAt < 0 || cntAt < 0 || cntAt < idxAt) {
    fail(1, `文档结构不符：找不到 ${INDEX_HEADING} / ${COUNTS_HEADING} 且顺序应为「索引在前、计数在后」`)
  }
  const head = norm.slice(0, idxAt)

  // 「当前协议面」区块：已存在则定位其起点待替换，否则插在文件索引之前。
  // 拼装一律用「前缀 + 重建区块」，前缀尾部换行归一成恰好一个空行 —— 这样重复跑必然收敛。
  const s = head.indexOf(SURFACE_START)
  const insertedSurface = s < 0
  let prefix = (s >= 0 ? head.slice(0, s) : head).replace(/\n+$/, '') + '\n\n'

  // 历史表里「表头仍称 полный список、但已不完整」的方法名 → 计算「只在历史表里的方法」
  const historical = []
  for (const m of head.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) historical.push(m[1])
  const liveAll = new Set([
    ...surface.client.map((x) => x.method),
    ...surface.serverRequest.map((x) => x.method),
    ...surface.notification.map((x) => x.method),
  ])
  const removedMethods = historical.filter((m) => !liveAll.has(m))

  const surfaceText = renderSurface(surface, tree, removedMethods).trimEnd()
  const indexText = renderIndex(tree)
  const countsText = renderCounts(tree, surface)

  // 确定性拼装：前缀 + 协议面 + 索引 + 计数（各区块自带分隔空行）
  const assembled = prefix + surfaceText + '\n\n' + indexText + '\n' + countsText + '\n'
  const { text: stabilized, relocated, delinked } = stabilizeLinks(assembled, byBase, existing)

  return {
    text: stabilized,
    stats: { relocated, delinked, insertedSurface, removedMethods, tree, surface },
  }
}

function main() {
  const argv = process.argv.slice(2)
  const mode = argv.includes('--apply') ? 'apply' : argv.includes('--dry-run') ? 'dry-run' : 'check'

  if (!fs.existsSync(SCHEMA_DIR)) fail(2, `找不到快照目录 ${REL_PREFIX} ⇒ SKIP`)
  if (!fs.existsSync(DOC_PATH)) fail(2, `找不到 ${path.relative(REPO_ROOT, DOC_PATH)} ⇒ SKIP`)

  const current = fs.readFileSync(DOC_PATH, 'utf8')
  const { text: next, stats } = buildDocument(current)
  const nextCrlf = next.replace(/\n/g, EOL)

  const same = nextCrlf === current
  console.log(`快照目录：json ${stats.tree.json.root.length + Object.entries(stats.tree.json).filter(([k]) => k !== 'root').reduce((a, [, v]) => a + v.length, 0)} 文件` +
    ` / typescript ${stats.tree.typescript.root.length + Object.entries(stats.tree.typescript).filter(([k]) => k !== 'root').reduce((a, [, v]) => a + v.length, 0)} 文件`)
  console.log(`协议面：client ${stats.surface.client.length} / server requests ${stats.surface.serverRequest.length} / notifications ${stats.surface.notification.length}`)
  console.log(`只在历史表里的方法：${stats.removedMethods.length} 个`)
  console.log(`链接改路径 ${stats.relocated.length} 条 / 降级为行内代码 ${stats.delinked.length} 条`)
  if (stats.relocated.length) for (const r of stats.relocated.slice(0, 5)) console.log(`  ~ ${r.from} -> ${r.to}`)
  if (stats.delinked.length) for (const d of stats.delinked.slice(0, 5)) console.log(`  - ${d.label} (${d.target})`)
  console.log(`文档：${current.split(EOL).length} 行 -> ${nextCrlf.split(EOL).length} 行`)

  if (mode === 'check') {
    console.log(same ? '结论：文档派生部分与快照一致（drift = 0）' : '结论：文档派生部分已漂移，请跑 --apply')
    process.exit(same ? 0 : 1)
  }
  if (mode === 'dry-run') {
    console.log(`dry-run 结束（未落盘）。${same ? '无差异' : '有差异'}`)
    return
  }
  fs.writeFileSync(DOC_PATH, nextCrlf, 'utf8')
  console.log('apply 完成：已写回 documentation/APP_SERVER_DOCUMENTATION.md')
}

main()
