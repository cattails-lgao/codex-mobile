### Feature: Rollback debug logs controlled by `.env`

#### Prerequisites
- App server stopped.
- Edit `.env` directly, and use `.env.local` for private local overrides.

#### Steps
1. Set `ROLLBACK_DEBUG=0` and `VITE_ROLLBACK_DEBUG=0` in `.env`.
2. Start app and trigger rollback auto-commit/message-changes flow.
3. Verify `[rollback-debug]` logs are not emitted in terminal/browser console.
4. Set `ROLLBACK_DEBUG=1` and `VITE_ROLLBACK_DEBUG=1` in `.env`.
5. Restart app and trigger the same flow again.
6. Verify `[rollback-debug]` logs appear in terminal/browser console.

#### Expected Results
- Debug logs are disabled when env flags are `0`.
- Debug logs are enabled when env flags are `1`.

#### Rollback/Cleanup
- Restore `.env` values to preferred defaults.
