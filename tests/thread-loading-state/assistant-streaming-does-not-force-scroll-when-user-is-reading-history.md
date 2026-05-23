### Feature: Assistant streaming does not force-scroll when user is reading history

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Open a thread long enough to scroll.

#### Steps
1. Scroll up so latest message is not visible.
2. Send a new prompt and wait for assistant reply to stream.
3. Observe viewport while reply is in progress.
4. Click `Jump to latest` (or manually scroll to bottom).
5. Send another prompt and observe streaming behavior again.

#### Expected Results
- While scrolled up, streaming assistant output does not pull viewport to bottom.
- After returning to bottom, streaming output auto-follows newest content.

#### Rollback/Cleanup
- No cleanup required.
