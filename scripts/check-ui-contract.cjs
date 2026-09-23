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
function readTokens(block) {
  const out = {}
  if (!block) return out
  for (const m of block[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) out[m[1]] = m[2]
  return out
}
// `:root` 是亮色基线、`:root.dark` 是暗色覆盖（与 style.css 里「不带前缀的规则是亮色基线」
// 的结构一致）。两套都必须齐全，并且各自满足自己的对比度下限——只查一套会让另一套悄悄退化。
const lightBlock = css.match(/\n:root \{([\s\S]*?)\n\}/)
const darkBlock = css.match(/\n:root\.dark \{([\s\S]*?)\n\}/)
check(':root（亮色）token 块存在', Boolean(lightBlock), STYLE)
check(':root.dark（暗色）token 块存在', Boolean(darkBlock), STYLE)
const LIGHT = readTokens(lightBlock)
const DARK = readTokens(darkBlock)
const missingLight = REQUIRED_TOKENS.filter((t) => !LIGHT[t])
const missingDark = REQUIRED_TOKENS.filter((t) => !DARK[t])
check(`亮色 token 齐全（${REQUIRED_TOKENS.length} 个）`, missingLight.length === 0, missingLight.join(', '))
check(`暗色 token 齐全（${REQUIRED_TOKENS.length} 个）`, missingDark.length === 0, missingDark.join(', '))

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

// 正文与次级文字：两套主题下都必须对每一个表面达标。
const under = []
for (const [theme, TOK] of [
  ['暗色', DARK],
  ['亮色', LIGHT],
]) {
  for (const ink of ['--ink-1', '--ink-2', '--ink-3']) {
    for (const s of ['--s0', '--s1', '--s2', '--s3', '--s4']) {
      const r = contrast(TOK[ink], TOK[s])
      if (r < AA) under.push(`${theme} ${ink} on ${s} = ${r.toFixed(2)}:1`)
    }
  }
}
check('ink-1/2/3 对全部 5 个表面 ≥4.5:1（两套主题）', under.length === 0, under.join('; '))

// 最低一级墨：只在「它确实达标」的地方允许承载文字。暗色下它承载了 12px 时间戳，
// 所以必须对 s0/s1/s2 达标；亮色下它到不了 AA，因此亮色侧不许把它用在文字上。
const ink4bad = []
for (const s of ['--s0', '--s1', '--s2']) {
  const r = contrast(DARK['--ink-4'], DARK[s])
  if (r < AA) ink4bad.push(`${s}=${r.toFixed(2)}:1`)
}
check('暗色 ink-4 对 s0/s1/s2 ≥4.5:1（它承载时间戳等正文级小字）', ink4bad.length === 0, ink4bad.join('; '))

const ink4OnS3 = contrast(DARK['--ink-4'], DARK['--s3'])
check(
  '暗色 ink-4 对 s3 仍低于 AA（已知上限，留 P1 调值）',
  ink4OnS3 < AA,
  `s3=${ink4OnS3.toFixed(2)}:1（迁移前 zinc-500 在该背景只有 2.16:1）`,
)

const lightInk4Worst = contrast(LIGHT['--ink-4'], LIGHT['--s0'])
check(
  '亮色 ink-4 不可承载文字（低于 AA，仅作非文本）',
  lightInk4Worst < AA,
  `对亮色 s0 只有 ${lightInk4Worst.toFixed(2)}:1`,
)
// 上面那条只有在「亮色侧真的没拿它写文字」时才有意义——否则它就是一条自证的废话。
const lightInk4Text = []
{
  let inDark = false
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!inDark) {
      if (/^:root\.dark\b/.test(trimmed) && trimmed.includes('{')) {
        if (!trimmed.endsWith('}')) inDark = true
        continue
      }
      if (/\btext-ink-4\b/.test(lines[i])) lightInk4Text.push(i + 1)
      continue
    }
    if (trimmed === '}' || trimmed.startsWith('}')) inDark = false
  }
}
check(
  '亮色侧没有把 ink-4 用在文字上',
  lightInk4Text.length === 0,
  lightInk4Text.length ? `行 ${lightInk4Text.join(', ')}` : '',
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
