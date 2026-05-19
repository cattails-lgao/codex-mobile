### Provider models load without Codex model-list dependency

#### Feature/Change Name
Provider-backed model selector startup loading.

#### Prerequisites/Setup
1. Build the project with `pnpm run build`.
2. Run a no-auth Docker container so Codex Web Local starts with OpenCode Zen fallback.
3. Open `http://127.0.0.1:<port>/#/` in the browser.

#### Steps
1. In light theme, open the home screen and wait for initial model loading.
2. Open the model selector.
3. Confirm Zen provider models are visible even if Codex `model/list` is slow or unavailable.
4. Confirm the selector starts with `big-pickle` and includes current Zen models such as `deepseek-v4-flash-free`.
5. Switch to dark theme and repeat steps 2 through 4.

#### Expected Results
- Provider-backed model loading asks `/codex-api/provider-models` before depending on `model/list`.
- OpenCode Zen models populate the selector without falling back to a blank list or stale Codex-only model list.
- The selector remains readable and usable in light theme and dark theme.

#### Rollback/Cleanup
- Stop the temporary Docker container when finished.

---
