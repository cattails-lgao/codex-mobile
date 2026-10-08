#!/usr/bin/env node
// verify-conversation-mount-scroll.cjs — round-127 结构性回归闸门（浏览器侧）。
//
// 断言：会话被「重挂」时不会把滚动位置丢掉（不停在 TOP）。
//
// 背景：`ThreadConversation.vue` 是 defineAsyncComponent，路由切到非线程视图（`#/`、
// `#/directory`、`#/settings`、`#/automations` …）时整棵 `.conversation-root` 会被卸载，
// 切回同一条线程时重新挂载。而该组件的五个滚动相关 watcher
// （messages / pendingRequests / liveOverlay / isLoading / activeThreadId）
// **一个都不会触发**（activeThreadId 没变、props 也没变）⇒ 新挂载的
// `<ul class="conversation-list">` 停在浏览器默认 scrollTop = 0 ⇒「列表跑到 TOP」。
// round-127 给组件补了挂载期滚动初始化（onMounted → scheduleConversationScroll）。
//
// 实测口径（2026-10-08，dev 4275，同一 harness）：
//   改动前：#/ #/directory #/settings #/automations 四个入口切走再切回，scrollTop 438 → 0
//   改动后：四个入口均为 438 → 438
//
// 环境要求：一个有 `/codex-api` 桥的服务，且桥里至少有 1 条长到可滚动（scrollable > 150px）
// 的真实线程，否则 SKIP（退出码 2）。
//
// 用法: PROFILE_BASE_URL=http://127.0.0.1:4275 node scripts/verify-conversation-mount-scroll.cjs
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
// 非线程视图：进入这些 hash 会卸载 .conversation-root
const AWAY_ROUTES = (process.env.AWAY_ROUTES || '#/,#/directory,#/settings,#/automations').split(',')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  ' + detail : ''}`)
}

const snap = (page) => page.evaluate(() => {
  const el = document.querySelector('.conversation-list')
  const root = document.querySelector('.conversation-root')
  return {
    rootPresent: !!root,
    present: !!el,
    top: el ? Math.round(el.scrollTop) : null,
    sh: el ? el.scrollHeight : null,
    ch: el ? el.clientHeight : null,
    items: document.querySelectorAll('.conversation-item').length,
  }
})

async function main() {
  const browser = await (LAUNCHER
    ? chromium.launch({ executablePath: LAUNCHER, headless: true })
    : chromium.launch())
  console.log('browser:', LAUNCHER || 'playwright chromium')
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

  // 记录 .conversation-root 的摘除/挂回次数 —— 用来证明本闸门不是空过
  await page.addInitScript(() => {
    window.__mount = { rootsRemoved: 0, rootsAdded: 0 }
    const isRoot = (n) => n && n.nodeType === 1 &&
      (n.classList?.contains('conversation-root') || !!n.querySelector?.('.conversation-root'))
    const start = () => {
      const obs = new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.removedNodes) if (isRoot(n)) window.__mount.rootsRemoved += 1
          for (const n of r.addedNodes) if (isRoot(n)) window.__mount.rootsAdded += 1
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
    else start()
  })

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1500)

  const ids = await page.evaluate(async () => {
    try {
      const res = await fetch('/codex-api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'thread/list', params: {} }),
      })
      const json = await res.json()
      return ((json?.result?.data) || (json?.result?.threads) || []).map((t) => t.id || t.threadId)
    } catch {
      return []
    }
  })
  console.log('threads from bridge:', ids.length)
  if (!ids.length) {
    console.log('SKIP: 桥里没有线程，无法验证')
    await browser.close()
    process.exit(2)
  }

  // 找一条足够长、能真正滚动的线程
  let target = null
  for (const id of ids.slice(0, 16)) {
    if (!id) continue
    await page.evaluate((h) => { window.location.hash = h }, `#/thread/${id}`)
    await page.waitForSelector('.conversation-list', { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(900)
    const m = await snap(page)
    if (!m.present) continue
    const scrollable = m.sh - m.ch
    console.log(`  thread ${id.slice(0, 8)}… items=${m.items} scrollable=${scrollable}px`)
    if (scrollable > 150 && !target) target = id
  }
  if (!target) {
    console.log('SKIP: 没有足够长的线程可供滚动验证')
    await browser.close()
    process.exit(2)
  }
  console.log('picked thread:', target)

  // 基线：停在底部
  await page.evaluate((h) => { window.location.hash = h }, `#/thread/${target}`)
  await page.waitForSelector('.conversation-list', { timeout: 15000 })
  await page.waitForTimeout(1600)
  await page.evaluate(() => { const el = document.querySelector('.conversation-list'); if (el) el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(500)
  const base = await snap(page)
  console.log('baseline: scrollTop=' + base.top + '/' + (base.sh - base.ch) + ' items=' + base.items)
  check('会话列已渲染且可滚动', base.present && base.top > 100, `scrollTop=${base.top}`)
  if (!(base.present && base.top > 100)) {
    console.log('SKIP: 列表没滚动起来，环境不足')
    await browser.close()
    process.exit(2)
  }

  // 逐个非线程视图：切走 → 切回同一条线程 → 位置必须保持
  await page.evaluate(() => { window.__mount.rootsRemoved = 0; window.__mount.rootsAdded = 0 })
  for (const away of AWAY_ROUTES) {
    await page.evaluate((h) => { window.location.hash = h }, away)
    await page.waitForTimeout(1100)
    const gone = await snap(page)
    await page.evaluate((h) => { window.location.hash = h }, `#/thread/${target}`)
    await page.waitForSelector('.conversation-list', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const back = await snap(page)
    console.log(`  away=${away} rootPresent(away)=${gone.rootPresent} -> back top=${back.top}/${(back.sh - back.ch)} items=${back.items}`)
    check(
      `重挂到同一线程后不停在 TOP（away=${away}）`,
      back.present && back.top !== null && back.top > 100 && Math.abs(back.top - base.top) <= 2,
      `base=${base.top} back=${back.top} scrollable=${back.sh - back.ch}`,
    )
  }
  const mount = await page.evaluate(() => window.__mount)
  check('会话确实被重挂过（本闸门非空过）', mount.rootsRemoved > 0 && mount.rootsAdded > 0, `removed=${mount.rootsRemoved} added=${mount.rootsAdded}`)
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
