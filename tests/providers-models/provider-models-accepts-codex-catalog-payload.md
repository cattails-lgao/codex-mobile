### Provider models accept Codex catalog payloads

#### Feature/Change Name
Provider-backed model discovery accepts both OpenAI-compatible and Codex catalog `/models` payloads.

#### Prerequisites/Setup
1. Build the project with `pnpm run build`.
2. Configure Codex with a `responses` provider whose `/models` endpoint returns `{"models":[{"slug":"..."}]}`.
3. Start the app and open it in the browser.

#### Steps
1. Open the model selector for the provider-backed thread or new-chat composer.
2. Confirm the selector includes model ids from the provider `models[].slug` payload.
3. Select one of the discovered models and start a new thread.

#### Expected Results
- `/codex-api/provider-models` returns model ids from either `data[].id` or `models[].slug`.
- The model selector is not reduced to only the configured fallback model when the provider returns a Codex catalog payload.
- Starting a thread passes the selected model id through to Codex.

#### Rollback/Cleanup
- Switch the provider back to the preferred default.

---
