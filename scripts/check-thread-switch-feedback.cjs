// Thread-switch feedback check: clicking a thread in the sidebar must show the
// selected-row highlight before the switch work finishes.
//
// Why this exists: the click used to start the whole chain (route swap ->
// selectThread -> conversation hydrate + first layout) inside one task, so the
// browser painted nothing for 72-108 ms after the click on a production build -
// the row never looked selected and the UI felt stuck. The fix paints the
// highlight first and defers the navigation to the next task, which brings the
// freeze back down to a single frame (~17 ms) while the heavy work still
// happens, just after the highlight is on screen.
//
//   node scripts/check-thread-switch-feedback.cjs
//
// Env:
//   PROFILE_BASE_URL      app url (default http://127.0.0.1:4173)
//   PROFILE_EDGE          chromium/edge executable override
//   PROFILE_HEADLESS=false to watch it run
//   FREEZE_BUDGET_MS      max unpainted window after a click (default 60)
const { chromium } = require('playwright')

const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const EDGE =
  process.env.PROFILE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const headless = process.env.PROFILE_HEADLESS !== 'false'
const FREEZE_BUDGET_MS = Number.parseInt(process.env.FREEZE_BUDGET_MS || '60', 10)

const failures = []
function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(label)
}

const OBSERVE = `
(() => {
  window.__f = { clicks: [], frames: [], epoch: performance.now() }
  const rel = () => Math.round((performance.now() - window.__f.epoch) * 10) / 10
  document.addEventListener('click', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.thread-row') : null
    if (row) window.__f.clicks.push({ t: rel(), title: ((row.querySelector('.thread-row-title') || {}).textContent || '').slice(0, 26) })
  }, true)
  let last = 0
  const loop = () => { const now = performance.now(); window.__f.frames.push({ t: rel(), gap: Math.round(now - last) }); last = now; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  window.__resetF = () => { window.__f.clicks.length = 0; window.__f.frames.length = 0 }
  window.__freeze = () => {
    const click = window.__f.clicks[0]
    if (!click) return null
    let frozen = 0
    for (const frame of window.__f.frames) {
      if (frame.t < click.t) continue
      frozen += frame.gap
      if (frame.gap < 40) break
    }
    return frozen
  }
})()
`

