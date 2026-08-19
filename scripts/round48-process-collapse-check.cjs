const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'http://127.0.0.1:4173/'
const OUT = 'd:\\code\\codex-mobile\\output\\playwright'
const threadId = 'process-collapse-check'

function createThread(extraProcessItem = false) {
  const completedItems = [
    { type: 'userMessage', id: 'complete-user', content: [{ type: 'text', text: 'Complete this task.' }] },
    { type: 'agentMessage', id: 'complete-process', text: 'Intermediate assistant progress.' },
    { type: 'commandExecution', id: 'complete-command', command: 'pnpm run build', status: 'completed', exitCode: 0, aggregatedOutput: 'Build completed.' },
  ]
  if (extraProcessItem) completedItems.push({ type: 'mcpToolCall', id: 'complete-tool', server: 'mock', tool: 'inspect', arguments: {}, status: 'completed', result: { content: [{ type: 'text', text: 'ok' }] } })
  completedItems.push({ type: 'agentMessage', id: 'complete-final', text: 'Final answer remains visible.' })
  return {
    id: threadId,
    sessionId: threadId,
    preview: 'Process collapse check',
    status: { type: 'idle' },
    modelProvider: 'opencode_zen',
    createdAt: 1787100000,
    updatedAt: 1787100010,
    recencyAt: 1787100010,
    cwd: 'D:\\code\\codex-mobile',
    cliVersion: '0.147.0',
    source: 'vscode',
    name: 'Process collapse check',
    turns: [
      { id: 'complete-turn', status: 'completed', startedAt: 1787100000, completedAt: 1787100010, durationMs: 10000, items: completedItems },
      { id: 'active-turn', status: 'inProgress', startedAt: 1787100020, items: [
        { type: 'userMessage', id: 'active-user', content: [{ type: 'text', text: 'Still working.' }] },
        { type: 'commandExecution', id: 'active-command', command: 'pnpm test', status: 'inProgress', aggregatedOutput: 'Running.' },
      ] },
    ],
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  const results = []
  for (const theme of ['light', 'dark']) {
    for (const viewport of [{ width: 375, height: 812, label: '375x812' }, { width: 768, height: 1024, label: '768x1024' }]) {
      let useExtraProcessItem = false
      const page = await browser.newPage({ viewport })
      await page.addInitScript((value) => localStorage.setItem('codex-web-local.dark-mode.v1', value), theme)
      await page.route('**/codex-api/rpc**', async (route) => {
        let method = ''
        try { method = JSON.parse(route.request().postData() || '').method || '' } catch {}
        const thread = createThread(useExtraProcessItem)
        if (method === 'thread/list') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data: [thread] } }) })
        if (method === 'thread/read' || method === 'thread/resume') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { thread } }) })
        return route.continue()
      })
      await page.goto(`${BASE}#/thread/${threadId}`, { waitUntil: 'domcontentloaded' })
      await page.locator('.conversation-turn').first().waitFor({ timeout: 15000 })
      const completedTurn = page.locator('[data-turn-key="turn-complete-user"]')
      const activeTurn = page.locator('[data-turn-key="turn-active-user"]')
      const toggle = completedTurn.locator('.conversation-turn-process-toggle')
      const activeToggle = activeTurn.locator('.conversation-turn-process-toggle')
      const final = completedTurn.locator('.conversation-item-final')
      const processItems = completedTurn.locator('.conversation-turn-process-items')
      const initial = await toggle.getAttribute('aria-expanded') === 'true' && await processItems.isVisible() && await final.isVisible() && await activeToggle.count() === 0
      await toggle.click()
      const collapsed = await toggle.getAttribute('aria-expanded') === 'false' && await processItems.count() === 0 && await final.isVisible()
      await toggle.click()
      const reopened = await toggle.getAttribute('aria-expanded') === 'true' && await processItems.isVisible()
      await toggle.click()
      useExtraProcessItem = true
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.conversation-turn').first().waitFor({ timeout: 15000 })
      const refreshedTurn = page.locator('[data-turn-key="turn-complete-user"]')
      const autoExpanded = await refreshedTurn.locator('.conversation-turn-process-toggle').getAttribute('aria-expanded') === 'true'
        && await refreshedTurn.locator('.conversation-turn-process-items').isVisible()
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      const darkApplied = await page.evaluate(() => document.documentElement.classList.contains('dark')) === (theme === 'dark')
      const pass = initial && collapsed && reopened && autoExpanded && noOverflow && darkApplied
      results.push({ theme, viewport: viewport.label, pass, initial, collapsed, reopened, autoExpanded, noOverflow, darkApplied })
      await page.screenshot({ path: `${OUT}\\round48-process-collapse-${theme}-${viewport.label}.png`, fullPage: false })
      await page.close()
    }
  }
  await browser.close()
  console.log(JSON.stringify(results, null, 2))
  if (results.some((result) => !result.pass)) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
