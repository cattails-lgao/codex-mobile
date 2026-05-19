### Provider-backed scheduled refreshes keep model menus populated

#### Feature/Change Name
Background ancillary refreshes preserve provider-specific models for selected Zen/OpenRouter threads.

#### Prerequisites/Setup
1. Use an isolated `CODEX_HOME` with an existing Zen or OpenRouter thread.
2. Copy Codex auth into that same `CODEX_HOME` so the global provider becomes Codex.
3. Start local Vite: `CODEX_HOME=<temp-home> pnpm run dev --host 127.0.0.1 --port 4173`.

#### Steps
1. In light theme, open the old provider-backed thread.
2. Wait for the background refresh after route load.
3. Open the model dropdown.
4. Confirm the dropdown is populated with that thread provider's models, not empty and not Codex/GPT models.
5. Hover or focus an assistant response and confirm copy/fork actions are visibly readable.
6. Repeat in dark theme and confirm the same provider-scoped model menu and response actions remain readable.

#### Expected Results
- Scheduled refreshes fetch provider models for provider-backed selected threads even when they are not doing an explicit provider-change refresh.
- The model dropdown never falls back to disabled `Model` or an empty list for a loaded provider-backed thread.
- Assistant copy/fork actions have readable contrast in both light and dark themes.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove the temporary isolated `CODEX_HOME` if it is no longer needed.

---
