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
  `亮色基线裸色板清零（round-97 收敛，原基线 ${BASELINE.lightNaked}）`,
  nakedLightTotal === 0,
  nakedLightTotal ? nakedLightWhere.join(', ') : '亮侧（暗色覆盖块之外）已无 zinc/slate/状态色板类',
)

// round-98 暗色覆盖层退役：暗色块内不再有 raw 档位类（任何色系）。基线 token 自动切
// 主题，暗色特化只允许非颜色属性（shadow-none 等）与 text-white 这类反色墨。
const DARK_RAW_NS = /(?:bg|text|border|ring|placeholder|from|to|via|divide|outline|decoration|shadow|accent|caret|fill|stroke)(?:-[trblxy])?-(?:zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/
const darkRawWhere = []
let darkRawTotal = 0
for (const u of units) {
  const r = classByUnit.get(u.label)
  const d = r.dark.filter((t) => DARK_RAW_NS.test(t)).length
  darkRawTotal += d
  if (d) darkRawWhere.push(`${u.label}(${d})`)
}
check(
  '暗色覆盖层 raw 档位清零（round-98 退役）',
  darkRawTotal === 0,
  darkRawTotal ? darkRawWhere.slice(0, 8).join(', ') : '暗色块内已无任何 raw 色板类',
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

// ------------------------------------------------- 会话区：工具调用行（签名组件）
// 方案 §5 P1 的签名组件：等宽命令名 + 耗时/字节读数 + OK/RUN 徽记（度量稿 .toolrow）。
// 改造前状态色是 amber/emerald/rose 裸类 + #737373 硬编码（还叠着全局暗色层同权重覆盖）；
// 改造后颜色只表示状态、一律走状态 token。下面两条是它的回归闸门。
const workBlockVue = fs.readFileSync('src/components/content/WorkBlockItem.vue', 'utf8')
const toolCallVue = fs.readFileSync('src/components/content/ToolCallRow.vue', 'utf8')
const toolRowSources = [
  ['WorkBlockItem.vue', workBlockVue],
  ['ToolCallRow.vue', toolCallVue],
]
// 工具行的旧状态色（500/600 阶）与硬编码灰。权限提示面板的 amber-50/200/800 属于
// 警示表面、不在此列，所以模式只锁 500/600 两阶。
const legacyToolRowColorHits = toolRowSources
  .map(([name, src]) => [name, src.match(/#737373|amber-(?:500|600)|emerald-(?:500|600)|rose-(?:500|600)/g) || []])
  .filter(([, hits]) => hits.length)
check(
  '工具调用行状态色只用状态 token（amber/emerald/rose 裸类与 #737373 已清）',
  legacyToolRowColorHits.length === 0,
  legacyToolRowColorHits.map(([n, h]) => `${n}: ${h.slice(0, 3).join(',')}`).join('; ') ||
    'WorkBlockItem.vue + ToolCallRow.vue',
)
const monoRowSelectors = [
  ['WorkBlockItem.vue', workBlockVue, ['work-block-command', 'work-block-metric', 'work-block-status']],
  ['ToolCallRow.vue', toolCallVue, ['tool-call-name', 'tool-call-metric', 'tool-call-status']],
]
const nonMonoRowRules = (() => {
  const bad = []
  for (const [name, src, selectors] of monoRowSelectors) {
    for (const sel of selectors) {
      const rule = src.match(new RegExp(`\\.${sel} \\{([^}]*)\\}`))
      if (!rule || !/font-mono/.test(rule[1])) bad.push(`${name} .${sel}`)
    }
  }
  return bad
})()
check(
  '工具调用行命令名 / 读数 / 徽记都用等宽（机器口径）',
  nonMonoRowRules.length === 0,
  nonMonoRowRules.join(', ') || 'command + metric + status × 2 组件',
)

// ------------------------------------------------- 会话区：代码块楼层（round-94）
// 度量稿 pre：s2 表面 + 发丝 line-1 边 + 14px 圆角，bar（语言左 / 复制右）走 s1，
// 代码区 ink-2。改造前是永远深底的 bg-slate-950 裸色板 + slate 系标签；楼层颜色
// 一律 token 化，且复制控件必须同时存在于两条渲染路径（模板 + v-html）。
const conversationVue = fs.readFileSync('src/components/content/ThreadConversation.vue', 'utf8')
const markdownRenderingTs = fs.readFileSync('src/components/content/useMarkdownRendering.ts', 'utf8')
const codeFloorRule = conversationVue.match(/\n\.message-code-block \{([^}]*)\}/)
check(
  '代码块楼层颜色只用 token（不再永远深底的裸色板）',
  Boolean(codeFloorRule) &&
    /bg-s2/.test(codeFloorRule[1]) &&
    /border-line-1/.test(codeFloorRule[1]) &&
    !/slate-|zinc-|gray-/.test(codeFloorRule[1]),
  codeFloorRule ? codeFloorRule[1].replace(/\s+/g, ' ').trim() : '未找到 .message-code-block 规则',
)
const codeCopyPathHits = [
  ['ThreadConversation.vue', conversationVue],
  ['useMarkdownRendering.ts', markdownRenderingTs],
]
  .map(([name, src]) => [name, /data-code-copy/.test(src) && /message-code-copy/.test(src)])
  .filter(([, ok]) => !ok)
  .map(([name]) => name)
check(
  '代码块复制控件两条渲染路径都在（模板 + v-html，data-code-copy 委托）',
  codeCopyPathHits.length === 0,
  codeCopyPathHits.join(', ') || 'ThreadConversation.vue + useMarkdownRendering.ts',
)

// ------------------------------------------- 会话区标题层级 + 侧栏线程行（round-95）
// 标题：h1-h6 必须各自不同档（-xl/lg/base/sm，标准 Tailwind 档、不加 text-[Npx]），
// 且全部落在 ink-1 上——层级靠字号与字距，不靠色相。
const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
  .map((level) => {
    const rule = conversationVue.match(new RegExp(`\\.message-heading-${level} \\{([^}]*)\\}`))
    return [level, rule ? rule[1].replace(/\s+/g, ' ').trim() : '']
  })
const headingSizes = headingLevels.map(([level, body]) => [level, (body.match(/text-(?:xl|lg|base|sm)/) || [])[0] || '?'])
const headingSizeSet = new Set(headingSizes.map(([, size]) => size))
check(
  'Markdown 标题分级落在标准字号档（h1-h4 递减 20/18/16/14，h5/h6 并入 14 靠字距）',
  headingLevels.every(([, body]) => body) &&
    new Set(headingSizes.slice(0, 4).map(([, s]) => s)).size === 4 &&
    headingSizes.every(([, s]) => s !== '?'),
  headingSizes.map(([l, s]) => `${l}=${s}`).join(' ') || '未找到 heading 规则',
)
// 过程消息（conversation-item-process）里的标题是有意的次级样式（15px 弱化），不在本断言范围。
// 行锚定（^ + m）保证捕获完整选择器行，前缀过滤才有效。
const headingOffToken = conversationVue.match(/^[^{}\n]*\.message-heading(?:-h\d)? \{[^}]*\}/gm)
  ?.filter((rule) => !rule.includes('conversation-item-process'))
  ?.filter((rule) => /#(?:[0-9a-f]{3,6})|slate-|zinc-/.test(rule)) ?? []
check(
  'Markdown 标题颜色只用 ink token（round-23 的 #17181a 硬编码已清）',
  headingOffToken.length === 0,
  headingOffToken.slice(0, 3).join(' | '),
)

// ------------------------------------------- 排版阶梯归档（round-117）
// UI 层不得再使用阶梯外的 text-sm(14px)：阶梯是 micro 11 / meta 12 / ui 13 /
// body 15 / h3 18 / h2 24 / display 40（另加 nano 10）。162 处 text-sm 已按语义
// 归档——会话正文 → text-body(15)，控件/列表行/面板正文 → text-ui(13)。
// 唯一允许的例外是 Markdown 标题链（h4/h5/h6），它走 Tailwind 默认档体系，
// 由上方「Markdown 标题分级」断言单独管辖。
const textSmHits = []
for (const file of vueFiles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (/\btext-sm\b/.test(line)) textSmHits.push(`${path.basename(file)}:${i + 1}`)
  })
}
check(
  'UI 字号不落在阶梯外：text-sm(14px) 只余 Markdown 标题链 3 处',
  textSmHits.length === 3 && textSmHits.every((h) => h.startsWith('ThreadConversation.vue')),
  textSmHits.length ? textSmHits.join(', ') : '无',
)
// 线程行：相对时间等宽（机器口径）、运行 pip 用 --live、选中行有中性导轨。
const threadRowVue = fs.readFileSync('src/components/sidebar/SidebarThreadRow.vue', 'utf8')
const rowTimeRule = threadRowVue.match(/\n\.thread-row-time \{([^}]*)\}/)
check(
  '线程行相对时间用等宽 + tabular-nums（度量稿 .when）',
  Boolean(rowTimeRule) && /font-mono/.test(rowTimeRule[1]) && /tabular-nums/.test(rowTimeRule[1]),
  rowTimeRule ? rowTimeRule[1].replace(/\s+/g, ' ').trim() : '未找到 .thread-row-time 规则',
)
check(
  '线程行运行 pip 用 --live（spinner 退场）且选中行有中性导轨',
  /data-state='working'[^}]*bg-live/.test(threadRowVue) &&
    /data-active='true'\]::before[\s\S]*?bg-ink-2/.test(threadRowVue),
  'SidebarThreadRow.vue（working→pip live；active→2px ink-2 rail）',
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

