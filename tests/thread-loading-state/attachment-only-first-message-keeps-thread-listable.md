# Feature: Attachment-only first message keeps its thread listable

A thread whose first turn carries an attachment (or an image) but no typed text used to
compose a request whose body was empty:

```
# Files mentioned by the user:

## clip.mp4: C:\tmp\clip.mp4

## My request for Codex:

```

app-server derives `threads.preview` / `title` / `first_user_message` from the thread's
first user message, and its list query only returns rows with `preview <> ''` (the filter
is compiled into the query and into the partial sort indexes of codex 0.153.4). All three
columns therefore became empty strings and the row was dropped from `thread/list` — the
thread existed on disk and kept appending to its rollout, but disappeared from the
sidebar, from search, and from pinned sections. `thread/metadata/update` can only patch
`gitInfo` / `projectId`, so there is no RPC that can write `preview` back and the thread
was unrecoverable.

`resolveTurnPromptText` (`src/utils/turnPromptText.ts`) now substitutes a non-empty body
before composing: first attachment label, else `[Image]`, else `[Attachment]`.

## Prerequisites

- A local dev server (`pnpm run dev --host 127.0.0.1 --port 4173`) and a working model.
- One attachment to send, e.g. a small video or text file.

## Steps

1. Start a **new** chat and attach a file (do not type any text).
2. Send the message.
3. Wait for the turn to finish, then reload the page.
4. Look at the sidebar row for the new thread and open it.
5. Repeat with an image-only message (attach a picture, no text).

## Expected Results

- The message is sent as `… ## My request for Codex:` followed by the attachment's file
  name (e.g. `clip.mp4`); the model answers normally.
- The new thread **appears in the sidebar** with the file name as its placeholder title,
  both before and after a reload (previously it vanished entirely).
- Opening the thread shows the message and the attachment chip.
- The image-only case behaves the same way, with the image's file name as the body; a
  remote image URL falls back to `[Image]`.

## Rollback/Cleanup

- Delete the probe threads from the sidebar (inline delete) if they are not wanted.

## Automated evidence

- Isolated app-server 0.153.4 reproduction (`output/repro-empty-first-message.py`): the
  old composition and an empty text block both produced `preview = ''` and only 1 of 3
  rows was visible; the fixed composition (`output/verify-fixed-composition.py`) produces
  `preview = 'clip.mp4'` and 2 of 2 rows visible (VERDICT: PASS).
- Unit tests: `src/utils/turnPromptText.test.ts` (4) and
  `src/api/gateway/threads.blankPrompt.test.ts` (3).
