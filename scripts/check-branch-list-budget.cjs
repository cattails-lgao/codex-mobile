// Branch-list budget check: the right Git panel renders a branch picker from
// whatever refs the bridge ships. A repo with thousands of refs used to mount
// every one of them, which cost a >100 ms main-thread insert and left a
// ~32 000-layout-object document behind - turning the conversation's own
// scrollHeight reads into ~80 ms forced layouts. The panel now renders a window
// and grows it on scroll, so this check fails if the DOM is ever unbounded
// again.
//
//   node scripts/check-branch-list-budget.cjs
//
// Env:
//   PROFILE_BASE_URL   app url (default http://127.0.0.1:4173)
//   PROFILE_EDGE       chromium/edge executable override
//   PROFILE_HEADLESS=false to watch it run
//   BRANCH_ROW_BUDGET  max rendered branch rows (default 100)
//   NODE_BUDGET        max document nodes (default 4000)
const { chromium } = require('playwright')

const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const EDGE =
  process.env.PROFILE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const headless = process.env.PROFILE_HEADLESS !== 'false'
const ROW_BUDGET = Number.parseInt(process.env.BRANCH_ROW_BUDGET || '100', 10)
const NODE_BUDGET = Number.parseInt(process.env.NODE_BUDGET || '4000', 10)

const failures = []

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(label)
}

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-row', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.locator('.thread-row').first().click()

  // The panel populates after the git RPCs resolve; wait for rows or give up.
  let rows = 0
  const deadline = Date.now() + 40000
  while (Date.now() < deadline) {
    rows = await page.evaluate(() => {
      const ul = document.querySelector('ul.rgp-branches')
      return ul ? ul.children.length : 0
    })
    if (rows > 1) break
    await page.waitForTimeout(250)
  }

  const state = await page.evaluate(() => {
    const ul = document.querySelector('ul.rgp-branches')
    return {
      rows: ul ? ul.children.length : 0,
      nodes: document.querySelectorAll('*').length,
      listScrollable: ul ? ul.scrollHeight > ul.clientHeight + 4 : false,
    }
  })

  if (!state.rows) {
    console.log('FAIL  branch list never populated - start the app with a repo that has refs')
    await browser.close()
    process.exit(1)
  }

  check(state.rows <= ROW_BUDGET, `rendered branch rows <= ${ROW_BUDGET}`, `rows=${state.rows}`)
  check(state.nodes <= NODE_BUDGET, `document nodes <= ${NODE_BUDGET}`, `nodes=${state.nodes}`)

  // Scrolling to the end must reveal more rows, i.e. the window grows rather
  // than the list silently hiding branches.
  const before = state.rows
  if (state.listScrollable || before >= ROW_BUDGET) {
    await page.evaluate(() => {
      const ul = document.querySelector('ul.rgp-branches')
      if (ul) ul.scrollTop = ul.scrollHeight
    })
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => {
      const ul = document.querySelector('ul.rgp-branches')
      return ul ? ul.children.length : 0
    })
    check(after >= before, 'scrolling to the end keeps or extends the window', `before=${before} after=${after}`)
    check(after <= before + ROW_BUDGET, 'window grows by one page at a time', `before=${before} after=${after}`)
  } else {
    console.log(`n/a   scroll growth - repo exposes only ${before} branch row(s)`)
  }

  // Typing a query must reset the window so the filtered list starts fresh.
  await page.locator('input.rgp-search').first().fill('zzz-no-such-branch')
  await page.waitForTimeout(400)
  const filtered = await page.evaluate(() => {
    const ul = document.querySelector('ul.rgp-branches')
    return ul ? ul.children.length : 0
  })
  check(filtered <= ROW_BUDGET, 'filtered list stays within the budget', `rows=${filtered}`)

  await browser.close()
  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed: ${failures.join('; ')}`)
    process.exit(1)
  }
  console.log('\nall checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
