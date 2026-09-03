const { chromium } = require('playwright')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://127.0.0.1:4173'

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: EDGE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-row', { timeout: 20000 })
  await page.waitForTimeout(3000)

  const snapshot = async (label) => {
    const s = await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      const loading = document.querySelector('.conversation-loading')
      const empty = document.querySelector('.conversation-empty')
      const bar = document.querySelector('.conversation-switching-bar')
      return {
        listLen: list ? list.innerHTML.length : 0,
        loading: loading ? loading.innerText : null,
        empty: empty ? empty.innerText : null,
        bar: bar ? bar.innerText : null,
      }
    })
    console.log(label, JSON.stringify(s))
  }

  await snapshot('before-switch (thread 0)')
  const rows = page.locator('.thread-row')
  const count = await rows.count()
  console.log('thread rows:', count)
  if (count < 2) { await browser.close(); return }

  await rows.nth(1).click()
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(40)
    await snapshot(`t+${(i + 1) * 40}ms after switch`)
  }
  await page.waitForTimeout(1500)
  await snapshot('after settle')
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
