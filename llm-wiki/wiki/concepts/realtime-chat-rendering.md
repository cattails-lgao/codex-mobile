# Concept: Realtime Chat Rendering And Inline Media

## Summary

Realtime chat performance has two separate hot paths:

- frontend render work while assistant output streams
- server bridge payload sanitization when loading large historical sessions

The current implementation optimizes both enough for browser delivery: unchanged chat rows avoid repeated markdown/highlight work, high-frequency realtime item events do not trigger full thread refreshes, and inline image/base64 payloads are externalized before thread responses reach the UI.

Sources:
- [Realtime chat rendering and inline media notes](../../raw/features/realtime-chat-rendering-inline-media.md)
- [Integrated terminal source](../../raw/features/integrated-terminal.md)

## Frontend Rendering Model

`ThreadConversation.vue` uses a local markdown parser rather than a full markdown dependency. Streaming can be expensive if parser calls are made directly from template bindings, so the optimized path caches render inputs:

- message block cache keyed by message id, message text, and cwd
- inline segment cache keyed by source text
- markdown HTML cache keyed by cwd, text, and highlighter version
- highlighted code cache keyed by highlighter version, language, and code

Normal message rows are memoized with Vue `v-memo`, so unchanged visible rows are skipped while the active streaming row changes.

## Realtime Sync Model

The app should update live content from realtime notifications without repeatedly loading full thread state:

- `item/*` events update live assistant text, command output, reasoning, file changes, or plan state locally.
- message refresh is reserved for structural events such as `turn/started`, `turn/completed`, and `error`.
- thread list refresh is reserved for `thread/*` events and `turn/completed`.
- background thread pagination waits while turns are active, then resumes later.

This keeps sidebar pagination and thread reconciliation from competing with realtime rendering.

## Inline Media Sanitization

Large session JSONL files can contain repeated inline image data. The largest observed local sessions were tens of MB, mostly due to `data:image/...;base64,...` or bare PNG base64 in fields such as `payload.output[].image_url`, `payload.result`, `payload.content[].image_url`, `payload.images[]`, and replacement history.

The bridge should not send those strings directly to the browser. Instead, thread read/resume/fork/rollback responses are sanitized:

- inline data URLs are persisted to local temp media files
- bare base64 is externalized only when decoded bytes match PNG/JPEG/WebP/GIF signatures
- UI payload fields are rewritten to `/codex-local-image?path=...`
- non-image base64 and non-image data URLs are left untouched

This is a read-path/UI-payload optimization. It does not compact historical JSONL files on disk.

## Chat Link Parsing And Thread URLs

`ThreadConversation.vue` also owns local inline parsing for chat links. A PR #174 review follow-up established these rules for Codex thread links and bold-wrapped URLs:

- bare `codex://threads/<id>` should render as a browser-openable local web thread URL
- Markdown links such as `[Open thread](codex://threads/<id>)` should preserve the authored label as visible text while rewriting only the href
- the rewritten thread URL must use the current browser origin and app path, not a hardcoded `http://localhost:5173`
- bold and triple-asterisk wrappers around bare URLs or Markdown links should not leak literal `*` characters into visible text or hrefs

Review-bot comments on this path should be verified against current code before patching. In PR #174, Qodo and CodeRabbit surfaced three real issues: triple-asterisk parsing, Markdown label loss, and fixed-port thread URLs. The fixed-port issue was resolved by building local thread URLs from `window.location.origin` plus the current pathname, with a server-side fallback of `/#/thread/<id>`.

Source:
- [Codex thread link rendering and PR #174 review follow-up](../../raw/fixes/codex-thread-link-pr174.md)

## Verification Notes

Use `scripts/profile-testchat-realtime.cjs` for realtime rendering checks and `scripts/profile-browser-runtime.cjs` for startup/large-thread profiles.

Useful assertions:

- no persistent `todo-render-profile-*` directories remain after TestChat profiling
- long task count remains low/zero during streaming
- file links still render with correct href/title/text
- Codex thread links render with the current app origin; Markdown labels such as `Open thread` remain visible
- bold/triple-asterisk wrapped links render without stray `*` characters
- large image-heavy threads render images through `/codex-local-image`, not `data:` URLs
- `thread/resume` payloads stay bounded even when raw JSONL files are tens of MB