// -------------------------------------------------------- 状态色底字不可同色
// 回归形态（round-97 sweep 引入、round-98 修复）：浅色状态底被错映射成实色 token 底，
// 与同色 token 文字叠加后不可读（bg-alert bg-alert 上写 text-alert）。实色底上的文字
// 只允许 ink-inv（实心按钮）这类反色墨；带透明度的淡底（bg-ok/10）不算实色底。
const sameColorBgText = []
for (const f of [...vueFiles, STYLE]) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] + ' ' + (lines[i + 1] || '')
    for (const s of ['ok', 'alert', 'live', 'model']) {
      const solidBg = new RegExp(`(?<![-\\w/:])bg-${s}(?![-\\w/])`)
      const txt = new RegExp(`(?<![-\\w/:])text-${s}(?![-\\w/])`)
      const hoverSolid = new RegExp(`(?<![-\\w/:])hover:bg-${s}(?![-\\w/])`)
      const hoverTxt = new RegExp(`(?<![-\\w/:])hover:text-${s}(?![-\\w/])`)
      if ((solidBg.test(line) && txt.test(line)) || (hoverSolid.test(line) && hoverTxt.test(line))) {
        sameColorBgText.push(`${f}:${i + 1} bg-${s}+text-${s}`)
        break
      }
    }
  }
}
check(
  '状态色底与同色文字不共存（实色底上的文字必须是反色墨）',
  sameColorBgText.length === 0,
  sameColorBgText.slice(0, 5).join('; ') || 'ok/alert/live/model × bg+text 无同色叠加',
)

// -------------------------------------------------------- 字号临时值不增
let arbitraryText = 0
for (const f of [...vueFiles, STYLE]) {
  // 只计固定 px/rem 任意值；text-[1em] 是「继承字号」重置（等宽于 inherit），不属阶梯违规。
  arbitraryText += (fs.readFileSync(f, 'utf8').match(/text-\[\d+(\.\d+)?(px|rem)\]/g) || []).length
}
check(
  `全 src 的 text-[Npx] 临时字号清零（基线 ${BASELINE.arbitraryText}，round-96 阶梯化）`,
  arbitraryText === 0,
  `当前 ${arbitraryText}（扫描 ${vueFiles.length + 1} 个文件）`,
)
// 阶梯 token（round-96）：nano/micro/ui/body 必须在非 inline @theme 里定义——
// 12px 复用 text-xs，18/24/40px 复用 text-lg/2xl 与 display 字体。
const ladderTokens = ['--text-nano', '--text-micro', '--text-ui', '--text-body']
const missingLadder = ladderTokens.filter((t) => !new RegExp(`^\\s*${t}:`, 'm').test(fs.readFileSync(STYLE, 'utf8')))
check(
  '排版阶梯 token（nano 10 / micro 11 / ui 13 / body 15）已在 @theme 定义',
  missingLadder.length === 0,
  missingLadder.join(', ') || ladderTokens.join(' / '),
)

// ------------------------------------------------- 字母头像占位符清零（round-99）
// 回归形态：目录/技能库卡片用 `xxx.charAt(0)` 渲染字母头像占位符——不同实体首字相同
// 时完全无法区分（两个不同 MCP 都显示「C」）。真实 logo/avatar 图片保留，占位符禁止。
const fallbackHits = []
for (const f of vueFiles) {
  const src = fs.readFileSync(f, 'utf8')
  if (/(?:avatar-fallback|card-fallback|composio-fallback)/.test(src)) {
    fallbackHits.push(`${f}: fallback 类残留`)
    continue
  }
  // <template> 块内的 charAt(0)（脚本里的首字母大写、状态解析不算）
  const tpl = src.match(/<template>[\s\S]*<\/template>/)
  if (tpl && tpl[0].includes('charAt(0)')) fallbackHits.push(`${f}: template 内 charAt(0)`)
}
check(
  '字母头像占位符清零（去「不同 MCP 都显示 C」的占位符）',
  fallbackHits.length === 0,
  fallbackHits.slice(0, 5).join('; ') || '目录/技能库/弹窗头无字母占位符，真实图片保留',
)

