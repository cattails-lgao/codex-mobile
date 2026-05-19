### ChatGPT auth tokens refresh for external auth

#### Feature/Change Name
Codex app-server `account/chatgptAuthTokens/refresh` requests are handled automatically from `auth.json` so expired ChatGPT access tokens can be refreshed without a manual relogin.

#### Prerequisites/Setup
1. App server is running from this repository
2. `$CODEX_HOME/auth.json` contains ChatGPT auth with a valid `refresh_token`
3. The current ChatGPT `access_token` is expired or close enough to expiry that Codex app-server asks for token refresh

#### Steps
1. Open the app with the ChatGPT-authenticated account selected
2. Trigger an account operation such as loading account rate limits or starting a normal Codex turn
3. Watch the server logs for an `account/chatgptAuthTokens/refresh` server request
4. Reopen `$CODEX_HOME/auth.json`
5. Repeat the same account operation after the refresh completes

#### Expected Results
- The refresh request is answered automatically and does not appear as a manual pending request in the UI
- `auth.json` is updated with the fresh `access_token` and any rotated `refresh_token` or `id_token`
- The account operation succeeds without showing `token_expired`
- If no refresh token is available, the operation fails with a sign-in-again message instead of silently looping

#### Rollback/Cleanup
- None, unless a test-only `$CODEX_HOME` was used

---
