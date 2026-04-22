const { chromium } = require('playwright')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

const baseUrl = process.env.PROFILE_BASE_URL || 'http://localhost:5173'
const route = process.env.PROFILE_ROUTE || '/'
const waitMs = Number.parseInt(process.env.PROFILE_WAIT_MS || '7000', 10)
const headless = process.env.PROFILE_HEADLESS !== 'false'
const outputDir = resolve(process.cwd(), 'output/playwright')
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')

function routeSlug() {
  const raw = route.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return raw || 'home'
}

const artifactPrefix = `browser-runtime-profile-${routeSlug()}-${runStamp}`

function round(value) {
  return Math.round(value * 10) / 10
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarize(rows) {
  const durations = rows.map((row) => row.ms).filter((value) => Number.isFinite(value))
  const totalBytes = rows.reduce((sum, row) => sum + row.responseBytes, 0)
  return {
    count: rows.length,
    minMs: round(durations.length ? Math.min(...durations) : 0),
    avgMs: round(durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0),
    p95Ms: round(percentile(durations, 95)),
    maxMs: round(durations.length ? Math.max(...durations) : 0),
    totalKB: round(totalBytes / 1024),
  }
}

function buildWarnings(duplicateCounts, apiSummary, apiRows) {
  const warnings = []
  const providerModels = apiSummary.find((row) => row.key === '/codex-api/provider-models')
  const totalApiKB = round(apiRows.reduce((sum, row) => sum + row.responseBytes, 0) / 1024)

  if (duplicateCounts.threadListFirstPage > 1) warnings.push(`threadListFirstPage=${duplicateCounts.threadListFirstPage}`)
  if (duplicateCounts.threadResume > 1) warnings.push(`threadResume=${duplicateCounts.threadResume}`)
  if (duplicateCounts.threadRead > 0) warnings.push(`threadRead=${duplicateCounts.threadRead}`)
  if (duplicateCounts.skillsList > 1) warnings.push(`skillsList=${duplicateCounts.skillsList}`)
  if (duplicateCounts.rateLimitsRead > 1) warnings.push(`rateLimitsRead=${duplicateCounts.rateLimitsRead}`)
  if (providerModels && providerModels.maxMs > 1000) warnings.push(`providerModels=${providerModels.maxMs}ms`)
  if (totalApiKB > 750) warnings.push(`totalApiKB=${totalApiKB}`)

  return { warnings, totalApiKB }
}

function requestKey(row) {
  if (row.rpc === 'thread/list') {
    return row.cursor ? 'thread/list:cursor' : 'thread/list:first-page'
  }
  return row.rpc || row.path
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toTargetUrl() {
  if (/^https?:\/\//.test(route)) return route
  if (route.startsWith('#')) return `${baseUrl}/${route}`
  if (route.startsWith('/')) return `${baseUrl}${route}`
  return `${baseUrl}/${route}`
}

async function collectPerformance(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    const paints = performance.getEntriesByType('paint').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
    }))
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/codex-api') || entry.name.includes('/assets/'))
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        duration: entry.duration,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      }))

    return {
      navigation: navigation ? {
        responseEnd: navigation.responseEnd,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
      } : null,
      paints,
      resources,
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null,
    }
  })
}

async function main() {
  mkdirSync(outputDir, { recursive: true })

  const targetUrl = toTargetUrl()
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const apiRows = []

  page.on('request', (request) => {
    const url = request.url()
    if (!url.includes('/codex-api')) return

    const body = request.postData()
    const parsedBody = body ? parseJson(body) : null
    request.__profile = {
      startedAt: performance.now(),
      rpc: parsedBody && typeof parsedBody.method === 'string' ? parsedBody.method : '',
      cursor: parsedBody?.params && typeof parsedBody.params === 'object' && typeof parsedBody.params.cursor === 'string'
        ? parsedBody.params.cursor
        : '',
      requestBytes: body ? Buffer.byteLength(body, 'utf8') : 0,
    }
  })

  page.on('response', async (response) => {
    const request = response.request()
    const profile = request.__profile
    if (!profile) return

    let responseBytes = 0
    try {
      responseBytes = (await response.body()).byteLength
    } catch {
      responseBytes = 0
    }

    apiRows.push({
      method: request.method(),
      path: new URL(response.url()).pathname,
      rpc: profile.rpc,
      cursor: profile.cursor,
      status: response.status(),
      ms: round(performance.now() - profile.startedAt),
      requestBytes: profile.requestBytes,
      responseBytes,
      responseKB: round(responseBytes / 1024),
    })
  })

  const tracePath = resolve(outputDir, `${artifactPrefix}-trace.zip`)
  await context.tracing.start({ screenshots: true, snapshots: true })

  const startedAt = performance.now()
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : 7000)
  const totalMs = round(performance.now() - startedAt)

  const finalUrl = page.url()
  const title = await page.title()
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  const performanceData = await collectPerformance(page)
  const screenshotPath = resolve(outputDir, `${artifactPrefix}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await context.tracing.stop({ path: tracePath })
  await browser.close()

  const grouped = new Map()
  for (const row of apiRows) {
    const key = requestKey(row)
    const rows = grouped.get(key) || []
    rows.push(row)
    grouped.set(key, rows)
  }

  const apiSummary = Array.from(grouped.entries())
    .map(([key, rows]) => ({ key, ...summarize(rows) }))
    .sort((a, b) => b.avgMs - a.avgMs)

  const duplicateCounts = {
    threadList: apiRows.filter((row) => row.rpc === 'thread/list').length,
    threadListFirstPage: apiRows.filter((row) => row.rpc === 'thread/list' && !row.cursor).length,
    threadListCursor: apiRows.filter((row) => row.rpc === 'thread/list' && row.cursor).length,
    threadResume: apiRows.filter((row) => row.rpc === 'thread/resume').length,
    threadRead: apiRows.filter((row) => row.rpc === 'thread/read').length,
    skillsList: apiRows.filter((row) => row.rpc === 'skills/list').length,
    rateLimitsRead: apiRows.filter((row) => row.rpc === 'account/rateLimits/read').length,
    providerModels: apiRows.filter((row) => row.path === '/codex-api/provider-models').length,
  }
  const diagnostics = buildWarnings(duplicateCounts, apiSummary, apiRows)

  const report = {
    targetUrl,
    finalUrl,
    title,
    totalMs,
    screenshotPath,
    tracePath,
    duplicateCounts,
    warnings: diagnostics.warnings,
    totalApiKB: diagnostics.totalApiKB,
    bodyTextHead: bodyText.slice(0, 1000),
    performance: performanceData,
    apiSummary,
    slowestApiRows: [...apiRows].sort((a, b) => b.ms - a.ms).slice(0, 20),
    apiRows,
  }

  const reportPath = resolve(outputDir, `${artifactPrefix}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(JSON.stringify({
    reportPath,
    screenshotPath,
    tracePath,
    targetUrl,
    finalUrl,
    title,
    totalMs,
    duplicateCounts,
    warnings: diagnostics.warnings,
    totalApiKB: diagnostics.totalApiKB,
    topApiSummary: apiSummary.slice(0, 12),
    slowestApiRows: report.slowestApiRows.slice(0, 10),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
