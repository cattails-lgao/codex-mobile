#!/usr/bin/env node
// Re-verify the protocol facts behind round-86's bounded older-turn loading
// (src/server/bridge/threadTurnPage.ts). Run this after a Codex app-server
// upgrade: a failure here means the bridge would silently stop using the
// bounded path (it falls back to the full hydration, so the symptom is
// slowness, not wrong output), or -- worse -- would serve the wrong window if
// the checks inside the module were ever loosened.
//
//   1. `thread/read {includeTurns:false}` returns a `thread` object with the
//      same keys and values as a full hydration, only with `turns` empty. This
//      is why the route can keep its response shape while never hydrating.
//   2. The resume page's `nextCursor` reaches the turns strictly older than the
//      page's own oldest turn, and chaining it covers the whole history exactly
//      once, newest first.
//   3. `turnsBackwardsCursor` is NOT that cursor: it carries `includeAnchor:
//      true` and re-serves the page it came with. Using it to page older would
//      loop.
//   4. A page fetched from such a cursor is deep-equal to the corresponding
//      `fullHydration.slice()` reversed.
//   5. A turn id cannot be used as a cursor.
//
// Usage:
//   node scripts/probe-turn-page.cjs <threadId> [CODEX_HOME] [codexBinPath] [limit]
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const THREAD_ID = process.argv[2]
const CODEX_HOME = process.argv[3] || process.env.CODEX_HOME
const CODEX_BIN = process.argv[4] || process.env.CODEXUI_CODEX_COMMAND
const LIMIT = Number(process.argv[5] || 10)

