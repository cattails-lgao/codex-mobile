### Feature: Project menu Save project ZIP export

#### Prerequisites / Setup
- Start the app from a checkout with at least one saved local project root.
- Use a project folder containing a small known file, and ensure `.git` and `node_modules` may be present for exclusion checks.

#### Actions
1. Open the sidebar project action menu in light theme.
2. Click `Save project`.
3. Confirm the browser receives a `.zip` download for the selected project.
4. Inspect the ZIP contents.
5. Switch to dark theme and repeat steps 1-3.

#### Expected Results
- The project menu contains `Save project` between `Browse files` and automation actions.
- Clicking `Save project` downloads a ZIP blob without navigating away from the app.
- The archive includes project files under relative paths.
- `.git`, `node_modules`, and `.DS_Store` entries are not included.
- The menu item remains readable and aligned in both light and dark themes.

#### Rollback / Cleanup
- Delete the downloaded ZIP files from the browser download location.
