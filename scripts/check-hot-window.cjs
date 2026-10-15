// 浏览器级闸门：hot 轮窗口化（批 3c / round-165）。
//
// 3b 只窗口化「折叠态 warm 块」（高度 = 实测常量）；3c 把窗口化推进 hot 区 ——
// hot 块高度不可预估 ⇒ 高度来自 ResizeObserver 实测缓存（round-164 的内容观察器
// 兼任测量层），未测块强制入窗、spacer 求和只含实测值 ⇒ scrollHeight 守恒。
//
// 本闸门在浏览器里对**真实管线**量五件事（合成 30 轮 = 恰好全在 hot 区）：
//   1. 贴底打开 ⇒ 窗口化生效（渲染轮数 < 全量）且贴底维持；
//   2. 上滚 S px ⇒ dist 恰好 +S（spacer 守恒：scrollHeight 没在脚下漂移）；
//   3. 滚到顶再滚回底 ⇒ scrollHeight 与贴底读数逐位一致（窗口滑动不改变总高）；
//   4. JumpBar 跳转 hot 区顶部轮次 ⇒ 强制入窗使锚点存在、落点 ≈ 12px；
//   5. 反跑证明非空：禁掉 ResizeObserver ⇒ 缓存永远填不上 ⇒ 全部强制入窗 =
//      全量渲染（渲染轮数 == 全量），且其 scrollHeight 与窗口化态一致（±2px
//      子像素容差）—— 证明第 1 条的「窗口化生效」确实由测量缓存驱动。
//
// 数据策略与 check-bottom-lock.cjs 相同：拦 thread/read 与 thread/resume 回
// 合成线程，其余 RPC 透传。用法：
//   PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-hot-window.cjs
// 环境不足 → SKIP 退 2；断言失败 → FAIL 退 1。
const path = require('path')

for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) {
  delete process.env[key]
}

const BASE = (process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190').replace(/\/+$/, '')
const HEADLESS = process.env.PROFILE_HEADLESS !== '0'
const THREAD_ID = 'round165-hot-window'
const PINNED_TOLERANCE_PX = 2
// 30 = HOT_TURNS ⇒ 合成线程全部落在 hot 区（不与 3b warm 窗口化纠缠）。
const TURN_COUNT = 30
const PARAGRAPHS_PER_TURN = 4
const SCROLL_UP_PX = 2000

let chromium
try {
  chromium = require('playwright-core').chromium
} catch {
  console.error('需要 playwright-core（NODE_PATH 指向它的 node_modules）')
  process.exit(2)
}

const EDGE_CANDIDATES = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
]
const CHROME_CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
]
const LAUNCHER = process.env.PROFILE_EDGE
  || [...EDGE_CANDIDATES, ...CHROME_CANDIDATES].find((p) => require('fs').existsSync(p))

function syntheticThreadRead() {
  const base = {
    preview: 'round-165 hot window',
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    projectId: null,
    historyMode: 'paginated',
    modelProvider: 'openai',
    model: null,
    reasoningEffort: null,
    createdAt: 1,
    updatedAt: 2,
    recencyAt: null,
    status: { type: 'idle' },
    path: null,
    cwd: 'D:/code/codex-mobile',
    cliVersion: 'test',
    source: 'appServer',
    canAcceptDirectInput: null,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: 'round-165 hot window',
    environments: null,
    originator: null,
    daybreakEnabled: null,
    id: THREAD_ID,
  }
  const paragraph = (n) => {
    const out = []
    for (let k = 0; k < PARAGRAPHS_PER_TURN; k += 1) {
      out.push(`第 ${n} 轮的正文第 ${k + 1} 段，用来把这一轮撑高，好让 hot 区真的能滚动。`)
    }
    return out.join('\n\n')
  }
  const turn = (id, items) => ({
    id,
    status: 'completed',
    itemsView: 'full',
    rootTurnId: null,
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items,
  })
  const turns = []
  for (let n = 1; n <= TURN_COUNT; n += 1) {
    turns.push(turn(`turn-${n}`, [
      {
        type: 'userMessage',
        clientId: `c-u${n}`,
        id: `u${n}`,
        content: [{ type: 'text', text: `SYNTH-U-${n} 请解释第 ${n} 个问题` }],
      },
      { type: 'agentMessage', id: `a${n}`, text: paragraph(n) },
    ]))
  }
  return { result: { thread: { ...base, turns } } }
}

