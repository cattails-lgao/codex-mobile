### Composer @ file mention uses server fuzzy search with fallback

#### Feature/Change Name
Composer `@` file mentions now prefer the official `fuzzyFileSearch` session methods (`sessionStart` / `sessionUpdate` / `sessionStop`) over the local recursive endpoint, show a clear empty state when the thread has no searchable directory, and fall back to the local endpoint on older Codex versions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Codex CLI available on `PATH` (recent version exposing `fuzzyFileSearch/sessionStart` in `getMethodCatalog()`)
3. A project thread with a real working directory containing files
4. A projectless chat (no `cwd`) or a fresh thread that has not materialized a directory

#### Steps
1. In a project thread, type `@` in the composer and then type a filename fragment (for example `@App`).
2. Confirm a file suggestion popup appears listing matching files from the workspace.
3. Arrow down + Enter (or Tab) to select a file; confirm a file attachment chip is added to the composer and the mention token is removed.
4. Type `@` again, then press Escape; confirm the popup closes and no server session is leaked (verified via `getMethodCatalog()`-exposed session lifecycle in the app-server logs).
5. In a projectless chat (no working directory), type `@`; confirm the popup shows the empty-state message "No searchable directory for this thread" instead of silently showing nothing.
6. Optional: with an older Codex CLI that lacks `fuzzyFileSearch/*`, confirm mentions still work via the local `/codex-api/composer-file-search` fallback.

#### Expected Results
- `@` mentions search the workspace through the official fuzzy search when available.
- The popup either shows matching files, shows "No matching files", or shows the no-directory empty state — never silently disappears.
- Selecting or dismissing the popup stops the server-side search session.
- Older Codex versions degrade to the previous local search without error.
- Behavior is consistent in light and dark themes.

#### Rollback/Cleanup
- None. The local search endpoint remains as the fallback path.
