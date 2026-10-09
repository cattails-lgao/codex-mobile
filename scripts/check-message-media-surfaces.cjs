// 浏览器级闸门：round-138 新增的两个「输入可见面」——audio / localAudio 的播放器、
// mention 的 chip。
//
// 为什么需要它：round-138 给这两类输入各开了可见面，但当时的证据只有两种 ——
//   * check-ui-contract 读源码文本（看得见「写了什么」，看不见「渲染出来长什么样」）
//   * v2.test.ts 的合成 payload 单测（跑在 Node 里，**没有 CSS**）
// 于是「暗色下对比度够不够」「超长名字会不会把布局撑破」这两件事根本没被量过。
// 它们只能量浏览器，所以这里补上。
//
// 为什么不去找一条真实线程：本机 state_5.sqlite 的 thread_attachments 是 0 行，
// 没有任何一条真实 CLI 写出的 audio / mention 输入（见 round-138 §六①）。做法改成在
// 浏览器层**拦下 thread/read 与 thread/resume**，回一份合成的 thread —— 被检验的仍然是
// **真实管线**（归一化 → UiMessage → 组件 → CSS），只有数据是合成的；其余 RPC 一律透传，
// 让应用像连真服务一样启动。这条边界写进 round-138 的文档里，别把它读成「真实线程验证」。
//
// 用法：先起服务（须带 /codex-api 桥），再
//   PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/check-message-media-surfaces.cjs
// 环境不足（站点起不来）→ SKIP，退 2；面缺失 / 对比度不足 / 溢出 → FAIL，退 1。
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
const THREAD_ID = 'round138-media-surfaces'
// WCAG AA（正文）。token 表里 --ink-2 的注释就是「正文」，所以按正文门槛要求。
const MIN_CONTRAST = 4.5
// Tailwind 的 max-w-48 = 12rem = 192px（root 16px 时）。留一点余量只用来防空过。
const CHIP_NAME_MAX_PX = 200
// 短名（应原样显示）与超长名（必须被截断）各一条 —— 只测长名分不清「截断生效」与
// 「名字本来就没超」。
const SHORT_MENTION = { name: 'src/main.ts', path: '/repo/src/main.ts' }
const LONG_MENTION = {
  name: 'packages/web-client/src/features/conversation/components/an-extremely-long-module-name-that-has-to-be-truncated.tsx',
  path: '/repo/packages/web-client/src/features/conversation/components/an-extremely-long-module-name-that-has-to-be-truncated.tsx',
}
const AUDIO_DATA_URL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
const AUDIO_LOCAL_PATH = 'C:/recordings/voice-memo.m4a'
const AUDIO_LOCAL_PROXY = '/codex-local-file?path=C%3A%2Frecordings%2Fvoice-memo.m4a'

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