function installSyntheticThread(page) {
  return page.route('**/codex-api/rpc', async (route) => {
    let method = ''
    try {
      method = JSON.parse(route.request().postData() || '{}').method || ''
    } catch {
      method = ''
    }
    if (method === 'thread/read' || method === 'thread/resume') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(syntheticThreadRead()),
      })
      return
    }
    await route.continue()
  })
}

const READ_METRICS = () => {
  const list = document.querySelector('.conversation-list')
  if (!list) return null
  return {
    // 渲染的 hot 轮根 li 数（全量 = 30）
    turns: list.querySelectorAll('li.conversation-turn').length,
    sh: list.scrollHeight,
    top: +list.scrollTop.toFixed(2),
    ch: list.clientHeight,
    dist: +(list.scrollHeight - (list.scrollTop + list.clientHeight)).toFixed(2),
  }
}

async function openThread(browser, { disableResizeObserver } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (disableResizeObserver) {
    // 同 check-bottom-lock：不能 delete 全局（有无守卫 new ResizeObserver 的调用点），
    // 用空实现替换 —— RO 不再回调 ⇒ 高度缓存永远填不上 ⇒ 全部强制入窗（全量渲染）。
    await context.addInitScript(() => {
      window.ResizeObserver = class NoopResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    })
  }
  const page = await context.newPage()
  await installSyntheticThread(page)
  let reachable = true
  try {
    await page.goto(`${BASE}/#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  } catch {
    // dev server 冷启动 domcontentloaded 可能 >20s（round-164 实测）⇒ 重试给足 60s。
    try {
      await page.goto(`${BASE}/#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch {
      reachable = false
    }
  }
  let booted = false
  if (reachable) {
    booted = await page
      .waitForFunction(
        () => {
          const list = document.querySelector('.conversation-list')
          if (!list || list.querySelectorAll('.conversation-item').length === 0) return false
          return list.scrollHeight - (list.scrollTop + list.clientHeight) <= 2
        },
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false)
  }
  if (booted) {
    // 等 RO 首测 + 缓存回填 + 窗口重算收敛（scheduleHotMeasure 的 rAF + nextTick 链）。
    await page.waitForTimeout(1500)
  }
  return { context, page, reachable, booted }
}

