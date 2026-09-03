const { chromium } = require('playwright')
const { mkdirSync } = require('node:fs')
const { resolve } = require('node:path')

const BASE = 'http://127.0.0.1:4173'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outputDir = resolve(process.cwd(), 'output/playwright')
mkdirSync(outputDir, { recursive: true })
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const prefix = `thread-switch-${runStamp}`

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-row', { timeout: 20000 })
  await page.waitForTimeout(2500)

  // Track provider-models requests per switch.
  const providerModelsRequests = []
  page.on('request', (req) => {
    if (req.url().includes('/codex-api/provider-models')) {
      providerModelsRequests.push({ url: req.url(), at: Date.now() })
    }
  })
  const rows = page.locator('.thread-row')
  const count = await rows.count()
  if (count < 2) { console.log('need >= 2 threads'); await browser.close(); return }

  // Install Long Task + layout observer once.
  await page.evaluate(() => {
    window.__longTasks = []
    window.__layoutShifts = []
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longTasks.push({ start: Math.round(entry.startTime), dur: Math.round(entry.duration) })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch (e) { /* not supported */ }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__layoutShifts.push({ start: Math.round(entry.startTime), value: entry.value })
        }
      }).observe({ type: 'layout-shift', buffered: true })
    } catch (e) { /* not supported */ }
  })

  async function switchTo(index) {
    const before = await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      const loading = document.querySelector('.conversation-loading')
      const empty = document.querySelector('.conversation-empty')
      const bar = document.querySelector('.conversation-switching-bar')
      return {
        listLen: list ? list.innerHTML.length : 0,
        loadingText: loading ? loading.innerText : '',
        emptyText: empty ? empty.innerText : '',
        barText: bar ? bar.innerText : '',
      }
    })
    await page.evaluate(() => {
      window.__longTasks.length = 0
      window.__layoutShifts.length = 0
      window.__switchStart = performance.now()
    })
    const clickStart = performance.now()
    await rows.nth(index).click()

    // Poll: record when loading/empty/bar appear and when list content changes.
    let firstChangeMs = -1
    let sawLoading = false
    let sawEmpty = false
    let sawBar = false
    let barShownMs = -1
    let barGoneMs = -1
    let barActive = false
    for (let i = 0; i < 250; i += 1) {
      await page.waitForTimeout(40)
      const state = await page.evaluate(() => {
        const list = document.querySelector('.conversation-list')
        const loading = document.querySelector('.conversation-loading')
        const empty = document.querySelector('.conversation-empty')
        const bar = document.querySelector('.conversation-switching-bar')
        return {
          listLen: list ? list.innerHTML.length : 0,
          loadingText: loading ? loading.innerText : '',
          emptyText: empty ? empty.innerText : '',
          barText: bar ? bar.innerText : '',
        }
      })
      const now = performance.now() - clickStart
      if (state.loadingText) sawLoading = true
      if (state.emptyText) sawEmpty = true
      if (state.barText) {
        sawBar = true
        if (!barActive) { barShownMs = Math.round(now); barActive = true }
      } else if (barActive) {
        barGoneMs = Math.round(now)
        barActive = false
      }
      if (state.listLen !== before.listLen) {
        firstChangeMs = Math.round(now)
        break
      }
      if (now > 8000) break
    }
    await page.waitForTimeout(1500)
    const metrics = await page.evaluate(() => ({
      longTasks: window.__longTasks,
      layoutShifts: window.__layoutShifts,
    }))
    return { firstChangeMs, sawLoading, sawEmpty, sawBar, barShownMs, barGoneMs, longTasks: metrics.longTasks, layoutShifts: metrics.layoutShifts }
  }

  const results = []
  results.push({ step: '0->1 (first)', ...(await switchTo(1)) })
  results.push({ step: '1->0 (back)', ...(await switchTo(0)) })
  results.push({ step: '0->1 (again)', ...(await switchTo(1)) })
  results.push({ step: '1->0 (again)', ...(await switchTo(0)) })

  console.log(JSON.stringify({ results, providerModelsRequests }, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
