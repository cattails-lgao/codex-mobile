### Feature: Frontend missing-entry 404 page auto-redirects to chat

#### Prerequisites
- Build or runtime state where frontend entry cannot be served (for example missing `dist/index.html`).
- Start server and open the failing route in a browser.

#### Steps
1. Trigger the frontend missing-entry error page.
2. Confirm the page shows an error headline and a `Back to chat` link.
3. Wait 3 seconds without clicking the link.
4. Repeat and click `Back to chat` immediately.

#### Expected Results
- Error page still renders with the manual `Back to chat` link.
- Page automatically redirects to `/` after about 3 seconds.
- Manual link works instantly and is not blocked by the timer.

#### Rollback/Cleanup
- Restore frontend assets (`pnpm run build:frontend`) if they were intentionally removed for testing.
