#!/usr/bin/env node
// verify-conversation-list-persists.cjs — round-126 的结构性回归闸门（浏览器侧）。
//
// 断言的是「消息列表这个滚动容器在慢加载期间不会被从 DOM 摘掉、位置不会被重置」。
//
// 背景：`ThreadConversation.vue` 里消息列表原本是 `v-if`/`v-else` 链的最后一环：
//
//     <p v-if="isSlowOpen">Still loading…</p>
//     <p v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay">…</p>
//     <ul v-else class="conversation-list">        ← 滚动容器
//
// `isSlowOpen` 由 `useDesktopMessageHistoryLoading.ts` 决定：任何一次消息加载超过
// SLOW_OPEN_HINT_DELAY_MS = 5000ms 就把 slowOpenThreadId 指向该线程 ⇒ 整条 `<ul>`
// **从 DOM 消失**；加载结束后它作为**全新元素**挂回来，`scrollTop` 从 0 开始，而该组件
// 没有挂载期的滚动恢复（无 onMounted、五个滚动 watcher 也无 immediate）
// ⇒ 用户看到「消息列表跑到最上面」。round-126 把 `<ul>` 改成无条件渲染。
//
// 触发链（全部是应用自己的代码路径，闸门没有直接改应用状态）：
//   ① 桩掉 thread/list 里该线程的 updatedAt（+1h）⇒ 版本变化 ⇒ 重载不再命中复用缓存
//   ② 伪造 visibilitychange hidden→visible（= 切走再切回标签页）
//        ⇒ App.maybeSyncAfterForeground → syncAfterForeground
//        ⇒ refreshAll({ includeSelectedThreadMessages: true }) → loadMessages(选中线程)
//   ③ thread/read 注入延迟 > 5000ms ⇒ 慢开提示出现
//
// 实测口径（2026-10-08，同一 harness 交错四跑，dev server 4275）：
//   改动前：提示出现那一刻 listPresent=false（items=0）、摘除 1 次、scrollTop 2307 → 0
//   改动后：提示出现那一刻 listPresent=true（items=108，scrollTop 2307）、摘除 0 次、最终 2307
//
// 环境要求：一个有 `/codex-api` 桥的服务，且桥里至少有 1 条长到可滚动（scrollable > 600px）
// 的真实线程，否则 SKIP（退出码 2）。若慢开提示没能被触发，也 SKIP —— 闸门不允许空过。
//
// 用法: PROFILE_BASE_URL=http://127.0.0.1:4275 node scripts/verify-conversation-list-persists.cjs
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
// 必须超过 SLOW_OPEN_HINT_DELAY_MS(5000)，否则慢开提示不会出现
const DELAY_MS = Number(process.env.DELAY_MS || 9000)

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  ' + detail : ''}`)
}