if (!THREAD_ID) {
  console.error('usage: node scripts/probe-turn-page.cjs <threadId> [CODEX_HOME] [codexBinPath] [limit]')
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
  resolveCodexBin(), 'app-server',
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

const ids = (turns) => (Array.isArray(turns) ? turns : []).map((turn) => turn && turn.id)

function report(label, r, detail) {
  console.log(`  ${label.padEnd(44)}${String(r.ms).padStart(7)}ms${r.mb.toFixed(2).padStart(8)}MB${detail ? '   ' + detail : ''}`)
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
    const full = await call('thread/resume', { threadId: THREAD_ID })
    const fullThread = full.message?.result?.thread || {}
    const fullTurns = fullThread.turns || []
    const fullIds = ids(fullTurns)
    report('resume {threadId}  (full hydrate)', full, `turns=${fullTurns.length}`)

    const meta = await call('thread/read', { threadId: THREAD_ID, includeTurns: false })
    report('thread/read {includeTurns:false}', meta, `keys=${Object.keys(meta.message?.result?.thread || {}).length}`)

    const listing = await call('thread/turns/list', {
      threadId: THREAD_ID, limit: 10_000, sortDirection: 'desc', itemsView: 'notLoaded',
    })
    const listingIds = ids(listing.message?.result?.data)
    report('turns/list {10000, notLoaded, desc}', listing, `ids=${listingIds.length}`)
    console.log('')

    console.log('fact 1 - the metadata read is the hydrated thread with empty turns')
    const metaThread = meta.message?.result?.thread || {}
    const differing = Object.keys(fullThread).filter(
      (key) => key !== 'turns' && JSON.stringify(fullThread[key]) !== JSON.stringify(metaThread[key]),
    )
    check('same thread keys', JSON.stringify(Object.keys(fullThread).sort()) === JSON.stringify(Object.keys(metaThread).sort()))
    check('every field outside `turns` is identical', differing.length === 0)
    if (differing.length) console.log(`      differing: ${JSON.stringify(differing)}`)
    check('metadata read carries no turns', ids(metaThread.turns).length === 0)
    check('id listing agrees with the hydrated order (ascending after reversing)',
      JSON.stringify([...listingIds].reverse()) === JSON.stringify(fullIds))
    console.log('')

    console.log('fact 2 - the resume page chains, and the chain is complete')
    const page = await call('thread/resume', {
      threadId: THREAD_ID, excludeTurns: true,
      initialTurnsPage: { limit: LIMIT, sortDirection: 'desc', itemsView: 'full' },
    })
    const pageData = page.message?.result?.initialTurnsPage?.data || []
    const olderCursor = page.message?.result?.initialTurnsPage?.nextCursor || null
    const backwardsCursor = page.message?.result?.turnsBackwardsCursor || null
    console.log(`  page=${ids(pageData).length}  page.nextCursor=${olderCursor ? 'present' : 'null'}  turnsBackwardsCursor=${backwardsCursor ? 'present' : 'null'}`)

    const chained = [...ids(pageData)]
    let cursor = olderCursor
    let pages = 0
    while (cursor && pages < 64) {
      const next = await call('thread/turns/list', {
        threadId: THREAD_ID, cursor, sortDirection: 'desc', limit: LIMIT, itemsView: 'notLoaded',
      })
      if (next.message?.error) { console.log(`      ERROR ${JSON.stringify(next.message.error).slice(0, 160)}`); break }
      chained.push(...ids(next.message?.result?.data))
      cursor = next.message?.result?.nextCursor || null
      pages += 1
    }
    check('resume page plus nextCursor chain covers every turn exactly once',
      chained.length === fullIds.length && new Set(chained).size === fullIds.length)
    check('the chain runs newest first, matching the reverse of the hydration',
      JSON.stringify(chained) === JSON.stringify([...fullIds].reverse()))

    console.log('')
    console.log('fact 3 - turnsBackwardsCursor re-serves its own page (do not page older with it)')
    if (!backwardsCursor) {
      console.log('  (no turnsBackwardsCursor on this thread -- skipped)')
    } else {
      const replayed = await call('thread/turns/list', {
        threadId: THREAD_ID, cursor: backwardsCursor, sortDirection: 'desc', limit: LIMIT, itemsView: 'notLoaded',
      })
      check('desc from turnsBackwardsCursor returns the page it came with',
        JSON.stringify(ids(replayed.message?.result?.data)) === JSON.stringify(ids(pageData)))
      check('turnsBackwardsCursor is not the chain cursor', backwardsCursor !== olderCursor)
    }

    console.log('')
    console.log('fact 4 - a paged window equals the hydrated slice, reversed')
    if (!olderCursor) {
      console.log('  (no older turns on this thread -- skipped)')
    } else {
      const boundary = fullIds.length - ids(pageData).length
      const window_ = await call('thread/turns/list', {
        threadId: THREAD_ID, cursor: olderCursor, sortDirection: 'desc', limit: LIMIT, itemsView: 'full',
      })
      const got = window_.message?.result?.data || []
      report('turns/list {cursor, desc, full}', window_, `turns=${got.length}`)
      const expectedIds = fullIds.slice(Math.max(0, boundary - LIMIT), boundary)
      check('ids match fullHydration.slice(-(limit*2), -limit) reversed',
        JSON.stringify(ids(got)) === JSON.stringify([...expectedIds].reverse()))
      check('turn objects are deep-equal to the hydrated slice',
        JSON.stringify([...got].reverse()) === JSON.stringify(fullTurns.slice(Math.max(0, boundary - LIMIT), boundary)))
    }

    console.log('')
    console.log('fact 5 - a turn id is not a cursor')
    const asId = await call('thread/turns/list', {
      threadId: THREAD_ID, cursor: fullIds[fullIds.length - 1], sortDirection: 'desc', limit: 1, itemsView: 'notLoaded',
    })
    check('passing a turn id as `cursor` is rejected', Boolean(asId.message?.error))

    console.log('')
    const openCost = full.ms
    const olderCost = page.ms + (olderCursor ? listing.ms : 0)
    console.log(`  open-thread cost: full hydrate ${openCost}ms / ${full.mb.toFixed(2)}MB`)
    console.log(`  the round-86 path pays ${page.ms}ms / ${page.mb.toFixed(2)}MB for the same page,`)
    console.log(`  plus ${listing.ms}ms / ${listing.mb.toFixed(2)}MB for the id listing when older turns exist.`)
  } catch (error) {
    console.log(`FAILED: ${error.message}`)
    checks.push({ label: 'probe completed', ok: false })
  } finally {
    const failed = checks.filter((c) => !c.ok)
    console.log('')
    console.log(failed.length === 0 ? 'RESULT: all facts hold' : `RESULT: ${failed.length} fact(s) broken`)
    try { proc.kill() } catch {}
    setTimeout(() => process.exit(failed.length === 0 ? 0 : 1), 300)
  }
})()
