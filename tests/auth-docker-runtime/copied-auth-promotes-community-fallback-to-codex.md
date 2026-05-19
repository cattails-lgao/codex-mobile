### Copied auth promotes community fallback to Codex

#### Feature/Change Name
Runtime auth detection after starting without auth.

#### Prerequisites/Setup
1. Run `pnpm run build`.
2. Run `pnpm pack --pack-destination /tmp`.
3. Build a Docker image from the packed `codexapp` tarball with `@openai/codex` installed.
4. Start a fresh no-auth container with an empty mounted `CODEX_HOME`.
5. Keep a valid host `auth.json` available to copy into that mounted `CODEX_HOME`.

#### Steps
1. Open the no-auth container and confirm the provider is OpenCode Zen with `big-pickle`.
2. Switch the Settings provider selector to OpenRouter while still unauthenticated.
3. Copy a valid `auth.json` into the mounted `CODEX_HOME`.
4. Reload the page.
5. Confirm the provider has moved to Codex, the composer shows a concrete Codex model instead of a generic `Model` placeholder, and the Accounts count imports the active auth account.
6. Confirm the sidebar does not show a stale `Send feedback` / `Issue detected` row when there is no current visible error.
7. Send `hi` on the Codex provider and wait for an assistant reply.

#### Expected Results
- Community fallback providers are suppressed once usable Codex auth appears.
- User-configured providers with a custom key or custom endpoint remain available and are not suppressed.
- The app refreshes model metadata after provider promotion so the composer does not stay on a generic `Model` label.
- The copied auth file is imported into the accounts list without requiring a manual Reload click after Codex quota metadata loads successfully.
- Invalid or expired copied auth is not imported during startup before a successful quota read, so the first failed send still renders a chat error instead of leaving the thread empty.
- The Settings feedback row is hidden after provider/account recovery unless there is still a visible error.
- The Codex provider can send a message successfully after auth promotion.

#### Rollback/Cleanup
- Stop the temporary container and remove its mounted `CODEX_HOME` directory.

---
