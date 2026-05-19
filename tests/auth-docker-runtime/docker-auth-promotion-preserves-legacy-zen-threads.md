### Docker auth promotion preserves legacy Zen threads

#### Feature/Change Name
Legacy OpenCode Zen threads remain readable and provider-locked, while new threads use Codex once valid Codex auth appears.

#### Prerequisites/Setup
1. Run `pnpm run build`.
2. Run `pnpm pack --pack-destination /tmp`.
3. Build a Docker image from the packed `codexapp` tarball with `@openai/codex` installed.
4. Start a fresh no-auth Docker container with an empty `CODEX_HOME`.
5. Keep a valid host `auth.json` available to copy into `/codex-home/auth.json`.

#### Steps
1. In light theme, open the no-auth container URL at a mobile viewport.
2. Send `hi` and wait for an assistant reply from the default OpenCode Zen fallback.
3. Confirm the composer model is `big-pickle`.
4. Copy valid Codex auth into the same container and restart the container.
5. Reload the same thread URL.
6. Confirm the previous Zen-backed messages still render and the composer model menu still shows only Zen models.
7. Send another `hi` in the same thread and wait for a Zen assistant reply.
8. Repeat the loaded-thread and model-label checks in dark theme.

#### Expected Results
- App-server config passively registers `opencode_zen` even when usable Codex auth suppresses the community fallback as the global provider.
- The route stays on the requested thread instead of redirecting home when the active provider's thread list omits the legacy thread.
- The UI renders a chat error with feedback if thread loading fails; it does not show an empty thread silently.
- After valid Codex auth promotion, the same thread remains on the Zen provider/model list, while a newly created thread uses Codex models.
- Follow-up sends recover from a restarted app-server process by resuming the thread once before retrying `turn/start`.

#### Rollback/Cleanup
- Stop the temporary Docker container and remove any copied `auth.json` from its `CODEX_HOME`.

---
