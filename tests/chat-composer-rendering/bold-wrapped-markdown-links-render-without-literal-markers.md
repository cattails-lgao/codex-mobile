### Bold-wrapped Markdown links render without literal markers

#### Feature/Change Name
Bold-wrapped Markdown link marker cleanup in chat messages.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`).
2. A `TestChat` project/thread is available.
3. Light theme and dark theme are both available.

#### Steps
1. In light theme, open `TestChat`.
2. Send or inspect a message containing a bold-wrapped Markdown link, for example `**https://anyclaw.store/claim/a7m2z7**` or `**[claim link](https://anyclaw.store/claim/a7m2z7)**`.
3. Repeat with triple-asterisk wrapping: `***https://anyclaw.store/claim/a7m2z7***` and `***[claim link](https://anyclaw.store/claim/a7m2z7)***`.
4. Confirm the rendered row contains one clickable `a.message-file-link` for the URL.
5. Confirm no literal `**`, `***`, or stray `*` characters appear before or after the link.
6. Switch to dark theme and repeat steps 2 through 5.

#### Expected Results
- Bold-wrapped and triple-asterisk-wrapped bare URLs and Markdown links render as clickable links without visible Markdown emphasis markers.
- Existing URL/file-link href, title, and visible link text behavior is unchanged.
- Link color and contrast remain usable in light theme and dark theme.

#### Rollback/Cleanup
- Revert the parser change in `src/components/content/ThreadConversation.vue` if bold-wrapped links need to show raw Markdown markers again.

---
