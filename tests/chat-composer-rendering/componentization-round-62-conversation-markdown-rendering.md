# Componentization round-62: Conversation markdown/code rendering hook

Refactor of `ThreadConversation.vue` (no user-visible behavior change): the markdown/code-block rendering pipeline (highlight.js loading, LRU render caches, inline/block HTML builders, file-link URL mapping) was extracted into `useMarkdownRendering.ts` via dependency injection (`getCwd` + `isVideoMediaUrl`). This page is a smoke regression of the moved rendering surface.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation whose assistant text contains: a code fence with a language (e.g. ```` ```ts ````), bold/italic/inline code, a file link (e.g. `src/main.ts`), a table, and a blockquote.

## Actions and Expected Results

### Message rendering (template path)
1. Open the conversation. Expected: paragraphs, headings, blockquotes, bold/italic, inline code, and file links render exactly as before; file links are clickable and open `/codex-local-browse`.
2. For the code fence, verify highlighted code still renders with the `hljs` class (highlight.js lazy-loads on first code block) and scrolls/expands normally.
3. Confirm the reasoning/`ReasoningBlock` content (which uses `renderMarkdownBlocksAsHtml`) still shows correct HTML.

### File-link context menu
4. Right-click a `message-file-link`. Expected: the browse/edit context menu still appears with the same browse/edit URLs.

### Image panes
5. A message containing an embedded image/video renders in the image button/pane, and the image modal opens on click as before.

## Verification / Cleanup Notes

- No behavior change; this guards against extracting the rendering pipeline.
- Rollback: covered by `useMarkdownRendering.test.ts` (5 cases: inline-bold paragraph, block cache by cwd/text, code escaping, cache clear) plus `vue-tsc` and production build; revert `ThreadConversation.vue` wiring if a surface above misbehaves.