#!/usr/bin/env node
// verify-command-block-handoff.cjs — round-128 结构性回归闸门（浏览器侧，真实流式回合）。
//
// 断言：一个真实回合里，命令块从「live 通知渲染」交接给「持久化副本」时**不能消失再出现**
// ——即不存在「命令块一度归零、随后又挂回」的真空帧。
//
// 背景：`turn/completed` 曾在一处**急切清空**该线程的 live 命令
// （见 `useDesktopState.ts` 里 `deferredLiveCommandClearThreadIds` 的长注释），而渲染用的
// 持久化副本要等防抖 220ms 的收尾 `thread/read` 才落地，于是命令块从 DOM 里消失约
// 240–256ms（`scrollHeight` 瞬降约 57px、`scrollTop` 抖一下 147→90→147），视觉上就是
// 「新增命令块的时候闪一下」。清空本身是**必需的**（live 用通知 `item.id`、持久化用
// `session-cmd-<callId>`，不同 id，按 id 剪除对它无效），所以 round-128 的做法是把这次
// 清空**推迟到持久化副本写进 messages 的同一拍**（`loadMessages` 里
// `setPersistedMessagesForThread` 与 `clearCompletedTurnLiveState` 之间无 await）。
//
// 判定口径（纯 DOM，不依赖任何调试钩子）：
//   采样每一帧 `.conversation-list` 里 `[data-message-type="commandExecution"]` 的个数 cmds。
//   「闪一下」= cmds 从 >0 掉到 0、随后又在 VACUUM_MAX_MS 内回到 >0。闸门要求这种事件为 0。
//
// 环境要求：一个有 `/codex-api` 桥、且模型能真的跑一次 shell 命令（`approval_policy=never`、
//   有可用 provider）的服务。本机复现配置：`node tmp/setup-r128-home.cjs` 建隔离
//   `CODEX_HOME=D:/code/codex-mobile/tmp/r128-codex-home`，再在**仓外 cwd** 起服务
//   （仓内 `.codex/config.toml` 的 project-local provider 会覆盖，见该脚本注释），例如
//   `CODEX_HOME=… node scripts/dev.cjs --port 4191`。
//   模型整轮没产出命令块、或回合没跑完 → SKIP（退出码 2，不是失败也不是通过）。
//
// 用法: PROFILE_BASE_URL=http://127.0.0.1:4191 node scripts/verify-command-block-handoff.cjs
//   可选环境变量：OBS_PROMPT（触发命令的提示词）/ WARMUPS（热身轮数，默认 1）/
//                VIEWPORT_W / VIEWPORT_H / VACUUM_MAX_MS
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
const VW = Number(process.env.VIEWPORT_W || 375)
const VH = Number(process.env.VIEWPORT_H || 736)
const WARMUPS = Number(process.env.WARMUPS || 1)
const WARM_PROMPT = process.env.WARM_PROMPT || '请只回复一个词：ok'
const OBS_PROMPT = process.env.OBS_PROMPT || '请执行 shell 命令 node -e "console.log(6*7)"，然后用一句话报告输出。'
// 「闪一下」的交接窗口上界：超过这个时长才回到 >0 的，不当成同一拍的交接异常（例如用户切了线程）
const VACUUM_MAX_MS = Number(process.env.VACUUM_MAX_MS || 5000)

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  ' + detail : ''}`)
}

