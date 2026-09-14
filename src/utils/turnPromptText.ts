// A turn's composed text must never be blank when the turn carries any payload.
//
// app-server derives a thread row's `preview` / `title` / `first_user_message` from the
// thread's first user message, and `thread/list` only returns rows with `preview <> ''`
// — the filter is baked into the list query *and* into the partial sort indexes of
// codex 0.153.4 (`state/src/runtime/threads.rs`). A first turn whose body ends up empty
// therefore creates a thread that exists on disk, keeps appending to its rollout, but is
// invisible in every list (`thread/list`, search, pinned sections) — and no RPC can write
// `preview` back afterwards (`thread/metadata/update` only patches gitInfo/projectId), so
// the thread is unrecoverable.
//
// Reproduced live against app-server 0.153.4 with an isolated CODEX_HOME:
//   attachments + "## My request for Codex:" + empty body -> preview/title/fum all ''
//   empty text block (image-only send)                   -> preview/title/fum all ''
//   plain text prompt (control)                          -> metadata = the prompt
// 1 of 3 rows was visible in the list query's terms.
//
// The composer legitimately allows sending an attachment or image with no typed text,
// so the blank body has to be substituted before composing the request text. The order
// mirrors the sidebar title fallback in useDesktopThreadTitleCache
// (attachment label -> "[Image]") so the server-side metadata and the label the UI
// already shows agree.
export function resolveTurnPromptText(
  text: string,
  fileAttachments: ReadonlyArray<{ label?: string }> = [],
  imageUrls: ReadonlyArray<string | null | undefined> = [],
): string {
  if (text.trim().length > 0) return text

  const label = fileAttachments
    .map((attachment) => (attachment.label ?? '').trim())
    .find((candidate) => candidate.length > 0)
  if (label) return label

  if (imageUrls.some((url) => (url ?? '').trim().length > 0)) return '[Image]'

  // Skills-only turns are not reachable from the composer; keep a harmless last resort
  // instead of ever composing a blank body.
  return '[Attachment]'
}
