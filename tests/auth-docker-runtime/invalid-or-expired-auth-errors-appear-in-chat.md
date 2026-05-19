### Invalid or expired auth errors appear in chat

#### Feature/Change Name
Invalid Codex auth failed-turn error rendering.

#### Prerequisites/Setup
1. Build the project with `pnpm run build`.
2. Build a fresh Docker image from the packed artifact.
3. Start a Docker container with an invalid or expired `auth.json` mounted into `CODEX_HOME`.
4. Open the container URL in the browser.

#### Steps
1. Confirm `config/read` uses the default Codex provider path, not OpenCode Zen fallback.
2. Send `hi` from the composer.
3. Wait until the turn stops running.
4. Reload or reopen the same thread.
5. Repeat in dark theme and light theme.

#### Expected Results
- The failed turn displays the final auth error in the chat, including the HTTP 401/unauthorized message from Codex.
- The failed turn includes a visible `Send feedback` button next to the persisted chat error.
- Once the failed turn is persisted, the live `Thinking` error overlay is gone so the final auth error is not duplicated.
- The conversation does not silently show only the user message after a failed turn.
- Reloaded thread history preserves the failed-turn error message.
- Transient retry messages may appear while reconnecting, but the final non-retry error remains visible after completion.
- In dark theme and light theme, the feedback button remains readable and opens a feedback mailto with the visible auth error included in the diagnostic body.

#### Rollback/Cleanup
- Stop the invalid-auth Docker container after verification.

---
