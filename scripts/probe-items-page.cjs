#!/usr/bin/env node
// Verify the 0.159.0 additions codexapp may adopt:
//
//   1. `thread/items/list` exists and pages by item anchor. 0.158.0 only let
//      codexapp page whole turns; a per-item page would let the transcript
//      fetch exactly the items of a turn window without loading sibling items.
//   2. The `instant_interrupt` feature flag is accepted at spawn (opt-in per
//      the 0.159.0 changelog). Deep interrupt-latency behaviour needs a live
//      model turn and stays a manual test.
//
// Run after every app-server upgrade. Usage:
//   node scripts/probe-items-page.cjs <threadId> [CODEX_HOME] [codexBinPath]
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const THREAD_ID = process.argv[2]
const CODEX_HOME = process.argv[3] || process.env.CODEX_HOME
const CODEX_BIN = process.argv[4] || process.env.CODEXUI_CODEX_COMMAND

if (!THREAD_ID) {
  console.error('usage: node scripts/probe-items-page.cjs <threadId> [CODEX_HOME] [codexBinPath]')
  process.exit(2)
}

function resolveCodexBin() {
  if (CODEX_BIN) return fs.realpathSync(CODEX_BIN)
  const candidates = [
    '/usr/lib/node_modules/@openai/codex/bin/codex.js',
    '/usr/local/lib/node_modules/@openai/codex/bin/codex.js',
  ]
  for (const candidate of candidates) {
    try { return fs.realpathSync(candidate) } catch {}
  }
  throw new Error('cannot locate the codex launcher; pass it as the 3rd argument')
}

// Same placeholder the other probes use: legacy `model_provider="custom"`
// rollouts resume only when the provider exists at spawn time (freeMode.ts).
const PLACEHOLDER_PROVIDER_ARGS = [
  '-c', 'model_providers.custom.name="Custom Endpoint (probe placeholder)"',
  '-c', 'model_providers.custom.base_url="http://127.0.0.1:9/v1"',
  '-c', 'model_providers.custom.wire_api="responses"',
]

const proc = spawn(process.execPath, [
  resolveCodexBin(), 'app-server',
  '-c', 'approval_policy="on-request"',
  '-c', 'sandbox_mode="danger-full-access"',
  '-c', 'features.memories=true',
  '-c', 'features.instant_interrupt=true',
  ...PLACEHOLDER_PROVIDER_ARGS,
], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CODEX_HOME } })
proc.stderr.on('data', (d) => { if (String(d).includes('instant_interrupt')) console.log(`  [stderr] ${String(d).trim().slice(0, 200)}`) })

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
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ message: { error: { code: 'timeout', message: `timeout after 60s: ${method}` } } }) }, 60_000)
    pending.set(id, (message) => {
      clearTimeout(timer)
      resolve({
        ms: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
        message,
      })
    })
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

const checks = []
function check(label, ok, detail) {
  checks.push({ label, ok })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`)
}

function shapeOf(message) {
  if (message?.error) return `error ${JSON.stringify(message.error).slice(0, 160)}`
  const r = message?.result || {}
  const keys = Object.keys(r)
  const data = Array.isArray(r.data) ? `data[${r.data.length}]` : 'no-data'
  return `keys=${keys.join(',')} ${data}${r.nextCursor ? ' nextCursor' : ''}`
}

function readTurnId(turn) {
  return turn && typeof turn.id === 'string' ? turn.id : null
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

    const resumed = await call('thread/resume', { threadId: THREAD_ID })
    console.log(`  RESUME raw=${JSON.stringify(resumed.message).slice(0, 300)}`)
    const turns = resumed.message?.result?.thread?.turns || []
    console.log(`  resumed: turns=${turns.length}`)
    const firstTurnItems = turns[0]?.items || null
    if (firstTurnItems) console.log(`  turn[0] carries items[${firstTurnItems.length}] kinds=${[...new Set(firstTurnItems.map((i) => i?.item?.type || i?.type))].join(',')}`)

    console.log('')
    console.log('probe 1 - thread/items/list parameter shapes')
    const attempts = [
      ['plain', { threadId: THREAD_ID }],
      ['paged', { threadId: THREAD_ID, limit: 50, sortDirection: 'asc' }],
      ['itemsView', { threadId: THREAD_ID, limit: 50, sortDirection: 'asc', itemsView: 'full' }],
    ]
    let working = null
    for (const [label, params] of attempts) {
      const r = await call('thread/items/list', params)
      const s = shapeOf(r.message)
      console.log(`  ${label.padEnd(12)} ${s}`)
      if (!r.message?.error && Array.isArray(r.message?.result?.data)) { working = params; break }
    }

    console.log('')
    console.log('probe 2 - items/list pages completely and without overlap')
    if (!working) {
      check('thread/items/list is callable with a page shape', false, 'no accepted parameter shape found')
    } else {
      const all = []
      let cursor
      let pages = 0
      let lastError = null
      do {
        const params = { ...working }
        if (cursor) params.cursor = cursor
        const r = await call('thread/items/list', params)
        if (r.message?.error) { lastError = r.message.error; break }
        const record = r.message?.result || {}
        const data = Array.isArray(record.data) ? record.data : []
        for (const item of data) {
          const key = item?.id || item?.item?.id
          if (key) all.push(key)
        }
        cursor = record.nextCursor || null
        pages += 1
      } while (cursor && pages < 200)
      const truncated = Boolean(cursor) && pages >= 200
      check('thread/items/list accepted', !lastError, lastError ? JSON.stringify(lastError).slice(0, 120) : `${pages} page(s)${truncated ? ' (hit the probe safety cap)' : ''}`)
      check('items paging collected ids without duplicates', all.length > 0 && new Set(all).size === all.length, `items=${all.length}${truncated ? '+ (truncated at cap)' : ''}`)
    }

    console.log('')
    console.log('probe 3 - instant_interrupt feature flag')
    // The spawn above passes features.instant_interrupt=true; reaching here
    // without a config fatal error means the flag was accepted. A bad flag
    // fails the very first thread/resume with a config error.
    check('app-server accepted features.instant_interrupt=true', Boolean(resumed.message?.result?.thread))
    // 0.159.0 changed turn/interrupt: threadId alone is rejected with
    // "missing field `turnId`". Verify the turnId form is schema-valid (the
    // turn is idle, so a state error -- not a schema error -- is expected).
    const firstTurnId = readTurnId(turns[0])
    const interruptWithTurn = await call('turn/interrupt', { threadId: THREAD_ID, turnId: firstTurnId })
    const interruptErr = interruptWithTurn.message?.error
    const schemaOk = interruptErr && !/missing field|invalid type|unknown field/.test(interruptErr.message || '')
    console.log(`  turn/interrupt {threadId, turnId}: ${interruptErr ? interruptErr.message.slice(0, 140) : 'ok'}`)
    check('turn/interrupt accepts {threadId, turnId} (schema-valid)', schemaOk || !interruptErr)
  } catch (error) {
    console.log(`FAILED: ${error.message}`)
    checks.push({ label: 'probe completed', ok: false })
  } finally {
    const failed = checks.filter((c) => !c.ok)
    console.log('')
    console.log(failed.length === 0 ? 'RESULT: probe complete' : `RESULT: ${failed.length} check(s) failed`)
    try { proc.kill() } catch {}
    setTimeout(() => process.exit(failed.length === 0 ? 0 : 1), 300)
  }
})()
