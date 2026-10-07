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
// Why it identifies threads by id and never by row index or title:
// the sidebar is sorted by updatedAt, so opening a thread re-ranks its row
// (measured on a real build, one click at a time: index 1 -> 0 and index 2 -> 0,
// with 2 and 3 of 10 indices drifting). A six-click run produced five distinct
// orders, while a no-click control held the same order for 20 s. This check used
// to capture `titles[i]` once at startup and reuse those indices ~9 s and five
// clicks later, so its "final hash == expected hash" assertion compared the
// tour's last row against a thread that had long since moved off that index -
// the intermittent failure recorded in round-117. Titles are not a key either
// (two threads on this machine share one), so a title comparison can pass while
// asserting the wrong thread. Every expectation below is therefore taken fresh
// from `.thread-row[data-thread-id]` at the moment it is used, and the waits are
// condition-based rather than "sleep 3 s and hope".
//
//   node scripts/check-thread-switch-feedback.cjs
//
// Env:
//   PROFILE_BASE_URL      app url (default http://127.0.0.1:4173)
//   PROFILE_EDGE          chromium/edge executable override
//   PROFILE_HEADLESS=false to watch it run
//   FREEZE_BUDGET_MS      max unpainted window after a click (default 60)
//   SETTLE_TIMEOUT_MS     max wait for a click to settle (default 15000)
const { chromium } = require('playwright')

const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const EDGE =
  process.env.PROFILE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const headless = process.env.PROFILE_HEADLESS !== 'false'
const FREEZE_BUDGET_MS = Number.parseInt(process.env.FREEZE_BUDGET_MS || '60', 10)
const SETTLE_TIMEOUT_MS = Number.parseInt(process.env.SETTLE_TIMEOUT_MS || '15000', 10)

const failures = []
function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(label)
}

const short = (id) => (id ? id.slice(0, 8) : '(none)')
const rowSelector = (id) => `.thread-row[data-thread-id="${id}"]`

