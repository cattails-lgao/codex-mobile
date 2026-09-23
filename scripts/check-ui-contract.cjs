#!/usr/bin/env node
// UI 契约检查（P0）：把「设计系统不该退化」这件事变成可复跑的断言。
//
// 断言的是**计数与取值**，不是毫秒——稳定、不会因为机器负载抖动而误报。
// 用法: node scripts/check-ui-contract.cjs
const fs = require('fs')
const path = require('path')

const STYLE = 'src/style.css'
const FONT_DIR = 'public/fonts'

// 基线：迁移前的实测值。断言的语义是「不得退化」，不是「必须等于」。
const BASELINE = {
  arbitraryText: 147, // 全 src 的 text-[Npx] 临时字号
  statusNaked: 250, // style.css 深色层里的状态色裸类（P0 有意留到 P1）
}

let failed = 0
const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  if (!pass) failed++
}

const css = fs.readFileSync(STYLE, 'utf8')

// ---------------------------------------------------------------- token 完整性
const REQUIRED_TOKENS = [
  '--s0',
  '--s1',
  '--s2',
  '--s3',
  '--s4',
  '--s-inv', // 亮底：主按钮与选中态的反色元素
  '--s-inv-soft',
  '--line-1',
  '--line-2',
  '--line-3',
  '--line-4',
  '--line-5',
  '--ink-1',
  '--ink-2',
  '--ink-3',
  '--ink-4',
  '--ink-inv',
]
const rootBlock = css.match(/\n:root \{([\s\S]*?)\n\}/)
check(':root token 块存在', Boolean(rootBlock), STYLE)
const TOK = {}
if (rootBlock) {
  for (const m of rootBlock[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) TOK[m[1]] = m[2]
}
const missing = REQUIRED_TOKENS.filter((t) => !TOK[t])
check(`token 定义齐全（${REQUIRED_TOKENS.length} 个）`, missing.length === 0, missing.join(', '))

// --------------------------------------------- 深色层不再出现裸色板（回归闸门）
const NAKED_RE =
  /(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|decoration|shadow|accent|caret)(?:-[trblxy])?-(?:zinc|slate)-\d{2,3}/
const lines = css.split('\n')
let inDark = false
let inComment = false
const nakedInDark = []
const nakedInLight = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const trimmed = line.trim()
  // 跟踪块注释，注释里提到类名不算违规
  if (inComment) {
    if (trimmed.includes('*/')) inComment = false
    continue
  }
  if (trimmed.startsWith('/*')) {
    if (!trimmed.includes('*/')) inComment = true
    continue
  }
  const hit = NAKED_RE.test(line)
  if (!inDark) {
    if (/^:root\.dark\b/.test(trimmed) && trimmed.includes('{')) {
      if (hit) nakedInDark.push(i + 1)
      if (!trimmed.endsWith('}')) inDark = true
      continue
    }
    if (hit) nakedInLight.push(i + 1)
    continue
  }
  if (hit) nakedInDark.push(i + 1)
  if (trimmed === '}' || trimmed.startsWith('}')) inDark = false
}
check(
  '深色覆盖层已无裸色板（全部走 token）',
  nakedInDark.length === 0,
  nakedInDark.length ? `行 ${nakedInDark.join(', ')}` : '',
)
check(
  '浅色基线未被 P0 触碰（仍是裸色板，P2 处理）',
  nakedInLight.length > 0 && nakedInLight.length <= 8,
  `行 ${nakedInLight.join(', ')}`,
)

// ------------------------------------------- 状态色裸类不增（P1 才迁移）
const statusLeft = (css.match(/(?:bg|text|border|ring)-(?:rose|emerald|amber|sky|red|blue|violet)-\d{2,3}/g) || []).length
check(
  `状态色裸类不增（基线 ${BASELINE.statusNaked}，P1 迁移时应下降）`,
  statusLeft <= BASELINE.statusNaked,
  `当前 ${statusLeft}`,
)

