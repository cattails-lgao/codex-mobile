// 验证主题的两件事，它们都是「不测就等于没做」的类型：
//
//   1. 页面底色跟随主题（修掉亮色下 body 仍近黑）。暗色由 `:root.dark body` 给出，
//      亮色由 `body { background-color: var(--s0) }` 给出，亮色的 --s0 在 :root 上。
//   2. 首屏之前就定好主题。`:root` 是亮色基线，所以若没有 index.html 里那段同步脚本，
//      暗色用户会先被画成亮色再翻黑。这里用「拦掉应用主包」的办法把两件事解耦：主包被
//      拦掉后 Vue 永远不会挂载，此时 `<html>` 上的主题类只可能来自那段同步脚本——于是
//      「类已经在」就等于「它在首屏之前就已经定好」。
//
// 用法：先起服务，再 `node scripts/check-theme.cjs`。
const path = require('path')
const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190'
const HEADLESS = process.env.PROFILE_HEADLESS !== '0'

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
]
const EDGE = process.env.PROFILE_EDGE || EDGE_CANDIDATES.find((p) => require('fs').existsSync(p))

const DARK_KEY = 'codex-web-local.dark-mode.v1'
const DARK_SURFACE = 'rgb(24, 24, 27)' // --s1 暗色 = zinc-900
const LIGHT_SURFACE = 'rgb(247, 247, 249)' // --s0 亮色 = #f7f7f9

const checks = []
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail })

// 读取当前主题状态。blockApp=true 时拦掉应用主包，于是 Vue 不挂载，
// 观察到的一切都来自 index.html 里的同步脚本 + 样式表。
async function readState(browser, { pref, colorScheme, blockApp }) {
  const context = await browser.newContext(colorScheme ? { colorScheme } : {})
  const page = await context.newPage()
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      } catch {}
    },
    [DARK_KEY, pref],
  )
  if (blockApp) {
    // 主包与它带的样式都放行，只拦 JS 入口，避免把注册的 Vue 应用算进来。
    await page.route('**/assets/index-*.js', (route) => route.abort())
    await page.route('**/src/main.ts', (route) => route.abort())
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(250)
  const state = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }))
  await context.close()
  return state
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless: HEADLESS })

  // —— 第一部分：只靠同步脚本（主包被拦），主题必须在首屏前就已就位 ——
  const bootDark = await readState(browser, { pref: 'dark', colorScheme: 'light', blockApp: true })
  check('首屏脚本：存储为 dark → <html> 已带 dark 类（早于应用挂载）', /\bdark\b/.test(bootDark.htmlClass), `class="${bootDark.htmlClass}"`)
  check('首屏脚本：存储为 dark → 底色是暗色表面', bootDark.bodyBg === DARK_SURFACE, bootDark.bodyBg)
  check('首屏脚本：存储为 dark → theme-color 是暗色', bootDark.themeColor === '#09090b', String(bootDark.themeColor))

  const bootLight = await readState(browser, { pref: 'light', colorScheme: 'dark', blockApp: true })
  check('首屏脚本：存储为 light → <html> 无 dark 类（即使系统是暗色）', !/\bdark\b/.test(bootLight.htmlClass), `class="${bootLight.htmlClass}"`)
  check('首屏脚本：存储为 light → 底色是亮色表面（这就是原先近黑的缺陷）', bootLight.bodyBg === LIGHT_SURFACE, bootLight.bodyBg)
  check('首屏脚本：存储为 light → theme-color 是亮色', bootLight.themeColor === '#f7f7f9', String(bootLight.themeColor))

  const bootSystemDark = await readState(browser, { pref: null, colorScheme: 'dark', blockApp: true })
  check('首屏脚本：无存储值 + 系统暗色 → dark 类在', /\bdark\b/.test(bootSystemDark.htmlClass), `class="${bootSystemDark.htmlClass}"`)

  const bootSystemLight = await readState(browser, { pref: null, colorScheme: 'light', blockApp: true })
  check('首屏脚本：无存储值 + 系统亮色 → 无 dark 类', !/\bdark\b/.test(bootSystemLight.htmlClass), `class="${bootSystemLight.htmlClass}"`)

  // —— 第二部分：应用挂载后仍然一致（防止脚本与 App.vue 的判据分叉） ——
  const liveDark = await readState(browser, { pref: 'dark', colorScheme: 'light', blockApp: false })
  check('应用挂载后：暗色下 <html> 带 dark 类', /\bdark\b/.test(liveDark.htmlClass), `class="${liveDark.htmlClass}"`)
  check('应用挂载后：暗色下底色仍是暗色表面', liveDark.bodyBg === DARK_SURFACE, liveDark.bodyBg)
  check('应用挂载后：暗色下 theme-color 由 --s0 同步为 #09090b', liveDark.themeColor === '#09090b', String(liveDark.themeColor))

  const liveLight = await readState(browser, { pref: 'light', colorScheme: 'dark', blockApp: false })
  check('应用挂载后：亮色下 <html> 无 dark 类', !/\bdark\b/.test(liveLight.htmlClass), `class="${liveLight.htmlClass}"`)
  check('应用挂载后：亮色下底色是亮色表面', liveLight.bodyBg === LIGHT_SURFACE, liveLight.bodyBg)
  check('应用挂载后：亮色下 theme-color 同步为 --s0 亮色值', liveLight.themeColor === '#f7f7f9', String(liveLight.themeColor))

  check('color-scheme 跟随主题（滚动条/表单控件不反色）', liveDark.colorScheme === 'dark' && liveLight.colorScheme === 'light', `dark=${liveDark.colorScheme} light=${liveLight.colorScheme}`)

  console.log('主题契约检查')
  console.log(`  目标 ${BASE}`)
  console.log(`  浏览器 ${EDGE}`)
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
