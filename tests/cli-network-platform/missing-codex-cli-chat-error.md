### Missing Codex CLI chat error

#### Feature/Change Name
Fresh installs without a runnable Codex CLI show a visible chat runtime error.

#### Prerequisites/Setup
1. Start the app in an isolated environment without `codex` in `PATH` and without `CODEXUI_CODEX_COMMAND`.
2. Use a mobile viewport such as `390x844`.
3. Light theme and dark theme both available from the appearance switcher when the app can reach settings.

#### Steps
1. In light theme, open the app home/new chat screen.
2. Confirm the composer area shows `Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.`
3. Confirm the model dropdown no longer fails silently as the only visible symptom.
4. Switch to dark theme and repeat steps 1-3.

#### Expected Results
- The missing CLI condition is visible in the chat/composer area.
- The banner remains readable and does not overlap the mobile composer controls.
- Dark theme uses a dark error surface, not a light-theme panel.

#### Rollback/Cleanup
- Stop and remove the isolated container or test server.

---
