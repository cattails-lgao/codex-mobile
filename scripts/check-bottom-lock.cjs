// 浏览器级闸门：贴底锁定的**确定性**（round-164）。
//
// 背景：round-155 实测过一次「贴底时图片到达后没回锁」（4 次忠实复现未果）。
// 当时的补锁只覆盖两条路 —— scheduleConversationScroll 的 rAF 里锁 6 帧、
// bindPendingImageHandlers 给「bind 时点已在 DOM 里的 <img>」绑 load/error；
// 任何落在两者之外的增高（晚创建的 img、warm 窗口重渲染、高亮重排……）都会漏锁。
// round-164 给 ThreadConversation 补了第三条路：ResizeObserver 观察容器 + 全部
// 直接子元素（内容增高 = 某个子元素的盒子变高），贴底态下任何增高都确定性地回锁。
//
// 本闸门在浏览器里对**真实管线**（归一化 → UiMessage → 组件 → CSS）量三件事：
//   1. 贴底态下手动增高内容 → 必须回锁（新 RO 路径的断言）；
//   2. 上滚离开贴底后增高 → **不得**拽回（保证新路径不劫持用户滚动）；
//   3. 反跑证明非空：禁掉 ResizeObserver 重开页面，同一增高必然漏锁
//      （dist 停在增高量附近）—— 证明第 1 条断言在没有修复时确实 FAIL。
// 「增高」用改最后一个子元素的高度来注入：确定性（不依赖图片时序），且走的
// 正是 RO 关心的「子元素盒子变高」这一形态。
//
// 数据与 check-message-media-surfaces.cjs 同一策略：拦 thread/read 与
// thread/resume 回合成线程，其余 RPC 一律透传，让应用像连真服务一样启动。
// 只有数据是合成的，被检验的滚动/锁定路径全部真实。
//
// 用法：先起服务（须带 /codex-api 桥），再
//   PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-bottom-lock.cjs
// 环境不足（站点起不来 / 应用未启动）→ SKIP，退 2；断言失败 → FAIL，退 1。
const path = require('path')

// 与 check-message-media-surfaces.cjs 同因：本机 agent shell 的代理变量会把对
// 127.0.0.1 的请求送去代理并稳定 502。本地闸门先摘掉，再用 --no-proxy-server 双保险。
for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) {
  delete process.env[key]
}

