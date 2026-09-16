#!/usr/bin/env node
// Re-verify the two protocol assumptions behind round-84's bounded open-thread
// hydration (src/server/bridge/threadResumeTurnPage.ts):
//
//   1. `thread/resume {excludeTurns, initialTurnsPage{limit,sortDirection:"desc",
//      itemsView:"full"}}` returns a page that is exactly
//      `fullHydration.slice(-limit)` reversed, item-for-item.
//   2. `thread/turns/list {itemsView:"notLoaded"}` can supply the thread's total
//      turn count cheaply, and its cursor paging neither overlaps nor skips.
//
// Run this after a Codex app-server upgrade. A failure here means the bridge's
// promotion would silently reverse or truncate the transcript, so treat the
// exit code as a gate, not as information.
//
// Usage:
//   node scripts/probe-resume-turn-page.cjs <threadId> [CODEX_HOME] [codexBinPath] [limit]
//
// `codexBinPath` defaults to a resolved pnpm-global launcher. On a host where
// the launcher lives elsewhere, pass `$(which codex)`.
//
// The app-server is spawned with the same `-c` overrides the bridge uses, with
// stdio JSONL. Everything runs inside ONE process because `thread/turns/list`
// needs a loaded thread; the per-call costs are still comparable to the bridge
// numbers quoted in the module header.
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const THREAD_ID = process.argv[2]
const CODEX_HOME = process.argv[3] || process.env.CODEX_HOME
const CODEX_BIN = process.argv[4] || process.env.CODEXUI_CODEX_COMMAND
const LIMIT = Number(process.argv[5] || 10)

if (!THREAD_ID) {
  console.error('usage: node scripts/probe-resume-turn-page.cjs <threadId> [CODEX_HOME] [codexBinPath] [limit]')
  process.exit(2)
}

function resolveCodexBin() {
  if (CODEX_BIN) return fs.realpathSync(CODEX_BIN)
  const candidates = [
    // pnpm store link layout: the launcher must be realpath'd, because
    // require.resolve() cannot see through it.
    'D:/Application/NodeManage/pnpm/global/v11/2c10-1a08f22f0da/node_modules/@openai/codex/bin/codex.js',
    '/usr/lib/node_modules/@openai/codex/bin/codex.js',
    '/usr/local/lib/node_modules/@openai/codex/bin/codex.js',
  ]
  for (const candidate of candidates) {
    try { return fs.realpathSync(candidate) } catch {}
  }
  throw new Error('cannot locate the codex launcher; pass it as the 3rd argument')
}

const proc = spawn(process.execPath, [
  resolveCodexBin(),
  'app-server',
  '-c', 'approval_policy="on-request"',
  '-c', 'sandbox_mode="danger-full-access"',
  '-c', 'features.memories=true',
], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME } })
proc.stderr.on('data', () => {})

let buffer = ''
const pending = new Map()
let nextId = 1
proc.stdout.setEncoding('utf8')
proc.stdout.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index !== -1) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    if (line.trim()) {
      try {
        const message = JSON.parse(line)
        if (typeof message.id === 'number' && pending.has(message.id)) {
          const resolve = pending.get(message.id)
          pending.delete(message.id)
          resolve(message)
        }
      } catch {}
    }
    index = buffer.indexOf('\n')
  }
})

