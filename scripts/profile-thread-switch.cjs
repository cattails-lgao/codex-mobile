// Thread-switch jank probe: clicks sidebar thread rows in sequence and reports
// main-thread blocking per switch (long tasks, frame gaps, layout shifts), an
// optional per-switch CPU self-time profile (CDP sampling profiler) and an
// optional per-switch Chrome timeline breakdown (Layout / UpdateLayoutTree /
// Paint / FunctionCall), so a freeze is attributed rather than guessed at.
//
//   node scripts/profile-thread-switch.cjs
//
// Env:
//   PROFILE_BASE_URL    dev server (default http://127.0.0.1:4173)
//   PROFILE_SWITCHES    how many switches to perform (default 6)
//   PROFILE_ROW_LIMIT   how many sidebar rows to consider (default 8)
//   PROFILE_OBSERVE_MS  per-switch observation window (default 2500)
//   PROFILE_HEADLESS=false to watch it run
//   PROFILE_TRACE=1     collect a Chrome timeline per switch (heavier, attributive)
//   PROFILE_NO_PROFILE=1 to skip per-switch CPU sampling
const { chromium } = require('playwright')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const BASE = process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const EDGE = process.env.PROFILE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const switchCount = Number.parseInt(process.env.PROFILE_SWITCHES || '6', 10)
const rowLimit = Number.parseInt(process.env.PROFILE_ROW_LIMIT || '8', 10)
const observeMs = Number.parseInt(process.env.PROFILE_OBSERVE_MS || '2500', 10)
const headless = process.env.PROFILE_HEADLESS !== 'false'
const withProfile = process.env.PROFILE_NO_PROFILE !== '1'
const withTrace = process.env.PROFILE_TRACE === '1'
const TRACE_CATEGORIES = 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking'
const outputDir = resolve(process.cwd(), 'output/playwright')
mkdirSync(outputDir, { recursive: true })
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const prefix = `thread-switch-${runStamp}`

function round(value) {
  return Math.round(value * 10) / 10
}

function shortUrl(url) {
  return (url || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '').split('?')[0]
}

function aggregateProfile(profile, limit) {
  const selfMicros = new Map()
  for (let i = 0; i < profile.samples.length; i += 1) {
    const delta = profile.timeDeltas[i] || 0
    selfMicros.set(profile.samples[i], (selfMicros.get(profile.samples[i]) || 0) + delta)
  }
  const nodeById = new Map(profile.nodes.map((node) => [node.id, node]))
  const hotByKey = new Map()
  for (const [id, micros] of selfMicros) {
    const node = nodeById.get(id)
    if (!node) continue
    const frame = node.callFrame
    const key = `${frame.functionName || '(anonymous)'} @ ${shortUrl(frame.url)}:${frame.lineNumber + 1}`
    hotByKey.set(key, (hotByKey.get(key) || 0) + micros)
  }
  return [...hotByKey.entries()]
    .map(([key, micros]) => ({ key, selfMs: round(micros / 1000) }))
    .filter((row) => !row.key.startsWith('(idle)'))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, limit)
}

