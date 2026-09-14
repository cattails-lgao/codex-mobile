#!/usr/bin/env node
/**
 * rescue-empty-preview.mjs — make vanished threads visible again.
 *
 * Why a thread can vanish
 * -----------------------
 * app-server derives a thread row's `preview` / `title` / `first_user_message` from the
 * thread's FIRST user message, after stripping the composer preamble
 * ("# Files mentioned by the user:" ... "## My request for Codex:"). When the first turn
 * carried an attachment or image but no typed body, the stripped body is empty, so all
 * three land as ''. `thread/list` filters `threads.preview <> ''` (the predicate is baked
 * into the list query *and* into the partial sort indexes of codex 0.153.4,
 * state/src/runtime/threads.rs:1077), so the row exists, keeps appending to its rollout,
 * and is invisible in every list.
 *
 * Why the obvious fixes do not work
 * ---------------------------------
 *   * `thread/metadata/update` patches gitInfo/projectId only; `thread/name/set` writes
 *     `name`, not `preview`; the server's own method enum has no preview setter.
 *   * `thread/read`, `thread/resume`, an extra turn, and an app-server restart all leave
 *     `preview` empty.
 *   * Writing `threads.preview` directly in state_*.sqlite does nothing: the rollout is
 *     the source of truth and state_*.sqlite is a WRITE-THROUGH CACHE. Verified twice —
 *     editing the column while the server runs has no effect on `thread/list`, and the
 *     value survives untouched in the file while the list keeps its old text.
 *
 * What does work
 * --------------
 * `thread/goal/set` appends a `thread_goal_updated` event to the ROLLOUT, and the
 * metadata derivation falls back to the goal objective when the first message body is
 * empty. Verified end to end against app-server 0.153.4 with an isolated CODEX_HOME,
 * driving the real codex-mobile server over /codex-api/rpc:
 *     thread/list before              : []
 *     thread/resume                   : OK
 *     thread/goal/set                 : OK   <- rollout gains thread_goal_updated
 *     thread/list after               : [both victims]        <- immediate, no restart
 *     thread/goal/clear               : OK   <- {cleared:true}, goal/get -> null
 *     thread/list after clear         : [both victims]        <- preview survives
 *     after a full app-server RESTART : [both victims]        <- persists
 *
 * `thread/resume` FIRST is not optional. Against a thread the app-server has not loaded,
 * goal/set silently updates only the `threads.preview` cache column and appends NOTHING
 * to the rollout — the RPC still answers OK, the list is unchanged, and a restart
 * re-derives the empty preview from the rollout. Resume loads the thread (and its
 * rollout writer); only then does the goal event actually land on disk.
 *
 * Requirements
 * ------------
 *   * Node >= 22.5 (node:sqlite) for discovery. Healing itself is plain HTTP.
 *   * codex-mobile must be RUNNING — the heal is an RPC to the live server, which is the
 *     process whose in-memory list the user sees. Loopback requests are authorised
 *     automatically (authMiddleware: localhost remote + localhost Host), so no cookie is
 *     needed when you run this on the same host.
 *
 * Usage
 *   node rescue-empty-preview.mjs                          # dry run, default home + port
 *   node rescue-empty-preview.mjs --url http://127.0.0.1:4173
 *   node rescue-empty-preview.mjs --apply                  # do it, then verify
 *   node rescue-empty-preview.mjs --thread <id> --apply
 *   node rescue-empty-preview.mjs --preview "clip.mp4" --apply
 *   node rescue-empty-preview.mjs --keep-goal --apply      # skip the goal/clear half
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

let DatabaseSync
try {
  ({ DatabaseSync } = await import('node:sqlite'))
} catch {
  console.error(`This script needs Node >= 22.5 for node:sqlite (found ${process.version}).`)
  process.exit(2)
}

const REQUEST_MARKER = '## My request for Codex:'

function parseArgs(argv) {
  const out = { apply: false, help: false, home: '', thread: '', preview: '', keepGoal: false, url: 'http://127.0.0.1:5900' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') out.apply = true
    else if (arg === '--keep-goal') out.keepGoal = true
    else if (arg === '-h' || arg === '--help') out.help = true
    else if (arg === '--home') out.home = argv[++i] ?? ''
    else if (arg === '--thread') out.thread = argv[++i] ?? ''
    else if (arg === '--preview') out.preview = argv[++i] ?? ''
    else if (arg === '--url') out.url = argv[++i] ?? ''
    else {
      console.error(`unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return out
}

function usage() {
  console.log(`rescue-empty-preview.mjs — heal threads hidden by an empty preview

  --home <dir>      CODEX_HOME to inspect (default: $CODEX_HOME or ~/.codex)
  --url <base>      running codex-mobile base URL (default http://127.0.0.1:5900)
  --thread <id>     only this thread id
  --preview <text>  force this fallback text instead of deriving it from the rollout
  --keep-goal       leave the goal in place instead of clearing it after the heal
  --apply           actually heal (default is a dry run)
  -h, --help        this message`)
}

const collapse = (value) => (value ?? '').replace(/\s+/g, ' ').trim()

/** Mirrors src/utils/turnPromptText.ts: typed body -> attachment label -> [Image] -> last resort. */
function derivePreview(rawText, hasImage = false) {
  const text = rawText ?? ''
  const idx = text.lastIndexOf(REQUEST_MARKER)
  const body = collapse(idx >= 0 ? text.slice(idx + REQUEST_MARKER.length) : text)
  if (body) return body.slice(0, 140)

  const preamble = idx >= 0 ? text.slice(0, idx) : ''
  const match = preamble.match(/^##\s+(.+?)\s*:\s*\S/m) || preamble.match(/^##\s+(.+?)\s*$/m)
  if (match) return match[1].trim().slice(0, 140)

  return hasImage ? '[Image]' : '[Attachment]'
}

function findStateDb(home) {
  const dbs = (fs.existsSync(home) ? fs.readdirSync(home) : [])
    .filter((name) => /^state_.*\.sqlite$/.test(name))
    .map((name) => path.join(home, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return dbs[0] ?? ''
}

/**
 * The thread's first real user turn, so we can rebuild the text the fixed composer would
 * have sent. `found: false` means the rollout has no user turn at all (unused/aborted
 * thread, not a victim). Injected blocks (`<environment_context>`, `<model_switch>`) and
 * `role: developer` entries are not user turns.
 */
function readFirstUserTurn(rolloutPath) {
  let raw
  try {
    raw = fs.readFileSync(rolloutPath, 'utf8')
  } catch {
    return { found: false }
  }
  const messages = []
  let hasImage = false
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    const payload = entry?.payload
    if (!payload) continue
    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      messages.push(payload.message)
      continue
    }
    if (payload.type !== 'message' || payload.role !== 'user') continue
    const blocks = Array.isArray(payload.content) ? payload.content : []
    if (blocks.some((block) => typeof block?.type === 'string' && block.type.includes('image'))) hasImage = true
    messages.push(blocks.map((block) => (typeof block?.text === 'string' ? block.text : '')).join('\n'))
  }

  let emptyTurn = false
  for (const message of messages) {
    if (message.includes(REQUEST_MARKER)) return { found: true, text: message, hasImage }
    const stripped = message.trim()
    if (!stripped) {
      emptyTurn = true
      continue
    }
    if (stripped.startsWith('<')) continue
    return { found: true, text: message, hasImage }
  }
  return emptyTurn ? { found: true, text: '', hasImage } : { found: false }
}

function rolloutCandidates(home, rolloutPath, threadId) {
  const list = []
  if (rolloutPath && fs.existsSync(rolloutPath)) list.push(rolloutPath)
  const sessions = path.join(home, 'sessions')
  if (threadId && fs.existsSync(sessions)) {
    const stack = [sessions]
    while (stack.length) {
      const dir = stack.pop()
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) stack.push(full)
        else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) list.push(full)
      }
    }
    list.sort()
  }
  return [...new Set(list)]
}

