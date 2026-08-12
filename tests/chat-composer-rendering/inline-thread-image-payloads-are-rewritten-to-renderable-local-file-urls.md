### Feature: Inline thread image payloads are rewritten to renderable local file URLs

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Have a thread that includes a user inline image block originally stored as a `data:` payload.

#### Steps
1. Open the thread in the chat UI.
2. Confirm the message area where the inline image appears.
3. Open Network tab and inspect `POST /codex-api/rpc` `thread/read` response.
4. Verify image block now has `type: "image"` and `url` with `file://...` (not `data:`).

#### Expected Results
- Inline `data:` image payload is not sent in RPC response.
- UI still renders the image from the generated local file URL.

#### Rollback/Cleanup
- No cleanup required.

## Feature: Video files preview inline in the message list (round-37)

#### Prerequisites
- Dev server at `127.0.0.1:4173`
- A small video file (`.mp4`/`.webm`/`.mov`/…) reachable from the workspace

#### Steps
1. Attach the video in the composer (photo-library input): confirm the attachment shows a `<video>` player (not an `<img>`), and the file also appears as a file chip.
2. Type a message and send it: confirm the optimistic user message renders the video inline with native controls.
3. Click the video in the message list: confirm the preview modal shows a `<video>` player with autoplay.
4. Paste a markdown `![](path/to/video.webm)` media line in a reply (or use a thread whose assistant reply contains one): confirm it renders as a video player, not a broken image.
5. Send the message and confirm the turn still runs (the video is skipped as model `input_image`; it is only passed as a file attachment).

#### Expected Results
- Video URLs (proxy URLs under `/codex-local-image`, local paths, or `data:video/*`) are detected by extension/MIME and render as `<video controls>` in the composer, the message list, and the preview modal.
- Inline `data:video/*` payloads in `thread/read` responses are externalized to local files (`.mp4`/`.webm`/…) served with a `video/*` content type.
- Sending a message with a video attachment does not fail the turn.

#### Rollback/Cleanup
- The test video can be removed from the workspace after the check.

## Feature: Attached images reach the model through the zen proxy (round-40)

#### Prerequisites
- Dev server at `127.0.0.1:4173`
- A project thread, an image file (`.jpg`/`.png`)

#### Steps
1. Attach the image in the composer, type a question such as "图片里有什么？" and send it.
2. Wait for the turn; confirm the model answers based on the image content instead of replying "图片内容无法直接读取" / "无法读取图片".
3. If the provider is rate-limited (429), the request is still correctly built: the app-server log shows the request body contains `{"type":"input_image","image_url":"data:image/..."}`.
4. Optional: check `src/server/unifiedResponsesProxy.ts` — `responsesInputToMessages` maps `input_image` parts to chat `image_url` content parts (the round-40 fix; before it, `image_url` was dropped and the model only saw the text placeholder).

#### Expected Results
- The zen proxy keeps the image as a multimodal `image_url` part in the upstream chat-completions payload.
- Model responses can reference the actual image pixels.

#### Rollback/Cleanup
- Roll back the test turn afterwards (回退此消息).
