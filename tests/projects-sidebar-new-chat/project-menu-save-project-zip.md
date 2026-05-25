### Feature: Project menu Save project ZIP export

#### Prerequisites / Setup
- Start the app from a checkout with at least one saved local project root.
- Use a project folder containing a small known file, and ensure `.git` and `node_modules` may be present for exclusion checks.
- For chat export/import coverage, use an isolated `CODEX_HOME` containing at least one session JSONL whose `session_meta.payload.cwd` points at the project folder.

#### Actions
1. Open the sidebar project action menu in light theme.
2. Click `Save project`.
3. Confirm the browser receives a `.zip` download for the selected project.
4. Inspect the ZIP contents.
5. On the new-thread screen, click `Import Project` next to `Create Project`, choose the downloaded archive, and import it.
6. Switch to dark theme and repeat steps 1-3.

#### Expected Results
- The project menu contains `Save project` between `Browse files` and automation actions.
- Clicking `Save project` downloads a ZIP blob without navigating away from the app.
- The archive includes project files under relative paths.
- `.git`, `node_modules`, and `.DS_Store` entries are not included.
- Matching Codex session JSONL files are included under `.codex-project/chats/`.
- Import creates a new project folder, restores project files, registers the imported project in the sidebar, and writes imported chat sessions into the active `CODEX_HOME` with `cwd` rewritten to the new project folder.
- Imported chat sessions preserve their exported model and provider when the destination home can use them; imported OpenAI sessions fall back to the active free-mode provider when the destination home has no usable OpenAI/Codex auth.
- The menu item remains readable and aligned in both light and dark themes.

#### Rollback / Cleanup
- Delete the downloaded ZIP files from the browser download location.
- Delete the imported project folder and any imported test sessions from the isolated `CODEX_HOME`.
