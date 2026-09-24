// UI audit: capture the running app's real appearance + a few computed-style facts.
// Usage: PROFILE_BASE_URL=http://127.0.0.1:4190 node tmp/ui-audit-shots.cjs
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const EDGE_CANDIDATES = [
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
]
const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
]
const LAUNCHER = [...EDGE_CANDIDATES, ...CHROME_CANDIDATES].find((p) => fs.existsSync(p))
const BASE = (process.env.PROFILE_BASE_URL || 'http://127.0.0.1:4190').replace(/\/$/, '')
const THEME_KEY = 'codex-web-local.dark-mode.v1'
const THREAD_ID = process.env.THREAD_ID || '01a0238c-d5e7-7651-97cc-2303f044f00e'
const OUT = path.join('output', 'playwright', 'ui-audit')

fs.mkdirSync(OUT, { recursive: true })

async function shoot(browser, { name, url, width, height, theme, wait = 3500, before }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  })
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {}
    },
    [THEME_KEY, theme],
  )
  const page = await ctx.newPage()
  await page.goto(`${BASE}/#${url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(wait)
  // 输入区的**配置控件**（模型 / 推理 / 协作模式 / 审批）在线程数据就绪之前是 disabled 的，而
  // disabled 与 enabled 是两套计算值——采到哪一套只取决于「截图那一刻加载完没有」。这里显式
  // 等到模型控件可用，把采样钉在 enabled 状态上；首页没有活动线程，超时是预期结果，忽略即可。
  // （发送按钮因为草稿为空而 disabled，那是稳定状态，不属于这里的不确定性。）
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('.thread-composer-model-control .composer-dropdown-trigger')
        return el ? !el.disabled : true
      },
      { timeout: 12000 },
    )
    .catch(() => {})
  if (before) await before(page)
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  const facts = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return {
        sel,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        background: s.backgroundColor,
        color: s.color,
        radius: s.borderRadius,
        border: s.border,
      }
    }
    const families = new Set()
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      families.add(s.fontFamily)
    }
    return {
      themeClass: document.documentElement.className,
      families: [...families],
      samples: [
        pick('body'),
        pick('.desktop-sidebar'),
        pick('.sidebar-root'),
        pick('.content-header'),
        pick('.thread-composer textarea'),
        pick('button'),
        // 侧栏两个工具入口与路由头部图标：缺陷①的现场。原先采样点只到 .sidebar-root 这一层，
        // 这里改了什么都测不到（闸门覆盖不到的地方等于没有闸门）。
        pick('.sidebar-skills-link'),
        pick('.sidebar-automations-link-icon'),
        pick('.skills-route-header-icon'),
        // 输入区四个控件（缺陷②的现场）：原先只采到 `.thread-composer textarea`，四个下拉
        // 长什么样、有没有被改动，闸门一概看不见。round-91 的教训是「采样范围＝可见范围」，
        // 这里把要改的元素先纳入采样，改动才可能被等值检查抓到。
        pick('.thread-composer-model-control .composer-dropdown-trigger'),
        pick('.thread-composer-thinking-control .composer-dropdown-trigger'),
        pick('.thread-composer-plan-trigger'),
        pick('.thread-composer-approval-trigger'),
        pick('.thread-composer-submit'),
      ].filter(Boolean),
      scrollHeight: document.documentElement.scrollHeight,
      nodes: document.querySelectorAll('body *').length,
    }
  })
  await ctx.close()
  return { file, facts }
}

async function main() {
  const browser = await chromium.launch({ executablePath: LAUNCHER, headless: true })
  const jobs = [
    { name: 'desktop-dark-home', url: '/', width: 1440, height: 900, theme: 'dark' },
    { name: 'desktop-dark-thread', url: `/thread/${THREAD_ID}`, width: 1440, height: 900, theme: 'dark' },
    { name: 'desktop-light-thread', url: `/thread/${THREAD_ID}`, width: 1440, height: 900, theme: 'light' },
    { name: 'desktop-dark-skills', url: '/skills', width: 1440, height: 900, theme: 'dark' },
    {
      name: 'desktop-dark-thread-rightpanel',
      url: `/thread/${THREAD_ID}`,
      width: 1440,
      height: 900,
      theme: 'dark',
      before: async (page) => {
        const btn = page.locator('button[title*="Files"], button[title*="Git"], button[aria-label*="Files"], button[aria-label*="Git"]').first()
        if (await btn.count()) await btn.click().catch(() => {})
        await page.waitForTimeout(1500)
      },
    },
    { name: 'mobile-dark-home', url: '/', width: 390, height: 844, theme: 'dark' },
    { name: 'mobile-dark-thread', url: `/thread/${THREAD_ID}`, width: 390, height: 844, theme: 'dark' },
  ]
  const summary = []
  for (const job of jobs) {
    const res = await shoot(browser, job)
    console.log(`\n### ${job.name} -> ${res.file}`)
    console.log(`theme=${res.facts.themeClass} nodes=${res.facts.nodes}`)
    console.log('font families in use:')
    for (const f of res.facts.families) console.log(`  - ${f}`)
    for (const s of res.facts.samples) {
      console.log(`  ${s.sel}: ${s.fontFamily} / ${s.fontSize} / bg=${s.background} / fg=${s.color} / r=${s.radius}`)
    }
    summary.push({ name: job.name, ...res.facts, file: res.file })
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(summary, null, 2))
  await browser.close()
  console.log(`\nwrote ${path.join(OUT, 'facts.json')}`)
}

main().catch((e) => {
  console.error('FAILED', e)
  process.exit(1)
})