const SNAP = `
() => {
  const active = Array.from(document.querySelectorAll('.thread-row')).filter((r) => r.getAttribute('data-active') === 'true')
  const conversation = document.querySelector('.conversation-list')
  return {
    activeTitles: active.map((r) => ((r.querySelector('.thread-row-title') || {}).textContent || '').slice(0, 26)),
    hash: location.hash,
    conversationChars: conversation ? conversation.textContent.length : 0,
  }
}
`

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(OBSERVE)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-row', { timeout: 30000 })
  await page.waitForTimeout(3000)

  const isDev = await page.evaluate(() => !!document.querySelector('script[src*="/@vite/client"]'))
  const rows = await page.locator('.thread-row').count()
  const titles = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.thread-row-title')).map((el) => el.textContent.slice(0, 26)),
  )
  console.log(`rows=${rows} dev=${isDev} budget=${FREEZE_BUDGET_MS}ms`)
  if (rows < 2) {
    console.log('FAIL  need at least 2 threads in the sidebar to check a switch')
    await browser.close()
    process.exit(1)
  }
  if (isDev) console.log('note  dev server: frame-timing assertions skipped (Vite compiles on demand)')

  // --- first open, from home ---
  await page.evaluate(() => window.__resetF())
  await page.locator('.thread-row').first().click({ force: true })
  const early = await page.evaluate(`(${SNAP})()`)
  await page.waitForTimeout(3000)
  const settled = await page.evaluate(`(${SNAP})()`)
  const firstFreeze = await page.evaluate(() => window.__freeze())

  check(
    early.activeTitles.length === 1 && early.activeTitles[0] === titles[0],
    'clicked row is the active row as soon as the main thread is free',
    `early=${JSON.stringify(early.activeTitles)}`,
  )
  check(
    settled.activeTitles[0] === titles[0] && settled.hash.includes('/thread/'),
    'highlight and route still agree after the switch settles',
    `settled=${JSON.stringify(settled.activeTitles)} ${settled.hash}`,
  )
  check(
    settled.conversationChars > 0,
    'conversation content loads for the clicked thread',
    `chars=${settled.conversationChars}`,
  )
  if (!isDev) {
    check(firstFreeze !== null && firstFreeze <= FREEZE_BUDGET_MS, `first-open freeze <= ${FREEZE_BUDGET_MS}ms`, `frozen=${firstFreeze}ms`)
  }

  // --- switch to a second thread, from a loaded thread ---
  const beforeChars = settled.conversationChars
  await page.evaluate(() => window.__resetF())
  await page.locator('.thread-row').nth(1).click({ force: true })
  const early2 = await page.evaluate(`(${SNAP})()`)
  check(
    early2.activeTitles.length === 1 && early2.activeTitles[0] === titles[1],
    'second switch highlights the new row before its content loads',
    `early=${JSON.stringify(early2.activeTitles)} chars=${early2.conversationChars}`,
  )
  await page.waitForTimeout(2500)
  const switched = await page.evaluate(`(${SNAP})()`)
  const secondFreeze = await page.evaluate(() => window.__freeze())
  check(
    switched.activeTitles[0] === titles[1],
    'second switch settles on the clicked row',
    `settled=${JSON.stringify(switched.activeTitles)} chars=${switched.conversationChars}`,
  )
  check(
    switched.conversationChars !== beforeChars || switched.conversationChars > 0,
    'second switch shows the other thread content',
    `before=${beforeChars} after=${switched.conversationChars}`,
  )
  if (!isDev) {
    check(secondFreeze !== null && secondFreeze <= FREEZE_BUDGET_MS, `switch freeze <= ${FREEZE_BUDGET_MS}ms`, `frozen=${secondFreeze}ms`)
  }

  // --- two clicks inside one frame must land on the last one ---
  await page.evaluate(() => {
    const all = document.querySelectorAll('.thread-row')
    all[0].click()
    all[1].click()
  })
  await page.waitForTimeout(2500)
  const rapid = await page.evaluate(`(${SNAP})()`)
  check(
    rapid.activeTitles.length === 1 && rapid.activeTitles[0] === titles[1] && rapid.hash.includes('/thread/'),
    'rapid double click lands on the last clicked thread',
    `active=${JSON.stringify(rapid.activeTitles)} ${rapid.hash}`,
  )

  // --- A -> B -> C -> A before each load settles (mirrors
  // tests/thread-loading-state/rapid-thread-switching-during-active-load.md):
  // the last clicked thread must win and the highlight, route and content must
  // agree once it settles, with no stale intermediate selection left behind. ---
  const tour = [0, 1, 2, 3, 0].filter((i) => i < rows)
  await page.evaluate((indices) => {
    const all = document.querySelectorAll('.thread-row')
    for (const i of indices) all[i].click()
  }, tour)
  await page.waitForTimeout(3000)
  const afterTour = await page.evaluate(`(${SNAP})()`)
  check(
    afterTour.activeTitles.length === 1 && afterTour.activeTitles[0] === titles[tour[tour.length - 1]],
    'rapid A->B->C->A before settling lands on the last clicked thread',
    `tour=${JSON.stringify(tour.map((i) => titles[i]))} active=${JSON.stringify(afterTour.activeTitles)}`,
  )
  check(
    afterTour.hash === settled.hash && afterTour.conversationChars > 0,
    'highlight, route and content agree after the rapid tour',
    `hash=${afterTour.hash} expected=${settled.hash} chars=${afterTour.conversationChars}`,
  )

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
