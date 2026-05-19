### Docker provider checklist and live error overlay regression

#### Feature/Change Name
Docker provider/auth checklist execution and live error overlay de-duplication.

#### Prerequisites/Setup
1. Run `pnpm run build`.
2. Run `pnpm pack --pack-destination /tmp`.
3. Build a Docker image from the packed `codexapp` tarball with `@openai/codex` installed.
4. Start three isolated containers:
   - no auth file
   - invalid or expired `auth.json`
   - malformed `auth.json`

#### Steps
1. In light theme, open the no-auth container, confirm the composer starts on `big-pickle`, send `hi`, and wait for an assistant reply.
2. Switch the Settings provider selector to OpenRouter, send `hi` again, and wait for a reply or provider-scoped response.
3. Open the invalid-auth container, send `hi`, wait for the final 401/auth error, and confirm `Send feedback` is visible.
4. Reload the invalid-auth thread and confirm the persisted error remains without a duplicate live `Thinking` error overlay.
5. Switch the invalid-auth thread to dark theme and confirm the persisted error and feedback button remain readable.
6. Open the malformed-auth container, confirm it falls back to `big-pickle`, send `hi`, and wait for an assistant reply.

#### Expected Results
- No-auth startup uses the OpenCode Zen runtime fallback and sends successfully.
- Runtime `-c` provider config uses underscore-safe provider ids, so Zen/OpenRouter/custom providers are actually registered with Codex app-server.
- Provider switching is scoped to the selected provider and does not require changing the model dropdown directly.
- Invalid/expired auth stays on the Codex provider path and renders the final auth failure as a persisted chat error.
- A new live error is still visible when an older persisted turn error exists, but the same live error is suppressed after that exact error has persisted.
- Feedback mailto diagnostics include recent diagnostics, visible page text, and the visible auth error.
- Malformed auth is treated as unusable auth and falls back to Zen.

#### Rollback/Cleanup
- Stop temporary containers with `docker rm -f codexui-what-noauth codexui-what-invalid-auth codexui-what-malformed-auth`.

---
