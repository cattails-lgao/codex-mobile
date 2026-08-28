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
const SHOT = 'output/playwright/turn-time-e2e.png'
const SEND_MSG = 'List the files in the current directory with a shell command and show the output.'

async function launchBrowser() {
  if (SYSTEM_LAUNCHER) return await chromium.launch({ executablePath: SYSTEM_LAUNCHER, headless: true })
  return await chromium.launch()
}

async function enterThread(page) {
  for (const proj of ['test', 'workflow-investor']) {
    if ((await page.getByText(proj, { exact: true }).count()) > 0) {
      await page.getByText(proj, { exact: true }).first().click().catch(() => {})
      await page.waitForTimeout(1000)
      for (const tt of ['$skill-installer', '是否有可视化配置页面', '回复OK']) {
        const el = page.getByText(tt, { exact: false }).first()
        if ((await el.count()) > 0) {
          await el.click().catch(() => {})
          await page.waitForTimeout(1800)
          return true
        }
      }
    }
  }
  return false
}

;(async () => {
  const browser = await launchBrowser()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2000)
  const inThread = await enterThread(page)
  console.log('IN_THREAD:', inThread)

  const composer = page.getByPlaceholder(/Ask Codex any(thing|thing\.)/i).first()
  const composerCount = await composer.count().catch(() => 0)
  if (composerCount > 0) {
    await composer.fill(SEND_MSG)
    await page.waitForTimeout(300)
    await composer.press('Enter')
    console.log('SENT_MESSAGE:', true)
  } else {
    console.log('SENT_MESSAGE:', false, 'no composer found')
  }

  // 轮询等待耗时行出现（agent 执行命令 → worked 回合 → 显示耗时）
  let turnTimeCount = 0
  let samples = []
  const deadline = Date.now() + 150_000
  while (Date.now() < deadline) {
    turnTimeCount = await page.locator('.conversation-turn-time').count().catch(() => 0)
    if (turnTimeCount > 0) { samples = await page.locator('.conversation-turn-time').allInnerTexts(); break }
    await page.waitForTimeout(2000)
  }
  console.log('TURN_TIME_COUNT:', turnTimeCount)
  console.log('TURN_TIME_SAMPLES:', JSON.stringify(samples.slice(0, 8)))
  console.log('ERRORS:', JSON.stringify(errors.slice(0, 8)))

  await page.screenshot({ path: SHOT })
  await browser.close()
  console.log('DONE')
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1) })