// ------------------------------------------------------------ 动效阶梯（round-99）
// §4：悬停/按压 120ms 是全站默认（Tailwind transition 工具类直接读这两个 @theme 变量）。
const styleSrc = fs.readFileSync(STYLE, 'utf8')
const motionMissing = [
  ['--default-transition-duration: 120ms', '默认时长 120ms'],
  ['--default-transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1)', '统一缓动'],
].filter(([needle]) => !styleSrc.includes(needle))
check(
  '动效阶梯：120ms 默认时长 + 标准缓动已在 @theme 定义',
  motionMissing.length === 0,
  motionMissing.map(([, label]) => label).join(', ') || '悬停/按压 120ms + cubic-bezier(.22,.61,.36,1)',
)

// ------------------------------------------------- 覆盖层不得顶掉它盖住的内容（round-125）
// 审查面板是 <Teleport to="body"> 的全屏覆盖层，它与会话列**必须是同一槽位里并存的两个**。
// 曾经它不是：提交 0e147705「Show review pane in place of thread content」把它和会话列做成
// `v-if`/`v-else` 互斥分支 ⇒ 打开面板＝卸载整条会话 ⇒ 关闭时全新挂载、scrollTop 回到默认 0，
// 用户看到「消息列表跳回最顶部」，并连带丢掉已上翻分页 / autoFollowOutput / 图片预览 / 变更
// 动作态等全部内部状态（还白付一次整条线程重渲）。这是结构性不变式，钉住它。
// 实测口径：同一 harness 在改动前 count=0、scrollTop 2018→0；改动后 count=1、2018→2018。
const appLines = fs.readFileSync('src/App.vue', 'utf8').split(/\r?\n/)
const paneAt = appLines.findIndex((l) => l.trim().startsWith('<ReviewPane'))
const threadAt = appLines.findIndex((l) => l.trim() === '<div class="content-thread">')
const vElseWrapsThread = threadAt > 0 &&
  appLines.slice(Math.max(0, threadAt - 3), threadAt).some((l) => l.trim().startsWith('<template v-else>'))
check(
  '审查面板是覆盖层，不得与会话列构成 v-if/v-else 互斥（round-125）',
  paneAt > 0 && threadAt > 0 && !vElseWrapsThread,
  paneAt > 0 && threadAt > 0
    ? `ReviewPane@${paneAt + 1}, content-thread@${threadAt + 1}${vElseWrapsThread ? ' ← 仍被 v-else 包着' : ''}`
    : '未定位到 ReviewPane / .content-thread',
)

// ------------------------------------------- 滚动容器不得被状态分支摘掉（round-126）
// 消息列表 `<ul class="conversation-list">` 是会话唯一的滚动容器：它的 scrollTop 只能靠
// 「这个元素一直在」来保住。它曾经是 v-if/v-else 链的最后一环
// （<p v-if="isSlowOpen"> → <p v-else-if="messages.length === 0 …"> → <ul v-else>），
// 而 isSlowOpen 由「任何一次消息加载超过 SLOW_OPEN_HINT_DELAY_MS(5000ms)」置真
// （useDesktopMessageHistoryLoading.ts）⇒ 加载稍慢就把整个滚动容器从 DOM 摘掉，加载结束后
// 它作为全新元素挂回来、scrollTop 从 0 开始，而该组件没有挂载期滚动恢复
// （无 onMounted；五个滚动 watcher 也都没有 immediate）⇒ 用户看到「消息列表跑到最上面」。
// 实测口径（同一 harness 交错四跑）：改动前提示出现时 listPresent=false、scrollTop 2307→0；
// 改动后 listPresent=true、最终仍是 2307。
const convLines = fs.readFileSync('src/components/content/ThreadConversation.vue', 'utf8').split(/\r?\n/)
const listAt = convLines.findIndex((l) => l.trim().startsWith('<ul') && l.includes('conversation-list'))
const listTag = listAt >= 0 ? convLines[listAt] : ''
const listHasChainDirective = /\bv-(if|else|else-if)\b/.test(listTag)
const emptyBranchStillChained = convLines.some((l) => l.includes('v-else-if="messages.length === 0'))
check(
  '消息列表是滚动容器，不得挂在 v-if/v-else 分支上（round-126）',
  listAt > 0 && !listHasChainDirective && !emptyBranchStillChained,
  listAt > 0
    ? `<ul class="conversation-list">@${listAt + 1}${listHasChainDirective ? ' ← 仍带 v-if/v-else 指令' : ''}${emptyBranchStillChained ? '；空态仍是 v-else-if（链未断开）' : ''}`
    : '未定位到 <ul class="conversation-list">',
)

