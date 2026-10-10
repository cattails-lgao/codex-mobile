// 浏览器级闸门：round-140「代理投递写入的 userMessage 不渲染成用户气泡」。
//
// 为什么必须量浏览器：这是**观感**问题（截图里 agent 的话跑到右侧成了「我发的」）。
// check-ui-contract 只能读源码文本（看得见「写了什么」，看不见「渲染成什么样」），
// v2/transcriptGrouping 单测跑在 Node 里**没有 CSS**。所以这里补上。
//
// 数据是合成的，管线是真的：在浏览器层拦下 thread/read 与 thread/resume，回一份合成
// thread（含 4 条角色容易混淆的 user 消息），被检验的仍然是**真实管线**
// （归一化 → UiMessage.isAgentNote → transcriptGrouping → 组件 → CSS）；其余 RPC 一律
// 透传，让应用像连真服务一样启动。别把这个读成「真实线程验证」。
//
// 合成数据的三条判据来源（0.161.0 实测 + 线上库取证）：
//   · user-injected ：同一 turn 内第 2 条、clientId=null ⇒ 代理 sendInput 投递 ⇒ 必须成注记
//   · user-steer    ：同一 turn 内第 3 条、clientId 非空 ⇒ 客户端 steer ⇒ **必须仍是用户气泡**
//     （这条是本次改动最容易被搞错的地方：位置判据单独使用会把用户自己的 steer 误伤）
//   · user-subagent / user-env ：轮内首条但正文是 <subagent_notification> / <environment_context>
//     包裹 ⇒ 前缀判据 ⇒ 必须成注记（位置判据抓不到它们）
//
// 用法：先起服务（须带 /codex-api 桥），再
//   PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-agent-note-surfaces.cjs
// 环境不足（站点起不来）→ SKIP，退 2；气泡/注记数量或对齐不对、对比度不足、溢出 → FAIL，退 1。
const path = require('path')

// 这台机器上的 agent shell 带着 WorkBuddy 自己的 http_proxy/https_proxy（指向
// 127.0.0.1:5xxxx）。Playwright 会把它们透给浏览器，于是对 127.0.0.1 的请求会被送去
// 代理并稳定拿到 502 Bad Gateway —— 看起来像「站点没起来」，实际是代理在挡。
// 本地闸门必须先摘掉这几个变量，再用 --no-proxy-server 双保险。
for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) {
  delete process.env[key]
}

const BASE = (process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190').replace(/\/+$/, '')
const HEADLESS = process.env.PROFILE_HEADLESS !== '0'
const THREAD_ID = 'round140-agent-note'
const MIN_CONTRAST = 4.5

const GENUINE_TEXT = '授权按方案修复四组问题'
const INJECTED_TEXT = 'CP8恢复实物：需主核判据冲突（这条不是用户发的）'
const STEER_TEXT = '补充一句：先跑类型检查'
const SUBAGENT_TEXT = '<subagent_notification>part_01 已完成</subagent_notification>'
const ENV_TEXT = '<environment_context>cwd=/root</environment_context>'
/** 注记正文里必须还看得见的关键字（防 renderMarkdownBlocksAsHtml 把包裹当 HTML 吞掉）。 */
const NOTE_MARKERS = ['CP8恢复实物', 'part_01', 'environment_context']

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
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
]
const CHROME_CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
]
const LAUNCHER = process.env.PROFILE_EDGE
  || [...EDGE_CANDIDATES, ...CHROME_CANDIDATES].find((p) => require('fs').existsSync(p))

const DARK_KEY = 'codex-web-local.dark-mode.v1'

