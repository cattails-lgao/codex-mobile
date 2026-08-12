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

### Round-38: @ suggestions exclude ignored/generated directories

#### Feature/Change Name
The fuzzy search session results are filtered before display: paths under ignored directories (`.git`, `node_modules`, `dist`, `build`, `out`, hidden dot-directories, `__pycache__`, `target`, `.venv`, …) are dropped from the `@` file mention list. The app-server session search does not exclude them, so without this filter typing `@re` in a git workspace could surface `.git/refs/heads` and similar VCS internals.

#### Prerequisites/Setup
- Dev server running (`pnpm run dev`)
- A project thread whose workspace is a git repository (or contains a `node_modules`/`dist` folder)

#### Steps
1. In the project thread, type `@` and a fragment that also matches git internals (e.g. `@ref` when `.git/refs` exists).
2. Confirm the suggestion popup lists only real workspace files/directories, with no `.git`, `node_modules`, `dist`, `build` entries.
3. Type `@` with a fragment matching only an ignored path; confirm the popup shows "No matching files" instead of the ignored entries.
4. Select a normal suggestion; confirm the attachment chip is added as before.

#### Expected Results
- VCS internals and dependency/generated folders never appear in the `@` list.
- Behavior is identical in light and dark themes.

#### Rollback/Cleanup
- None.

### Round-39: @ search fallback works without ripgrep

#### Feature/Change Name
The local `/codex-api/composer-file-search` fallback no longer requires `ripgrep` on the machine. When `rg` is unavailable (minimal installs), it degrades to a pure-Node directory walker (the same one used by the Files panel), so `@` mentions keep working. Before this, the fallback threw "ripgrep (rg) is not available" and `@` results depended entirely on the app-server session search (e.g. `@main` could not find `src/main.ts`).

#### Prerequisites/Setup
- Dev server running (`pnpm run dev`)
- A workspace containing `src/main.ts` (or any file whose base name matches the query)
- No `rg` on PATH (or run with `CODEXUI_RG_COMMAND` unset)

#### Steps
1. In a project thread, type `@main`.
2. Confirm `src/main.ts` appears in the suggestion popup.
3. Type `@` with an empty query; confirm workspace files still list (no `.git`/`node_modules` entries).

#### Expected Results
- `@` mentions return the same relative paths as the ripgrep path (scoring identical via `scoreFileCandidate`).
- Behavior is identical in light and dark themes.

#### Rollback/Cleanup
- None.
