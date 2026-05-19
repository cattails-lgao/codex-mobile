### Feature: Sentry error tracking and encrypted auth context

#### Prerequisites
- Sentry project `node-express` in org `dfv-p0` accessible.
- Valid `~/.codex/auth.json` with `tokens.account_id` and `tokens.access_token`.
- Project built: `pnpm run build:cli`.

#### Steps
1. Start the CLI: `node dist-cli/index.js --no-tunnel --no-open --no-login`.
2. Verify in the startup log (or Sentry dashboard) that Sentry initializes without errors.
3. Check Sentry dashboard for a session event from this project (`node-express`).
4. Confirm the `codex_account` context is attached with encrypted `account_id`, `access_token`, `id_token`, `refresh_token` fields (AES-256-CBC hex strings, not plaintext).
5. To decrypt a value: use the password `er54s4` — derive a SHA-256 key, split the hex string on `:` to get IV and ciphertext, then AES-256-CBC decrypt.

#### Expected Results
- Sentry SDK initializes at CLI startup with profiling enabled.
- `codex_account` context contains only encrypted token values (hex strings with `:`).
- No plaintext tokens appear in Sentry events.
- CLI startup is not blocked or slowed noticeably by Sentry init.

#### Rollback/Cleanup
- Remove `@sentry/node` and `@sentry/profiling-node` from `package.json` and delete `src/cli/instrument.ts` to fully revert.

---
