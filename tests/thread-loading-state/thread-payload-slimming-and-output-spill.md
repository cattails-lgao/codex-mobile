# Feature: Thread payload slimming, command output spill, and read cache

Round-76 (v0.1.121). Verifies that heavy thread payloads are slimmed at the bridge, oversized command output is spilled to disk with an on-demand read-back, and repeat `thread/read` calls are served from cache.

## Prerequisites

- Dev server running on the port from the handover snapshot with `CODEXUI_API_PERF_LOGGING=1` (`CODEXUI_API_PERF_MS_THRESHOLD=100`) to see the `[codex-api-perf]` server log.
- A local thread whose last 10 turns are heavy — i.e. it contains at least one command execution whose output exceeds 16KB. The reference thread is `01a0465a-f570-78a0-ae6b-badc1c40b4e8` (its rollout segments are ~3.07MB and ~32.4MB).
- Browser DevTools open with the Network panel filtered to `/codex-api`.

## Steps

1. Open the thread route (`#/thread/<threadId>`). In the Network panel find `POST /codex-api/rpc` with `rpcMethod=thread/resume`.
2. Note the response body size.
3. Open the same thread a second time (or call `thread/read` with `includeTurns: true` twice).
4. Expand a command execution block whose output is large.
5. Click **"查看完整输出" / "Show full output"** in that block.
6. Load the home route (`#/`) with a warmed server and note the timings of the `/codex-api/*` requests.
7. Probe the read-back route directly:
   - `curl -s "http://127.0.0.1:<port>/codex-api/command-output?ref=<40-hex-sha1>" -w '\n%{http_code}\n'`
   - `curl -s "http://127.0.0.1:<port>/codex-api/command-output?ref=../../etc/passwd" -w '\n%{http_code}\n'`
   - `curl -s "http://127.0.0.1:<port>/codex-api/command-output?ref=0000000000000000000000000000000000000000" -w '\n%{http_code}\n'`

## Expected Results

- Step 2: the `thread/resume` response body for the reference thread is **~1.6MB**, not ~4.4MB. Reference measurement: 4,391.5KB → 1,599.1KB (−63.6%). The home route's total `/codex-api` bytes drop from 4,448.4KB to ~2,010.3KB.
- No `mcpToolCall` item in the payload carries a `result` field any more, and MCP tool-call blocks in the UI still render server/tool/status/error/duration normally (the field was never read by the frontend).
- Step 3: the second read is served from cache. Reference measurement: **1,745ms → 72ms** (server log `1717ms → 21ms`) while returning the same 1.56MB body.
- Step 4: the expanded block shows a truncation note such as `已省略 803.2 KB，共 803.4 KB` and a **"查看完整输出"** button, and the visible output keeps both the head and the tail of the original text (not only the head).
- Step 5: the button enters a loading state, then the full original text replaces the truncated text and the button disappears. A `GET /codex-api/command-output?ref=<sha1>` shows up in the Network panel and returns 200 in ~10–20ms.
- Block output that is **under** 16KB shows no truncation note and no button (unchanged rendering).
- Step 6: every `/codex-api/*` request on the warm home route is **under the 100ms perf-log threshold** (i.e. nothing appears in the server log), and the first contentful paint is in the same range as the pre-round-76 warm baseline (~250–450ms).
- Step 7: valid ref returns `200` with `{"text":"..."}`; the traversal attempt returns **400** `Invalid command output reference.`; the all-zero ref returns **404** `Command output is no longer available.`

## Rollback/Cleanup

- Spilled command output lives under the OS temp directory in `codex-web-command-output/` (sha1-named `.txt` files, one per oversized block, capped at 8MB each). It is safe to delete; the read-back route then returns 404 and the UI keeps showing the truncated inline text.
- No repository files are written by this feature.
