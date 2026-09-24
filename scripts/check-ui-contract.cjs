#!/usr/bin/env node
// UI 契约检查（P0）：把「设计系统不该退化」这件事变成可复跑的断言。
//
// 断言的是**计数与取值**，不是毫秒——稳定、不会因为机器负载抖动而误报。
//
// 扫描范围 = **全部 CSS 单元**：src/style.css 加上每个 .vue 的 <style> 块。这一点很关键：
// 原先只扫 style.css 却断言「深色覆盖层已无裸色板」，于是组件 <style> 里另外 108 处
// 暗色覆盖类（:global(:root.dark) …）全都溜了过去——闸门覆盖不到的地方就等于没有闸门。
//
// 用法: node scripts/check-ui-contract.cjs
const fs = require('fs')
const path = require('path')

const STYLE = 'src/style.css'
const FONT_DIR = 'public/fonts'

// 基线：迁移前的实测值。断言的语义是「不得退化」，不是「必须等于」。
const BASELINE = {
  arbitraryText: 147, // 全 src 的 text-[Npx] 临时字号
  lightNaked: 1112, // 亮色基线里的裸 zinc/slate 颜色类（两套主题都对等时才能换掉）
  statusNakedInStyle: 250, // style.css 内的状态色裸类（亮暗都在，P1 迁移）
}

let failed = 0
const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  if (!pass) failed++
}

// ------------------------------------------------------------ 收集 CSS 单元
// ring-offset-* 也要算进来：它同样是「暗色层里的裸色板」，漏掉它闸门就有洞（实测漏过 2 处）。
const NAKED_NS = /(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|placeholder|outline|decoration|shadow|accent|caret)(?:-[trblxy])?-(?:zinc|slate)-\d{2,3}/
const STATUS = /(?:bg|text|border|ring)-(?:rose|emerald|amber|sky|red|blue|violet)-\d{2,3}/

function walkVue(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkVue(p, out)
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

const vueFiles = walkVue('src')
const units = [{ label: STYLE, text: fs.readFileSync(STYLE, 'utf8') }]
for (const f of vueFiles) {
  const src = fs.readFileSync(f, 'utf8')
  let i = 0
  for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    units.push({ label: `${f}#style${i++}`, text: m[1] })
  }
}

// 逐字符扫描，判读每个类名落在「暗色覆盖层」还是「亮色基线」。
// 选择器可能写成 `:root.dark .x {`、`:global(:root.dark) .a, :global(:root.dark) .b {`，
// 也可能包在 @media 里；逐行正则判块会在 `}` 与 `{` 不同行时读错状态，所以按字符扫。
function classify(text) {
  const stack = []
  const dark = []
  const light = []
  let i = 0
  let segStart = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{') {
      const sel = text.slice(segStart, i).trim()
      const at = /^@(media|supports|layer|container|document)/.test(sel)
      stack.push(at ? stack[stack.length - 1] || false : /:root\.dark/.test(sel))
      segStart = i + 1
    } else if (ch === '}') {
      stack.pop()
      segStart = i + 1
    } else if (/[a-z-]/.test(ch)) {
      const m = /^[A-Za-z0-9_:/[\]().%-]+/.exec(text.slice(i))
      if (m) {
        ;(stack.some(Boolean) ? dark : light).push(m[0])
        i += m[0].length
        continue
      }
    }
    i++
  }
  return { dark, light }
}

const nakedDarkWhere = []
const nakedLightWhere = []
let nakedDarkTotal = 0
let nakedLightTotal = 0
const lightTokens = []
const classByUnit = new Map()
for (const u of units) {
  const r = classify(u.text)
  classByUnit.set(u.label, r)
  const d = r.dark.filter((t) => NAKED_NS.test(t)).length
  const l = r.light.filter((t) => NAKED_NS.test(t)).length
  nakedDarkTotal += d
  nakedLightTotal += l
  if (d) nakedDarkWhere.push(`${u.label}(${d})`)
  if (l) nakedLightWhere.push(`${u.label}(${l})`)
  if (u.label === STYLE) lightTokens.push(...r.light)
}

