// 证明 P0 的 token 迁移没有改变深色外观。
//
// 做法：拿迁移前存档的计算样式快照（docs/ui-audit/current-computed-styles.json）跟迁移后
// 重新采集的快照逐条比对。迁移前 Tailwind 输出 oklch()，迁移后 token 层输出 rgb()，所以先
// 把两边都归一成 sRGB 三元组再比。
//
// 允许的偏差是 **每通道 ≤2/255**：Tailwind v4 的调色板以 oklch 存储、小数位只保留 3 位，它
// 自己光栅化出来的像素与官方 hex 就差 1~2/255（例如 zinc-500 的 oklch 落成 113,113,123，
// 而 #71717a 是 113,113,122）。这不是迁移引入的差异，是上游数值本身的舍入；超过 2 就说明
// 迁移真的换了颜色。
//
// 用法：先跑 `PROFILE_BASE_URL=... node scripts/ui-audit-shots.cjs` 采集新快照，再跑本脚本。
//   节点 --max-old-space-size 无需调整；无浏览器依赖，纯数值。
//
// 第二个参数可按属性筛选，形如 --props=background,color,border。基线快照冻结在「颜色迁移
// 之前」，所以当后续提交有意改变排版时（例如切字体族、落字号阶梯），fontFamily / fontSize
// 会合法地不同；这时用 --props 只看颜色，才能把「颜色没被顺手改坏」独立断言出来。
const fs = require('fs')
const path = require('path')

const BASELINE = path.join('docs', 'ui-audit', 'current-computed-styles.json')
const args = process.argv.slice(2).filter((a) => a.startsWith('--'))
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const CURRENT = positional[0] || path.join('output', 'playwright', 'ui-audit', 'facts.json')
const TOLERANCE = 2 // 每通道允许的最大差异（/255）
const ALL_PROPS = ['fontFamily', 'fontSize', 'background', 'color', 'border', 'radius']
const propsArg = (args.find((a) => a.startsWith('--props=')) || '').slice('--props='.length)
const PROPS = propsArg ? propsArg.split(',').map((s) => s.trim()).filter(Boolean) : ALL_PROPS
const unknown = PROPS.filter((p) => !ALL_PROPS.includes(p))
if (unknown.length) {
  console.error(`未知属性：${unknown.join(', ')}（可选：${ALL_PROPS.join(', ')}）`)
  process.exit(2)
}

// oklch → sRGB，按 CSS Color 4 的权威公式。
function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  })
}

// 返回 [r,g,b] 或 null（无法解析）。
function parseColor(v) {
  let m = String(v).match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])]
  m = String(v).match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/)
  if (m) {
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
    return oklchToRgb(L, parseFloat(m[2]), parseFloat(m[3]))
  }
  return null
}

// 把字符串里出现的每个颜色替换成归一化的 rgb() 文本，其余字符原样保留。
function normalizeColors(str) {
  return String(str).replace(/rgba?\([^)]*\)|oklch\([^)]*\)/g, (c) => {
    const rgb = parseColor(c)
    return rgb ? `rgb(${rgb.join(' ')})` : c
  })
}

function collectColors(str) {
  return [...String(str).matchAll(/rgba?\([^)]*\)|oklch\([^)]*\)/g)].map((x) => parseColor(x[0]))
}

function load(file) {
  if (!fs.existsSync(file)) {
    console.error(`找不到快照：${file}`)
    console.error('先跑：PROFILE_BASE_URL=<url> node scripts/ui-audit-shots.cjs')
    process.exit(2)
  }
  return Object.fromEntries(JSON.parse(fs.readFileSync(file, 'utf8')).map((x) => [x.name, x]))
}

const before = load(BASELINE)
const after = load(CURRENT)

let samples = 0
let props = 0
let identical = 0
let notationOnly = 0
const overTolerance = []
const structural = []
const declared = [] // 有意为之的差异（对比度修复等）在报告里单列

