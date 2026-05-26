### Feature: Project menu Save project ZIP export

#### Prerequisites / Setup
- Start the app from a checkout with at least one saved local project root.
- Use a project folder containing a small known file, and ensure generated folders such as `.git`, `node_modules`, `.venv`, `.cache`, `.next`, `.gradle`, `target`, and `__pycache__` may be present for exclusion checks.
- For chat export/import coverage, use an isolated `CODEX_HOME` containing multiple session JSONL files whose `session_meta.payload.cwd` points at the project folder, plus thread rows in `state_5.sqlite` with generated titles and distinct `updated_at` values.

#### Actions
1. Open the sidebar project action menu in light theme.
2. Click `Save Project to Zip`.
3. Confirm the browser receives a `.zip` download for the selected project.
4. Inspect the ZIP contents.
5. Open a thread action menu for a thread inside the same project, click `Save Project to Zip`, and confirm it downloads the same project ZIP.
6. On the new-thread screen, click `Import Project` next to `Create Project`, choose the downloaded archive in the ZIP file picker, and import it.
7. Switch to dark theme and repeat steps 1-3.

#### Expected Results
- The project menu contains `Save Project to Zip` between `Browse files` and automation actions.
- Each thread menu contains `Save Project to Zip` after `Browse files`, exporting that thread's project folder, including projectless chat folders and other local directories.
- Clicking `Save Project to Zip` shows progress while the ZIP downloads into a blob, then saves the blob without navigating away from the app.
- The archive includes project files under relative paths.
- `.git`, `node_modules`, common language/package cache folders, standard virtualenv folders, build output folders, coverage folders, OS metadata files, and Git-ignored files are not included when export runs inside a Git repo.
- Existing non-chat files under a project's `.codex-project/` folder round-trip through import; chat JSONL files under `.codex-project/chats/` are handled as imported Codex sessions.
- Matching Codex session JSONL files are included under `.codex-project/chats/`.
- Matching thread titles and update timestamps are included under `.codex-project/chats/thread-titles.json`.
- Import creates a new project folder, restores project files, registers the imported project in the sidebar, and writes imported chat sessions into the active `CODEX_HOME` with `cwd` rewritten to the new project folder.
- Imported chat rows keep the original generated title and source ordering when title metadata is available, and sessions without explicit DB timestamp metadata keep their source JSONL ordering instead of being treated as newly updated.
- Imported chat sessions are rewritten to the destination home's current model and provider so resumed imported threads use the active local configuration.
- The menu item remains readable and aligned in both light and dark themes.

#### Rollback / Cleanup
- Delete the downloaded ZIP files from the browser download location.
- Delete the imported project folder and any imported test sessions from the isolated `CODEX_HOME`.
