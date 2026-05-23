### Skills sync idempotent commits and nested shared skills handling

#### Feature/Change Name
Skills Sync skips unchanged manifest writes and does not fail parent commits when only nested `shared_skills` content is dirty.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 5173`)
2. GitHub Skills Sync is connected to a private skills sync repo
3. `/Users/igor/.codex/skills/shared_skills` exists as a nested Git repository
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open `#/skills`.
2. Click `Startup Sync` when no installed skills manifest content has changed.
3. Confirm the sync completes without adding a new `Update synced skills manifest` commit to the GitHub repo.
4. Modify a file inside `/Users/igor/.codex/skills/shared_skills` without committing it inside that nested repository.
5. Click `Push` or `Startup Sync` again.
6. Confirm the sync does not show `Command failed (git commit -m Sync installed skills folder and manifest)` for the parent `/Users/igor/.codex/skills` repository.
7. Confirm the startup auto-push path skips when the only local status is dirty nested `shared_skills` content and local `HEAD` equals `origin/main`.
8. Switch to dark theme and repeat steps 1, 2, and 5.

#### Expected Results
- Unchanged `installed-skills.json` content is not written back to GitHub, so repeated empty-looking manifest commits are not created.
- A dirty nested `shared_skills` repository does not make the parent skills sync fail with `no changes added to commit`.
- Dirty nested `shared_skills` content alone does not keep triggering no-op startup push work.
- Skills Sync status, errors, and action buttons remain readable in light theme and dark theme.

#### Rollback/Cleanup
- Revert or commit the intentional test edit inside `/Users/igor/.codex/skills/shared_skills`.

---
