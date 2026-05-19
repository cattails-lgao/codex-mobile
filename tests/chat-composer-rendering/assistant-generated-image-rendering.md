### Assistant generated image rendering

#### Feature/Change Name
Codex app-server generated image items render as assistant image previews.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A Codex thread that has completed an image generation turn, or a test app-server payload containing either `type: "imageGeneration"` with a base64 `result` or `type: "imageView"` with an absolute image `path`

#### Steps
1. Open the thread in CodexUI
2. Locate the completed image generation turn
3. Inspect the assistant response area where the generated image should appear
4. Click the generated image preview

#### Expected Results
- The generated image item appears as an assistant image preview instead of disappearing from the conversation
- The preview is rendered larger than normal user attachment thumbnails and keeps its aspect ratio
- Clicking the preview opens the existing image modal
- The image is served through `/codex-local-image?path=...`

#### Rollback/Cleanup
- Delete any temporary generated image files if they were created only for this test

---
