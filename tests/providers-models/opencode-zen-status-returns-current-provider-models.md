### OpenCode Zen status returns current provider models

#### Feature/Change Name
OpenCode Zen free-mode status and model discovery consistency.

#### Prerequisites/Setup
1. Dev server or published CLI server running with no Codex auth so free mode defaults to OpenCode Zen.
2. Browser can open the home route in light theme and dark theme.

#### Steps
1. In light theme, open the home route.
2. Call `GET /codex-api/free-mode/status`.
3. Call `GET /codex-api/provider-models`.
4. Confirm both responses report OpenCode Zen data, including `big-pickle` and current Zen model ids such as `deepseek-v4-flash-free` when upstream returns it.
5. Confirm `/codex-api/free-mode/status` reports `wireApi` as `responses`.
6. Open the model selector immediately after initial page load and confirm the Zen models are available without first switching providers or refreshing settings.
7. In Chrome with a previously loaded app version, reload the page and confirm the service worker fetches the new script/style bundle instead of keeping stale cached selector behavior.
8. With a script/style bundle already cached by the service worker, temporarily make the same script/style request return HTTP 404 or 500 and reload.
9. Switch to dark theme and repeat steps 1 through 8.

#### Expected Results
- Free-mode status does not expose stale OpenRouter cached model ids when `provider` is `opencode-zen`.
- OpenCode Zen uses `responses`, not `chat`, in saved/default UI state.
- Provider model discovery and status agree on the model list source.
- Initial startup model loading uses the active provider context and does not leave GPT-only `model/list` entries as the visible selector list for OpenCode Zen.
- Selected model ids persist to localStorage by thread/provider context; legacy/global selected-model keys cannot choose a model for OpenCode Zen, while a valid provider-scoped OpenCode Zen saved choice is restored.
- Service-worker script/style cache invalidation does not keep Chrome on an older model-selector bundle after a new local build is served.
- Service-worker script/style fetches still use a cached bundle if the network request resolves with a non-OK HTTP status.
- Model selector content remains usable in light theme and dark theme.

#### Rollback/Cleanup
- None.

---
