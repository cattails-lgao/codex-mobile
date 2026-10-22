// Bounded-memory line access to a codex rollout (`sessions/**.jsonl`).
//
// round-185: every session-log consumer in the bridge used to do
// `await readFile(sessionPath, 'utf8')` and then `split('\n')`. That is fine for
// the 0.5–5MB logs it was written against, and fatal for the logs real threads
// grow into: measured on the 181MB thread on the production server, a **single**
// `thread/read` took the bridge from 438MB to 1027MB RSS (+589MB retained
// afterwards) and four concurrent reads — which is just a user reopening a
// couple of tabs — pushed the loopback bridge past its ~991MB V8 heap limit and
// killed it (`v8::String::NewFromUtf8` + `node::StringDecoder::DecodeData` in
// the core dump). While it was down every `/codex-api/rpc` call failed, which
// the UI showed as "I clicked save and nothing happened".
//
// A whole-file string costs roughly 2x the file (UTF-8 bytes -> UTF-16 string),
// `split` allocates a string per line on top, and each `JSON.parse` builds the
// row's object graph. Streaming removes all three: the peak is one line plus the
// rows the caller actually keeps, independent of how large the log is.
//
// The readers are deliberately *not* size-capped. Skipping recovery on large
// logs would trade a crash for silently missing commands/skill chips, which is
// the same bug wearing a different hat — every consumer gets the identical rows
// it always got, just without materialising the file first.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

/**
 * 64KiB chunks: large enough that the syscall count on a 181MB log stays in the
 * thousands, small enough that the buffer itself is never interesting to the
 * heap.
 */
const SESSION_LOG_READ_CHUNK_BYTES = 64 * 1024

/**
 * A line source. **Async** iterable on purpose: a `string` is an
 * `Iterable<string>`, so allowing sync iterables here would let a caller pass a
 * raw log where lines are expected and silently scan it one character at a time.
 */
export type SessionLogLineSource = AsyncIterable<string>

/**
 * Stream the lines of `sessionPath`, one at a time.
 *
 * `crlfDelay: Infinity` makes a lone `\r` a line break too, so CRLF logs split
 * exactly like `raw.split('\n')` did (the callers trim the trailing `\r` away
 * via `JSON.parse`). An unterminated final line is still yielded — the file may
 * be mid-append while we read it, and `split('\n')` behaved the same way.
 *
 * The stream is destroyed in `finally` so a caller that breaks out early (or
 * throws while parsing a row) cannot leak the file descriptor.
 */
export async function* iterateSessionLogLines(sessionPath: string): AsyncGenerator<string> {
  const stream = createReadStream(sessionPath, {
    encoding: 'utf8',
    highWaterMark: SESSION_LOG_READ_CHUNK_BYTES,
  })
  const reader = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of reader) yield line
  } finally {
    reader.close()
    stream.destroy()
  }
}

/**
 * The same lines from a string that is already in memory. Used by the raw-log
 * entry points (`mergeSessionSkillInputsIntoTurns` / `mergeSessionCommandsInto-
 * Turns`, kept for the rpc echo path and for unit tests); it slices lazily
 * instead of building the whole `split` array.
 */
export async function* iterateSessionLogLinesFromText(raw: string): AsyncGenerator<string> {
  let start = 0
  while (start <= raw.length) {
    const newlineAt = raw.indexOf('\n', start)
    if (newlineAt < 0) {
      // `split('\n')` yields a trailing '' for a trailing newline; keeping the
      // same shape means callers that skip blank lines behave identically.
      yield raw.slice(start)
      return
    }
    yield raw.slice(start, newlineAt)
    start = newlineAt + 1
  }
}

/**
 * The `session_meta` line — always the first one — without reading the rest.
 *
 * `readSessionMetaCwd` / `readSessionMetaId` already only ever parsed line 1;
 * the project-ZIP exporter was nevertheless reading every rollout in full to
 * hand them that line (round-185: one of the four whole-file reads).
 */
export async function readSessionLogFirstLine(sessionPath: string): Promise<string> {
  for await (const line of iterateSessionLogLines(sessionPath)) return line
  return ''
}