// 页面内逐帧采样器（rAF）+ 节点增删（MutationObserver）。不含任何调试钩子。
const SAMPLER = () => {
  window.__handoff = { frames: [], muts: [], on: false, stop: false }
  const SEL = '.conversation-list'
  const tick = () => {
    if (window.__handoff.on) {
      const el = document.querySelector(SEL)
      if (el) {
        const q = (s) => el.querySelectorAll(s).length
        const turns = el.querySelectorAll('.conversation-turn')
        const lt = turns[turns.length - 1]
        const struct = lt
          ? Array.from(lt.querySelectorAll('section')).map((sec) => {
              const types = Array.from(sec.querySelectorAll('[data-message-type]')).map((x) => x.getAttribute('data-message-type')).filter(Boolean)
              return sec.className.replace('conversation-turn-', '').split(' ')[0] + '(' + types.length + ':' + types.join('|') + ')'
            }).join(' + ')
          : ''
        window.__handoff.frames.push([
          Math.round(performance.now()),
          q('.conversation-item'), q('.conversation-item-overlay'),
          q('[data-message-type="commandExecution"]'),
          el.scrollHeight, el.clientHeight, Math.round(el.scrollTop),
          (el.textContent || '').length,
          struct,
        ])
      }
    }
    if (!window.__handoff.stop) requestAnimationFrame(tick)
  }
  const obs = new MutationObserver((recs) => {
    if (!window.__handoff.on) return
    for (const r of recs) {
      for (const n of r.addedNodes) if (n.nodeType === 1) window.__handoff.muts.push([Math.round(performance.now()), '+', String(n.className || n.nodeName).split(' ')[0], (n.getAttribute && n.getAttribute('data-message-type')) || ''])
      for (const n of r.removedNodes) if (n.nodeType === 1) window.__handoff.muts.push([Math.round(performance.now()), '-', String(n.className || n.nodeName).split(' ')[0], (n.getAttribute && n.getAttribute('data-message-type')) || ''])
    }
  })
  const start = () => { const el = document.querySelector(SEL); if (!el) return setTimeout(start, 100); obs.observe(el, { childList: true, subtree: true }) }
  requestAnimationFrame(tick)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start()
}

async function state(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.conversation-list')
    if (!el) return null
    const err = document.querySelector('.live-overlay-error')
    return {
      items: el.querySelectorAll('.conversation-item').length,
      overlay: el.querySelectorAll('.conversation-item-overlay').length,
      cmds: el.querySelectorAll('[data-message-type="commandExecution"]').length,
      sh: el.scrollHeight, ch: el.clientHeight, st: Math.round(el.scrollTop),
      txt: (el.textContent || '').length,
      err: err ? String(err.textContent || '').replace(/\s+/g, ' ').slice(0, 120) : '',
      url: location.hash,
    }
  })
}

async function send(page, text) {
  const c = page.locator('textarea.thread-composer-input').first()
  await c.waitFor({ timeout: 20000 })
  await c.click()
  await c.fill(text)
  await page.waitForTimeout(150)
  await c.press('Enter')
}

async function waitIdle(page, timeoutMs) {
  const t0 = Date.now()
  let last = null
  let stable = 0
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(500)
    const s = await state(page)
    if (!s) continue
    if (s.err) return { ok: false, s }
    const key = s.items + ':' + s.overlay + ':' + s.txt
    if (key === last) { stable += 1; if (stable >= 3 && s.overlay === 0) return { ok: true, s } }
    else { stable = 0; last = key }
  }
  return { ok: false, s: await state(page) }
}

// 从原始帧里找「命令块归零后又回到 >0」的真空事件（第 3 列 = cmds，索引 1+2）。
function findVacuums(frames, markT) {
  const out = []
  let lastPos = -1
  for (let i = 0; i < frames.length; i += 1) {
    const cmds = frames[i][3]
    if (cmds > 0) {
      if (lastPos >= 0 && i > lastPos + 1) {
        const firstZero = frames[lastPos + 1]
        out.push({
          disappearMs: firstZero[0] - markT,
          durationMs: frames[i][0] - firstZero[0],
          before: frames[lastPos],
          during: firstZero,
          after: frames[i],
        })
      }
      lastPos = i
    }
  }
  return out
}

