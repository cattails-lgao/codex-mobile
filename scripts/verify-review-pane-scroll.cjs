#!/usr/bin/env node
// verify-review-pane-scroll.cjs — round-125 的结构性回归闸门（浏览器侧）。
//
// 断言的是「审查面板打开时，消息列表还在、位置还在」，不是毫秒。
//
// 背景：`ReviewPane` 是 `<Teleport to="body">` 的全屏覆盖层。它曾经与会话列是
// `v-if`/`v-else` 的**互斥分支**（提交 0e147705「Show review pane in place of thread
// content」），于是「打开审查面板」＝**卸载整条会话列** ⇒ 关闭时全新挂载、`scrollTop`
// 落回默认 0 ⇒ 用户看到「消息列表跳回最顶部」，并连带丢掉已上翻分页 / autoFollowOutput /
// 图片预览 / 变更动作态，还白付一次整条线程重渲。round-125 把它改回并存。
//
// 判据（两条都要）：
//   ① 面板打开期间 `.conversation-list` 仍挂在 DOM 里
//        修好 = 1；退化成互斥 = 0
//   ② 关闭面板后 `.conversation-list` 的 scrollTop 与打开前一致
//        修好 = 一致；退化成互斥 = 0
//
// 实测口径（2026-10-08，同一 harness 交错三跑）：
//   改动前：① count=0  ② 2018 → 0      （FAILED 3 / 7）
//   改动后：① count=1  ② 2018 → 2018   （ALL GREEN 7 / 7）
//
// 环境要求：一个有 `/codex-api` 桥的服务（dev server 即可，`node scripts/dev.cjs`），
// 且桥里至少有 1 条长到可滚动（scrollable > 600px）的真实线程，否则 SKIP（退出码 2）。
//
// 用法: PROFILE_BASE_URL=http://127.0.0.1:4275 node scripts/verify-review-pane-scroll.cjs
// 退出码: 0 全绿 / 1 有断言失败 / 2 环境不足（SKIP）/ 3 运行异常
const fs = require('node:fs')
const { chromium } = require('playwright')

const EDGE = [
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
]
const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
]
const LAUNCHER = [...EDGE, ...CHROME].find((p) => fs.existsSync(p))
const BASE = (process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  ' + detail : ''}`)
}

async function listThreads(page) {
  return page.evaluate(async () => {
    try {
      const res = await fetch('/codex-api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'thread/list', params: {} }),
      })
      const json = await res.json()
      const r = json && json.result
      const list = (r && (r.data || r.threads)) || []
      return list.map((t) => ({ id: t.id || t.threadId }))
    } catch {
      return []
    }
  })
}

async function listMetrics(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.conversation-list')
    if (!el) return null
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })
}

async function main() {
  const browser = await (LAUNCHER
    ? chromium.launch({ executablePath: LAUNCHER, headless: true })
    : chromium.launch())
  console.log('browser:', LAUNCHER || 'playwright chromium')
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1500)

  const threads = (await listThreads(page)).slice(0, 14)
  console.log('threads from bridge:', threads.length)
  if (threads.length === 0) {
    console.log('SKIP: 桥里没有线程，无法验证')
    await browser.close()
    process.exit(2)
  }

  // 找一个消息多到能滚动的线程（滚动位置保真需要它真的可滚）
  let picked = null
  for (const t of threads) {
    if (!t.id) continue
    await page.goto(`${BASE}/#/thread/${t.id}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForSelector('.conversation-list', { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(700)
    const m = await listMetrics(page)
    if (!m) continue
    const scrollable = m.scrollHeight - m.clientHeight
    console.log(`  thread ${t.id.slice(0, 8)}… scrollable=${scrollable}px`)
    if (scrollable > 600 && !picked) picked = { t, m }
  }

  if (!picked) {
    console.log('SKIP: 没有足够长的线程可供滚动验证')
    await browser.close()
    process.exit(2)
  }
  console.log('picked thread:', picked.t.id, 'scrollable', picked.m.scrollHeight - picked.m.clientHeight, 'px')
  await page.goto(`${BASE}/#/thread/${picked.t.id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.conversation-list', { timeout: 15000 })
  await page.waitForTimeout(900)

  // ── 打开右侧 Git 面板 → 点「审查工作树更改」 ──────────────────────
  // 注意：1280px 下右侧面板**默认就是展开的**（Git tab 已激活、.rgp-review 已在），
  // 无脑点 .content-header-right-panel-toggle 会把它**收起**。所以只在按钮不存在时才开面板。
  if ((await page.locator('.rgp-review').count()) === 0) {
    const toggle = page.locator('.content-header-right-panel-toggle')
    if ((await toggle.count()) > 0) await toggle.first().click()
    await page.waitForTimeout(600)
    const gitTab = page.locator('.content-right-panel-tab').first()
    if ((await gitTab.count()) > 0) await gitTab.click()
    await page.waitForTimeout(600)
  }

  const reviewBtn = page.locator('.rgp-review')
  const btnCount = await reviewBtn.count()
  check('Git 面板里存在「审查工作树更改」按钮', btnCount === 1, `count=${btnCount}`)
  if (btnCount !== 1) {
    console.log('pageErrors:', pageErrors.slice(0, 5))
    await browser.close()
    process.exit(2)
  }

  // ── 打开前：把列表滚到中间，记录位置 ─────────────────────────────
  await page.evaluate(() => {
    const el = document.querySelector('.conversation-list')
    if (el) el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.35)
  })
  await page.waitForTimeout(400)
  const before = await listMetrics(page)
  console.log('before open: scrollTop=', before.scrollTop)

  await reviewBtn.click()
  await page.waitForTimeout(900)

  check('审查面板已打开', (await page.locator('.review-pane-backdrop').count()) === 1, '')
  const listWhileOpen = await page.locator('.conversation-list').count()
  check('面板打开期间 .conversation-list 仍在 DOM（会话列常驻）', listWhileOpen === 1, `count=${listWhileOpen}`)

  await page.locator('.review-pane-close').first().click()
  await page.waitForTimeout(1200)
  check('审查面板已关闭', (await page.locator('.review-pane-backdrop').count()) === 0, '')

  const after = await listMetrics(page)
  if (!after) {
    check('关闭后 .conversation-list 存在', false, '')
  } else {
    check(
      '关闭后 scrollTop 与打开前一致（未被重置到顶部）',
      Math.abs(after.scrollTop - before.scrollTop) <= 2,
      `before=${before.scrollTop} after=${after.scrollTop}`,
    )
    check('关闭后未停在顶部', after.scrollTop > 100, `scrollTop=${after.scrollTop}`)
  }
  check('无未捕获页面异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? 'ALL GREEN' : 'FAILED ' + failed.length}  (${results.length} 项)`)
  await browser.close()
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(3)
})
