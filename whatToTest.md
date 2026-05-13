# What To Test

## Docker Provider/Auth Regression

- [ ] Build packaged app:
  - `pnpm run build`
  - `pnpm pack --pack-destination /tmp`
  - Build Docker image that installs the packed `codexapp` tarball plus `@openai/codex`.
- [ ] No-auth Docker startup:
  - Start a fresh container with no `/codex-home/auth.json`.
  - Verify `config/read` returns `model_provider="opencode-zen"` and `model="big-pickle"`.
  - Send `hi`; wait for assistant reply.
  - Capture screenshot.
- [ ] Provider switch:
  - Start from OpenCode Zen.
  - Send `hi`; wait for assistant reply.
  - Switch the Settings provider selector to OpenRouter. Do not change the model dropdown directly.
  - Send `hi`; wait for assistant reply.
  - Verify composer model changes to an OpenRouter model.
  - Capture screenshot.
- [ ] Invalid/expired auth file:
  - Mount `/codex-home/auth.json` with invalid token fields and old `last_refresh`.
  - Verify startup uses Codex provider path, not Zen fallback.
  - Send `hi`; wait for final 401/auth error in chat.
  - Verify `Send feedback` appears on the persisted error row.
  - Reload the same thread; verify the error persists.
  - Verify there is no duplicate live `Thinking` error overlay after persistence.
  - Capture light and dark screenshots.
- [ ] Malformed auth file:
  - Mount invalid JSON as `/codex-home/auth.json`.
  - Verify it is treated as unusable auth and falls back to OpenCode Zen.
  - Send `hi`; wait for assistant reply.
  - Capture screenshot.

## Model Loading

- [ ] Open the model dropdown after no-auth startup.
- [ ] Confirm Zen provider models load before Codex model list.
- [ ] Confirm stale models from a previous provider do not appear after provider switch.
- [ ] Confirm provider-scoped selected model persistence:
  - Pick a Zen model.
  - Switch to OpenRouter and pick an OpenRouter model.
  - Switch back to Zen.
  - Verify the previous Zen model is restored.

## Error Handling

- [ ] Confirm first-turn live-state materialization pending does not show a false chat error.
- [ ] Confirm failed turns render as persisted system chat messages.
- [ ] Confirm persisted failed-turn errors include the final non-retry error text, not only transient reconnect text.
- [ ] Confirm feedback mailto includes recent diagnostics and visible page text.

## Review/PR Checks

- [ ] Run focused unit tests:
  - `pnpm test:unit src/api/codexGateway.test.ts src/composables/useDesktopState.test.ts src/server/freeMode.test.ts src/server/codexAppServerBridge.archive.test.ts src/api/normalizers/v2.test.ts`
- [ ] Run production build:
  - `pnpm run build`
- [ ] Post PR comment `/review` after pushing changes.
- [ ] Re-check Qodo/CodeRabbit comments and fix only confirmed issues.
