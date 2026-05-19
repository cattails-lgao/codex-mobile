### Error-triggered feedback button

#### Feature/Change Name
Feedback action appears in Settings and on visible error banners after captured UI/runtime/API failures, then opens prefilled email diagnostics.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173` or an alternate free port).
2. Browser devtools available to inject a test error or failed fetch.
3. Light theme and dark theme both available from the appearance switcher.

#### Steps
1. In light theme, load the home screen, open Settings, and confirm no `Send feedback` row is visible during a clean state.
2. Trigger a failure, for example run `fetch('/codex-api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })` in the browser console or open a folder path that produces a visible load error.
3. Reopen Settings and confirm a `Send feedback` row with `Issue detected` appears after the failed request is recorded.
4. Trigger or view a visible error banner, such as the missing Codex CLI composer banner, a chat send/connection error in the live conversation overlay, a settings provider error, a folder picker error, a Skills Hub error, or a branch dropdown error, and confirm that error state includes a compact `Send feedback` action.
5. Confirm no feedback action appears in the content header during normal use.
6. Click `Send feedback` and confirm the mail client opens a draft to `brutalstrikedevs@gmail.com`.
7. Confirm the draft body includes current URL, user agent, viewport, app/worktree version info, and recent diagnostics including the failed request or visible error.
8. Switch to dark theme and repeat steps 1-7.

#### Expected Results
- The settings feedback action is absent during normal operation.
- Runtime errors, unhandled rejections, failed fetches/API responses, and visible load failures make the Settings feedback action visible.
- Visible error states, including chat send/connection failures, include a local `Send feedback` action so the user can report the error from the same context.
- The generated `mailto:` draft is prefilled with useful diagnostics and does not submit anything automatically.
- No feedback action is shown in the app header during normal use.
- The Settings feedback row and visible-error feedback actions remain readable in light and dark themes.

#### Rollback/Cleanup
- Close the generated email draft without sending if this was only a test.

---
