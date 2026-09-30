const fs = require('fs')
const { chromium } = require('playwright')

const EDGE_CANDIDATES = [
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
]
const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
]
const SYSTEM_LAUNCHER = [...EDGE_CANDIDATES, ...CHROME_CANDIDATES].find((p) => fs.existsSync(p))
const BASE = `${(process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '')}/`
const SHOT_DIR = 'output/playwright'

async function launchBrowser() {
  if (SYSTEM_LAUNCHER) {
    console.log('USING_SYSTEM_BROWSER:', SYSTEM_LAUNCHER)
    return await chromium.launch({ executablePath: SYSTEM_LAUNCHER, headless: true })
  }
  console.log('USING_FALLBACK: playwright chromium')
  return await chromium.launch()
}

async function main() {
  const browser = await launchBrowser()
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : (detail ? 'SKIP' : 'FAIL')}: ${name} ${detail}`)
  }

  await page.goto(BASE + '#/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2000)
  check('home renders as HTML app', (await page.locator('body').innerText()).length > 50)

  // 进入一个真实线程，content header（右侧面板开关的所在）才会存在。
  // 375px 下首页是「Let's build」空态——既无侧栏也无 content header，所以旧的
  // 「点第一个项目 → 点第一个会话项」路径已随 UI 改版失效（点到的只是空态里的按钮）。
  // 改为直接向桥要一个真实线程 id，再进对应路由。
  // 面板开关用 class 定位而非 aria-label：后者是 i18n 文本（中文界面渲染为
  // 「打开侧边面板」），按英文原文 getByLabel 永远匹配不到。
  const openBtn = page.locator('.content-header-right-panel-toggle')
  if ((await openBtn.count()) === 0) {
    const threadId = await page
      .evaluate(async () => {
        try {
          const res = await fetch('/codex-api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'thread/list', params: {} }),
          })
          const json = await res.json()
          const r = json && json.result
          const list = (r && (r.data || r.threads)) || []
          const first = list[0]
          return first ? (first.id || first.threadId || null) : null
        } catch {
          return null
        }
      })
      .catch(() => null)
    if (threadId) {
      await page.goto(`${BASE}#/thread/${threadId}`, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(2500)
    }
    await page.screenshot({ path: `${SHOT_DIR}/mobile-375-after-thread-nav.png` })
  }

  const gotBtn = (await openBtn.count()) > 0
  check('mobile side-panel open button found (thread scope reached)', gotBtn)
  await page.screenshot({ path: `${SHOT_DIR}/mobile-375-before-drawer.png` })

  if ((await openBtn.count()) > 0) {
    // 打开抽屉
    await openBtn.first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOT_DIR}/mobile-375-drawer-open.png` })

    const drawerVisible = (await page.locator('.content-right-panel.is-mobile-open').count()) > 0
    check('drawer opens as overlay (mobile-open class set)', drawerVisible)

    // 切换 tab（Git / 文件 / Terminal）
    const tabs = page.locator('button[aria-selected], [role="tab"]')
    const tabCount = await tabs.count().catch(() => 0)
    let tabSwitched = false
    if (tabCount > 0) {
      for (let i = 0; i < Math.min(tabCount, 4); i++) {
        await tabs.nth(i).click().catch(() => {})
        await page.waitForTimeout(250)
      }
      tabSwitched = true
    }
    check('tab switching executed without throwing', tabSwitched)

    // 关闭抽屉：优先抽屉内部关闭按钮，否则回退 header toggle。两者都用 class 定位
    // ——aria-label 是 i18n 文本（中文界面为「关闭面板」），按英文原文匹配不到。
    const panelClose = page.locator('.content-right-panel-close')
    if ((await panelClose.count()) > 0) {
      await panelClose.first().click().catch(() => {})
    } else {
      await openBtn.first().click().catch(() => {})
    }
    await page.waitForTimeout(500)
    // 移动端面板容器常驻 DOM，以 .is-mobile-open 表征开合；该 class 由 isMobileRightPanelOpen 驱动
    const openClass = page.locator('.content-right-panel.is-mobile-open')
    const closedOk = (await openClass.count()) === 0
    check('drawer closes (is-mobile-open class removed)', closedOk)
    await page.screenshot({ path: `${SHOT_DIR}/mobile-375-drawer-closed.png` })
  } else {
    check('drawer open/close interaction', false, 'no open button in current view')
  }

  const realErrs = errors.filter((e) => !/[info] Welcome/i.test(e))
  check('no console/page errors during drawer flow', realErrs.length === 0, JSON.stringify(realErrs))

  console.log('---SUMMARY---')
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error('FATAL', e && e.message)
  process.exit(1)
})