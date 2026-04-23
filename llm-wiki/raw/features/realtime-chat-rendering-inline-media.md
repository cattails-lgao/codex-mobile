# Realtime Chat Rendering And Inline Media Notes

Captured: 2026-04-23

## Source Context

Branch: `codex/realtime-chat-render-cache`

Relevant files:
- `src/components/content/ThreadConversation.vue`
- `src/composables/useDesktopState.ts`
- `src/server/codexAppServerBridge.ts`
- `src/server/codexAppServerBridge.inlinePayload.test.ts`
- `scripts/profile-testchat-realtime.cjs`
- `scripts/profile-browser-runtime.cjs`

## Rendering Findings

- Streaming assistant text previously caused expensive markdown parsing, inline parsing, and syntax highlighting to be re-evaluated across visible chat rows.
- `ThreadConversation.vue` now caches:
  - parsed message blocks by message id/text/cwd
  - inline segments by source text
  - rendered markdown HTML by cwd/text/highlighter version
  - highlighted code HTML by highlighter version/language/code
- Normal message text flow uses Vue `v-memo` keyed by message id, message text, cwd, highlighter version, and markdown-image failure version.
- Scroll restoration is coalesced so streaming updates schedule at most one pending frame.
- File-link markdown parsing needed a guard so links and later inline code can coexist in the same message row.

## Sync Findings

- High-frequency `item/*` realtime events should update live UI state locally, not trigger full thread/message refreshes.
- Event-driven sync now refreshes selected messages only for structural events such as `turn/started`, `turn/completed`, and `error`.
- Thread list refresh is limited to `thread/*` events and `turn/completed`.
- Background thread pagination is delayed while any turn is active, then resumed after active turns finish.

## Inline Media Findings

- Large local JSONL sessions were mostly large because image data was stored inline as base64/data URIs.
- Example large-session inspection:
  - 40.4 MB session: roughly 18.1 MB in `payload.output[].image_url`, 11.1 MB in base64-like `payload.result`, plus duplicated image content in message image fields and replacement history.
  - 32.2 MB session: roughly 9.3 MB in `payload.content[].image_url` and duplicated `payload.images[]`, plus 5.95 MB in replacement-history image URLs.
  - 31.5 MB session: a mix of command output, function outputs, inline images, replacement history, and compacted/context data.
- Browser payloads were already bounded despite huge JSONL files:
  - 40.4 MB session loaded with about 310 KB `thread/resume` payload.
  - 32.2 MB session loaded with about 11.5 KB `thread/resume` payload.
  - 31.5 MB session loaded with about 393 KB `thread/resume` payload.
- `codexAppServerBridge.ts` sanitizes thread-turn payloads for thread read/resume/fork/rollback responses before sending them to the UI.
- Sanitization now externalizes inline image data from common fields including:
  - `url`
  - `image_url`
  - `images`
  - `result`
  - `b64_json`
  - `image`
- Bare base64 is treated as an image only when decoded bytes match supported signatures: PNG, JPEG, WebP, or GIF.
- Non-image base64 strings and non-image data URLs should remain unchanged.
- Sanitized inline images are persisted under a temp media directory and exposed through `/codex-local-image?path=...`.
- This bridge/read-path fix does not rewrite existing raw `.jsonl` files written by Codex app-server.

## Verification

- `pnpm run test:unit` passed with 2 files and 13 tests after edge coverage was added.
- `pnpm run build:frontend` passed.
- `pnpm run build:cli` passed.
- TestChat realtime profiler passed with cleanup enabled and no long tasks.
- Large image-heavy browser checks showed rendered images using `/codex-local-image`, not `data:` URLs.
- Markdown file-link regression passed with correct href/title/text plus bold and inline code in the same row.