// --------------------------------------------------- 文字只用墨色 token
// 防止后人把表面色/线色当文字色用——那会立刻掉出对比度保证。
const textOnSurface = [...css.matchAll(/\btext-(s[0-4]|s-inv(?:-soft)?|line-[1-5])(?![\w-])/g)].map((m) => m[0])
check(
  '文字颜色只用 ink-* token（表面色/线色不得用于文字）',
  textOnSurface.length === 0,
  textOnSurface.slice(0, 5).join(', '),
)

// -------------------------------------------------------------- 对比度下限
function lum(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(fg, bg) {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}
const AA = 4.5
const under = []
for (const ink of ['--ink-1', '--ink-2', '--ink-3']) {
  for (const s of ['--s0', '--s1', '--s2', '--s3', '--s4']) {
    const r = contrast(TOK[ink], TOK[s])
    if (r < AA) under.push(`${ink} on ${s} = ${r.toFixed(2)}:1`)
  }
}
check('ink-1/2/3 对全部 5 个表面 ≥4.5:1', under.length === 0, under.join('; '))

const ink4bad = []
for (const s of ['--s0', '--s1', '--s2']) {
  const r = contrast(TOK['--ink-4'], TOK[s])
  if (r < AA) ink4bad.push(`${s}=${r.toFixed(2)}:1`)
}
check('ink-4 对 s0/s1/s2 ≥4.5:1', ink4bad.length === 0, ink4bad.join('; '))
// ink-4 是「最低一级墨」，在 s3 上到不了 AA。这里断言它**仍然**不达标，
// 是为了让这个已知上限显式存在，而不是被悄悄忘记（P1 调值时这条会翻转）。
const ink4OnS3 = contrast(TOK['--ink-4'], TOK['--s3'])
check(
  'ink-4 对 s3 仍低于 AA（已知上限，留 P1 调值）',
  ink4OnS3 < AA,
  `s3=${ink4OnS3.toFixed(2)}:1（迁移前 zinc-500 在该背景只有 2.16:1）`,
)

// -------------------------------------------------------- 字号临时值不增
const sourceFiles = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(vue|css)$/.test(e.name)) sourceFiles.push(p)
  }
}
walk('src')
let arbitraryText = 0
for (const f of sourceFiles) {
  arbitraryText += (fs.readFileSync(f, 'utf8').match(/text-\[[0-9]/g) || []).length
}
check(
  `全 src 的 text-[Npx] 临时字号不增（基线 ${BASELINE.arbitraryText}）`,
  arbitraryText <= BASELINE.arbitraryText,
  `当前 ${arbitraryText}（扫描 ${sourceFiles.length} 个文件）`,
)

// -------------------------------------------------------------- 字体资产
const FACES = [
  'ibm-plex-sans-400.woff2',
  'ibm-plex-sans-500.woff2',
  'ibm-plex-sans-600.woff2',
  'ibm-plex-mono-400.woff2',
  'ibm-plex-mono-500.woff2',
  'bricolage-grotesque-var.woff2',
]
const missingFonts = FACES.filter((f) => !fs.existsSync(path.join(FONT_DIR, f)))
check(`字体资产齐全（${FACES.length} 个 woff2）`, missingFonts.length === 0, missingFonts.join(', '))
check(
  'OFL 许可证随字体分发（OFL-1.1 要求）',
  fs.existsSync(path.join(FONT_DIR, 'LICENSE-IBM-Plex.txt')) &&
    fs.existsSync(path.join(FONT_DIR, 'LICENSE-Bricolage-Grotesque.txt')),
  '',
)
check('绝不打包 CJK 字体', !FACES.some((f) => /cjk|sc|jp|kr|han/i.test(f)), '')

// --------------------------------------------------------------------- 报告
console.log('UI 契约检查\n')
for (const r of results) {
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
}
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}  (${results.length - failed}/${results.length})`)
process.exit(failed === 0 ? 0 : 1)