// 合成 thread：一条 audio（data URL）+ 一条 localAudio（落到 /codex-local-file 代理）
// 放在一轮里，两条 mention（短名 + 超长名）放在另一轮里。
// 字段形状照抄 v2.test.ts 的 threadReadResponseWithContent —— 0.161.0 起 Thread 多了
// environments / originator / daybreakEnabled 三个字段（round-130）。
function syntheticThreadRead() {
  const base = {
    extra: null,
    sessionId: 'round138-media-surfaces-session',
    forkedFromId: null,
    parentThreadId: null,
    preview: 'round-138 media surfaces',
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
    name: 'round-138 media surfaces',
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
  return {
    result: {
      thread: {
        ...base,
        id: THREAD_ID,
        turns: [
          turn('turn-audio', [{
            type: 'userMessage',
            clientId: null,
            id: 'user-audio',
            content: [
              { type: 'audio', url: AUDIO_DATA_URL },
              { type: 'localAudio', path: AUDIO_LOCAL_PATH },
            ],
          }]),
          turn('turn-mention', [{
            type: 'userMessage',
            clientId: null,
            id: 'user-mention',
            content: [
              { type: 'mention', name: SHORT_MENTION.name, path: SHORT_MENTION.path },
              { type: 'mention', name: LONG_MENTION.name, path: LONG_MENTION.path },
            ],
          }]),
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
    // round-138 的两个面与真实线程数据无关，其余 RPC 一律透传，让应用正常启动。
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
    const hi = Math.max(a, b)
    const lo = Math.min(a, b)
    return (hi + 0.05) / (lo + 0.05)
  }
  // 一直往上找到第一个**不透明**的底色：chip 自己是 bg-s0，但万一哪天改成透明，
  // 对比度必须按真实可见底色算，而不是按 rgba(0,0,0,0)。
  const opaqueBackground = (el) => {
    let node = el
    while (node) {
      const c = parseColor(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0.95) return c
      node = node.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  const audios = Array.from(document.querySelectorAll('.message-audio-attachments .message-audio-player'))
  const chips = Array.from(document.querySelectorAll('.message-mention-chip'))

  return {
    booted: (document.body ? document.body.innerText : '').length > 30,
    audioCount: audios.length,
    audios: audios.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        src: el.getAttribute('src') || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }),
    mentionCount: chips.length,
    chips: chips.map((el) => {
      const nameEl = el.querySelector('.message-file-chip-name')
      const rect = el.getBoundingClientRect()
      const container = el.closest('.message-file-attachments')
      const containerRect = container ? container.getBoundingClientRect() : null
      const fg = parseColor(getComputedStyle(el).color)
      const bg = opaqueBackground(el)
      const nameStyle = nameEl ? getComputedStyle(nameEl) : null
      return {
        name: nameEl ? nameEl.textContent : '',
        contrast: fg ? contrast(fg, bg) : null,
        fg: fg ? `rgb(${fg.r}, ${fg.g}, ${fg.b})` : null,
        bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        whiteSpace: nameStyle ? nameStyle.whiteSpace : null,
        overflowX: nameStyle ? nameStyle.overflowX : null,
        textOverflow: nameStyle ? nameStyle.textOverflow : null,
        nameClientWidth: nameEl ? Math.round(nameEl.clientWidth) : null,
        nameScrollWidth: nameEl ? Math.round(nameEl.scrollWidth) : null,
        chipRight: Math.round(rect.right),
        containerRight: containerRect ? Math.round(containerRect.right) : null,
        viewportWidth: window.innerWidth,
      }
    }),
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
    // 等到面出现；真出现不了就靠 facts.booted 区分「应用没起来」（SKIP）与
    // 「应用起来了但这个面没了」（FAIL）。
    await page
      .waitForFunction(() => document.querySelectorAll('.message-mention-chip').length > 0, { timeout: 15000 })
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
    console.log('消息媒体面检查（audio / localAudio / mention）')
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
    check(L, 'audio 播放器渲染 2 个（audio data URL + localAudio 代理）', facts.audioCount === 2, `count=${facts.audioCount}`)
    check(L, '第一个播放器用的是 audio 的 data URL', (facts.audios[0]?.src || '').startsWith('data:audio/wav'), facts.audios[0]?.src?.slice(0, 42))
    check(L, '第二个播放器走 /codex-local-file 代理（localAudio）', (facts.audios[1]?.src || '').includes('/codex-local-file?path='), facts.audios[1]?.src)
    check(
      L,
      '播放器真实占位（宽高 > 0，没有被压成 0）',
      facts.audios.length === 2 && facts.audios.every((a) => a.width > 60 && a.height > 10),
      facts.audios.map((a) => `${a.width}x${a.height}`).join(' '),
    )
    check(L, 'mention chip 渲染 2 个（短名 + 超长名）', facts.mentionCount === 2, `count=${facts.mentionCount}`)

    const shortChip = facts.chips.find((c) => c.name === SHORT_MENTION.name)
    const longChip = facts.chips.find((c) => c.name === LONG_MENTION.name)
    check(L, '短名 chip 文本原样显示', !!shortChip, shortChip ? `"${shortChip.name}"` : 'not found')

    if (longChip) {
      const clipped = longChip.nameScrollWidth > longChip.nameClientWidth
      check(
        L,
        '超长名被截断（scrollWidth > clientWidth）',
        clipped,
        `scroll=${longChip.nameScrollWidth} client=${longChip.nameClientWidth}`,
      )
      check(
        L,
        '截断用的是省略号（nowrap + hidden + ellipsis）',
        longChip.whiteSpace === 'nowrap' && longChip.overflowX === 'hidden' && longChip.textOverflow === 'ellipsis',
        `${longChip.whiteSpace}/${longChip.overflowX}/${longChip.textOverflow}`,
      )
      check(
        L,
        '超长名的名字栏被 max-w-48 约束住（<=200px）',
        longChip.nameClientWidth !== null && longChip.nameClientWidth <= CHIP_NAME_MAX_PX,
        `${longChip.nameClientWidth}px`,
      )
    } else {
      check(L, '超长名被截断（scrollWidth > clientWidth）', false, 'long chip not found')
      check(L, '截断用的是省略号（nowrap + hidden + ellipsis）', false, 'long chip not found')
      check(L, '超长名的名字栏被 max-w-48 约束住（<=200px）', false, 'long chip not found')
    }

    const minContrast = Math.min(...facts.chips.map((c) => (c.contrast === null ? 0 : c.contrast)))
    check(
      L,
      `chip 文字对比度 >= ${MIN_CONTRAST}:1（暗色下也要够）`,
      facts.chips.length === 2 && Number.isFinite(minContrast) && minContrast >= MIN_CONTRAST,
      facts.chips.map((c) => `${c.fg} on ${c.bg} = ${c.contrast === null ? 'n/a' : c.contrast.toFixed(2)}`).join(' | '),
    )

    const overflow = facts.chips.filter(
      (c) => c.containerRight !== null && (c.chipRight > c.containerRight + 1 || c.chipRight > c.viewportWidth + 1),
    )
    check(
      L,
      'chip 不撑破容器 / 不溢出视口',
      facts.chips.length === 2 && overflow.length === 0,
      overflow.length ? overflow.map((c) => `right=${c.chipRight} container=${c.containerRight}`).join(' ') : 'ok',
    )
  }

  console.log('消息媒体面检查（audio / localAudio / mention）')
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