;(async () => {
  const browser = await (LAUNCHER
    ? chromium.launch({ executablePath: LAUNCHER, headless: true })
    : chromium.launch())
  console.log('browser:', LAUNCHER || 'playwright chromium')
  console.log('base:', BASE)
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))
  await page.addInitScript(SAMPLER)

  // 网络时间线：抓 thread/read 的响应，用它判定「持久化副本落地 / 回合已完成」。
  const net = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.includes('/codex-api/')) return
    let body = ''
    try { body = r.postData() || '' } catch { /* ignore */ }
    let m = ''
    try { m = JSON.parse(body).method || '' } catch { /* ignore */ }
    const meta = { t: Date.now(), m }
    r.__handoff = meta
    net.push(meta)
  })
  page.on('response', async (res) => {
    const meta = res.request().__handoff
    if (!meta || meta.m !== 'thread/read') return
    try {
      const j = await res.json()
      const t = j.result && j.result.thread
      const turns = (t && t.turns) || []
      const last = turns[turns.length - 1] || {}
      const items = (last.items || []).map((x) => x.type)
      meta.cmds = items.filter((x) => x === 'commandExecution').length
      meta.turnStatus = last.status || ''
      meta.itemTypes = items.join('|')
    } catch (e) { meta.parseErr = String(e.message).slice(0, 60) }
  })

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForSelector('textarea.thread-composer-input', { timeout: 25000 })
  await page.waitForTimeout(2000)

  // 用 UI 自身建线程（避免「RPC 建的线程 UI 无法 resume」这一路径差异），并让 app-server 热身。
  console.log(`阶段1：热身 ${WARMUPS} 轮`)
  for (let i = 1; i <= WARMUPS; i += 1) {
    let r = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await send(page, WARM_PROMPT)
      r = await waitIdle(page, 60000)
      const s0 = r.s || {}
      console.log(`  热身${i}.${attempt}: ok=${r.ok} url=${s0.url || ''} items=${s0.items} sh=${s0.sh} ch=${s0.ch}${s0.err ? ' err=' + s0.err : ''}`)
      if (r.ok) break
      if (!/app-server exited unexpectedly/i.test(s0.err || '')) break
      console.log('  （app-server 崩溃，重载页面重试）')
      await page.goto(BASE + '/#/', { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForSelector('textarea.thread-composer-input', { timeout: 25000 })
      await page.waitForTimeout(3000)
    }
    if (!r || !r.ok) {
      console.log('SKIP: 热身回合没跑通，环境不足')
      await browser.close()
      process.exit(2)
    }
  }

  const pre = await state(page)
  console.log('观测前状态: items=' + pre.items + ' cmds=' + pre.cmds + ' sh=' + pre.sh + ' ch=' + pre.ch + ' url=' + pre.url)
  if (pre.cmds > 0) console.log('  注意：观测前已有命令块（cmd 基线=' + pre.cmds + '），真空判定仍按「归零后回弹」计。')

  // 开启采样
  await page.evaluate(() => { window.__handoff.frames = []; window.__handoff.muts = []; window.__handoff.on = true })
  const markT = await page.evaluate(() => Math.round(performance.now()))
  const wallMark = Date.now()
  await send(page, OBS_PROMPT)

  const r = await waitIdle(page, 120000)
  console.log('观测回合: 结束=' + r.ok + (r.s && r.s.err ? ' err=' + r.s.err : ''))
  await page.waitForTimeout(1500)
  const data = await page.evaluate(() => { window.__handoff.on = false; window.__handoff.stop = true; return window.__handoff })

  const f = data.frames.filter((x) => x[0] >= markT)
  const cols = ['items', 'ovl', 'cmds', 'sh', 'ch', 'st', 'txt']
  const line = (fr) => `+${fr[0] - markT}ms ` + cols.map((c, i) => `${c}=${fr[i + 1]}`).join(' ') + `  struct[` + (fr[8] || '') + ']'
  console.log('\n帧数=' + f.length + (f.length > 1 ? ' 最大帧间隔ms=' + Math.max(...f.slice(1).map((x, i) => x[0] - f[i][0])) : ''))

  const maxCmds = f.reduce((m, x) => Math.max(m, x[3]), 0)
  const sawCommand = maxCmds > 0
  const finalCmds = f.length ? f[f.length - 1][3] : 0

  const vacuums = findVacuums(f, markT)
  const flashVacuums = vacuums.filter((v) => v.durationMs <= VACUUM_MAX_MS)

  console.log('\n=== 命令块真空事件（cmds 归零后回弹）===')
  if (!vacuums.length) console.log('  无')
  vacuums.forEach((v) => {
    console.log(`  @+${v.disappearMs}ms 消失，持续 ${v.durationMs}ms${v.durationMs <= VACUUM_MAX_MS ? '  ← 属交接窗口' : '  （超窗口，不计）'}`)
    console.log(`    消失前: cmds=${v.before[3]} sh=${v.before[4]} st=${v.before[6]} txt=${v.before[7]}`)
    console.log(`    真空中: cmds=${v.during[3]} sh=${v.during[4]} st=${v.during[6]} txt=${v.during[7]} struct[${v.during[8]}]`)
    console.log(`    恢复后: cmds=${v.after[3]} sh=${v.after[4]} st=${v.after[6]} txt=${v.after[7]} struct[${v.after[8]}]`)
  })

  // 围绕「第一次出现命令块」与「持久化落地」打印窗口，便于人工复核
  const firstCmdIdx = f.findIndex((x) => x[3] > 0)
  if (firstCmdIdx >= 0) {
    console.log('\n=== 命令块首次出现 ±10 帧 ===')
    for (let i = Math.max(0, firstCmdIdx - 10); i <= Math.min(f.length - 1, firstCmdIdx + 10); i += 1) {
      console.log((i === firstCmdIdx ? '>> ' : '   ') + line(f[i]))
    }
  }

  const completedReads = net.filter((x) => x.m === 'thread/read' && x.turnStatus === 'completed')
  const lastCompleted = completedReads[completedReads.length - 1]
  console.log('\n=== thread/read（相对观测起点 ms）===')
  net.filter((x) => x.m === 'thread/read').forEach((x) => {
    const rel = x.t - wallMark
    if (rel < -500) return
    console.log(`  +${rel}ms lastStatus=${x.turnStatus || '?'} lastItems=${x.itemTypes || '?'}${x.parseErr ? ' parseErr=' + x.parseErr : ''}`)
  })

  // ---------- 断言 ----------
  if (!sawCommand) {
    console.log('\nSKIP: 观测回合里模型没有产出命令块（cmds 全程为 0），无法验证交接')
    await browser.close()
    process.exit(2)
  }
  if (!lastCompleted) {
    console.log('\nSKIP: 没有观测到回合完成的 thread/read（lastStatus=completed），环境不足')
    await browser.close()
    process.exit(2)
  }
  if (f.length < 60) {
    console.log(`\nSKIP: 采样帧数过少（${f.length}），环境不足`)
    await browser.close()
    process.exit(2)
  }

  check('观测回合产出了命令块（本闸门非空过）', sawCommand, `maxCmds=${maxCmds}`)
  check('观测到回合完成（收尾 thread/read lastStatus=completed）', !!lastCompleted,
    `+${lastCompleted.t - wallMark}ms lastItems=${lastCompleted.itemTypes}`)
  check('收尾 thread/read 的持久化副本里含命令块', (lastCompleted.cmds || 0) >= 1,
    `cmds=${lastCompleted.cmds}`)
  check('命令块 live→持久化交接无真空（未出现 归零→回弹）', flashVacuums.length === 0,
    flashVacuums.length
      ? flashVacuums.map((v) => `+${v.disappearMs}ms 消失 ${v.durationMs}ms`).join(' | ')
      : `vacuums(≤${VACUUM_MAX_MS}ms)=0`)
  check('回合结束后命令块仍在 DOM 里（持久化副本可见）', finalCmds >= 1, `finalCmds=${finalCmds}`)
  check('无未捕获页面异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

  const failed = results.filter((x) => !x.ok)
  console.log(`\n${failed.length === 0 ? 'ALL GREEN' : 'FAILED ' + failed.length}  (${results.length} 项)`)
  await browser.close()
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e && e.message ? e.message : e)
  process.exit(3)
})
