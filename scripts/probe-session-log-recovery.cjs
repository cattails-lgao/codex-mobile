#!/usr/bin/env node
// Report whether the bridge's session-log chronology recovery still applies to a
// rollout, and what the cache in src/server/bridge/session.ts is saving.
//
// The recovery in `buildSessionItemOrder` was written against a rollout that
// records commands as `function_call` / `function_call_output` named
// `exec_command` or `shell_command`, and file changes as `custom_tool_call`
// named `apply_patch`. Current CLI versions write commands as
// `custom_tool_call` / `custom_tool_call_output` named `exec` instead. When a
// log carries no row the recovery recognises, the merge has nothing to
// interleave, so `mergeSessionCommandsIntoTurns` must return the turns
// untouched and `mergeSessionCommandsIntoTurnsFromPath` must not read the file
// again — otherwise every open of that thread pays a full read plus a full JSON
// parse of the whole log to reorder a feed the app-server already got right.
//
// Run this after a Codex CLI upgrade:
//   - "recovery does not apply" on a session you expect chronology recovery for
//     means the recogniser needs updating for the new tool shape;
//   - the cost line is what the size+mtime cache removes from every later open.
//
// Usage:
//   node scripts/probe-session-log-recovery.cjs <session.jsonl> [--require-recovery]
//
// Exit codes: 0 = reported, 1 = `--require-recovery` was set and the recovery
// does not apply, 2 = usage / unreadable input.
const fs = require('node:fs')

const RECOGNISED_FUNCTION_NAMES = new Set(['exec_command', 'shell_command'])
const CURRENT_COMMAND_TOOL_NAME = 'exec'
const RECOGNISED_CUSTOM_TOOL_NAMES = new Set(['apply_patch'])

// Mirrors isRecoverableToolPayload in src/server/bridge/session.ts.
function isRecoverableToolPayload(payload) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (payload.type === 'function_call') return RECOGNISED_FUNCTION_NAMES.has(name)
  return payload.type === 'custom_tool_call' && RECOGNISED_CUSTOM_TOOL_NAMES.has(name)
}

const file = process.argv[2]
const requireRecovery = process.argv.includes('--require-recovery')
if (!file) {
  console.error('usage: node scripts/probe-session-log-recovery.cjs <session.jsonl> [--require-recovery]')
  process.exit(2)
}

let stat
try {
  stat = fs.statSync(file)
} catch (error) {
  console.error(`cannot stat ${file}: ${error.message}`)
  process.exit(2)
}

console.log(`file: ${file}`)
console.log(`size: ${(stat.size / 1048576).toFixed(2)}MB  mtime: ${new Date(stat.mtimeMs).toISOString()}`)
console.log('')

// --- the scan the bridge performs on a cache miss -------------------------
const scanStart = process.hrtime.bigint()
const raw = fs.readFileSync(file, 'utf8')
const readMs = Number(process.hrtime.bigint() - scanStart) / 1e6

const lines = raw.split('\n')
const rowTypes = new Map()
const recoverableRows = []
const currentShapeCommandRows = []
let parsedRows = 0

for (const line of lines) {
  if (!line.trim()) continue
  let row
  try {
    row = JSON.parse(line)
  } catch {
    continue
  }
  parsedRows += 1
  rowTypes.set(row.type, (rowTypes.get(row.type) ?? 0) + 1)
  if (row.type !== 'response_item') continue
  const payload = row.payload ?? {}
  if (isRecoverableToolPayload(payload)) {
    recoverableRows.push(payload.type === 'function_call' ? payload.name : `${payload.type}:${payload.name}`)
  }
  if (payload.type === 'custom_tool_call' && payload.name === CURRENT_COMMAND_TOOL_NAME) {
    currentShapeCommandRows.push(payload.call_id ?? '(no call_id)')
  }
}

const scanMs = Number(process.hrtime.bigint() - scanStart) / 1e6
const overheadMs = scanMs - readMs

console.log(`rows: ${parsedRows} (${lines.length - 1} lines)`)
for (const [type, count] of [...rowTypes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(type).padEnd(18)} ${count}`)
}
console.log('')
console.log(`command/file-change rows the recovery recognises : ${recoverableRows.length}`)
for (const kind of [...new Set(recoverableRows)]) {
  console.log(`  ${kind.padEnd(34)} ${recoverableRows.filter((row) => row === kind).length}`)
}
console.log(`current-shape command rows (custom_tool_call exec): ${currentShapeCommandRows.length}`)
console.log('')

const applies = recoverableRows.length > 0
console.log(applies
  ? 'verdict: recovery APPLIES — the log carries rows buildSessionItemOrder understands'
  : 'verdict: recovery DOES NOT APPLY — nothing to interleave, so the merge must leave the turns untouched')

// --- what the cache removes ------------------------------------------------
// `mergeSessionCommandsIntoTurnsFromPath` keys on size + mtime, so once a log is
// known not to apply, later opens pay one stat instead of the read + parse.
const statStart = process.hrtime.bigint()
const repeat = 200
for (let i = 0; i < repeat; i += 1) fs.statSync(file)
const statMs = Number(process.hrtime.bigint() - statStart) / 1e6 / repeat

console.log('')
console.log('cost per open:')
console.log(`  cache miss (read ${readMs.toFixed(1)}ms + parse ${overheadMs.toFixed(1)}ms) ${scanMs.toFixed(1)}ms`)
console.log(`  cache hit  (stat only)                                   ${statMs.toFixed(3)}ms`)

// Gate: for a log big enough to matter, the stat that replaces the read has to
// be orders of magnitude cheaper, or the caching design buys nothing.
let failed = false
if (stat.size >= 1048576 && !(statMs * 20 < scanMs)) {
  console.error('')
  console.error(`FAIL: stat (${statMs.toFixed(3)}ms) is not far cheaper than read+parse (${scanMs.toFixed(1)}ms)`)
  failed = true
}
if (requireRecovery && !applies) {
  console.error('')
  console.error('FAIL: --require-recovery was set but this log carries no row the recovery recognises')
  failed = true
}

if (!failed) {
  console.log('')
  console.log('OK')
}
process.exit(failed ? 1 : 0)