const metrics = (page) => page.evaluate(() => {
  const el = document.querySelector('.conversation-list')
  return {
    present: !!el,
    scrollTop: el ? el.scrollTop : null,
    scrollHeight: el ? el.scrollHeight : null,
    clientHeight: el ? el.clientHeight : null,
    slowHint: !!document.querySelector('.conversation-loading-slow'),
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

  // 记录滚动容器的挂载/摘除，并在摘除瞬间抓下当时的状态
  await page.addInitScript(() => {
    window.__listEvents = []
    const snap = (type) => {
      const el = document.querySelector('.conversation-list')
      window.__listEvents.push({
        type,
        slowHint: !!document.querySelector('.conversation-loading-slow'),
        hasList: !!el,
        scrollTop: el ? el.scrollTop : null,
      })
    }
    const isList = (n) =>
      n && n.nodeType === 1 &&
      (n.classList?.contains('conversation-list') || n.querySelector?.('.conversation-list'))
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.removedNodes) if (isList(n)) snap('removed')
        for (const n of r.addedNodes) if (isList(n)) snap('added')
      }
    })
    const start = () => {
      const root = document.querySelector('.conversation-root')
      if (!root) return setTimeout(start, 200)
      obs.observe(root.parentElement || document.body, { childList: true, subtree: true })
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
    else start()
  })

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1800)

  const threads = await page.evaluate(async () => {
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
  console.log('threads from bridge:', threads.length)
  if (!threads.length) {
    console.log('SKIP: 桥里没有线程，无法验证')
    await browser.close()
    process.exit(2)
  }

  // 找一条足够长、能真正滚动的线程
  let picked = null
  for (const id of threads.slice(0, 14)) {
    if (!id) continue
    await page.evaluate((h) => { window.location.hash = h }, `#/thread/${id}`)
    await page.waitForSelector('.conversation-list', { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(700)
    const m = await metrics(page)
    if (!m.present) continue
    const scrollable = m.scrollHeight - m.clientHeight
    console.log(`  thread ${id.slice(0, 8)}… scrollable=${scrollable}px`)
    if (scrollable > 600 && !picked) picked = id
  }
  if (!picked) {
    console.log('SKIP: 没有足够长的线程可供滚动验证')
    await browser.close()
    process.exit(2)
  }
  console.log('picked thread:', picked)

  await page.evaluate((h) => { window.location.hash = h }, `#/thread/${picked}`)
  await page.waitForSelector('.conversation-list', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    const el = document.querySelector('.conversation-list')
    if (el) el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.4)
  })
  await page.waitForTimeout(500)
  const before = await metrics(page)
  console.log('baseline: scrollTop=', before.scrollTop, 'items=', before.items)
  check('会话列已渲染且可滚动', before.present && before.scrollTop > 100, `scrollTop=${before.scrollTop}`)
  if (!(before.present && before.scrollTop > 100)) {
    console.log('SKIP: 列表没滚动起来，环境不足')
    await browser.close()
    process.exit(2)
  }

  // ── 装桩：版本 +1h（让重载真的发生）+ thread/read 延迟 ─────────
  let stubbed = 0
  await page.route('**/codex-api/**', async (route) => {
    const body = route.request().postData() || ''
    if (/"thread\/list"/.test(body)) {
      try {
        const resp = await route.fetch()
        const json = await resp.json()
        for (const row of (json?.result?.data || json?.result?.threads || [])) {
          if ((row.id || row.threadId) === picked) {
            row.updatedAt = (Number(row.updatedAt) || 0) + 3600
            stubbed += 1
          }
        }
        return route.fulfill({ response: resp, json })
      } catch {
        return route.continue().catch(() => {})
      }
    }
    if (/thread\/(read|resume)|turns\/list/.test(body)) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
    return route.continue().catch(() => {})
  })

  await page.evaluate(() => { window.__listEvents.length = 0; })

  // ── 触发前台恢复重同步（= 切走再切回标签页）────────────────────
  const t0 = Date.now()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // 重载期间仍应保留旧内容（displayFilteredMessages 的 lastStable 兜底）→ 重新滚一次
  await page.waitForTimeout(900)
  await page.evaluate(() => {
    const el = document.querySelector('.conversation-list')
    if (el) el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * 0.4)
  })
  await page.waitForTimeout(400)
  const during = await metrics(page)

  // ── 等慢开提示（阈值 5s），抓那一刻的状态 ──────────────────────
  let atHint = null
  const dl = Date.now() + DELAY_MS + 8000
  while (Date.now() < dl) {
    const m = await metrics(page)
    if (m.slowHint) { atHint = m; break }
    await page.waitForTimeout(200)
  }
  if (!atHint) {
    console.log('SKIP: 慢开提示未被触发（桩或触发链失效），闸门不允许空过')
    await browser.close()
    process.exit(2)
  }
  console.log(`慢开提示出现 t+${Date.now() - t0}ms  listPresent=${atHint.present} items=${atHint.items} scrollTop=${atHint.scrollTop}`)

  check('慢开提示出现时消息列表仍在 DOM（滚动容器不被摘掉）', atHint.present === true, `present=${atHint.present}`)
  check('慢开提示出现时列表仍有内容', atHint.items > 0, `items=${atHint.items}`)
  check(
    '慢开提示出现时保持原滚动位置（未被重置到顶部）',
    atHint.scrollTop !== null && Math.abs(atHint.scrollTop - during.scrollTop) <= 2,
    `during=${during.scrollTop} atHint=${atHint.scrollTop}`,
  )

  // ── 等加载结束 ────────────────────────────────────────────────
  let settled = null
  const dl2 = Date.now() + DELAY_MS + 15000
  while (Date.now() < dl2) {
    const m = await metrics(page)
    if (!m.slowHint && m.present) { settled = m; break }
    await page.waitForTimeout(300)
  }
  check('加载结束后列表仍在', settled !== null, settled ? '' : '超时未收尾')
  if (settled) {
    check(
      '加载结束后滚动位置与触发前一致',
      Math.abs(settled.scrollTop - during.scrollTop) <= 2,
      `during=${during.scrollTop} settled=${settled.scrollTop}`,
    )
    check('加载结束后未停在顶部', settled.scrollTop > 100, `scrollTop=${settled.scrollTop}`)
  }

  const events = await page.evaluate(() => window.__listEvents)
  const removals = events.filter((e) => e.type === 'removed')
  check('全程没有摘除过滚动容器', removals.length === 0, `removed=${removals.length}`)
  check('thread/list 版本桩生效（重载确实发生）', stubbed > 0, `stubbed=${stubbed}`)
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