function call(method, params) {
  const id = nextId++
  const startedAt = process.hrtime.bigint()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout after 120s: ${method}`)) }, 120_000)
    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve({
        ms: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
        message,
        mb: Buffer.byteLength(JSON.stringify(message), 'utf8') / 1_048_576,
      })
    })
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

function ids(turns) {
  return (Array.isArray(turns) ? turns : []).map((turn) => turn && turn.id)
}

function report(label, r, detail) {
  console.log(
    `  ${label.padEnd(38)}${String(r.ms).padStart(7)}ms${r.mb.toFixed(2).padStart(8)}MB${detail ? '   ' + detail : ''}`,
  )
  if (r.message?.error) console.log(`      ERROR ${JSON.stringify(r.message.error).slice(0, 200)}`)
}

const checks = []
function check(label, ok) {
  checks.push({ label, ok })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

;(async () => {
  console.log(`thread: ${THREAD_ID}`)
  console.log(`CODEX_HOME: ${CODEX_HOME}`)
  console.log('')
  try {
    await call('initialize', {
      clientInfo: { name: 'codex-web-local', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    })
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`)

    console.log('cost')
    const legacy = await call('thread/resume', { threadId: THREAD_ID })
    const fullTurns = legacy.message?.result?.thread?.turns || []
    report('resume {threadId}  (legacy, full hydrate)', legacy, `turns=${fullTurns.length}`)

    const bounded = await call('thread/resume', {
      threadId: THREAD_ID,
      excludeTurns: true,
      initialTurnsPage: { limit: LIMIT, sortDirection: 'desc', itemsView: 'full' },
    })
    const boundedPage = bounded.message?.result?.initialTurnsPage || null
    report('resume {excludeTurns, page}  (bounded)', bounded, `page=${(boundedPage?.data || []).length}`)

    const count = await call('thread/turns/list', {
      threadId: THREAD_ID,
      limit: 10_000,
      sortDirection: 'desc',
      itemsView: 'notLoaded',
    })
    const countData = count.message?.result?.data || []
    report('turns/list {10000, notLoaded}  (count)', count, `count=${countData.length}`)

    console.log('')
    console.log('assumption 1 - page equals fullHydration.slice(-limit).reverse()')
    const expectedAsc = ids(fullTurns).slice(-LIMIT)
    const pageAsReturned = ids(boundedPage?.data)
    check('ids match after reversing the page', JSON.stringify(pageAsReturned) === JSON.stringify([...expectedAsc].reverse()))

    const explicit = await call('thread/turns/list', {
      threadId: THREAD_ID,
      limit: LIMIT,
      sortDirection: 'desc',
      itemsView: 'full',
    })
    check('deep payload matches turns/list with the same arguments',
      JSON.stringify(explicit.message?.result?.data) === JSON.stringify(boundedPage?.data || []))
    check('bounded response carries no turns in thread.turns',
      ids(bounded.message?.result?.thread?.turns).length === 0)

    console.log('')
    console.log('assumption 2 - notLoaded paging gives an exact count')
    check('single-shot count equals the full hydration turn count', countData.length === fullTurns.length)
    check('single-shot count had no remaining cursor', !count.message?.result?.nextCursor)

    let cursor
    const paged = []
    for (let page = 0; page < 8; page += 1) {
      const params = { threadId: THREAD_ID, limit: 5, sortDirection: 'desc', itemsView: 'notLoaded' }
      if (cursor) params.cursor = cursor
      const r = await call('thread/turns/list', params)
      const data = r.message?.result?.data || []
      paged.push(...ids(data))
      cursor = r.message?.result?.nextCursor
      if (!cursor) break
    }
    check('cursor paging collects every turn exactly once',
      paged.length === fullTurns.length && new Set(paged).size === paged.length)

    console.log('')
    const derived = Math.max(0, countData.length - (boundedPage?.data || []).length)
    const legacyStartIndex = Math.max(0, fullTurns.length - LIMIT)
    console.log(`  derived threadTurnStartIndex = ${derived}  (legacy trim would stamp ${legacyStartIndex})`)
    check('derived start index matches the legacy trim', derived === legacyStartIndex)

    console.log('')
    const total = legacy.ms + 0
    const boundedTotal = bounded.ms + (boundedPage?.nextCursor ? count.ms : 0)
    console.log(`  open-thread cost: ${total}ms / ${legacy.mb.toFixed(2)}MB  ->  ${boundedTotal}ms / ${(bounded.mb + (boundedPage?.nextCursor ? count.mb : 0)).toFixed(2)}MB`)
  } catch (error) {
    console.log(`FAILED: ${error.message}`)
    checks.push({ label: 'probe completed', ok: false })
  } finally {
    const failed = checks.filter((c) => !c.ok)
    console.log('')
    console.log(failed.length === 0 ? 'RESULT: all assumptions hold' : `RESULT: ${failed.length} assumption(s) broken`)
    try { proc.kill() } catch {}
    setTimeout(() => process.exit(failed.length === 0 ? 0 : 1), 300)
  }
})()
