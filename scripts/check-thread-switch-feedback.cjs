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
// 退出码: 0 全绿 / 1 有断言失败或运行异常 / 2 环境不足（SKIP，例如这个 CODEX_HOME
//         里没有 ≥2 条有消息的线程可供切换）
//
// Env:
//   PROFILE_BASE_URL      app url (default http://127.0.0.1:4173)
//   PROFILE_EDGE          chromium/edge executable override
//   PROFILE_HEADLESS=false to watch it run
//   FREEZE_BUDGET_MS      base max unpainted window after a click (default 60)
//   FREEZE_BUDGET_MODE    'scaled' (default) grows the budget with the ambient
//                         frame cadence measured on this run; 'absolute' pins it
//                         to FREEZE_BUDGET_MS (round-128 and earlier behaviour)
//   FREEZE_AMBIENT_FACTOR multiplier applied to the ambient 90th-percentile
//                         frame gap when scaling (default 2)
//   FREEZE_BUDGET_CAP_MS  hard ceiling for the scaled budget (default 200). If
//                         the ambient cadence alone needs more, the timing
//                         assertion is skipped with a note instead of failing
//   FREEZE_SYNTHETIC_LOAD_MS
//                         busy-wait this many ms inside every animation frame,
//                         to reproduce a uniformly slow (loaded) machine
//                         (default 0 = off; self-test aid for the A/B above)
//   FREEZE_INJECT_CLICK_STALL_MS
//                         busy-wait this many ms in a capture-phase click
//                         listener that runs before the app's own handler - the
//                         round-89 regression shape. Proves the assertion still
//                         fires even after the budget is scaled (default 0)
//   SETTLE_TIMEOUT_MS     max wait for a click to settle (default 15000)
const { chromium } = require('playwright')

const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const EDGE =
  process.env.PROFILE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const headless = process.env.PROFILE_HEADLESS !== 'false'
const FREEZE_BUDGET_MS = Number.parseInt(process.env.FREEZE_BUDGET_MS || '60', 10)
const FREEZE_BUDGET_MODE = process.env.FREEZE_BUDGET_MODE || 'scaled'
const FREEZE_AMBIENT_FACTOR = Number.parseFloat(process.env.FREEZE_AMBIENT_FACTOR || '2')
const FREEZE_BUDGET_CAP_MS = Number.parseInt(process.env.FREEZE_BUDGET_CAP_MS || '200', 10)
const FREEZE_SYNTHETIC_LOAD_MS = Number.parseInt(process.env.FREEZE_SYNTHETIC_LOAD_MS || '0', 10)
const FREEZE_INJECT_CLICK_STALL_MS = Number.parseInt(process.env.FREEZE_INJECT_CLICK_STALL_MS || '0', 10)
const SETTLE_TIMEOUT_MS = Number.parseInt(process.env.SETTLE_TIMEOUT_MS || '15000', 10)

const failures = []
function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(label)
}

const short = (id) => (id ? id.slice(0, 8) : '(none)')
const rowSelector = (id) => `.thread-row[data-thread-id="${id}"]`

// Quiet window opened before each measured click, so the ambient frame cadence
// can be read on this run rather than assumed from a fixed number.
const AMBIENT_WINDOW_MS = 700

// The freeze budget, normalised by this machine's ambient frame cadence. On an
// idle machine the ambient 90th-percentile gap is a few ms, so the budget stays
// at FREEZE_BUDGET_MS and the assertion is as strict as before. On a loaded one
// a single frame already costs tens of ms, so the budget grows with it (up to
// FREEZE_BUDGET_CAP_MS) and a click that paints on the next frame passes
// regardless of load. Round-119/120 recorded this assertion failing 6 of 15
// runs on a busy machine at frozen 61-100 ms with no product regression - pure
// scheduling noise, which is exactly what this normalisation removes.
function effectiveFreezeBudget(
  ambientGap,
  mode = FREEZE_BUDGET_MODE,
  base = FREEZE_BUDGET_MS,
  factor = FREEZE_AMBIENT_FACTOR,
  cap = FREEZE_BUDGET_CAP_MS,
) {
  if (mode === 'absolute') return base
  const scaled = Math.ceil((ambientGap || 0) * factor)
  return Math.min(Math.max(base, scaled), cap)
}

