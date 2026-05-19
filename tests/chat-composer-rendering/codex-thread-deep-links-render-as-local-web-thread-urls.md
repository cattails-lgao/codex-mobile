### Codex thread deep links render as local web thread URLs

#### Feature/Change Name
Codex thread link conversion in chat messages.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`).
2. A `TestChat` project/thread is available.
3. Light theme and dark theme are both available.
4. Note the current app origin from the browser address bar, for example `http://127.0.0.1:4173`.

#### Steps
1. In light theme, open `TestChat`.
2. Send or inspect a message containing a bare Codex thread link, for example `codex://threads/019e04cb-9670-7d91-be85-3ba35312170c`.
3. Send or inspect a message containing a Markdown Codex thread link, for example `[Open thread](codex://threads/019e04cb-9670-7d91-be85-3ba35312170c)`.
4. Confirm each rendered row contains a clickable `a.message-file-link`.
5. Confirm the bare link href and visible text both equal `<current app origin>/#/thread/019e04cb-9670-7d91-be85-3ba35312170c`, for example `http://127.0.0.1:4173/#/thread/019e04cb-9670-7d91-be85-3ba35312170c`.
6. Confirm the Markdown link href equals `<current app origin>/#/thread/019e04cb-9670-7d91-be85-3ba35312170c` and visible text equals `Open thread`.
7. Switch to dark theme and repeat steps 2 through 6.

#### Expected Results
- Bare `codex://threads/<id>` links render as local web thread URLs.
- Markdown links targeting `codex://threads/<id>` keep their Markdown label while linking to the local web thread URL.
- Link color and contrast remain usable in light theme and dark theme.

#### Rollback/Cleanup
- Revert the thread-link conversion in `src/components/content/ThreadConversation.vue` if `codex://threads/<id>` should render literally again.

---