for (const page of Object.keys(before)) {
  if (!after[page]) {
    structural.push(`页面缺失：${page}`)
    continue
  }
  const bs = Object.fromEntries(before[page].samples.map((s) => [s.sel, s]))
  for (const b of Object.values(bs)) {
    const a = after[page].samples.find((s) => s.sel === b.sel)
    if (!a) {
      structural.push(`${page} · 元素缺失：${b.sel}`)
      continue
    }
    samples++
    for (const p of PROPS) {
      props++
      const rawA = String(b[p])
      const rawB = String(a[p])
      if (rawA === rawB) {
        identical++
        continue
      }
      const normA = normalizeColors(rawA)
      const normB = normalizeColors(rawB)
      if (normA === normB) {
        notationOnly++
        continue
      }
      // 记法归一后仍不同：逐通道量差
      const ca = collectColors(rawA)
      const cb = collectColors(rawB)
      const n = Math.min(ca.length, cb.length)
      // 字体族 / 字号 / 圆角本身不含颜色：只要归一后不同就是真差异，没有容差可言。
      // 颜色属性按通道差判定。少了这一层，字号变化会因为「解析不出颜色」而被当成 Δ0 放过。
      let maxDelta = ca.length && cb.length && ca.length === cb.length ? 0 : Infinity
      for (let i = 0; i < n && maxDelta !== Infinity; i++) {
        for (let ch = 0; ch < 3; ch++) maxDelta = Math.max(maxDelta, Math.abs(ca[i][ch] - cb[i][ch]))
      }
      const rec = { page, sel: b.sel, prop: p, before: rawA, after: rawB, maxDelta }
      if (maxDelta > TOLERANCE) overTolerance.push(rec)
      else declared.push(rec)
    }
  }
}

console.log('token 迁移等值检查（深色外观是否被改动）')
console.log(`  基线快照  ${BASELINE}`)
console.log(`  当前快照  ${CURRENT}`)
console.log('')
console.log(`  元素 ${samples} 个 · 属性 ${props} 项`)
console.log(`    逐字相同          ${identical}`)
console.log(`    仅记法不同        ${notationOnly}   （oklch ↔ rgb，归一后完全相等）`)
console.log(`    上游舍入（≤2/255） ${declared.length}`)
console.log(`    超出容差（>2/255） ${overTolerance.length}`)
if (structural.length) console.log(`    结构差异          ${structural.length}`)

if (declared.length) {
  const grouped = new Map()
  for (const d of declared) {
    const key = `${normalizeColors(d.before)}  →  ${normalizeColors(d.after)}   (Δ${d.maxDelta})`
    const g = grouped.get(key) || { n: 0, where: [] }
    g.n++
    if (g.where.length < 3) g.where.push(`${d.page} ${d.sel}.${d.prop}`)
    grouped.set(key, g)
  }
  console.log('')
  console.log('  — 上游 oklch 舍入造成的差异（Tailwind 自己的 hex 与 oklch 就不等）—')
  for (const [k, g] of grouped) console.log(`    ${String(g.n).padStart(3)}×  ${k}\n         ${g.where.join(' | ')}`)
}

if (structural.length) {
  console.log('')
  console.log('  — 结构差异 —')
  for (const s of structural) console.log(`    ${s}`)
}

let failed = false
if (overTolerance.length) {
  failed = true
  console.log('')
  console.log(`  ✗ ${overTolerance.length} 项超出容差——这些属性真的变了：`)
  for (const r of overTolerance) {
    console.log(`    [${r.page}] ${r.sel} .${r.prop}`)
    console.log(`       before ${r.before}`)
    console.log(`       after  ${r.after}`)
    console.log(`       最大通道差 ${r.maxDelta}`)
  }
}
if (structural.length) failed = true

if (!failed) {
  const worst = declared.reduce((m, d) => Math.max(m, d.maxDelta), 0)
  console.log('')
  console.log(`  ✓ 通过：无任何颜色差异超过 ${TOLERANCE}/255（实测最大 ${worst}/255）`)
  console.log('    → 深色外观未被改动，差异全部来自 Tailwind 调色板本身的 oklch 舍入。')
}

process.exit(failed ? 1 : 0)
