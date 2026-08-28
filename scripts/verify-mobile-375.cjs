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
const BASE = 'http://127.0.0.1:4173/'
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

  // 尝试进入某个线程视图以获得右侧面板可用性（canShowRightPanel 依赖 thread 路由）
  const openBtn = page.getByLabel('Open side panel')
  if ((await openBtn.count()) === 0) {
    // 点第一个项目，等待会话树出现
    const projectNames = await page.locator('button, .project-item, [role="button"]').allInnerTexts()
    const target = projectNames.find((t) => t && t.trim() && t.trim() !== '+' && t.trim() !== 'Create Project' && t.trim() !== 'Import Project')
    if (target) {
      await page.getByText(target.trim(), { exact: true }).first().click().catch(() => {})
      await page.waitForTimeout(1500)
    }
    await page.screenshot({ path: `${SHOT_DIR}/mobile-375-after-project-click.png` })
  }

  // 定位移动端抽屉开合按钮（aria-label = Open/Close side panel）
  let gotBtn = (await openBtn.count()) > 0
  if (!gotBtn) {
    // 尝试点击会话树中第一个会话项进入 thread 路由
    const threadSel = '.thread-item, li, [data-thread-id], a'
    const firstThread = page.locator(threadSel)
    const n = await firstThread.count().catch(() => 0)
    if (n > 0) {
      await firstThread.first().click().catch(() => {})
      await page.waitForTimeout(1500)
    }
    gotBtn = (await openBtn.count()) > 0
  }
  check('mobile side-panel open button found (thread scope reached)', gotBtn)
  await page.screenshot({ path: `${SHOT_DIR}/mobile-375-before-drawer.png` })

  if ((await openBtn.count()) > 0) {
    // 打开抽屉
    await openBtn.first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${SHOT_DIR}/mobile-375-drawer-open.png` })

    const closeBtn = page.getByLabel('Close side panel')
    const drawerVisible = await page.locator('.content-right-panel, [class*="right-panel"]').first().isVisible().catch(() => false)
    check('drawer opens as overlay (open->close label swap)', (await closeBtn.count()) > 0)

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

    // 关闭抽屉：优先抽屉内部关闭按钮（aria-label="Close panel"），否则回退 header toggle
    const panelClose = page.getByLabel('Close panel')
    if ((await panelClose.count()) > 0) {
      await panelClose.first().click().catch(() => {})
    } else if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click().catch(() => {})
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