// ------------------------------------------- 挂载期必须有滚动初始化（round-127）
// 组件是 defineAsyncComponent：路由切到非线程视图（`#/`、`#/directory`、`#/settings`、
// `#/automations` …）时整棵 `.conversation-root` 被卸载，切回同一条线程时重新挂载。
// 而它的五个滚动相关 watcher（messages / pendingRequests / liveOverlay / isLoading /
// activeThreadId）**一个都不会触发**（activeThreadId 没变、props 也没变）⇒ 新挂载的
// `<ul class="conversation-list">` 停在浏览器默认 scrollTop = 0 ⇒「列表跑到 TOP」。
// round-127 补 onMounted → scheduleConversationScroll。实测口径（同一 harness，四个入口）：
// 改动前 438 → 0（verify-conversation-mount-scroll FAILED 4/7）；改动后 438 → 438（ALL GREEN 7/7）。
const convSource = convLines.join('\n')
const importsOnMounted = /import\s*\{[^}]*\bonMounted\b[^}]*\}\s*from\s*'vue'/.test(convSource)
const mountedIdx = convSource.indexOf('onMounted(')
const mountedBody = mountedIdx >= 0 ? convSource.slice(mountedIdx, mountedIdx + 240) : ''
const mountedSchedulesScroll = /scheduleConversationScroll\s*\(/.test(mountedBody)
check(
  '会话挂载期有滚动初始化，重挂不停在 TOP（round-127）',
  importsOnMounted && mountedSchedulesScroll,
  mountedIdx >= 0
    ? `onMounted@${convSource.slice(0, mountedIdx).split('\n').length}${importsOnMounted ? '' : ' ← 未从 vue 导入 onMounted'}${mountedSchedulesScroll ? '' : ' ← 挂载回调未结算滚动（缺 scheduleConversationScroll）'}`
    : '未定位到 onMounted(',
)

// ------------------------------------------- 命令块 live→持久化交接要延迟清空（round-128）
// 「新增命令块时闪一下」的根因是**回合收尾处急切清空 live 命令**：`turn/completed` 一到就把
// `liveCommandsByThreadId[thread]` 删掉，而渲染用的持久化副本要等防抖
// EVENT_SYNC_DEBOUNCE_MS(220ms) 的收尾 `thread/read` 才落地 ⇒ 命令块从 DOM 里消失约
// 240–256ms（实测 scrollHeight 666→609、scrollTop 147→90→147）。清空本身**必需**：
// live 用通知 `item.id`（裸 callId）、持久化用 `session-cmd-<callId>`，不同 id，
// `removeLiveCommandsPersistedIn` 的按 id 剪除对它无效，不收尾清空就会多出一个命令块。
// round-128 把这次清空推迟到持久化副本写进 messages 的同一拍。本断言钉住这套不变式：
//   ① 存在延迟集合 + 兜底上界常量；② live 命令的清空在 `flushDeferredLiveCommands` 里；
//   ③ 回合收尾统一走 `finishTurnForThread`（两条通知路径都调它），且**只对当前选中线程**
//      延迟；④ `turn/completed` 分支**不得**再出现急切清空，`applyRealtimeUpdates` 的收尾
//      路径也不得直接 `setThreadInProgress(completedTurn.threadId, false)`。
const stateSource = fs.readFileSync('src/composables/useDesktopState.ts', 'utf8')
const declDeferred = /const\s+deferredLiveCommandClearThreadIds\s*=\s*new\s+Set<string>\(\)/.test(stateSource)
const hasFallbackConst = /const\s+LIVE_COMMAND_HANDOFF_FALLBACK_MS\s*=\s*\d+/.test(stateSource)
const flushIdx = stateSource.indexOf('function flushDeferredLiveCommands(')
const flushBody = flushIdx >= 0 ? stateSource.slice(flushIdx, flushIdx + 420) : ''
const flushClears = /omitKey\(\s*liveCommandsByThreadId\.value\s*,/.test(flushBody)
const finishIdx = stateSource.indexOf('function finishTurnForThread(')
const finishBody = finishIdx >= 0 ? stateSource.slice(finishIdx, finishIdx + 900) : ''
const finishCallSites = (stateSource.match(/finishTurnForThread\s*\(/g) || []).length - 1
const finishDefersSelectedOnly = /threadId\s*===\s*selectedThreadId\.value/.test(finishBody)
const finishKeepsDeferred = /keepDeferredLiveCommands/.test(finishBody)
const clearKeepsOption = /clearCompletedTurnLiveState\s*\([^)]*keepLiveCommands/.test(stateSource)
// `turn/completed` 分支：必须走 finishTurnForThread，且**不得**直接清 live 命令
const completedBranchIdx = stateSource.indexOf("notification.method === 'turn/completed'")
const completedBranch = completedBranchIdx >= 0 ? stateSource.slice(completedBranchIdx, completedBranchIdx + 900) : ''
const completedBranchUsesFinish = /finishTurnForThread\s*\(/.test(completedBranch)
const eagerClearInCompletedBranch = /omitKey\(\s*liveCommandsByThreadId\.value/.test(completedBranch)
// applyRealtimeUpdates 的收尾路径：不得再直接 setThreadInProgress(completedTurn.threadId, false)
const realtimeDirectSet = /setThreadInProgress\(\s*completedTurn\.threadId\s*,\s*false\s*\)/.test(stateSource)
check(
  '命令块 live→持久化交接延迟清空，不出现真空（round-128）',
  declDeferred && hasFallbackConst && flushIdx >= 0 && flushClears &&
    finishIdx >= 0 && finishCallSites >= 2 && finishDefersSelectedOnly && finishKeepsDeferred && clearKeepsOption &&
    completedBranchIdx >= 0 && completedBranchUsesFinish && !eagerClearInCompletedBranch && !realtimeDirectSet,
  [
    `延迟集合=${declDeferred ? 'yes' : 'NO'}`,
    `兜底常量=${hasFallbackConst ? 'yes' : 'NO'}`,
    `flush 清空 live=${flushClears ? 'yes' : 'NO'}`,
    `finishTurnForThread 调用点=${finishCallSites}（须 ≥2，两条通知路径）`,
    `仅选中线程延迟=${finishDefersSelectedOnly ? 'yes' : 'NO'}`,
    `clear 接受 keepLiveCommands=${clearKeepsOption ? 'yes' : 'NO'}`,
    `turn/completed 走 finish=${completedBranchUsesFinish ? 'yes' : 'NO'}`,
    `turn/completed 仍急切清空=${eagerClearInCompletedBranch ? 'YES(退化了)' : 'no'}`,
    `applyRealtimeUpdates 直接 setThreadInProgress=${realtimeDirectSet ? 'YES(退化了)' : 'no'}`,
  ].join(' / '),
)

// ------------------------------------------- 空快照不得清空本地消息历史（round-132）
// 线上症状：Thinking 期间（只有此时非 silent 的前台恢复刷新真的会取数）服务端答 0 条时，
// `preserveMissing` 为假 ⇒ `mergeMessages` 把本地历史**整体替换**成空数组 ⇒ 列表整段消失、
// 只剩一个 Thinking 浮层（空快照往往同时带 `status:{type:'inProgress'}`，桥层
// materialization-pending 兜底就长这样）。本断言钉住修复的不变式：
//   ① 判据必须**双侧**（服务端 0 条 **且** 本地有历史）——只判前者会给真正的空线程刷噪音警告；
//   ② 该判据必须进 `preserveMissing`，并在成立时**不**让空快照整体覆盖轮次索引；
//   ③ 成立时留一条可检索的 warning；④ `previousPersisted` 必须在写回之前读取（否则读到的是新值）。
const loadingSource = fs.readFileSync('src/composables/useDesktopMessageHistoryLoading.ts', 'utf8')
const suspiciousDecl =
  /const\s+suspiciousEmptyResponse\s*=\s*nextMessages\.length\s*===\s*0\s*&&\s*previousPersisted\.length\s*>\s*0/.test(
    loadingSource,
  )
const mergeCallIdx = loadingSource.indexOf('mergeMessages(previousPersisted, nextMessages, {')
const preserveBlock = mergeCallIdx >= 0 ? loadingSource.slice(mergeCallIdx, mergeCallIdx + 260) : ''
const preserveKeepsSuspicious = /suspiciousEmptyResponse/.test(preserveBlock)
const prevPersistedIdx = loadingSource.indexOf('const previousPersisted = deps.persistedMessagesByThreadId.value[threadId]')
const setPersistedIdx = loadingSource.indexOf('deps.setPersistedMessagesForThread(threadId, mergedMessages)')
const readsPreviousBeforeWrite = prevPersistedIdx >= 0 && setPersistedIdx >= 0 && prevPersistedIdx < setPersistedIdx
const indexGuardIdx = loadingSource.indexOf('if (!suspiciousEmptyResponse) {')
const indexGuardBody = indexGuardIdx >= 0 ? loadingSource.slice(indexGuardIdx, indexGuardIdx + 320) : ''
const indexGuardSkipsReplace = /replaceTurnIndexLookupForThread/.test(indexGuardBody)
const warnsOnSuspicious = /console\.warn\([\s\S]{0,200}keeping local history/.test(loadingSource)
check(
  '空快照不覆盖本地消息历史与轮次索引（round-132）',
  suspiciousDecl && preserveKeepsSuspicious && readsPreviousBeforeWrite && indexGuardSkipsReplace && warnsOnSuspicious,
  [
    `双侧判据=${suspiciousDecl ? 'yes' : 'NO'}`,
    `进 preserveMissing=${preserveKeepsSuspicious ? 'yes' : 'NO'}`,
    `previousPersisted 先读后写=${readsPreviousBeforeWrite ? 'yes' : 'NO'}`,
    `跳过轮次索引覆盖=${indexGuardSkipsReplace ? 'yes' : 'NO'}`,
    `留 warning=${warnsOnSuspicious ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// ------------------------------------------- 前台恢复不再强制重取选中线程消息（round-134）
// round-132 §10.6 第 4 条：前台恢复那次**非 silent** 的消息重取只在线程 `inProgress` 时才真的
// 发请求（复用判据 alreadyLoaded && !inProgress 直接跳过）——恰是消息最新鲜、最不需要重取的
// 时刻；而 round-132 的「0 条清表」与 round-133 的「链未命中回落全量 ~7.5s」都从这条入口进来。
// 现在前台恢复只刷线程列表（+附状态），选中线程的消息交给紧随其后的 **silent** 兜底：
// syncThreadSelectionWithRoute → ensureThreadMessagesLoaded，且只在「从未加载过」时才取数。
const foregroundBodyIdx = appVue.indexOf('async function syncAfterForeground(')
const foregroundBody = foregroundBodyIdx >= 0 ? appVue.slice(foregroundBodyIdx, foregroundBodyIdx + 900) : ''
const foregroundSkipsForcedMessages =
  /includeSelectedThreadMessages:\s*false/.test(foregroundBody) &&
  !/includeSelectedThreadMessages:\s*true/.test(foregroundBody)
const foregroundKeepsSilentNet = /syncThreadSelectionWithRoute\(\)/.test(foregroundBody)
const routeSyncIdx = appVue.indexOf('async function syncThreadSelectionWithRoute(')
const routeSyncBody = routeSyncIdx >= 0 ? appVue.slice(routeSyncIdx, routeSyncIdx + 2000) : ''
const routeSyncLoadsSilently = /ensureThreadMessagesLoaded\([^)]*\{[^}]*silent:\s*true/.test(routeSyncBody)
check(
  '前台恢复不再强制重取选中线程消息（round-134）',
  foregroundBodyIdx >= 0 && foregroundSkipsForcedMessages && foregroundKeepsSilentNet && routeSyncLoadsSilently,
  [
    `前台恢复跳过强制取数=${foregroundSkipsForcedMessages ? 'yes' : 'NO'}`,
    `仍接 silent 兜底=${foregroundKeepsSilentNet ? 'yes' : 'NO'}`,
    `silent 兜底按需加载=${routeSyncLoadsSilently ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// ------------------------------------------- 未 materialize 线程不再 502（round-135）
// round-134 §七：未 materialize 的线程上 thread/read {includeTurns:true} 会 502
// `list_turns is not supported yet` —— 两条兜底谓词都不匹配。round-135 在
// codex-cli 0.161.0 上实测形态逐字不变（thread/resume 同样 502）。本断言钉三件事：
//   ① 新谓词**窄匹配**：必须锚在 `list_turns` 上，不能退回 threadTurnPage.ts 的裸
//      `-32601|not supported` 宽模式 —— 那会把一条真有轮次的线程答成空对话；
//   ② 桥的兜底分支同时覆盖 thread/read 与 thread/resume；
//   ③ 载荷仍是 buildPendingMaterializationThreadReadResult（不带 status，见 round-134）。
const threadErrorsSource = fs.readFileSync('src/server/bridge/threadErrors.ts', 'utf8')
const bridgeShellSource = fs.readFileSync('src/server/codexAppServerBridge.ts', 'utf8')
const notListableIdx = threadErrorsSource.indexOf('export function isThreadTurnsNotListableError')
const notListableBody = notListableIdx >= 0 ? threadErrorsSource.slice(notListableIdx, notListableIdx + 360) : ''
const notListableAnchorsListTurns = /includes\('list_turns'\)/.test(notListableBody)
const notListableStaysNarrow =
  /includes\('not supported'\)/.test(notListableBody) &&
  !/TURN_LIST_UNSUPPORTED_PATTERN|-32601\|not supported/.test(notListableBody)
const shellFallbackIdx = bridgeShellSource.indexOf('isThreadTurnsNotListableError(error)')
const shellFallbackLine = shellFallbackIdx >= 0
  ? bridgeShellSource.slice(
      bridgeShellSource.lastIndexOf('\n', shellFallbackIdx) + 1,
      bridgeShellSource.indexOf('\n', shellFallbackIdx),
    )
  : ''
const shellFallbackCoversRead = /thread\/read/.test(shellFallbackLine)
const shellFallbackCoversResume = /thread\/resume/.test(shellFallbackLine)
const shellFallbackUsesHonestPayload = shellFallbackIdx >= 0 &&
  /setJson\(res,\s*200,\s*\{\s*result:\s*buildPendingMaterializationThreadReadResult\(threadId\)\s*\}\)/.test(
    bridgeShellSource.slice(shellFallbackIdx, shellFallbackIdx + 900),
  )
check(
  '未 materialize 线程的 thread/read 与 thread/resume 不再 502（round-135）',
  notListableIdx >= 0 && notListableAnchorsListTurns && notListableStaysNarrow &&
    shellFallbackIdx >= 0 && shellFallbackCoversRead && shellFallbackCoversResume && shellFallbackUsesHonestPayload,
  [
    `谓词锚在 list_turns=${notListableAnchorsListTurns ? 'yes' : 'NO'}`,
    `谓词保持窄匹配=${notListableStaysNarrow ? 'yes' : 'NO'}`,
    `兜底覆盖 thread/read=${shellFallbackCoversRead ? 'yes' : 'NO'}`,
    `兜底覆盖 thread/resume=${shellFallbackCoversResume ? 'yes' : 'NO'}`,
    `诚实载荷（无 status）=${shellFallbackUsesHonestPayload ? 'yes' : 'NO'}`,
  ].join(' / '),
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

// ----------------------------- 上翻链路：种子重建 / 骨架缓存的失效面 / 链持久化
// round-132 定位到「上翻 6–7 秒」的唯一成本源是**游标链未命中后回落全量读**
// （同窗口同锚点 7202ms vs 命中链 969ms），而回落路径不登记锚点 ⇒ 同一位置反复付
// 这笔钱。round-136 从三处收口，这里各钉一条（断言的都是「调用形态」，
// 语义由 threadTurnPage.test.ts / threadTurnPageCursorStore.test.ts 覆盖）。
const turnPageSrc = fs.readFileSync('src/server/bridge/threadTurnPage.ts', 'utf8')
const bridgeSrc136 = fs.readFileSync('src/server/codexAppServerBridge.ts', 'utf8')
const cursorStoreSrc = fs.readFileSync('src/server/bridge/threadTurnPageCursorStore.ts', 'utf8')

// ① 未命中时先用一次「只含 id」的列表重建种子；重建出的游标必须**先登记再使用**
//    （否则下一次同锚点还得重建），且必须校验该页最老一轮就是锚点（否则游标指错窗口）。
const rebuildCallSite = /const cursor = await resolveChainCursor\(deps, threadId, ids, beforeIndex\)/.test(turnPageSrc)
const rebuildRecordsBeforeUse = /deps\.chain\.record\(threadId, anchorTurnId, cursor\)\s*\n\s*return cursor/.test(turnPageSrc)
const rebuildVerifiesAnchor = /oldestTurnId !== anchorTurnId \|\| !cursor\) return null/.test(turnPageSrc)
const rebuildHonoursClamp = /span > TURN_LIST_SERVER_PAGE_CLAMP\) return null/.test(turnPageSrc)
check(
  '上翻链未命中时先重建种子而非直接回落全量读（round-136）',
  rebuildCallSite && rebuildRecordsBeforeUse && rebuildVerifiesAnchor && rebuildHonoursClamp,
  [
    `调用点=await resolveChainCursor(${rebuildCallSite ? 'yes' : 'NO'})`,
    `先登记再用=${rebuildRecordsBeforeUse ? 'yes' : 'NO'}`,
    `校验页尾即锚点=${rebuildVerifiesAnchor ? 'yes' : 'NO'}`,
    `尊重单页上限=${rebuildHonoursClamp ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// ② 全量读缓存（threadTurnPageReadCacheByThreadId）只服务「更早轮次」窗口：
//    通知必须按「能否改变轮次结构」门控（否则实时回合里恒为冷 ⇒ 重复付 6–7s）；
//    存快照是纯读行为、不得再清它；真正的结构性变更（thread/revert 等客户端 RPC）
//    改由 rpc() 兜住，不能在收窄通知面之后丢掉。
const emitBody = (/private emitNotification\([\s\S]*?\n  \}/.exec(bridgeSrc136) ?? [''])[0]
const emitGatesFullRead = /if \(threadReadInvalidatesCache\(notification\.method\)\) \{\s*\n\s*this\.threadTurnPageReadCacheByThreadId\.delete\(nThreadId\)/.test(emitBody)
const snapshotBody = (/storeThreadReadSnapshot\(threadId: string, snapshot: unknown\): void \{([\s\S]*?)\n  \}/.exec(bridgeSrc136) ?? ['', ''])[1]
const snapshotStillSetsSnapshot = /lastThreadReadSnapshotByThreadId\.set\(threadId, snapshot\)/.test(snapshotBody)
const snapshotNoLongerClears = !/threadTurnPageReadCacheByThreadId\.delete\(threadId\)/.test(snapshotBody)
const rpcClearsTurnPageCache = /this\.invalidateThreadTurnPageReadCache\(threadId \|\| undefined\)/.test(bridgeSrc136)
check(
  '上翻全量读缓存按轮次结构门控失效，纯读不再自清（round-136）',
  emitGatesFullRead && snapshotStillSetsSnapshot && snapshotNoLongerClears && rpcClearsTurnPageCache,
  [
    `通知门控=${emitGatesFullRead ? 'yes' : 'NO'}`,
    `快照仍入库=${snapshotStillSetsSnapshot ? 'yes' : 'NO'}`,
    `快照不再清全量读缓存=${snapshotNoLongerClears ? 'yes' : 'NO'}`,
    `结构性 RPC 仍清=${rpcClearsTurnPageCache ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// ③ 游标链跨重启持久化：链要能 hydrate/snapshot，桥要在首次用到前装载、在登记后
//    去抖落盘、在 dispose 时 flush；文件落在 $CODEX_HOME 下（不是共享的
//    .codex-global-state.json，理由见 store 模块头）。新增公共方法 ⇒ 必须升
//    SHARED_BRIDGE_VERSION，否则 dev 热更新会复用旧实例。
const chainHasHydrate = /hydrate\(state: Record<string, Record<string, string>>/.test(turnPageSrc)
const chainHasSnapshot = /snapshot\(\): Record<string, Record<string, string>>/.test(turnPageSrc)
const bridgeHydrates = /readThreadTurnPageCursors\(\)/.test(bridgeSrc136) &&
  /this\.threadTurnPageCursorChain\.hydrate\(state\)/.test(bridgeSrc136)
const bridgeHydratesBeforeUse = /await this\.ensureThreadTurnPageCursorChainHydrated\(\)/.test(bridgeSrc136)
const bridgePersists = /writeThreadTurnPageCursors\(this\.threadTurnPageCursorChain\.snapshot\(\)\)/.test(bridgeSrc136)
const bridgeFlushesOnDispose = /this\.flushThreadTurnPageCursorChain\(\)/.test(bridgeSrc136)
const versionBumped = /const SHARED_BRIDGE_VERSION = 'experimental-api-v7'/.test(bridgeSrc136)
const storeFileNamed = cursorStoreSrc.includes('codex-mobile-turn-page-cursors.json')
check(
  '上翻游标链跨重启持久化（round-136）',
  chainHasHydrate && chainHasSnapshot && bridgeHydrates && bridgeHydratesBeforeUse &&
    bridgePersists && bridgeFlushesOnDispose && versionBumped && storeFileNamed,
  [
    `链 hydrate/snapshot=${chainHasHydrate && chainHasSnapshot ? 'yes' : 'NO'}`,
    `桥装载=${bridgeHydrates && bridgeHydratesBeforeUse ? 'yes' : 'NO'}`,
    `桥去抖落盘=${bridgePersists ? 'yes' : 'NO'}`,
    `dispose flush=${bridgeFlushesOnDispose ? 'yes' : 'NO'}`,
    `版本=v7 ${versionBumped ? 'yes' : 'NO'}`,
    `sidecar 文件名=${storeFileNamed ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// ----------------------------------------- 空状态下一步动作 + fileId 图片可见（round-137）
// round-120 §三③：三处空状态只陈述现状、缺可执行动作（规范口径 = 原因 + 下一步）。
// round-131 §十③ / round-130 §四①：`{type:'image', fileId}`（无内联 url）的图片在 UI 上
// 静默消失。round-137 决定：文案补动作 + 这类图片渲染成「不可预览」的可见占位。
// 完整 fileId -> 字节 的解析在 0.161.0 **协议上不可行**：附件面只有
// thread/attachment/{add,list,remove}，list 的 ThreadAttachment.payload 是 opaque JsonValue，
// 且没有内容取回端点 ⇒ 只登记为后续协议侧议题，不在本轮做。
const i18nSrc137 = fs.readFileSync('src/composables/useUiLanguage.ts', 'utf8')
const convSrc137 = fs.readFileSync('src/components/content/ThreadConversation.vue', 'utf8')
const treeSrc137 = fs.readFileSync('src/components/sidebar/SidebarThreadTree.vue', 'utf8')
const v2Src137 = fs.readFileSync('src/api/normalizers/v2.ts', 'utf8')
const codexTypes137 = fs.readFileSync('src/types/codex.ts', 'utf8')
const msgContentSrc137 = fs.readFileSync('src/utils/messageContent.ts', 'utf8')

const noMessagesHasAction = /'No messages in this thread yet\. Type a message below to get started\.'/.test(i18nSrc137)
const noMatchHasAction = /'No matching threads\. Clear the search to see all threads\.'/.test(i18nSrc137)
const noThreadsHasAction = /'No threads yet\. Start a new thread to begin\.'/.test(i18nSrc137)
const callSitesUpdated = /t\('No messages in this thread yet\. Type a message below to get started\.'\)/.test(convSrc137)
  && /t\('No matching threads\. Clear the search to see all threads\.'\)/.test(treeSrc137)
  && /t\('No threads yet\. Start a new thread to begin\.'\)/.test(treeSrc137)
check(
  '三处空状态携带可执行的下一步（round-137）',
  noMessagesHasAction && noMatchHasAction && noThreadsHasAction && callSitesUpdated,
  [
    `线程内无消息=${noMessagesHasAction ? 'yes' : 'NO'}`,
    `搜索无结果=${noMatchHasAction ? 'yes' : 'NO'}`,
    `项目无线程=${noThreadsHasAction ? 'yes' : 'NO'}`,
    `调用点同步=${callSitesUpdated ? 'yes' : 'NO'}`,
  ].join(' / '),
)

const collectsFileId = /block\.type === 'image' && !\('url' in block\) && 'fileId' in block/.test(v2Src137)
const hasImageAttachmentField = /imageAttachmentIds\?: string\[\]/.test(codexTypes137)
const countsAsVisibleBody = /Array\.isArray\(message\.imageAttachmentIds\)/.test(msgContentSrc137)
const rendersPlaceholder = /message\.imageAttachmentIds\.length > 0/.test(convSrc137)
  && /t\('Image attachment \(preview unavailable\)'\)/.test(convSrc137)
const keepsSilentDropForUrlImages = /'url' in block && typeof block\.url === 'string'/.test(v2Src137)
check(
  'attachment-only（fileId）图片不再静默缺失，改为可见占位（round-137）',
  collectsFileId && hasImageAttachmentField && countsAsVisibleBody && rendersPlaceholder && keepsSilentDropForUrlImages,
  [
    `解析收集=${collectsFileId ? 'yes' : 'NO'}`,
    `类型字段=${hasImageAttachmentField ? 'yes' : 'NO'}`,
    `计入可见正文=${countsAsVisibleBody ? 'yes' : 'NO'}`,
    `渲染占位=${rendersPlaceholder ? 'yes' : 'NO'}`,
    `url 分支未变=${keepsSilentDropForUrlImages ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// --------------- round-138：fileId 图片的机会性解析 + audio/localAudio/mention 的可见面
// 【待办 1】round-137 把「fileId -> 字节」判为协议不可行；round-138 修正了推理：服务端确实没有
// 内容端点（state_5.sqlite 的 thread_attachments 表 = id/thread_id/attachment_type/identity_key/
// payload/created_at，payload 是**客户端写的** opaque JsonValue），**正因如此**，任何客户端想让
// 图有意义就只能把可解析内容写进 payload ⇒ 按**值的形态**（`data:` URL / 绝对图片路径走既有
// /codex-local-image 代理）识别即可，不必猜字段名。只在结果里真出现 fileId 时才查一次附件表；
// 命中改写 `{type:'image',url}`、未命中保持 round-137 的占位 ⇒ 严格单调变好。
const attachSrc138 = fs.readFileSync('src/server/bridge/threadAttachmentImageSources.ts', 'utf8')
const bridgeSrc138 = fs.readFileSync('src/server/codexAppServerBridge.ts', 'utf8')
const shortCircuitsWithoutFileId = /const blocks = collectFileIdImageBlocks\(result\)\s*\n\s*if \(blocks\.length === 0\) return result/.test(attachSrc138)
const identifiesByValueShape = /export function toRenderableMediaSource\(value: string\): string \| null/.test(attachSrc138)
  && /\^data:\(image\|video\)\\?\//.test(attachSrc138)
const reusesLocalImageProxy = /\/codex-local-image\?path=\$\{encodeURIComponent\(path\)\}/.test(attachSrc138)
const hasExtensionAllowlist = /const LOCAL_IMAGE_EXTENSIONS = new Set\(\[/.test(attachSrc138)
const swallowsLookupErrors = /try \{\s*\n\s*attachments = await listAttachments\(threadId\)\s*\n\s*\} catch \{\s*\n\s*return result/.test(attachSrc138)
const rewritesOnlyOnHit = /delete block\.fileId\s*\n\s*block\.type = 'image'\s*\n\s*block\.url = source/.test(attachSrc138)
const wiredIntoBridge = /sanitizeThreadTurnsInlinePayloads: async \(method: string, result: unknown\) => resolveThreadReadFileIdImages\(/.test(bridgeSrc138)
  && /await appServer\.rpc\('thread\/attachment\/list'/.test(bridgeSrc138)
check(
  'fileId 图片：按值形态机会性解析，命中出图 / 未命中保持占位（round-138）',
  shortCircuitsWithoutFileId && identifiesByValueShape && reusesLocalImageProxy && hasExtensionAllowlist
    && swallowsLookupErrors && rewritesOnlyOnHit && wiredIntoBridge,
  [
    `无 fileId 零 RPC=${shortCircuitsWithoutFileId ? 'yes' : 'NO'}`,
    `按值形态识别=${identifiesByValueShape ? 'yes' : 'NO'}`,
    `复用本地代理=${reusesLocalImageProxy ? 'yes' : 'NO'}`,
    `扩展名白名单=${hasExtensionAllowlist ? 'yes' : 'NO'}`,
    `查表失败静默=${swallowsLookupErrors ? 'yes' : 'NO'}`,
    `命中才改写=${rewritesOnlyOnHit ? 'yes' : 'NO'}`,
    `接入桥层=${wiredIntoBridge ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// 【待办 2】audio / localAudio / mention 之前全部落进 rawBlocks，而 rawBlocks 在 UI 上没有渲染
// 分支、空正文又被 shouldOmitEmptyGenericMessage 省略 ⇒ 在历史里静默消失（与 round-137 的 fileId
// 图片同因）。round-138 给三者各自的可见面；兜底改用「集合判定 + 类型加宽」，因为把 8 个变体全用
// `!==` 长链排掉后 TS 会把联合收窄成 never。
const typesSrc138 = fs.readFileSync('src/types/codex.ts', 'utf8')
const mcSrc138 = fs.readFileSync('src/utils/messageContent.ts', 'utf8')
const handlesAudioBlocks = /block\.type === 'audio' && typeof block\.url === 'string'/.test(v2Src137)
const handlesLocalAudioBlocks = /toLocalFileUrl\(block\.path\.trim\(\)\)/.test(v2Src137)
const handlesMentionBlocks = /block\.type === 'mention'/.test(v2Src137)
const setBasedFallback = /const HANDLED_USER_INPUT_TYPES = new Set<string>\(\[/.test(v2Src137)
  && /const blockType: string = block\.type\s*\n\s*if \(!HANDLED_USER_INPUT_TYPES\.has\(blockType\)\)/.test(v2Src137)
const newFieldsDeclared = /audioSources\?: string\[\]/.test(typesSrc138)
  && /mentions\?: Array<\{ name: string; path: string \}>/.test(typesSrc138)
const newFieldsCountAsVisible = /Array\.isArray\(message\.audioSources\)/.test(mcSrc138)
  && /Array\.isArray\(message\.mentions\)/.test(mcSrc138)
const notDroppedAsEmptyUserMessage = /parsed\.audioSources\.length > 0\s*\n\s*\|\| parsed\.mentions\.length > 0/.test(v2Src137)
const rendersAudioPlayer = /<audio/.test(convSrc137) && /class="message-audio-player"/.test(convSrc137)
const rendersMentionChip = /class="message-file-chip message-mention-chip"/.test(convSrc137)
check(
  'audio / localAudio / mention 都有可见面，不再静默消失（round-138）',
  handlesAudioBlocks && handlesLocalAudioBlocks && handlesMentionBlocks && setBasedFallback
    && newFieldsDeclared && newFieldsCountAsVisible && notDroppedAsEmptyUserMessage
    && rendersAudioPlayer && rendersMentionChip,
  [
    `audio=${handlesAudioBlocks ? 'yes' : 'NO'}`,
    `localAudio=${handlesLocalAudioBlocks ? 'yes' : 'NO'}`,
    `mention=${handlesMentionBlocks ? 'yes' : 'NO'}`,
    `集合兜底=${setBasedFallback ? 'yes' : 'NO'}`,
    `类型字段=${newFieldsDeclared ? 'yes' : 'NO'}`,
    `计入可见正文=${newFieldsCountAsVisible ? 'yes' : 'NO'}`,
    `非空消息判定=${notDroppedAsEmptyUserMessage ? 'yes' : 'NO'}`,
    `渲染播放器=${rendersAudioPlayer ? 'yes' : 'NO'}`,
    `渲染提及=${rendersMentionChip ? 'yes' : 'NO'}`,
  ].join(' / '),
)

// --------------- round-140：代理投递写入的 userMessage 不再渲染成用户气泡
// 【问题】codex 多代理通信（`collabAgentToolCall{tool:'sendInput', receiverThreadIds:[本会话]}`）
// 会被 app-server **以 userMessage 条目写进接收会话正在运行的那个 turn**，且不经任何客户端
// ⇒ 线上全库 705 例 clientId 全为 null。UI 从条目流读回来只能画成右侧用户气泡（观感上
// "我说过这句话"）。判别依据全部经 0.161.0 实测：`turn/start` / `turn/steer` 的
// `clientUserMessageId` 都会回写成该条 userMessage 的 `clientId`（thread/read 与 thread_history
// 库都能看到），故「轮内非首条 && clientId 为 null」是精确判据；轮内首条永不判为注入
// （老数据/别的客户端没写 id 时首条就是用户提问）；`<subagent_notification>` /
// `<environment_context>` 两种固定包裹形态另算。同一 turn 内出现第 2 条 userMessage 本身是
// **正常**形态（我们自己 Steer 就会造成，实测它同样带 clientId）—— 这条不变式必须钉住，
// 否则会把用户自己的 steer 误判成注记。
const v2Src140 = fs.readFileSync('src/api/normalizers/v2.ts', 'utf8')
const typesSrc140 = fs.readFileSync('src/types/codex.ts', 'utf8')
const groupingSrc140 = fs.readFileSync('src/utils/transcriptGrouping.ts', 'utf8')
const convSrc140 = fs.readFileSync('src/components/content/ThreadConversation.vue', 'utf8')
const gatewaySrc140 = fs.readFileSync('src/api/gateway/threads.ts', 'utf8')
const typeFields140 = /clientId\?: string \| null/.test(typesSrc140) && /isAgentNote\?: boolean/.test(typesSrc140)
const carriesClientId140 = /clientId: typeof item\.clientId === 'string' && item\.clientId\.length > 0 \? item\.clientId : null/.test(v2Src140)
const prefixRule140 = /const AGENT_NOTE_TEXT_PREFIXES = \['<subagent_notification>', '<environment_context>'\]/.test(v2Src140)
// 判据：非首条 + clientId 为 null（顺序有意义——首条豁免必须在 null 判定之前）。
const nullClientRule140 = /if \(indexAmongUserMessages <= 0\) return false\s*\r?\n\s*return \(message\.clientId \?\? null\) === null/.test(v2Src140)
const perTurnOrdinal140 = /let userMessageOrdinal = 0/.test(v2Src140)
  && /isInjectedUserMessage\(message, userMessageOrdinal\)/.test(v2Src140)
  && /message\.isUnhandled === true\) continue/.test(v2Src140)
const kindWired140 = /\| 'agent-note'/.test(groupingSrc140)
  && /if \(message\.isAgentNote === true\) return 'agent-note'/.test(groupingSrc140)
// 注记不得开辟新渲染组——否则它会成为一轮的 request，又变成独立用户气泡。
const noNewGroup140 = /if \(isUserAuthoredMessage\(message\) \|\| !current\) \{/.test(groupingSrc140)
const turnBoundary140 = /function isUserMessage\(message: UiMessage\): boolean \{\s*\r?\n\s*\/\/ round-140：轮次边界只由「用户本人发的」消息确立。\s*\r?\n\s*return isUserAuthoredMessage\(message\)/.test(groupingSrc140)
const rendersNote140 = /item\.presentation === 'agent-note'/.test(convSrc140)
  && /class="thread-agent-note"/.test(convSrc140)
  && /thread-agent-note-header/.test(convSrc140)
  && /item\.kind === 'agent-note'/.test(convSrc140)
// 提交侧必须带上 clientUserMessageId（turn/start 与 turn/steer 各一处）。
const submitIdSites140 = (gatewaySrc140.match(/clientUserMessageId: createClientUserMessageId\(\)/g) || []).length
const sendsClientUserMessageId140 = /function createClientUserMessageId\(\): string \{/.test(gatewaySrc140)
  && submitIdSites140 === 2
check(
  '代理投递写入的 userMessage 渲染为注记，用户气泡只留给真人（round-140）',
  typeFields140 && carriesClientId140 && prefixRule140 && nullClientRule140 && perTurnOrdinal140
    && kindWired140 && noNewGroup140 && turnBoundary140 && rendersNote140 && sendsClientUserMessageId140,
  [
    `判据字段=${typeFields140 ? 'yes' : 'NO'}`,
    `带出 clientId=${carriesClientId140 ? 'yes' : 'NO'}`,
    `包裹前缀规则=${prefixRule140 ? 'yes' : 'NO'}`,
    `非首条+null 判据=${nullClientRule140 ? 'yes' : 'NO'}`,
    `逐轮计数=${perTurnOrdinal140 ? 'yes' : 'NO'}`,
    `agent-note kind=${kindWired140 ? 'yes' : 'NO'}`,
    `不开新组=${noNewGroup140 ? 'yes' : 'NO'}`,
    `轮次边界守卫=${turnBoundary140 ? 'yes' : 'NO'}`,
    `渲染注记=${rendersNote140 ? 'yes' : 'NO'}`,
    `提交带 id=${sendsClientUserMessageId140 ? 'yes' : 'NO'}（命中 ${submitIdSites140} 处，须 2）`,
  ].join(' / '),
)

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