// Chrome timeline aggregation: which main-thread categories own the freeze.
function aggregateTrace(events) {
  const byName = new Map()
  const fnCalls = new Map()
  const bigEvents = []
  const layoutPasses = []
  const invalidations = new Map()
  let layoutCount = 0
  let styleCount = 0
  let maxLayoutMs = 0
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.dur !== 'number') continue
    byName.set(event.name, (byName.get(event.name) || 0) + event.dur)
    if (event.name === 'Layout') {
      layoutCount += 1
      maxLayoutMs = Math.max(maxLayoutMs, event.dur)
    }
    if (event.name === 'UpdateLayoutTree') styleCount += 1
    if (event.name === 'StyleRecalcInvalidationTracking' || event.name === 'LayoutInvalidationTracking') {
      const data = event.args?.data || {}
      const key = `${event.name} | reason=${data.reason || ''} | node=${data.nodeName || ''} | ${JSON.stringify(data.extraData ?? {}).slice(0, 100)}`
      invalidations.set(key, (invalidations.get(key) || 0) + (event.dur || 0))
    } else if (event.name === 'Layout' || event.name === 'UpdateLayoutTree') {
      const begin = event.args?.beginData || {}
      layoutPasses.push({
        name: event.name,
        durMs: round(event.dur / 1000),
        atMs: round(event.ts / 1000),
        dirtyObjects: begin.dirtyObjects,
        totalObjects: begin.totalObjects,
      })
      bigEvents.push({
        name: event.name,
        durMs: round(event.dur / 1000),
        dirtyObjects: begin.dirtyObjects,
        totalObjects: begin.totalObjects,
        elementCount: begin.elementCount,
        partial: begin.partialLayout,
        frame: begin.frame,
        stack: (begin.stackTrace || []).slice(0, 4)
          .map((frame) => `${frame.functionName || '(anon)'} @ ${shortUrl(frame.url)}:${(frame.lineNumber ?? -1) + 1}`),
      })
    }
    if (event.name === 'FunctionCall') {
      const data = event.args?.data || {}
      const key = `${data.functionName || '(anonymous)'} @ ${shortUrl(data.url)}:${(data.lineNumber ?? -1) + 1}`
      fnCalls.set(key, (fnCalls.get(key) || 0) + event.dur)
    }
  }
  return {
    layoutMs: round((byName.get('Layout') || 0) / 1000),
    layoutCount,
    maxLayoutMs: round(maxLayoutMs / 1000),
    styleMs: round((byName.get('UpdateLayoutTree') || 0) / 1000),
    styleCount,
    paintMs: round((byName.get('Paint') || 0) / 1000),
    prePaintMs: round((byName.get('PrePaint') || 0) / 1000),
    compositeMs: round((byName.get('CompositeLayers') || 0) / 1000),
    hitTestMs: round((byName.get('HitTest') || 0) / 1000),
    functionCallMs: round((byName.get('FunctionCall') || 0) / 1000),
    runMicrotasksMs: round((byName.get('RunMicrotasks') || 0) / 1000),
    timerFireMs: round((byName.get('TimerFire') || 0) / 1000),
    eventDispatchMs: round((byName.get('EventDispatch') || 0) / 1000),
    topEvents: [...byName.entries()]
      .map(([name, micros]) => ({ name, ms: round(micros / 1000) }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12),
    topFunctionCalls: [...fnCalls.entries()]
      .map(([key, micros]) => ({ key, ms: round(micros / 1000) }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12),
    biggestEvents: bigEvents.sort((a, b) => b.durMs - a.durMs).slice(0, 4),
    layoutPasses: layoutPasses.slice(0, 16),
    invalidations: [...invalidations.entries()]
      .map(([key, micros]) => ({ key, ms: round(micros / 1000) }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10),
  }
}

async function main() {
  const browser = await chromium.launch({ headless, executablePath: EDGE })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  const providerModelsRequests = []
  page.on('request', (req) => {
    if (req.url().includes('/codex-api/provider-models')) {
      providerModelsRequests.push({ url: req.url(), at: Date.now() })
    }
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('.thread-row', { timeout: 60000 })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading threads...'), null, { timeout: 60000 })
  const settleMs = Number.parseInt(process.env.PROFILE_SETTLE_MS || '2500', 10)
  await page.waitForTimeout(settleMs)

  // PROFILE_HIDE_CSS lets a single run isolate a region: the same switching loop
  // runs with that CSS applied, so layout/style costs can be attributed to a subtree.
  if (process.env.PROFILE_HIDE_CSS) {
    await page.addStyleTag({ content: process.env.PROFILE_HIDE_CSS })
    await page.waitForTimeout(500)
  }

  await page.evaluate(() => {
    window.__longTasks = []
    window.__layoutShifts = []
    window.__frames = []
    window.__lastFrameAt = performance.now()
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
    const tick = (now) => {
      window.__frames.push({ at: now, gap: now - window.__lastFrameAt })
      window.__lastFrameAt = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const rows = page.locator('.thread-row')
  const count = await rows.count()
  if (count < 2) { console.log('need >= 2 threads'); await browser.close(); return }

  const rowLabels = []
  for (let i = 0; i < Math.min(count, rowLimit); i += 1) {
    rowLabels.push((await rows.nth(i).innerText()).trim().split('\n').join(' | '))
  }

  const client = await context.newCDPSession(page)
  if (withProfile) {
    await client.send('Profiler.enable')
    await client.send('Profiler.setSamplingInterval', { interval: 400 })
  }

  async function switchTo(index, step) {
    const before = await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      return { now: performance.now(), listLen: list ? list.innerHTML.length : 0 }
    })
    await page.evaluate(() => {
      window.__longTasks.length = 0
      window.__layoutShifts.length = 0
      window.__frames.length = 0
    })
    const providerMark = providerModelsRequests.length

    // Tracing runs one session per switch: it cannot be restarted after Tracing.end
    // without a fresh start, and starting it inside the window keeps the timeline
    // attributable to this click.
    const collected = []
    const onData = (payload) => collected.push(...payload.value)
    if (withTrace) {
      client.on('Tracing.dataCollected', onData)
      await client.send('Tracing.start', { categories: TRACE_CATEGORIES })
    }
    if (withProfile) await client.send('Profiler.start')

    await rows.nth(index).click()
    await page.waitForTimeout(observeMs)

    const profile = withProfile ? (await client.send('Profiler.stop')).profile : null
    if (withTrace) {
      const complete = new Promise((resolveTrace) => client.once('Tracing.tracingComplete', resolveTrace))
      await client.send('Tracing.end')
      await complete
      client.off('Tracing.dataCollected', onData)
    }

    const metrics = await page.evaluate((mark) => {
      const longTasks = window.__longTasks.filter((entry) => entry.start >= mark - 100)
      const frames = window.__frames.filter((entry) => entry.at >= mark - 100)
      const gaps = frames.map((entry) => entry.gap).sort((a, b) => b - a)
      const list = document.querySelector('.conversation-list')
      return {
        longTaskCount: longTasks.length,
        longTaskTotalMs: longTasks.reduce((sum, entry) => sum + entry.dur, 0),
        longTaskMaxMs: longTasks.reduce((max, entry) => Math.max(max, entry.dur), 0),
        blockingMs: longTasks.reduce((sum, entry) => sum + Math.max(0, entry.dur - 50), 0),
        topGaps: gaps.slice(0, 5),
        longTasks: longTasks.map((entry) => entry.dur),
        layoutShiftTotal: window.__layoutShifts.reduce((sum, entry) => sum + entry.value, 0),
        after: {
          listLen: list ? list.innerHTML.length : 0,
          listItems: document.querySelectorAll('.conversation-item').length,
          nodes: list ? list.querySelectorAll('*').length : 0,
        },
      }
    }, before.now)

    return {
      step,
      index,
      label: rowLabels[index] || '',
      ...metrics,
      topGaps: metrics.topGaps.map(round),
      longTaskTotalMs: round(metrics.longTaskTotalMs),
      longTaskMaxMs: round(metrics.longTaskMaxMs),
      blockingMs: round(metrics.blockingMs),
      providerModelsRequests: providerModelsRequests.length - providerMark,
      listLenChanged: metrics.after.listLen !== before.listLen,
      hotFunctions: profile ? aggregateProfile(profile, 8) : [],
      trace: withTrace ? aggregateTrace(collected) : null,
    }
  }

  const order = []
  const distinct = Math.min(count, rowLimit, switchCount)
  for (let i = 0; i < distinct; i += 1) order.push(i)
  for (let i = 0; order.length < switchCount; i += 1) order.push(i % Math.max(1, distinct))

  // Warm-up switches are excluded from the report: the first switch after page
  // load also pays one-time costs (lazy module compile/evaluate, first text
  // shaping, background boot requests), which swamps the steady-state signal.
  const warmup = Number.parseInt(process.env.PROFILE_WARMUP || '0', 10)
  for (let i = 0; i < warmup; i += 1) {
    await rows.nth(order[i % order.length]).click()
    await page.waitForTimeout(600)
  }

  const results = []
  for (let i = 0; i < order.length; i += 1) {
    results.push(await switchTo(order[i], i === 0 ? `0->${order[i]} (first)` : `${order[i - 1]}->${order[i]}`))
  }

  await browser.close()

  const report = {
    baseUrl: BASE,
    rowLabels,
    switchCount: results.length,
    observeMs,
    providerModelsRequestCount: providerModelsRequests.length,
    results,
  }
  const reportPath = resolve(outputDir, `${prefix}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(JSON.stringify({
    reportPath,
    rowLabels,
    providerModelsRequestCount: providerModelsRequests.length,
    results: results.map((row) => ({
      step: row.step,
      label: row.label,
      listItems: row.after.listItems,
      blockingMs: row.blockingMs,
      longTaskCount: row.longTaskCount,
      longTaskMaxMs: row.longTaskMaxMs,
      longTasks: row.longTasks,
      topGaps: row.topGaps,
      listLenChanged: row.listLenChanged,
      hotFunctions: row.hotFunctions,
      trace: row.trace,
    })),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