async function main() {
  if (!LAUNCHER) {
    console.error('找不到 Edge/Chrome 可执行文件（可用 PROFILE_EDGE 指定）')
    process.exit(2)
  }
  const browser = await chromium.launch({
    executablePath: LAUNCHER,
    headless: HEADLESS,
    args: ['--no-proxy-server'],
  })

  const checks = []
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? '' })
  const fmt = (m) => (m ? `turns=${m.turns} sh=${m.sh} top=${m.top} dist=${m.dist}` : 'null')

  try {
    const run = await openThread(browser)
    if (!run.reachable || !run.booted) {
      console.log('hot 轮窗口化检查')
      console.log(`  目标 ${BASE}`)
      console.log('')
      console.log(`SKIP  站点不可达或应用未就绪（${BASE}）`)
      console.log('')
      console.log('SKIP（环境不足，不是通过）')
      await browser.close()
      process.exit(2)
    }
    const { page } = run

    // 1) 贴底打开：窗口化生效（渲染轮数 < 30）且贴底维持。
    const pinned = await page.evaluate(READ_METRICS)
    check(
      `贴底打开：窗口化生效（渲染轮数 < ${TURN_COUNT}）且贴底维持`,
      !!pinned && pinned.turns < TURN_COUNT && pinned.dist <= PINNED_TOLERANCE_PX,
      fmt(pinned),
    )

    // 2) 上滚 S px ⇒ dist 恰好 +S（scrollHeight 没在脚下漂移）。
    await page.evaluate((px) => {
      const list = document.querySelector('.conversation-list')
      list.scrollTop = list.scrollTop - px
    }, SCROLL_UP_PX)
    await page.waitForTimeout(500)
    const scrolled = await page.evaluate(READ_METRICS)
    const expectedDist = pinned ? pinned.dist + SCROLL_UP_PX : Number.NaN
    check(
      `上滚 ${SCROLL_UP_PX}px ⇒ dist 恰好 +${SCROLL_UP_PX}（spacer 守恒）`,
      !!scrolled && Math.abs(scrolled.dist - expectedDist) <= PINNED_TOLERANCE_PX,
      `期望 dist ≈ ${expectedDist}；实测 ${fmt(scrolled)}`,
    )

    // 3) 滚到 hot 区顶部再滚回底：scrollHeight 恢复逐位一致。
    await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      list.scrollTop = 0
    })
    await page.waitForTimeout(500)
    const atTop = await page.evaluate(READ_METRICS)
    await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      list.scrollTop = list.scrollHeight
    })
    await page.waitForTimeout(500)
    const backToBottom = await page.evaluate(READ_METRICS)
    check(
      '滚到顶再回底 ⇒ scrollHeight 与贴底读数一致（窗口滑动不改总高）',
      !!atTop && !!backToBottom && !!pinned
        && Math.abs(backToBottom.sh - pinned.sh) <= PINNED_TOLERANCE_PX,
      `贴底 sh=${pinned && pinned.sh} 顶 sh=${atTop && atTop.sh} 回底 sh=${backToBottom && backToBottom.sh}（回底 dist=${backToBottom && backToBottom.dist}）`,
    )

    // 4) JumpBar 跳 hot 区顶部轮次（turn 0 ⇒ 强制入窗）⇒ 锚点存在、落点 ≈ 12px。
    // 断言口径：jumpToQuestion 的语义是把**内部锚点**（user 消息 li，
    // id = question-anchor-0）放到容器顶 +12px —— 不是外层 turn li（其顶部
    // 在锚点上方 ~21px，round-165 实测量错一次）。
    const jumpOk = await page.evaluate(() => {
      const dots = document.querySelectorAll('.question-jump-item')
      if (dots.length === 0) return { clicked: false }
      dots[0].click()
      return { clicked: true }
    })
    await page.waitForTimeout(1800) // smooth 滚动 + 强制入窗渲染
    const afterJump = await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      const anchor = document.getElementById('question-anchor-0')
      if (!list || !anchor) return { found: false }
      const rect = anchor.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      return { found: true, offset: +(rect.top - listRect.top).toFixed(1), dist: +(list.scrollHeight - (list.scrollTop + list.clientHeight)).toFixed(2) }
    })
    check(
      'JumpBar 跳 hot 区首轮 ⇒ 强制入窗使锚点存在、锚点落点 ≈ 12px',
      !!jumpOk && jumpOk.clicked && !!afterJump && afterJump.found && Math.abs(afterJump.offset - 12) <= 4,
      `clicked=${jumpOk && jumpOk.clicked} found=${afterJump && afterJump.found} anchorOffset=${afterJump && afterJump.offset}`,
    )
    await run.context.close()

    // 5) 反跑：禁 RO ⇒ 缓存填不上 ⇒ 全量渲染；其 sh 与窗口化态一致（守恒对照）。
    const bare = await openThread(browser, { disableResizeObserver: true })
    if (!bare.reachable || !bare.booted) {
      check('反跑：禁用 ResizeObserver 后页面未就绪（无法证明非空）', false, `target=${BASE}`)
    } else {
      const bareMetrics = await bare.page.evaluate(READ_METRICS)
      check(
        '反跑：无 ResizeObserver ⇒ 全部强制入窗（渲染轮数 == 全量）',
        !!bareMetrics && bareMetrics.turns === TURN_COUNT,
        `期望 turns=${TURN_COUNT}；实测 ${fmt(bareMetrics)}`,
      )
      check(
        '反跑（全量）sh 与窗口化态 sh 一致（±2px）⇒ 守恒非恒真',
        !!bareMetrics && !!pinned && Math.abs(bareMetrics.sh - pinned.sh) <= PINNED_TOLERANCE_PX,
        `窗口化 sh=${pinned && pinned.sh}；全量 sh=${bareMetrics && bareMetrics.sh}`,
      )
      await bare.context.close()
    }
  } finally {
    await browser.close()
  }

  console.log('hot 轮窗口化检查')
  console.log(`  目标 ${BASE}`)
  console.log(`  浏览器 ${LAUNCHER}`)
  console.log('')
  for (const c of checks) {
    console.log(`  ${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}  (${c.detail})`)
  }
  console.log('')
  const failed = checks.filter((c) => !c.pass).length
  if (failed > 0) {
    console.log(`${failed}/${checks.length} 项失败`)
    process.exit(1)
  }
  console.log(`全部通过  (${checks.length}/${checks.length})`)
  process.exit(0)
}

main().catch((error) => {
  console.error('闸门异常：', error)
  process.exit(1)
})