async function rpc(baseUrl, method, params) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/codex-api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`${method} -> HTTP ${response.status}: ${text.slice(0, 200)}`)
  }
  if (payload?.error) throw new Error(`${method} -> ${JSON.stringify(payload.error).slice(0, 240)}`)
  if (!response.ok) throw new Error(`${method} -> HTTP ${response.status}: ${text.slice(0, 200)}`)
  return payload?.result
}

async function listThreadIds(baseUrl) {
  const result = await rpc(baseUrl, 'thread/list', {
    archived: false, limit: 200, sortKey: 'updated_at', modelProviders: [],
  })
  return new Set((result?.data ?? []).map((thread) => thread?.id).filter(Boolean))
}

function collectPlan(home, args) {
  const dbPath = findStateDb(home)
  if (!dbPath) return { dbPath: '', plan: [], skipped: [] }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let columns = []
  try {
    columns = db.prepare('PRAGMA table_info(threads)').all().map((row) => row.name)
  } catch (error) {
    db.close()
    throw new Error(`cannot read the threads table: ${error.message}`)
  }
  const select = ['id', 'title', 'first_user_message', 'archived']
  if (columns.includes('rollout_path')) select.push('rollout_path')
  const where = ["preview = ''"]
  const params = []
  if (args.thread) {
    where.push('id = ?')
    params.push(args.thread)
  }
  const rows = db
    .prepare(`SELECT ${select.join(', ')} FROM threads WHERE ${where.join(' AND ')} ORDER BY created_at_ms`)
    .all(...params)
  db.close()

  const plan = []
  const skipped = []
  for (const row of rows) {
    let preview = args.preview
    let source = args.preview ? 'forced by --preview' : ''
    if (!preview) {
      for (const file of rolloutCandidates(home, row.rollout_path, row.id)) {
        const turn = readFirstUserTurn(file)
        if (!turn.found) continue
        preview = derivePreview(turn.text, turn.hasImage)
        source = path.basename(file)
        break
      }
    }
    if (!preview) {
      skipped.push(row.id)
      continue
    }
    plan.push({ row, preview, source })
  }
  return { dbPath, plan, skipped }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return 0
  }

  const home = args.home || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  console.log(`CODEX_HOME : ${home}`)
  console.log(`server     : ${args.url}`)
  console.log(`mode       : ${args.apply ? 'APPLY' : 'dry run (no RPC that changes state)'}\n`)

  const { dbPath, plan, skipped } = collectPlan(home, args)
  if (!dbPath) {
    console.error('no state_*.sqlite found in that CODEX_HOME — wrong --home?')
    return 1
  }
  console.log(`state DB   : ${dbPath}`)
  console.log(`candidates : rows whose preview is empty and whose rollout has a user turn`)

  if (skipped.length) {
    console.log(`skipped    : ${skipped.length} empty-preview row(s) with no user turn in the rollout`)
    console.log(`             (never-used threads, not victims)`)
  }
  if (!plan.length) {
    console.log('\nnothing to heal.')
    return 0
  }

  console.log('')
  for (const { row, preview, source } of plan) {
    console.log(`- ${row.id}${row.archived ? '  [archived]' : ''}`)
    console.log(`    preview '' -> ${JSON.stringify(preview)}   (from ${source})`)
    console.log(`    thread/resume  (loads the thread so the goal event reaches the rollout)`)
    console.log(`    goal/set objective=${JSON.stringify(preview)} status=complete`)
    if (!args.keepGoal) console.log(`    goal/clear (keeps the preview, removes the goal)`)
  }

  if (!args.apply) {
    console.log('\ndry run — re-run with --apply to heal through the running server.')
    return 0
  }

  let before
  try {
    before = await listThreadIds(args.url)
  } catch (error) {
    console.error(`\ncannot reach the running server: ${error.message}`)
    console.error('start codex-mobile first (the heal goes through its live app-server), or fix --url.')
    return 1
  }
  console.log(`\nthread/list currently returns ${before.size} thread(s)`)

  let healed = 0
  for (const { row, preview } of plan) {
    try {
      await rpc(args.url, 'thread/resume', { threadId: row.id, excludeTurns: true })
      await rpc(args.url, 'thread/goal/set', { threadId: row.id, objective: preview, status: 'complete' })
      if (!args.keepGoal) await rpc(args.url, 'thread/goal/clear', { threadId: row.id })
      healed += 1
      console.log(`  ${row.id}: resume + goal/set${args.keepGoal ? '' : ' + goal/clear'} ok`)
    } catch (error) {
      console.error(`  ${row.id}: FAILED — ${error.message}`)
    }
  }

  const after = await listThreadIds(args.url)
  console.log(`\nthread/list returns ${after.size} thread(s) now`)
  let missing = 0
  for (const { row } of plan) {
    const visible = after.has(row.id)
    if (!visible) missing += 1
    console.log(`  ${row.id}  ${visible ? 'VISIBLE' : 'still hidden — check the server log for the RPC error'}`)
  }
  console.log(`\nhealed ${healed}/${plan.length}${missing ? `, ${missing} not visible yet` : ', all visible'}.`)
  return 0
}

process.exit(await main())
