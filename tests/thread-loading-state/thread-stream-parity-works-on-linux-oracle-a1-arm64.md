### Feature: Thread stream parity works on Linux (Oracle A1 ARM64)

#### Prerequisites
- Oracle A1 server accessible via SSH (`ssh a1`).
- Codex CLI installed on A1 (`codex --version` works).
- Existing Codex sessions with commands and file edits on A1.

#### Steps
1. Clone or pull branch `codex/thread-stream-parity` on A1 into `~/codexui`.
2. Run `pnpm install` and start dev server: `pnpm run dev --host 0.0.0.0 --port 4173`.
3. From A1 locally, call `curl http://localhost:<port>/codex-api/rpc -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"thread/list","params":{},"id":1}'` and verify thread list returns.
4. Pick a thread with known commands and file edits (e.g., MCP server deploy thread).
5. Call `curl http://localhost:<port>/codex-api/thread-live-state?threadId=<id>` and inspect response.
6. Verify `conversationState.turns[*].items` contains `commandExecution` items recovered from session log with correct `command`, `status`, and `aggregatedOutput`.
7. Verify `fileChange` items recovered from `apply_patch` session log entries with `changes[].path`, `changes[].operation`, and `changes[].diff`.
8. Verify items are interleaved chronologically with `agentMessage` items (not all commands at the start or end).
9. Test from Mac via Tailscale: `curl --http1.1 http://100.127.77.25:<port>/codex-api/thread-live-state?threadId=<id>` (use `--http1.1` to avoid Vite HTTP/2 upgrade hang).

#### Expected Results
- Bridge server starts and spawns Codex app-server on Linux ARM64 without errors.
- `thread/list` RPC returns all threads from `~/.codex/sessions/`.
- `thread-live-state` returns full turn history with recovered `commandExecution` and `fileChange` items.
- Session log parsing works with Linux file paths (`/home/ubuntu/.codex/sessions/...`).
- Chronological interleaving matches the order seen on macOS (commands appear between agent messages, not appended).
- Tailscale remote access works with `--http1.1` flag.

#### Verified Results (2026-04-08)
- A1 server: Ubuntu ARM64, Node v22.22.0, Codex CLI 0.101.0.
- Thread `019d62d5-9fa7-7ad2-bab7-b5225d617734`: 21 turns, 120 commands, 17 file changes recovered.
- Thread `019d6a60-d303-7d50-bdf3-7a7f7e38abb1`: 10 turns, 62 commands, 3 file changes recovered.
- Thread `019d658d-ca06-7c80-8ef6-ee22c828b407`: 4 turns, 73 commands, 7 file changes recovered.
- All items correctly interleaved with agent messages in chronological order.
- Command content verified: `command`, `status`, `aggregatedOutput` fields present.
- File change content verified: `changes[].path`, `changes[].operation`, `changes[].diff` fields present.

#### Rollback/Cleanup
- Stop the dev server on A1: `pkill -f vite`.
