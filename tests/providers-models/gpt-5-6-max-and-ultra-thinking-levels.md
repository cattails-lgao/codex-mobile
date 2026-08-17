### GPT-5.6 Max and Ultra thinking levels

#### Feature/Change Name
The model-strength (Thinking) selector is capped to `low` / `medium` / `high` for every model, regardless of the model's declared `supportedReasoningEfforts`. Provider-only models (org.opencode / OpenCode Zen) that omit the field no longer fall back to the full 8-entry list (`none`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`/`ultra`); the fixed dropdown catalog in `ThreadComposer.vue` was trimmed to the three commonly used tiers.

> Note: this supersedes the previous behavior where GPT-5.6 Sol/Terra exposed `Max`/`Ultra`, GPT-5.6 Luna exposed `Max`, and GPT-5.5 exposed neither, all driven by each model's `supportedReasoningEfforts`. That array is still read, but it is now intersected with the trimmed Low/Medium/High catalog, so `xhigh`/`max`/`ultra`/`none`/`minimal` are never offered in the selector.

#### Prerequisites/Setup
1. Install a Codex CLI version whose model catalog includes GPT-5.6 and its reasoning levels.
2. Sign in with an account that can use a GPT-5.6 model, or configure a provider-only model (e.g. org.opencode / OpenCode Zen).
3. Build and start the app.

#### Steps
1. Start a new chat and select `GPT-5.6-Sol` / `GPT-5.6-Terra` / `GPT-5.5`, one at a time.
2. Open the Thinking selector and confirm it lists only `Low`, `Medium`, `High` — no `None`, `Minimal`, `Extra high`, `Max`, or `Ultra`.
3. Select a provider-only model (org.opencode / OpenCode Zen) and open the Thinking selector; confirm it also lists only `Low` / `Medium` / `High` (no fallback to the full 8-entry list).
4. Select `Medium` and send a prompt; confirm the turn receives the exact lowercase `medium` value.
5. Switch from a model configured with `High` to a model whose declared default differs, and confirm the selector follows the selection rules (default effort when available, else `medium`, else the first supported tier).
6. Switch to dark theme and repeat the selector visibility checks.
7. Reload the page with a configured effort and confirm the selection persists and stays valid.

#### Expected Results
- The Thinking selector shows exactly `Low` / `Medium` / `High` for every model, in both light and dark themes.
- Provider-only models with no declared `supportedReasoningEfforts` never surface `Ultra`/`Max`/`Minimal`/`None`/`Extra high`.
- The selected value passes as the exact lowercase `low` / `medium` / `high` to Codex.
- A configured effort survives config normalization and appears selected after refresh.

#### Rollback/Cleanup
- Restore the full 8-tier catalog by reverting `reasoningOptionCatalog` in `ThreadComposer.vue` (add back `none`/`minimal`/`xhigh`/`max`/`ultra`).
- Restore the preferred model and thinking level.

---
