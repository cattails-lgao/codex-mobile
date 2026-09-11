// Bridge-level RPC profiler (round-76).
//
// The browser profiler (scripts/profile-browser-runtime.cjs) measures what the
// frontend sees, but it cannot show the bridge's own payload composition. This
// script talks to /codex-api/rpc directly so a perf round can report
//   - response bytes / wall time per RPC,
//   - how much the payload slimming (payloadSlimming.ts) actually removed,
//   - whether the thread/read result cache (threadReadCache.ts) served a repeat.
//
// Usage:
//   node scripts/profile-bridge-rpc.cjs
//   PERF_BASE_URL=http://127.0.0.1:4173 \
//   PERF_THREAD_ID=<threadId> \
//   node scripts/profile-bridge-rpc.cjs
//
// Pick a thread whose recent turns contain at least one command execution with
// output over COMMAND_OUTPUT_INLINE_LIMIT_BYTES (16KB), otherwise the spill
// counters are legitimately zero.
const BASE = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173'
const THREAD_ID = process.env.PERF_THREAD_ID || ''
const MB = 1048576

function readTurns(result) {
  if (!result || typeof result !== 'object') return []
  const thread = result.thread && typeof result.thread === 'object' ? result.thread : result
  return Array.isArray(thread.turns) ? thread.turns : []
}

// Thread item payloads are flat: the type discriminator and the fields live on
// the same object (`{ type: 'commandExecution', aggregatedOutput, ... }`), not
// under a nested key.
function slimStats(result) {
  const stats = {
    turns: 0, items: 0,
    commandBlocks: 0, commandTruncated: 0, omittedBytes: 0,
    mcpToolCall: 0, mcpResultFieldsRemaining: 0,
  }
  for (const turn of readTurns(result)) {
    stats.turns += 1
    for (const item of (Array.isArray(turn?.items) ? turn.items : [])) {
      if (!item || typeof item !== 'object') continue
      stats.items += 1
      if (item.type === 'commandExecution') {
        stats.commandBlocks += 1
        const spill = item.aggregatedOutputSpill
        if (spill && typeof spill === 'object' && Number(spill.omittedBytes) > 0) {
          stats.commandTruncated += 1
          stats.omittedBytes += Number(spill.omittedBytes) || 0
        }
      }
      if (item.type === 'mcpToolCall') {
        stats.mcpToolCall += 1
        if (Object.prototype.hasOwnProperty.call(item, 'result')) stats.mcpResultFieldsRemaining += 1
      }
    }
  }
  return stats
}

function printStats(label, result) {
  if (result == null) return null
  const s = slimStats(result)
  console.log(
    `${label.padEnd(30)} turns=${s.turns} items=${s.items} cmdBlocks=${s.commandBlocks} ` +
    `cmdTruncated=${s.commandTruncated} spilledMB=${(s.omittedBytes / MB).toFixed(2)} ` +
    `mcpCalls=${s.mcpToolCall} mcpResultLeft=${s.mcpResultFieldsRemaining}`,
  )
  return s
}

async function call(method, params, label) {
  const startedAt = Date.now()
  const res = await fetch(`${BASE}/codex-api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `perf-${label}`, method, params }),
  })
  const text = await res.text()
  const ms = Date.now() - startedAt
  const bytes = Buffer.byteLength(text, 'utf8')
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* keep raw */ }
  const result = parsed && typeof parsed === 'object' ? (parsed.result ?? parsed.error ?? null) : null
  console.log(`${label.padEnd(30)} http=${res.status} ms=${String(ms).padStart(6)} MB=${(bytes / MB).toFixed(2).padStart(7)}`)
  return { ms, bytes, result }
}

async function main() {
  console.log(`base=${BASE}`)
  if (!THREAD_ID) {
    console.log('\nPERF_THREAD_ID not set — only the thread list will be measured.')
    console.log('Set PERF_THREAD_ID=<threadId> to profile a heavy thread end to end.\n')
    await call('thread/list', {}, 'thread/list')
    return
  }
  console.log(`thread=${THREAD_ID}\n`)

  await call('thread/list', {}, 'thread/list')

  const resume = await call('thread/resume', { threadId: THREAD_ID }, 'thread/resume (cold)')
  const resumeStats = printStats('  slimming', resume.result)

  const read1 = await call('thread/read', { threadId: THREAD_ID, includeTurns: true }, 'thread/read #1 (cold)')
  printStats('  slimming', read1.result)
  const read2 = await call('thread/read', { threadId: THREAD_ID, includeTurns: true }, 'thread/read #2 (repeat)')

  console.log('\nsummary')
  console.log(`  thread/resume        ${resume.ms}ms  ${(resume.bytes / MB).toFixed(2)}MB`)
  console.log(`  thread/read repeat   ${read1.ms}ms(${(read1.bytes / MB).toFixed(2)}MB) -> ${read2.ms}ms(${(read2.bytes / MB).toFixed(2)}MB)`)
  if (resumeStats) {
    console.log(`  command spill        ${resumeStats.commandTruncated}/${resumeStats.commandBlocks} blocks, ${(resumeStats.omittedBytes / MB).toFixed(2)}MB omitted to disk`)
    console.log(`  mcp result leftover  ${resumeStats.mcpResultFieldsRemaining} (expected 0)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