function syntheticThreadRead() {
  const base = {
    extra: null,
    sessionId: 'round140-agent-note-session',
    forkedFromId: null,
    parentThreadId: null,
    preview: 'round-140 agent note surfaces',
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
    cwd: 'C:/code/codex-mobile',
    cliVersion: 'test',
    source: 'appServer',
    canAcceptDirectInput: null,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: 'round-140 agent note surfaces',
    environments: null,
    originator: null,
    daybreakEnabled: null,
  }
  const turn = (id, items) => ({
    id,
    status: 'completed',
    itemsView: 'full',
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items,
  })
  const userMessage = (id, text, clientId) => ({
    type: 'userMessage',
    id,
    clientId,
    content: [{ type: 'text', text }],
  })
  return {
    result: {
      thread: {
        ...base,
        id: THREAD_ID,
        turns: [
          turn('turn-mixed', [
            userMessage('user-genuine', GENUINE_TEXT, '3f1c8a90-1111-4222-8333-444455556666'),
            { type: 'agentMessage', id: 'agent-1', text: '收到，开始处理。' },
            userMessage('user-injected', INJECTED_TEXT, null),
            userMessage('user-steer', STEER_TEXT, 'b131b25d-4265-499b-b47d-65cae053342b'),
            { type: 'agentMessage', id: 'agent-2', text: '继续。' },
          ]),
          turn('turn-subagent', [userMessage('user-subagent', SUBAGENT_TEXT, null)]),
          turn('turn-env', [userMessage('user-env', ENV_TEXT, null)]),
        ],
      },
    },
  }
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

const READS = () => {
  const parseColor = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value || '')
    if (!m) return null
    const parts = m[1].split(',').map((x) => parseFloat(x.trim()))
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const luminance = (c) => {
    const channel = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
  }
  const contrast = (fg, bg) => {
    const a = luminance(fg)
    const b = luminance(bg)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }
  const opaqueBackground = (el) => {
    let node = el
    while (node) {
      const c = parseColor(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0.95) return c
      node = node.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  const bubbles = Array.from(document.querySelectorAll('article.message-card[data-role="user"]'))
    .map((el) => (el.innerText || '').trim())
  const noteCards = Array.from(document.querySelectorAll('article.thread-agent-note'))
  const notes = noteCards.map((el) => {
    const row = el.closest('.message-row')
    const body = el.querySelector('.thread-agent-note-body')
    const header = el.querySelector('.thread-agent-note-header')
    const rect = el.getBoundingClientRect()
    const fg = parseColor(getComputedStyle(el).color)
    const bg = opaqueBackground(el)
    return {
      text: (body ? body.innerText : '').trim(),
      header: (header ? header.innerText : '').trim(),
      rowJustify: row ? getComputedStyle(row).justifyContent : null,
      rowRightAligned: row ? getComputedStyle(row).justifyContent === 'flex-end' : null,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      contrast: fg ? contrast(fg, bg) : null,
      fg: fg ? `rgb(${fg.r}, ${fg.g}, ${fg.b})` : null,
      bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
    }
  })
  return {
    booted: (document.body ? document.body.innerText : '').length > 30,
    bubbles,
    bubbleCount: bubbles.length,
    notes,
    noteCount: notes.length,
    noteRowCount: document.querySelectorAll('.thread-agent-note-row[data-message-type="agentNote"]').length,
    // round-140：注记不得开辟新渲染组。合成数据里真人只发了 2 条（genuine + steer）
    // ⇒ 恰好 2 个 conversation-turn；若注记被当成轮次边界会变成 5 个（3 条注记各开一组）。
    turnBlockCount: document.querySelectorAll('li.conversation-turn').length,
    viewportWidth: window.innerWidth,
  }
}

const RUNS = [
  { theme: 'light', width: 1440, height: 900, label: 'light/desktop' },
  { theme: 'dark', width: 1440, height: 900, label: 'dark/desktop' },
  { theme: 'light', width: 390, height: 844, label: 'light/narrow' },
  { theme: 'dark', width: 390, height: 844, label: 'dark/narrow' },
]

async function collect(browser, run) {
  const context = await browser.newContext({
    viewport: { width: run.width, height: run.height },
    colorScheme: run.theme === 'dark' ? 'dark' : 'light',
  })
  await context.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {}
    },
    [DARK_KEY, run.theme],
  )
  const page = await context.newPage()
  await installSyntheticThread(page)
  let reachable = true
  try {
    await page.goto(`${BASE}/#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  } catch {
    reachable = false
  }
  if (reachable) {
    await page
      .waitForFunction(() => document.querySelectorAll('article.thread-agent-note').length > 0, { timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(600)
  }
  const facts = reachable ? await page.evaluate(READS) : null
  await context.close()
  return { reachable, facts }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: LAUNCHER,
    headless: HEADLESS,
    args: ['--no-proxy-server'],
  })

  const checks = []
  const check = (label, name, pass, detail) => checks.push({ label, name, pass: !!pass, detail: detail ?? '' })

  let skipped = null
  const collected = []
  for (const run of RUNS) {
    const res = await collect(browser, run)
    if (!res.reachable || !res.facts || !res.facts.booted) {
      skipped = `${run.label}: 站点不可达或未启动（${BASE}）`
      break
    }
    collected.push({ run, facts: res.facts })
  }

  if (skipped) {
    console.log('代理注记面检查（round-140）')
    console.log(`  目标 ${BASE}`)
    console.log(`  浏览器 ${LAUNCHER}`)
    console.log('')
    console.log(`SKIP  ${skipped}`)
    console.log('')
    console.log('SKIP（环境不足，不是通过）')
    await browser.close()
    process.exit(2)
  }

  for (const { run, facts } of collected) {
    const L = run.label
    // ① 只有真人发的两条才是用户气泡：genuine（clientId 非空）+ steer（clientId 非空）。
    check(
      L,
      '用户气泡恰好 2 个（提问 + 客户端 steer）',
      facts.bubbleCount === 2,
      `count=${facts.bubbleCount} texts=${JSON.stringify(facts.bubbles.map((t) => t.slice(0, 18)))}`,
    )
    check(
      L,
      '客户端 steer 仍是用户气泡（位置判据单独用会误伤它）',
      facts.bubbles.some((t) => t.includes(STEER_TEXT)),
      facts.bubbles.some((t) => t.includes(STEER_TEXT)) ? 'ok' : 'steer 不见了',
    )
    check(
      L,
      '同轮第 2 条（clientId=null）不再渲染成用户气泡',
      !facts.bubbles.some((t) => t.includes('CP8恢复实物')),
      facts.bubbles.some((t) => t.includes('CP8恢复实物')) ? '被渲染成用户气泡' : 'ok',
    )

    // ② 三条注入各自成注记。
    check(L, '代理注记恰好 3 条（同轮注入 / 子代理回报 / 环境注入）', facts.noteCount === 3, `count=${facts.noteCount}`)
    check(L, '注记行带 data-message-type="agentNote"', facts.noteRowCount === 3, `rows=${facts.noteRowCount}`)
    for (const marker of NOTE_MARKERS) {
      check(
        L,
        `注记正文保留关键字「${marker}」（没被当 HTML 吞掉）`,
        facts.notes.some((n) => n.text.includes(marker)),
        facts.notes.map((n) => n.text.slice(0, 22)).join(' | '),
      )
    }

    // ③ 注记居左，不再像「我发的」。
    check(
      L,
      '注记行居左（justify-content 不是 flex-end）',
      facts.notes.length === 3 && facts.notes.every((n) => n.rowRightAligned === false && n.rowJustify === 'flex-start'),
      facts.notes.map((n) => n.rowJustify).join(' '),
    )
    check(
      L,
      '注记标题非空（有来源标签）',
      facts.notes.length === 3 && facts.notes.every((n) => n.header.length > 0),
      facts.notes.map((n) => `"${n.header}"`).join(' '),
    )

    // ④ 真实占位 + 不溢出（含 390px 窄屏）。
    check(
      L,
      '注记有真实占位（宽高 > 0）',
      facts.notes.length === 3 && facts.notes.every((n) => n.width > 80 && n.height > 16),
      facts.notes.map((n) => `${n.width}x${n.height}`).join(' '),
    )
    check(
      L,
      '注记不溢出视口',
      facts.notes.length === 3 && facts.notes.every((n) => n.right <= facts.viewportWidth + 1),
      facts.notes.map((n) => `right=${n.right}/${facts.viewportWidth}`).join(' '),
    )

    // ⑥ 注记不开新轮组（否则每条注记都会变成一轮的 request，又是一串独立气泡）。
    check(
      L,
      '注记不开辟新轮组（轮组数 = 真人提问数 2）',
      facts.turnBlockCount === 2,
      `turnBlocks=${facts.turnBlockCount}`,
    )

    // ⑤ 对比度：亮/暗两套主题都要够。
    const minContrast = Math.min(...facts.notes.map((n) => (n.contrast === null ? 0 : n.contrast)))
    check(
      L,
      `注记正文对比度 >= ${MIN_CONTRAST}:1`,
      facts.notes.length === 3 && Number.isFinite(minContrast) && minContrast >= MIN_CONTRAST,
      facts.notes.map((n) => `${n.fg} on ${n.bg} = ${n.contrast === null ? 'n/a' : n.contrast.toFixed(2)}`).join(' | '),
    )
  }

  console.log('代理注记面检查（round-140）')
  console.log(`  目标 ${BASE}`)
  console.log(`  浏览器 ${LAUNCHER}`)
  console.log('')
  let bad = 0
  let currentLabel = ''
  for (const c of checks) {
    if (c.label !== currentLabel) {
      currentLabel = c.label
      console.log(`  [${currentLabel}]`)
    }
    if (!c.pass) bad++
    console.log(`    ${c.pass ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
  }
  console.log('')
  console.log(bad ? `${bad}/${checks.length} 项失败` : `全部通过  (${checks.length}/${checks.length})`)
  await browser.close()
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error('ERR', e && e.message)
  process.exit(1)
})