const css = units[0].text

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
  '--live', // 运行中 / 待批准
  '--ok', // 完成 / 已连接
  '--alert', // 失败 / 破坏性
  '--model', // 仅模型身份
  '--line-focus', // 焦点环
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
check(
  '深色覆盖层已无裸色板（style.css + 全部组件 <style>）',
  nakedDarkTotal === 0,
  nakedDarkTotal ? nakedDarkWhere.join(', ') : `扫描 ${units.length} 个 CSS 单元`,
)
check(
  `亮色基线裸色板不增（基线 ${BASELINE.lightNaked}，待两套主题对等后统一迁移）`,
  nakedLightTotal > 0 && nakedLightTotal <= BASELINE.lightNaked,
  `当前 ${nakedLightTotal}`,
)

// 组件样式要用 token 类，@reference 必须指向项目样式表；指向 "tailwindcss" 只会拿到
// 框架默认主题，`@apply bg-s1` 会在构建期报 unknown utility class。
const badRef = vueFiles.filter((f) => fs.readFileSync(f, 'utf8').includes('@reference "tailwindcss"'))
check(
  '组件 @reference 指向项目样式表（否则 token 类不可 @apply）',
  badRef.length === 0,
  badRef.slice(0, 3).join(', '),
)

// ------------------------------------------- 状态色裸类不增（P1 才迁移）
const statusLeft = (css.match(new RegExp(STATUS.source, 'g')) || []).length
check(
  `style.css 内状态色裸类不增（基线 ${BASELINE.statusNakedInStyle}，P1 迁移时应下降）`,
  statusLeft <= BASELINE.statusNakedInStyle,
  `当前 ${statusLeft}`,
)

// ------------------------------------ 技能库与定时任务不得共用同一个字形
// 审计里的第①条确凿缺陷：这两个语义完全不同的入口用的是同一个闪电 SVG，只靠翠绿/橙区分。
// 颜色一旦不成立（色觉障碍、灰度截图、缩到 22px），两个入口就再也分不出来——所以必须靠字形，
// 而不是靠颜色。这条断言就是那个缺陷的回归闸门。
const appVue = fs.readFileSync('src/App.vue', 'utf8')
function glyphAfter(atClass) {
  const m = appVue.match(new RegExp(`class="${atClass}"[\\s\\S]{0,200}?<(IconTabler\\w+)`))
  return m ? m[1] : null
}
const glyphPairs = [
  ['侧栏', 'sidebar-skills-link-icon', 'sidebar-skills-link-icon sidebar-automations-link-icon'],
  ['路由头部', 'skills-route-header-icon', 'skills-route-header-icon automations-route-header-icon'],
]
const sharedGlyph = glyphPairs
  .map(([where, a, b]) => [where, glyphAfter(a), glyphAfter(b)])
  .filter(([, a, b]) => !a || !b || a === b)
check(
  '技能库与定时任务用不同字形（不能只靠颜色区分）',
  sharedGlyph.length === 0,
  sharedGlyph.length
    ? sharedGlyph.map(([w, a, b]) => `${w}: ${a || '缺失'} vs ${b || '缺失'}`).join('; ')
    : glyphPairs
        .map(([w, a, b]) => `${w} ${glyphAfter(a)}/${glyphAfter(b)}`)
        .join(' · '),
)

// ------------------------------ 输入区：模型前置 / 用 --model 标示 / 一屏一个主按钮
// 审计第②条确凿缺陷：协作模式、审批策略、模型、推理强度这四个语义完全不同的下拉长得一模一样
// （同为全圆角药丸、同为 s3 底 + ink-3 字），模型还排在第三位。修法＝模型前置并用 --model
// 标明身份、其余三个退成中性芯片并合并成一组、发送按钮改用最亮墨色。下面四条就是它的闸门。
const composerVue = fs.readFileSync('src/components/content/ThreadComposer.vue', 'utf8')
const modelControlsVue = fs.readFileSync('src/components/content/ThreadComposerModelControls.vue', 'utf8')