const OBSERVE = `
(() => {
  window.__f = { clicks: [], frames: [], epoch: performance.now() }
  const rel = () => Math.round((performance.now() - window.__f.epoch) * 10) / 10
  document.addEventListener('click', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('.thread-row') : null
    if (row) window.__f.clicks.push({ t: rel(), id: row.getAttribute('data-thread-id') || '' })
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

// Reads the sidebar in DOM order. The order is expected to change (updatedAt
// sort); only the ids are meaningful.
const ROWS = `
() => Array.from(document.querySelectorAll('.thread-row')).map((row) => ({
  id: row.getAttribute('data-thread-id') || '',
  title: ((row.querySelector('.thread-row-title') || {}).textContent || '').slice(0, 26),
  active: row.getAttribute('data-active') === 'true',
}))
`

const SNAP = `
() => {
  const active = Array.from(document.querySelectorAll('.thread-row')).filter((r) => r.getAttribute('data-active') === 'true')
  const conversation = document.querySelector('.conversation-root')
  // Length of the rendered message list, not of the conversation shell: the
  // shell always contains the "Loading messages..." placeholder, so measuring it
  // would report "content loaded" for a thread that is still hydrating.
  const list = document.querySelector('.conversation-list')
  const routeMatch = location.hash.match(/\\/thread\\/([^/?]+)/)
  return {
    activeIds: active.map((r) => r.getAttribute('data-thread-id') || ''),
    hash: location.hash,
    routeId: routeMatch ? routeMatch[1] : '',
    conversationId: conversation ? conversation.getAttribute('data-thread-id') || '' : '',
    conversationChars: list ? list.textContent.length : 0,
  }
}
`

// Picks sidebar threads that actually have messages, in DOM order. The check is
// about content appearing for the clicked thread, so its targets must be threads
// that have some - a sidebar full of never-used threads would otherwise fail
// every content assertion for environmental reasons. Runs in the page so it uses
// the app's own origin and session.
const CONTENT_IDS = `
async (limit) => {
  const ids = Array.from(document.querySelectorAll('.thread-row')).map((row) => row.getAttribute('data-thread-id') || '')
  const withContent = []
  for (const id of ids) {
    let data = []
    try {
      const res = await fetch('/codex-api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'thread/turns/list', params: { threadId: id, limit: 1, itemsView: 'notLoaded' } }),
      })
      const json = await res.json()
      data = json && json.result && Array.isArray(json.result.data) ? json.result.data : []
    } catch {
      data = []
    }
    if (data.length > 0) withContent.push(id)
    if (withContent.length >= limit) break
  }
  return withContent
}
`

async function readRows(page) {
  return page.evaluate(`(${ROWS})()`)
}

async function snap(page) {
  return page.evaluate(`(${SNAP})()`)
}

// Polls until the predicate holds. Replaces the old fixed sleeps: the failure
// this guards against was "asserted before the app settled", so waiting on the
// condition is both faster on a good run and correct on a slow one.
async function waitForState(page, predicate, timeout = SETTLE_TIMEOUT_MS) {
  const started = Date.now()
  let last = await snap(page)
  while (!predicate(last)) {
    if (Date.now() - started > timeout) return { ok: false, snap: last, waitedMs: Date.now() - started }
    await page.waitForTimeout(100)
    last = await snap(page)
  }
  return { ok: true, snap: last, waitedMs: Date.now() - started }
}

// Clicks inside the page so a multi-click tour stays in one task, exactly like
// the rapid-switch scenario it mirrors. Rows are re-resolved per id, so a
// re-sort between clicks cannot retarget a click.
async function clickTour(page, ids) {
  await page.evaluate((wanted) => {
    for (const id of wanted) {
      const row = document.querySelector(`.thread-row[data-thread-id="${id}"]`)
      if (row) row.click()
    }
  }, ids)
}

// "Settled" means all three surfaces agree on the target and its messages have
// rendered. Route and highlight land together (the highlight is painted first on
// purpose) but the conversation legitimately lags while selectThread hydrates -
// on a cold app-server that lag exceeds the fixed sleeps this check used to
// rely on, which is why content is part of the condition: asserting on it at the
// instant the route lands measures the transition, not the outcome.
const settledOn = (target) => (s) =>
  s.activeIds.length === 1 &&
  s.activeIds[0] === target &&
  s.routeId === target &&
  s.conversationId === target &&
  s.conversationChars > 0

async function main() {
  const browser = await chromium.launch({ executablePath: EDGE, headless })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(OBSERVE)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-row', { timeout: 30000 })
  await page.waitForTimeout(3000)

  const isDev = await page.evaluate(() => !!document.querySelector('script[src*="/@vite/client"]'))
  const startRows = await readRows(page)
  const rows = startRows.length
  // A stale build would silently degrade every assertion below into "compare
  // empty strings", so refuse to run instead.
  const missingIds = startRows.filter((row) => !row.id).length
  check(missingIds === 0, 'every sidebar row exposes data-thread-id', `missing=${missingIds}/${rows}`)
  if (missingIds > 0) {
    await browser.close()
    process.exit(1)
  }

  const contentIds = await page.evaluate(`(${CONTENT_IDS})(4)`)
  console.log(
    `rows=${rows} with-messages=${contentIds.length} dev=${isDev} budget=${FREEZE_BUDGET_MS}ms settleTimeout=${SETTLE_TIMEOUT_MS}ms`,
  )
  if (contentIds.length < 2) {
    console.log(
      'FAIL  need at least 2 sidebar threads that have messages to check a switch' +
        ` (found ${contentIds.length} of ${rows} rows) - seed the CODEX_HOME used by this service with real threads`,
    )
    await browser.close()
    process.exit(1)
  }
  if (isDev) console.log('note  dev server: frame-timing assertions skipped (Vite compiles on demand)')

  // --- first open, from home ---
  const firstId = contentIds[0]
  await page.evaluate(() => window.__resetF())
  await page.locator(rowSelector(firstId)).first().click({ force: true })
  const early = await snap(page)
  check(
    early.activeIds.length === 1 && early.activeIds[0] === firstId,
    'clicked row is the active row as soon as the main thread is free',
    `early=${JSON.stringify(early.activeIds.map(short))} wanted=${short(firstId)}`,
  )
  const settled = await waitForState(page, settledOn(firstId))
  await page.waitForTimeout(800)
  const firstFreeze = await page.evaluate(() => window.__freeze())
  check(
    settled.ok,
    'highlight, route and content agree after the first switch settles',
    `active=${JSON.stringify(settled.snap.activeIds.map(short))} route=${short(settled.snap.routeId)} conv=${short(settled.snap.conversationId)} waited=${settled.waitedMs}ms`,
  )
  check(
    settled.snap.conversationChars > 0,
    'conversation content loads for the clicked thread',
    `chars=${settled.snap.conversationChars}`,
  )
  if (!isDev) {
    check(firstFreeze !== null && firstFreeze <= FREEZE_BUDGET_MS, `first-open freeze <= ${FREEZE_BUDGET_MS}ms`, `frozen=${firstFreeze}ms`)
  }

  // --- switch to a second thread, from a loaded thread ---
  const secondId = contentIds[1]
  const beforeChars = settled.snap.conversationChars
  await page.evaluate(() => window.__resetF())
  await page.locator(rowSelector(secondId)).first().click({ force: true })
  const early2 = await snap(page)
  check(
    early2.activeIds.length === 1 && early2.activeIds[0] === secondId,
    'second switch highlights the new row before its content loads',
    `early=${JSON.stringify(early2.activeIds.map(short))} wanted=${short(secondId)} chars=${early2.conversationChars}`,
  )
  const switched = await waitForState(page, settledOn(secondId))
  await page.waitForTimeout(800)
  const secondFreeze = await page.evaluate(() => window.__freeze())
  check(
    switched.ok,
    'second switch settles on the clicked row',
    `active=${JSON.stringify(switched.snap.activeIds.map(short))} route=${short(switched.snap.routeId)} chars=${switched.snap.conversationChars} waited=${switched.waitedMs}ms`,
  )
  check(
    switched.snap.conversationId === secondId,
    'second switch renders the other thread content, not the previous one',
    `conv=${short(switched.snap.conversationId)} wanted=${short(secondId)} before=${beforeChars} after=${switched.snap.conversationChars}`,
  )
  if (!isDev) {
    check(secondFreeze !== null && secondFreeze <= FREEZE_BUDGET_MS, `switch freeze <= ${FREEZE_BUDGET_MS}ms`, `frozen=${secondFreeze}ms`)
  }

  // --- two clicks inside one frame must land on the last one ---
  const pair = contentIds.slice(0, 2)
  await clickTour(page, pair)
  const rapid = await waitForState(page, settledOn(pair[1]))
  check(
    rapid.ok,
    'rapid double click lands on the last clicked thread',
    `active=${JSON.stringify(rapid.snap.activeIds.map(short))} route=${short(rapid.snap.routeId)} wanted=${short(pair[1])} waited=${rapid.waitedMs}ms`,
  )

  // --- A -> B -> C -> A before each load settles (mirrors
  // tests/thread-loading-state/rapid-thread-switching-during-active-load.md):
  // the last clicked thread must win and the highlight, route and content must
  // agree once it settles, with no stale intermediate selection left behind.
  // Runs over as many distinct content-bearing threads as the home has (four on
  // a healthy one, fewer are cycled). Targets are ids resolved up front and
  // re-queried per click, so a re-rank during the tour cannot retarget one. ---
  const tourIds = [...contentIds.slice(0, 4), contentIds[0]]
  const tourTarget = tourIds[tourIds.length - 1]
  await clickTour(page, tourIds)
  const afterTour = await waitForState(page, settledOn(tourTarget))
  check(
    afterTour.ok,
    'rapid A->B->C->A before settling lands on the last clicked thread',
    `tour=${JSON.stringify(tourIds.map(short))} active=${JSON.stringify(afterTour.snap.activeIds.map(short))} route=${short(afterTour.snap.routeId)} waited=${afterTour.waitedMs}ms`,
  )
  check(
    afterTour.snap.conversationId === tourTarget && afterTour.snap.conversationChars > 0,
    'highlight, route and content agree after the rapid tour',
    `conv=${short(afterTour.snap.conversationId)} wanted=${short(tourTarget)} chars=${afterTour.snap.conversationChars}`,
  )

  // Diagnostic only: the sidebar re-sorts by updatedAt, so a changed order is
  // normal app behaviour and must not fail the gate - but it is the exact
  // hazard that used to make this check flaky, so surface the measurement.
  const endRows = await readRows(page)
  const moved = endRows.filter((row, i) => startRows[i] && startRows[i].id !== row.id).length
  const dupes = [...new Set(startRows.map((row) => row.title).filter((t, i, all) => all.indexOf(t) !== i))]
  console.log(
    `note  sidebar order: ${moved}/${rows} indices changed during the run` +
      (dupes.length ? `; duplicate titles present: ${JSON.stringify(dupes)}` : ''),
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
