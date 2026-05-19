### Startup avoids duplicate setup probes

#### Feature/Change Name
Startup loads Git repository status only for the active thread/new-thread cwd or an opened project menu, shares workspace-root state reads, and returns free-mode status without waiting on OpenRouter model discovery.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. Browser runtime profiler available (`pnpm run profile:browser`)
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
2. Inspect the generated `output/playwright/browser-runtime-profile-*.json`.
3. Confirm startup does not call `/codex-api/git/repository-status` once per visible project.
4. Confirm startup performs at most one `/codex-api/workspace-roots-state` GET before user actions.
5. Confirm `/codex-api/free-mode/status` completes without waiting for a live `https://openrouter.ai/api/v1/models` request.
6. Open a thread and confirm at most the selected thread cwd is checked with `/codex-api/git/repository-status`.
7. Open the project action menu for several projects and confirm Git-backed actions still appear only for Git repositories after each menu-specific status check.
8. Switch to dark theme and repeat steps 1-7.

#### Expected Results
- Initial sidebar Git status hydration does not scan every visible project.
- The `/codex-api/git/repository-status/batch` endpoint is not used.
- Git status checks are lazy and scoped to the active thread/new-thread cwd or the project menu being opened.
- App startup and initial thread loading share workspace-root state loading instead of issuing duplicate startup reads.
- Free-mode status returns cached or fallback model options immediately and refreshes model discovery in the background.
- Git-backed project menu actions remain correct in light theme and dark theme.
- Free-mode controls remain readable and functional in light theme and dark theme.

#### Rollback/Cleanup
- Remove generated `output/playwright/browser-runtime-profile-*` artifacts if they are not needed for comparison evidence.

---
