// 证明自托管字体真的被加载，且 CJK 仍走系统字体。
//
// 只看构建产物是不够的：@font-face 声明存在 ≠ 浏览器下载了它，computed font-family 也
// 只是声明的字串、不代表哪个 face 真正命中。这里在真实浏览器里问 FontFaceSet。
//
// 用法：先起服务（默认 http://127.0.0.1:4190），然后
//   node scripts/check-fonts.cjs
// 环境变量 PROFILE_BASE_URL 覆盖地址，PROFILE_HEADLESS=0 看窗口。
const path = require('path')
const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190'

let chromium
try {
  chromium = require('playwright-core').chromium
} catch {
  console.error('需要 playwright-core')
  process.exit(2)
}

const EDGE_CANDIDATES = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const EDGE = process.env.PROFILE_EDGE || EDGE_CANDIDATES.find((p) => require('fs').existsSync(p))

const EXPECTED_FACES = [
  { family: 'IBM Plex Sans', weight: '400' },
  { family: 'IBM Plex Sans', weight: '500' },
  { family: 'IBM Plex Sans', weight: '600' },
  { family: 'IBM Plex Mono', weight: '400' },
  { family: 'IBM Plex Mono', weight: '500' },
  { family: 'Bricolage Grotesque', weight: '100 900' },
]

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass: !!pass, detail })
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: process.env.PROFILE_HEADLESS !== '0',
  })
  const page = await browser.newPage()

  const failed = []
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText || ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  const fontRequests = []
  page.on('response', (r) => {
    if (/\.woff2?(\?|$)/.test(r.url())) fontRequests.push(`${r.status()} ${r.url().split('/').pop()}`)
  })

  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  // 等字体表就绪，否则 FontFaceSet 里可能还没登记。
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)

  const probe = await page.evaluate(async (expected) => {
    // 浏览器只下载真正被用到的 face，所以首页上没用到的等宽字体状态是 unloaded。
    // 强制 load 一遍，才能证明「每个发出的 face 都取得到、解析得了」，而不是「碰巧没用到」。
    await Promise.all(
      expected.map((f) => document.fonts.load(`${f.weight} 16px "${f.family}"`).catch(() => {})),
    )
    await document.fonts.ready
    const faces = [...document.fonts].map((f) => ({
      family: f.family.replace(/^"|"$/g, ''),
      weight: f.weight,
      status: f.status,
    }))
    const usable = (family, weight) => {
      try {
        return document.fonts.check(`${weight} 16px "${family}"`)
      } catch {
        return false
      }
    }
    const el = document.createElement('span')
    el.textContent = 'x'
    document.body.appendChild(el)
    const declaredSans = getComputedStyle(document.body).fontFamily
    // CJK 是否被 Plex 接管：Plex 只含 latin 子集，中文必然回退。用显式系统中文字体做参照，
    // 两者量出的宽度相同才说明中文没有落进 Plex（若我们误打包了 CJK 子集就会不同）。
    const widthOf = (family, text) => {
      el.style.fontFamily = family
      el.textContent = text
      return el.getBoundingClientRect().width
    }
    const cjk = {
      plex: widthOf('"IBM Plex Sans"', '中文测试'),
      yahei: widthOf('"Microsoft YaHei"', '中文测试'),
      plexMono: widthOf('"IBM Plex Mono"', '中文测试'),
    }
    el.remove()
    return {
      faces,
      usable: {
        sans400: usable('IBM Plex Sans', 400),
        mono400: usable('IBM Plex Mono', 400),
        display: usable('Bricolage Grotesque', 400),
      },
      declaredSans,
      cjk,
    }
  }, EXPECTED_FACES)

  check('页面无 JS 报错', pageErrors.length === 0, pageErrors.join(' | ') || '无')
  check('无失败请求（字体 404 / 加载失败）', failed.length === 0, failed.join(' | ') || '无')

  for (const want of EXPECTED_FACES) {
    const hit = probe.faces.find((f) => f.family === want.family && f.weight === want.weight)
    check(`@font-face 登记：${want.family} ${want.weight}`, hit, hit ? hit.status : '未登记')
  }

  check('body 声明的字体族以 IBM Plex Sans 开头', /^"?IBM Plex Sans"?/.test(probe.declaredSans.trim()), probe.declaredSans)
  check('IBM Plex Sans 400 可用（文件已下载并解析）', probe.usable.sans400, String(probe.usable.sans400))
  check('IBM Plex Mono 400 可用', probe.usable.mono400, String(probe.usable.mono400))
  check('Bricolage Grotesque 可用', probe.usable.display, String(probe.usable.display))

  // CJK 回退：Plex Sans 与系统中文字体量出的「中文测试」宽度相同，说明中文完全走了回退，
  // 而不是被一个误打包的 CJK 子集接管。
  const { plex, yahei, plexMono } = probe.cjk
  check('中文走系统回退而非 Plex（未打包 CJK）', Math.abs(plex - yahei) < 1.5, `plexSans=${plex.toFixed(1)} yahei=${yahei.toFixed(1)} plexMono=${plexMono.toFixed(1)}`)

  console.log('字体契约检查')
  console.log(`  目标 ${BASE}`)
  console.log(`  浏览器 ${EDGE}`)
  console.log(`  woff2 请求 ${fontRequests.length} 条：${fontRequests.join(', ') || '（均为缓存命中或未触发）'}`)
  console.log('')
  let bad = 0
  for (const c of checks) {
    if (!c.pass) bad++
    console.log(`  ${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
  }
  console.log('')
  console.log(bad ? `${bad}/${checks.length} 项失败` : `全部通过  (${checks.length}/${checks.length})`)
  await browser.close()
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
