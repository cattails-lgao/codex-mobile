### Feature: Public shared skills pull overwrites only shared skills

#### Prerequisites
- App running from this repository with Skills Hub available.
- GitHub skills sync is not configured/logged in.
- Local shared skills directory exists at `~/.codex/skills/shared_skills`.

#### Steps
1. Create a temporary local-only skill folder under `~/.codex/skills/shared_skills`, or edit a tracked shared skill file in that directory.
2. Note the parent `~/.codex/skills` status, including any unrelated local edits outside `shared_skills`.
3. Open `Skills Hub`.
4. Trigger `Pull` from the `Skills Sync (GitHub)` panel.
5. Wait for the pull success toast.
6. Inspect `~/.codex/skills/shared_skills` and compare it with the public `OpenClawAndroid/skills` `android` branch.
7. Inspect `~/.codex/skills` and verify unrelated parent-level files were not reset or cleaned by the unauthenticated pull.
8. If `~/.codex/skills/shared_skills/.git` is a git file or worktree/submodule-style pointer, repeat the pull and verify the nested repo is not reinitialized.
9. Inspect the `/codex-api/skills-sync/pull` response and verify `data.synced` matches the number of direct shared skill folders with `SKILL.md`.
10. In light theme, verify the Skills Hub list reloads and does not show stale local-only skills.
11. Switch to dark theme and verify the same Skills Hub state remains readable and current.

#### Expected Results
- Public unauthenticated pull resets only the nested `shared_skills` repo to the public upstream `android` branch.
- Local uncommitted edits and local-only untracked skill folders inside `shared_skills` are removed by the pull.
- Parent-level `~/.codex/skills` files outside `shared_skills` are not reset or cleaned.
- Existing git-file/worktree/submodule-style shared skills repos are reused, not reinitialized.
- The pull response reports the shared skills count from `~/.codex/skills/shared_skills`, not the parent skills directory.
- The installed skills list reloads immediately after the pull in both light and dark theme.
- Private GitHub sync repos still preserve local edits through the bidirectional sync path.

#### Rollback/Cleanup
- Recreate any intentionally removed local-only shared skill if it should be kept.
- Use private sync `Push` only after confirming the public pull result should be mirrored elsewhere.
