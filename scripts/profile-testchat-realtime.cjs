const { chromium } = require('playwright')
const { existsSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')

const baseUrl = process.env.TESTCHAT_PROFILE_BASE_URL || 'http://127.0.0.1:4173'
const testChatRoot = process.env.TESTCHAT_ROOT || '/Users/igor/temp/TestChat'
const label = process.env.TESTCHAT_PROFILE_LABEL || 'optimized'
const timeoutMs = Number.parseInt(process.env.TESTCHAT_PROFILE_TIMEOUT_MS || '240000', 10)
const outputDir = resolve(process.cwd(), 'output/playwright')
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const appName = `todo-render-profile-${label}-${runStamp}`.replace(/[^a-zA-Z0-9._-]/g, '-')
const createdAppDir = join(testChatRoot, appName)

function round(value) {
  return Math.round(value * 100) / 100
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarize(values) {
  const finite = values.filter((value) => Number.isFinite(value))
  return {
    count: finite.length,
    min: round(finite.length ? Math.min(...finite) : 0),
    avg: round(finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0),
    p95: round(percentile(finite, 95)),
    max: round(finite.length ? Math.max(...finite) : 0),
  }
}

async function selectTestChatProject(page) {
  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.thread-composer-input', { timeout: 30000 })

  const selected = await page.locator('.new-thread-folder-selected').innerText().catch(() => '')
  if (selected.includes(testChatRoot)) return

  await page.locator('.new-thread-folder-dropdown .composer-dropdown-trigger').click()
  await page.locator('.new-thread-folder-dropdown .composer-dropdown-search-input').fill('TestChat')
  const option = page.locator('.new-thread-folder-dropdown .composer-dropdown-option', { hasText: 'TestChat' }).first()
  await option.click({ timeout: 10000 })
  await page.waitForFunction(
    (root) => document.querySelector('.new-thread-folder-selected')?.textContent?.includes(root),
    testChatRoot,
    { timeout: 10000 },
  ).catch(() => undefined)
}

async function installBrowserMetrics(page) {
  await page.addInitScript(() => {
    window.__testchatProfile = {
      longTasks: [],
      frameDeltas: [],
      startedAt: performance.now(),
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__testchatProfile.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          })
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
      window.__testchatProfile.longTaskObserver = observer
    } catch {
      window.__testchatProfile.longTaskObserver = null
    }

    let previousFrame = performance.now()
    const tick = (now) => {
      window.__testchatProfile.frameDeltas.push(now - previousFrame)
      previousFrame = now
      window.__testchatProfile.raf = requestAnimationFrame(tick)
    }
    window.__testchatProfile.raf = requestAnimationFrame(tick)
  })
}

async function collectBrowserMetrics(page) {
  return page.evaluate(() => {
    const profile = window.__testchatProfile || { longTasks: [], frameDeltas: [], startedAt: performance.now() }
    if (profile.longTaskObserver) profile.longTaskObserver.disconnect()
    if (profile.raf) cancelAnimationFrame(profile.raf)
    const memory = performance.memory
      ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      }
      : null
    return {
      elapsedMs: performance.now() - profile.startedAt,
      longTasks: profile.longTasks,
      frameDeltas: profile.frameDeltas,
      memory,
    }
  })
}

async function main() {
  mkdirSync(outputDir, { recursive: true })
  if (existsSync(createdAppDir)) {
    rmSync(createdAppDir, { recursive: true, force: true })
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await installBrowserMetrics(page)

  const client = await context.newCDPSession(page)
  await client.send('Performance.enable')

  const tracePath = resolve(outputDir, `testchat-realtime-${label}-${runStamp}-trace.zip`)
  const screenshotPath = resolve(outputDir, `testchat-realtime-${label}-${runStamp}.png`)
  const reportPath = resolve(outputDir, `testchat-realtime-${label}-${runStamp}.json`)

  await context.tracing.start({ screenshots: true, snapshots: true })
  await selectTestChatProject(page)

  const marker = `PROFILE_RENDER_${runStamp}`
  const prompt = [
    `${marker}`,
    `Create a small todo list web app in ${createdAppDir}.`,
    'Keep it simple: index.html, style.css, and app.js only.',
    'Include add, complete, delete, and clear-completed interactions.',
    'Do not start a dev server. Do not create files outside that directory.',
  ].join('\n')

  await page.locator('.thread-composer-input').fill(prompt)
  const startedAt = Date.now()
  await page.locator('.thread-composer-submit').click()
  await page.waitForURL(/#\/thread\//, { timeout: 30000 })

  await page.waitForSelector('.thread-composer-stop', { timeout: 30000 }).catch(() => undefined)
  await page.waitForFunction(
    () => !document.querySelector('.thread-composer-stop'),
    undefined,
    { timeout: timeoutMs },
  )
  await page.waitForTimeout(2500)

  const performanceMetrics = await client.send('Performance.getMetrics')
  const browserMetrics = await collectBrowserMetrics(page)
  const threadUrl = page.url()
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await context.tracing.stop({ path: tracePath })
  await browser.close()

  if (existsSync(createdAppDir)) {
    rmSync(createdAppDir, { recursive: true, force: true })
  }
  const cleanupOk = !existsSync(createdAppDir)
  if (!cleanupOk) {
    throw new Error(`Failed to remove generated TestChat app directory: ${createdAppDir}`)
  }

  const longTaskDurations = browserMetrics.longTasks.map((entry) => entry.duration)
  const frameDeltas = browserMetrics.frameDeltas.filter((value) => value > 0)
  const report = {
    label,
    baseUrl,
    threadUrl,
    testChatRoot,
    createdAppDir,
    cleanupOk,
    marker,
    elapsedWallMs: Date.now() - startedAt,
    screenshotPath,
    tracePath,
    browserMetrics: {
      elapsedMs: round(browserMetrics.elapsedMs),
      longTasks: browserMetrics.longTasks,
      longTaskSummary: summarize(longTaskDurations),
      frameDeltaSummary: summarize(frameDeltas),
      over50msFrameCount: frameDeltas.filter((value) => value > 50).length,
      memory: browserMetrics.memory,
    },
    cdpPerformanceMetrics: performanceMetrics.metrics,
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    reportPath,
    screenshotPath,
    tracePath,
    testChatRoot,
    createdAppDir,
    cleanupOk,
    elapsedWallMs: report.elapsedWallMs,
    longTaskSummary: report.browserMetrics.longTaskSummary,
    frameDeltaSummary: report.browserMetrics.frameDeltaSummary,
    over50msFrameCount: report.browserMetrics.over50msFrameCount,
  }, null, 2))
}

main().catch((error) => {
  if (existsSync(createdAppDir)) {
    rmSync(createdAppDir, { recursive: true, force: true })
  }
  console.error(error)
  process.exit(1)
})
