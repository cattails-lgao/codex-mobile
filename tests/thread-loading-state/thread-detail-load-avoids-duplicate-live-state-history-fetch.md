### Thread detail load avoids duplicate live-state history fetch

#### Feature/Change Name
Normal thread detail loading calls `thread/read` directly instead of first calling `/codex-api/thread-live-state`, whose server path also reads full thread history.

Regression guard. As of the 2026-09-15 audit the endpoint has no client caller at all — nothing under `src/` references it and it is absent from the built `dist/assets` bundle — so the "instead of" half is currently satisfied trivially. Keep this test to catch a re-introduced duplicate full-history read.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Browser dev tools Network panel open
3. An existing thread with a large history

#### Steps
1. Open the existing thread
2. Inspect network/RPC calls during the message load

#### Expected Results
- The message load performs `thread/read` or `thread/resume` for the thread
- It does not call `/codex-api/thread-live-state` at all for the same normal message load
- Messages and active/in-progress state still render correctly

#### Rollback/Cleanup
- None

---