const atModel = composerVue.indexOf('<ThreadComposerModelControls')
const atSecondary = composerVue.indexOf('thread-composer-secondary')
const atApproval = composerVue.indexOf('thread-composer-approval-trigger')
check(
  '输入区：模型控件排在协作模式 / 审批策略之前',
  atModel > -1 && atSecondary > -1 && atApproval > -1 && atModel < atSecondary && atModel < atApproval,
  `model@${atModel} · secondary@${atSecondary} · approval@${atApproval}`,
)

check(
  '输入区：模型芯片用 --model 标示（不与其余三个中性芯片同款）',
  /text-model/.test(modelControlsVue) && /border-model/.test(modelControlsVue),
  'ThreadComposerModelControls.vue 中应出现 text-model + border-model',
)

const submitRule = composerVue.match(/\n\.thread-composer-submit \{([\s\S]*?)\n\}/)
check(
  '输入区：发送按钮用最亮墨色（--ink-1）而非强调色',
  Boolean(submitRule) && /bg-ink-1/.test(submitRule[1]),
  submitRule ? submitRule[1].replace(/\s+/g, ' ').trim().slice(0, 70) : '未找到 .thread-composer-submit 规则',
)

const queueRule = composerVue.match(/\n\.thread-composer-submit--queue \{([\s\S]*?)\n\}/)
check(
  '输入区：队列态用 --live token（不再是裸 amber-600）',
  Boolean(queueRule) && /bg-live/.test(queueRule[1]) && !/amber-\d/.test(queueRule[1]),
  queueRule ? queueRule[1].replace(/\s+/g, ' ').trim() : '未找到 .thread-composer-submit--queue 规则',
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
const lightInk4Text = lightTokens.filter((t) => /(?:^|:)text-ink-4$/.test(t))
check(
  '亮色侧（style.css 不带 :root.dark 前缀的规则）没有把 ink-4 用在文字上',
  lightInk4Text.length === 0,
  lightInk4Text.slice(0, 3).join(', '),
)

// -------------------------------------------------- 状态色可辨认（而不是装饰色）
// 状态色要当图标与标签用，因此对两个主表面都得达到 UI 组件的 3:1；达不到就只剩装饰作用，
// 而规则一是「颜色只表示状态」——装饰性的强调色恰恰是这次要清掉的东西。
const weakStatus = []
for (const [theme, TOK] of [
  ['暗色', DARK],
  ['亮色', LIGHT],
]) {
  for (const t of ['--live', '--ok', '--alert', '--model']) {
    for (const s of ['--s1', '--s2']) {
      const r = contrast(TOK[t], TOK[s])
      if (r < 3) weakStatus.push(`${theme} ${t} on ${s} = ${r.toFixed(2)}:1`)
    }
  }
}
check(
  '状态色对 s1/s2 ≥3:1（两套主题）',
  weakStatus.length === 0,
  weakStatus.join('; ') || 'live/ok/alert/model × 2 主题 × 2 表面',
)

// -------------------------------------------------------- 字号临时值不增
let arbitraryText = 0
for (const f of [...vueFiles, STYLE]) {
  arbitraryText += (fs.readFileSync(f, 'utf8').match(/text-\[[0-9]/g) || []).length
}
check(
  `全 src 的 text-[Npx] 临时字号不增（基线 ${BASELINE.arbitraryText}）`,
  arbitraryText <= BASELINE.arbitraryText,
  `当前 ${arbitraryText}（扫描 ${vueFiles.length + 1} 个文件）`,
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
if (nakedLightWhere.length) {
  console.log(`\n  亮色基线里仍留着裸色板的单元（共 ${nakedLightTotal} 处，P0 不动）：`)
  for (const w of nakedLightWhere.slice(0, 12)) console.log(`    ${w}`)
}
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}  (${results.length - failed}/${results.length})`)
process.exit(failed === 0 ? 0 : 1)
