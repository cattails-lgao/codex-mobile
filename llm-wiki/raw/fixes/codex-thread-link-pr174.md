# Codex Thread Link Rendering And Review Follow-Up

Captured: 2026-05-15

## Source Context

Branch: `codex/fix-bold-wrapped-chat-links`

Pull request: `friuns2/codexUI#174`

Relevant files:
- `src/components/content/ThreadConversation.vue`
- `tests.md`
- `scripts/profile-browser-runtime.cjs`

## Problem

Chat messages could expose markdown formatting markers or app-internal thread URLs in ways that were wrong for the web UI:

- Bold-wrapped links could show literal `**` around the link.
- Triple-asterisk-wrapped links such as `***https://example.com***` could leave stray `*` characters or include `*` in the href.
- Bare `codex://threads/<id>` links needed to become browser-openable web thread URLs.
- Markdown links such as `[Open thread](codex://threads/<id>)` needed to preserve `Open thread` as visible text while rewriting only the href.

## Review Findings

Qodo and CodeRabbit comments were treated as advisory findings and checked against the current code before changes were made.

Accepted findings:
- Triple-asterisk links were a real parser bug and were fixed with asterisk-wrapper handling shared by bare URL and markdown-link parsing.
- Markdown `codex://threads/<id>` links originally rendered the rewritten local URL as visible text; this was fixed so the authored Markdown label remains visible.
- `toLocalThreadUrl()` initially hardcoded `http://localhost:5173/#/thread/<id>`, which was a real portability bug for Vite auto-increment ports, `127.0.0.1:4173` profiling, and other origins.

Final thread-link behavior:
- Bare `codex://threads/<id>` renders as a local web thread URL.
- Markdown `[label](codex://threads/<id>)` renders `label` as visible text and points to the local web thread URL.
- The local web thread URL is built from the current `window.location.origin` and pathname, not a fixed `localhost:5173` origin. Server-side fallback returns `/#/thread/<id>`.

## Verification

Build and focused browser checks were run after the review follow-up:

- `pnpm run build:frontend` passed after temporarily symlinking the shared `node_modules` tree for this worktree.
- CJS Playwright opened `http://localhost:5174/#/thread/019e28d8-cf3b-7f63-a0fa-495a0c5c90bd`.
- The bare link `codex://threads/019e04cb-9670-7d91-be85-3ba35312170c` rendered as `http://localhost:5174/#/thread/019e04cb-9670-7d91-be85-3ba35312170c`.
- The Markdown link `[Open thread](codex://threads/019e04cb-9670-7d91-be85-3ba35312170c)` rendered visible text `Open thread` with href `http://localhost:5174/#/thread/019e04cb-9670-7d91-be85-3ba35312170c`.
- Light-theme and dark-theme link assertions both passed.
- `PROFILE_BASE_URL=http://localhost:5174 PROFILE_ROUTE='#/thread/019e28d8-cf3b-7f63-a0fa-495a0c5c90bd' PROFILE_WAIT_MS=7000 pnpm run profile:browser` completed.
- Profile result: `totalApiKB=239.3`, `threadRead=4` warning remained an existing route behavior, not caused by the parser/link change.

## PR Follow-Up

The dynamic-origin fix was committed as `7f6307b2 Use current origin for codex thread links` and pushed to PR `friuns2/codexUI#174`.

After the push:
- `/review` was posted as an ordinary PR comment.
- CodeRabbit status check passed.
- Qodo acknowledged the new review request and was still analyzing when checked shortly after the push; the old persistent comment still contained pre-fix text.
