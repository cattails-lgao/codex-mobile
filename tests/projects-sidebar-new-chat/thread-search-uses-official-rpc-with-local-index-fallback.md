# Manual Test: Thread search uses official RPC with local-index fallback

## Feature: Sidebar thread search prefers the official `thread/search` RPC

#### Prerequisites
- Dev server running on `http://127.0.0.1:4173/` with a reachable codex app-server.
- At least two existing threads whose titles/messages contain a distinct keyword (for example `codex`).

#### Steps
1. Open the sidebar search field (sidebar search button / `Chats` filter icon) and type a keyword that matches one or more threads, for example `codex`.
2. Wait ~220 ms debounce and confirm the sidebar filters to the matching threads.
3. Confirm the bridge request goes through the official RPC path: run
   `curl.exe -s --max-time 30 -X POST http://127.0.0.1:4173/codex-api/thread-search -H "Content-Type: application/json" -d '{"query":"codex","limit":200}'`
   and expect `{"data":{"threadIds":[...],"indexedThreadCount":0}}` with `threadIds` matching the filtered threads.
4. Optional parity check with the official RPC directly: POST `{"method":"thread/search","params":{"searchTerm":"codex"}}` to `/codex-api/rpc` and confirm the returned `data[].thread.id` set equals the `threadIds` from step 3.
5. Type a keyword that matches nothing, for example `zzzzz-no-match`, and confirm the sidebar shows no filtered results and the endpoint returns an empty `threadIds` array.

#### Expected Results
- Sidebar search filters threads by title/preview/message content using the app-server's official full-text search.
- `threadIds` in the `/codex-api/thread-search` response match the official `thread/search` RPC results.
- `indexedThreadCount` is `0` on the official path (the RPC does not expose an indexed count) and non-zero only on the local-index fallback path (older Codex CLI without `thread/search`).

#### Rollback/Cleanup
- Clear the sidebar search query.
- No persistent state is created; the endpoint is read-only.