// True when even the cap cannot absorb the ambient cadence: the machine is too
// loaded for a wall-clock timing assertion to mean anything. Reported and
// skipped, never failed - the alternative is a red run that blames the product
// for the host.
function ambientExceedsCap(
  ambientGap,
  mode = FREEZE_BUDGET_MODE,
  factor = FREEZE_AMBIENT_FACTOR,
  cap = FREEZE_BUDGET_CAP_MS,
) {
  return mode !== 'absolute' && Math.ceil((ambientGap || 0) * factor) > cap
}

// Single freeze assertion with the measured cadence in the detail line, so a
// pass or fail can always be attributed to the click vs the machine.
function checkFreeze(label, frozen, ambient, budget) {
  if (frozen === null || frozen === undefined) {
    check(false, `${label} measured`, 'no click recorded')
    return
  }
  if (ambientExceedsCap(ambient)) {
    console.log(
      `skip  ${label} - machine too loaded to time a ${FREEZE_BUDGET_CAP_MS}ms window ` +
        `(ambient90=${ambient}ms would need ${Math.ceil(ambient * FREEZE_AMBIENT_FACTOR)}ms)`,
    )
    return
  }
  check(
    frozen <= budget,
    `${label} <= ${budget}ms`,
    `frozen=${frozen}ms ambient90=${ambient}ms budget=${budget}ms` +
      (FREEZE_BUDGET_MODE === 'absolute' ? ' mode=absolute' : ''),
  )
}

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
  // Unpainted window after the click: the frame gaps up to and including the
  // first frame the browser painted. Bounded so a machine whose frames never
  // fall under the quiet-gap threshold cannot sum forever.
  // Ambient cadence: the frame gaps recorded before the click, i.e. the quiet
  // window the gate opens on purpose. A percentile of them is what one frame
  // costs on this machine right now.
  window.__ambient = (p) => {
    const click = window.__f.clicks[0]
    const gaps = window.__f.frames.filter((f) => !click || f.t < click.t).map((f) => f.gap)
    if (!gaps.length) return 0
    const sorted = gaps.slice().sort((a, b) => a - b)
    const pct = p === undefined ? 0.9 : p
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * pct)))]
  }
  const MAX_FREEZE_FRAMES = 12
  // Unpainted window after the click: sum the frame gaps up to and including the
  // first frame painted at this machine's normal cadence. A frame counts as
  // painted when its gap is within the cadence - twice the median, never below
  // the 40 ms floor the metric always used. On a fast machine that is the exact
  // old measurement; on a slow one it stops at the first frame the browser
  // actually produced instead of summing stalled frames until the bound, which
  // is what made the reading (and the fixed budget) meaningless under load.
  window.__freeze = () => {
    const click = window.__f.clicks[0]
    if (!click) return null
    const quiet = Math.max(40, (window.__ambient(0.5) || 0) * 2)
    let frozen = 0
    let seen = 0
    for (const frame of window.__f.frames) {
      if (frame.t < click.t) continue
      frozen += frame.gap
      seen += 1
      if (frame.gap <= quiet || seen >= MAX_FREEZE_FRAMES) break
    }
    return frozen
  }
  // Self-test aid: busy-wait busyMs inside every animation frame, so every frame
  // costs that much and the page runs at a uniformly slow cadence - which is
  // what a loaded machine looks like to the freeze metric. A setInterval busy
  // loop does not do this: it leaves most frames at the normal cadence and only
  // spikes the max, so a click usually still lands on a fast frame.
  window.__slBusy = 0
  window.__slStarted = false
  window.__synthLoad = (busyMs) => {
    window.__slBusy = busyMs > 0 ? busyMs : 0
    if (window.__slBusy > 0 && !window.__slStarted) {
      window.__slStarted = true
      const loop = () => {
        const end = performance.now() + window.__slBusy
        while (performance.now() < end) {}
        if (window.__slBusy > 0) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }
  }
  // Self-test aid: block the main thread on the click before the app's own
  // handler runs (capture phase, registered first), i.e. the round-89 shape of
  // the bug - the highlight cannot paint until the stall is over.
  window.__stallMs = 0
  window.__stallHooked = false
  window.__injStall = (ms) => {
    window.__stallMs = ms > 0 ? ms : 0
    if (window.__stallMs > 0 && !window.__stallHooked) {
      window.__stallHooked = true
      document.addEventListener(
        'click',
        (e) => {
          const row = e.target && e.target.closest ? e.target.closest('.thread-row') : null
          if (!row) return
          const end = performance.now() + window.__stallMs
          while (performance.now() < end) {}
        },
        true,
      )
    }
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

// Picks sidebar threads that actually have messages, in DOM order, in two
// tiers. The check is about content appearing for the clicked thread, so its
// targets must be threads that have some - a sidebar full of never-used threads
// would otherwise fail every content assertion for environmental reasons. Runs
// in the page so it uses the app's own origin and session.
//
// Tier 1 is thread/turns/list, the direct oracle. But it reports 0 turns for a
// few old-shape rollouts that still render when opened (round-118: two ~50 KB
// rollouts answered 0), so a 0 must not disqualify a thread outright - a purely
// turns-based selection would exit with "environment not satisfied" on homes
// where those threads are exactly the ones that have content.
//
// Tier 2, consulted only when tier 1 comes up short: a non-empty `preview`
// from thread/list is derived from the first user message, so it marks threads
// that hold content turns/list failed to count. Every pick - tier 1 or 2 - is
// still judged afterwards by the settle conditions (content must actually
// render), so a bad fallback pick fails those assertions loudly rather than
// being waved through. (Known edge, accepted: a preview filled by the
// round-81 goal-rescue path may have no messages; the diagnostic line below
// makes such a pick visible for attribution.)
const CONTENT_IDS = `
async (limit) => {
  const ids = Array.from(document.querySelectorAll('.thread-row')).map((row) => row.getAttribute('data-thread-id') || '')
  const byTurns = []
  const zeroTurns = []
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
    if (data.length > 0) {
      byTurns.push(id)
      if (byTurns.length >= limit) return { picked: byTurns, fromFallback: 0 }
    } else {
      zeroTurns.push(id)
    }
  }
  const res = await fetch('/codex-api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'thread/list', params: {} }),
  })
  const json = await res.json()
  const previewById = new Map(
    (json && json.result && Array.isArray(json.result.data) ? json.result.data : []).map((t) => [t.id, (t.preview || '').trim()]),
  )
  const picked = [...byTurns]
  let fromFallback = 0
  for (const id of [...zeroTurns, ...ids.filter((i) => !byTurns.includes(i) && !zeroTurns.includes(i))]) {
    if (picked.includes(id)) continue
    if ((previewById.get(id) || '').length > 0) {
      picked.push(id)
      fromFallback += 1
      if (picked.length >= limit) break
    }
  }
  return { picked, fromFallback }
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
  // 环境不足（这个 CODEX_HOME 里一条线程都没有 → 侧栏不渲染任何行）→ SKIP（退出码 2），
  // 而不是让 waitForSelector 超时冒到 main().catch 里被当成「运行异常」。隔离回放用的
  // 空 CODEX_HOME 正是这种情形，它不该让闸门看起来像回归。
  try {
    await page.waitForSelector('.thread-row', { timeout: 30000 })
  } catch {
    console.log(`SKIP: no .thread-row appeared within 30s at ${BASE} - this CODEX_HOME has no threads`)
    await browser.close()
    process.exit(2)
  }
  await page.waitForTimeout(3000)
  if (FREEZE_SYNTHETIC_LOAD_MS > 0) {
    await page.evaluate((ms) => window.__synthLoad(ms), FREEZE_SYNTHETIC_LOAD_MS)
    console.log(
      `note  synthetic load on: ${FREEZE_SYNTHETIC_LOAD_MS}ms busy per animation frame (uniformly slow cadence)`,
    )
  }
  if (FREEZE_INJECT_CLICK_STALL_MS > 0) {
    await page.evaluate((ms) => window.__injStall(ms), FREEZE_INJECT_CLICK_STALL_MS)
    console.log(
      `note  injected click stall on: ${FREEZE_INJECT_CLICK_STALL_MS}ms in a capture-phase listener before the app handler`,
    )
  }

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

  const contentPick = await page.evaluate(`(${CONTENT_IDS})(4)`)
  const contentIds = contentPick.picked
  const budgetLabel =
    FREEZE_BUDGET_MODE === 'absolute'
      ? `${FREEZE_BUDGET_MS}ms (absolute)`
      : `${FREEZE_BUDGET_MS}ms base, scaled by ambient x${FREEZE_AMBIENT_FACTOR} up to ${FREEZE_BUDGET_CAP_MS}ms`
  console.log(
    `rows=${rows} with-messages=${contentIds.length} dev=${isDev} budget=${budgetLabel} settleTimeout=${SETTLE_TIMEOUT_MS}ms`,
  )
  if (contentPick.fromFallback > 0) {
    console.log(
      `note  content selection: ${contentIds.length - contentPick.fromFallback} by turns/list + ` +
        `${contentPick.fromFallback} by preview fallback (turns/list reports 0 for some old-shape rollouts)`,
    )
  }
  if (contentIds.length < 2) {
    // 环境不足（这个 CODEX_HOME 里没有 ≥2 条有消息的线程）→ SKIP（退出码 2），
    // 与 verify-command-block-handoff / verify-*-scroll 的约定一致：退 1 只留给
    // 「真断言失败」。否则一个空隔离 home 会把环境欠缺伪装成回归。
    console.log(
      'SKIP: need at least 2 sidebar threads that have messages to check a switch' +
        ` (found ${contentIds.length} of ${rows} rows) - seed the CODEX_HOME used by this service with real threads`,
    )
    await browser.close()
    process.exit(2)
  }
  if (isDev) console.log('note  dev server: frame-timing assertions skipped (Vite compiles on demand)')

  // --- first open, from home ---
  const firstId = contentIds[0]
  await page.evaluate(() => window.__resetF())
  await page.waitForTimeout(AMBIENT_WINDOW_MS)
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
  const firstAmbient = await page.evaluate(() => window.__ambient())
  const firstBudget = effectiveFreezeBudget(firstAmbient)
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
    checkFreeze('first-open freeze', firstFreeze, firstAmbient, firstBudget)
  }

  // --- switch to a second thread, from a loaded thread ---
  const secondId = contentIds[1]
  const beforeChars = settled.snap.conversationChars
  await page.evaluate(() => window.__resetF())
  await page.waitForTimeout(AMBIENT_WINDOW_MS)
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
  const secondAmbient = await page.evaluate(() => window.__ambient())
  const secondBudget = effectiveFreezeBudget(secondAmbient)
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
    checkFreeze('switch freeze', secondFreeze, secondAmbient, secondBudget)
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

// Browser-free arithmetic check for the budget normalisation, so the scoring
// rule can be verified without a model or a running app:
//   node scripts/check-thread-switch-feedback.cjs --self-test
function selfTest() {
  let bad = 0
  const eq = (label, got, want) => {
    const ok = got === want
    if (!ok) bad += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}  (got=${got} want=${want})`)
  }
  eq('idle machine keeps the 60 ms floor', effectiveFreezeBudget(8), 60)
  eq('loaded machine scales by 2x ambient', effectiveFreezeBudget(70), 140)
  eq('absolute mode ignores the cadence', effectiveFreezeBudget(70, 'absolute'), 60)
  eq('scaled budget is capped', effectiveFreezeBudget(300), FREEZE_BUDGET_CAP_MS)
  eq('zero ambient falls back to the floor', effectiveFreezeBudget(0), 60)
  eq('idle never exceeds the cap rule', ambientExceedsCap(8), false)
  eq('very loaded machine exceeds the cap', ambientExceedsCap(300), true)
  eq('absolute mode never skips', ambientExceedsCap(300, 'absolute'), false)
  console.log(bad ? `\n${bad} self-test case(s) failed` : '\nself-test passed')
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