const BASE = (process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190').replace(/\/+$/, '')
const HEADLESS = process.env.PROFILE_HEADLESS !== '0'
const THREAD_ID = 'round164-bottom-lock'
// 贴底判定余量：容器钳位可能留 0.33px 残差（round-153/155 实测），放宽到 2px。
const PINNED_TOLERANCE_PX = 2
// 反跑里「漏锁」的判定：注入 500px 增高后 dist 仍 ≥ 此值才算真的漏了。
const UNLOCKED_MIN_DIST_PX = 300
const GROWTH_PX = 500

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

const TURN_COUNT = 4
const PARAGRAPHS_PER_TURN = 9

function syntheticThreadRead() {
  const base = {
    preview: 'round-164 bottom lock',
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
    name: 'round-164 bottom lock',
    environments: null,
    originator: null,
    daybreakEnabled: null,
    id: THREAD_ID,
  }
  const paragraph = (n) => {
    const out = []
    for (let k = 0; k < PARAGRAPHS_PER_TURN; k += 1) {
      out.push(`第 ${n} 轮的正文第 ${k + 1} 段，用来把这一轮撑高，好让容器真的能滚动。`)
    }
    return out.join('\n\n')
  }
  const turn = (id, items) => ({
    id,
    status: 'completed',
    itemsView: 'full',
    // 0.162.1 起 Turn.rootTurnId 必填（round-157）；运行时缺省按 null 容忍。
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

// 页内读数与动作（全部在 evaluate 里跑，避免多往返）。
const READ_METRICS = () => {
  const list = document.querySelector('.conversation-list')
  if (!list) return null
  return {
    items: list.querySelectorAll('.conversation-item').length,
    sh: list.scrollHeight,
    top: +list.scrollTop.toFixed(2),
    ch: list.clientHeight,
    dist: +(list.scrollHeight - (list.scrollTop + list.clientHeight)).toFixed(2),
  }
}

const GROW_LAST_TURN = (px) => {
  const list = document.querySelector('.conversation-list')
  if (!list) return null
  const turns = list.querySelectorAll('li.conversation-turn')
  const target = turns[turns.length - 1]
  if (!target) return null
  const prev = +target.getBoundingClientRect().height.toFixed(1)
  // 必须抬 min-content 地板（minHeight），不能用显式 height：列表是 flex-col 滚动容器，
  // 高于 min-content 的显式高度会被 flex 收缩直接压回去（round-163 spacer 需要 shrink-0
  // 是同一机制）—— round-164 实测 height 注入后 scrollHeight 纹丝不动。
  target.style.minHeight = `${Math.round(prev) + px}px`
  return prev
}

const UNDO_LAST_TURN = () => {
  const list = document.querySelector('.conversation-list')
  const turns = list ? list.querySelectorAll('li.conversation-turn') : []
  const target = turns[turns.length - 1]
  if (target) target.style.minHeight = ''
}

async function openThread(browser, { disableResizeObserver } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (disableResizeObserver) {
    // 不能 delete 全局：ThreadTerminalPanel / useProjectDragAndDrop 里有**无守卫**的
    // new ResizeObserver，删掉会让应用启动即炸（round-164 实测：反跑页面起不来）。
    // 换成空实现替换：应用照常启动，而组件内「贴底增高观察器」的回调永远不触发
    // ⇒ 漏锁形态确定性复现，且不影响页面其它部分。
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
    // dev server 冷启动时 Vite 按需编译整张模块图，domcontentloaded 可能超过 20s
    //（round-164 实测：首个浏览器命中超时、第二次命中走缓存就快了）⇒ 重试一次给足 60s。
    try {
      await page.goto(`${BASE}/#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch {
      reachable = false
    }
  }
  let booted = false
  if (reachable) {
    // 等应用起来并结算完首次贴底（onMounted → scheduleConversationScroll）。
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
    // 必须等挂载期初始 6 帧锁底窗口彻底结束再注入增高：round-164 实测，注入落在
    // 窗口内会被旧的帧锁机制回锁，让「反跑」永远漏不了锁、也让正跑分不清走的是
    // 新 RO 路径还是旧帧锁。1.2s > 6 帧（~100ms）+ 余量。
    await page.waitForTimeout(1200)
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
  const fmt = (m) => (m ? `sh=${m.sh} top=${m.top} dist=${m.dist}` : 'null')

  try {
    // ---- 第一页：正常形态（修复在位） ------------------------------------
    const run = await openThread(browser)
    if (!run.reachable || !run.booted) {
      console.log('贴底锁定确定性检查')
      console.log(`  目标 ${BASE}`)
      console.log(`  浏览器 ${LAUNCHER}`)
      console.log('')
      console.log(`SKIP  站点不可达或应用未就绪（${BASE}）`)
      console.log('')
      console.log('SKIP（环境不足，不是通过）')
      await browser.close()
      process.exit(2)
    }
    const { page } = run

    check('打开线程即贴底', true, fmt(await page.evaluate(READ_METRICS)))

    // 1) 贴底态下增高 → 必须回锁（round-164 新增的 ResizeObserver 路径）。
    const grownAt = await page.evaluate(GROW_LAST_TURN, GROWTH_PX)
    const rel = await page
      .waitForFunction(
        (tol) => {
          const list = document.querySelector('.conversation-list')
          if (!list) return false
          return list.scrollHeight - (list.scrollTop + list.clientHeight) <= tol
        },
        PINNED_TOLERANCE_PX,
        { timeout: 3000 },
      )
      .then(() => true)
      .catch(() => false)
    const afterGrow = await page.evaluate(READ_METRICS)
    check(
      `贴底时内容增高 +${GROWTH_PX}px → 确定性回锁`,
      rel && afterGrow && afterGrow.dist <= PINNED_TOLERANCE_PX,
      `增高自高度 ${grownAt}px；${fmt(afterGrow)}`,
    )
    await page.evaluate(UNDO_LAST_TURN)
    await page.waitForTimeout(300)

    // 2) 上滚离开贴底后增高 → 不得拽回（新路径不得劫持用户滚动）。
    await page.evaluate(() => {
      const list = document.querySelector('.conversation-list')
      list.scrollTop = list.scrollTop - 600
    })
    await page.waitForTimeout(300)
    const beforeGrowUp = await page.evaluate(READ_METRICS)
    await page.evaluate(GROW_LAST_TURN, GROWTH_PX)
    await page.waitForTimeout(900)
    const afterGrowUp = await page.evaluate(READ_METRICS)
    check(
      '上滚后内容增高 → 视口不被拽回',
      !!beforeGrowUp && !!afterGrowUp && Math.abs(afterGrowUp.top - beforeGrowUp.top) <= 2,
      `top ${beforeGrowUp && beforeGrowUp.top} → ${afterGrowUp && afterGrowUp.top}（dist ${afterGrowUp && afterGrowUp.dist}）`,
    )
    await page.evaluate(UNDO_LAST_TURN)
    await run.context.close()

    // ---- 第二页：反跑（禁掉 ResizeObserver ⇒ 漏锁应复现） -----------------
    const bare = await openThread(browser, { disableResizeObserver: true })
    if (!bare.reachable || !bare.booted) {
      check('反跑：禁用 ResizeObserver 后页面未就绪（无法证明非空）', false, `target=${BASE}`)
    } else {
      await bare.page.evaluate(GROW_LAST_TURN, GROWTH_PX)
      await bare.page.waitForTimeout(1200)
      const bareMetrics = await bare.page.evaluate(READ_METRICS)
      check(
        '反跑：无 ResizeObserver 时同一增高必然漏锁（证明本闸门非空）',
        !!bareMetrics && bareMetrics.dist >= UNLOCKED_MIN_DIST_PX,
        `期望 dist ≥ ${UNLOCKED_MIN_DIST_PX}；实测 ${fmt(bareMetrics)}`,
      )
      await bare.context.close()
    }
  } finally {
    await browser.close()
  }

  console.log('贴底锁定确定性检查')
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
