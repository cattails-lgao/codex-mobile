### Feature: New thread worktree creation supports searchable base-branch selector

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Use a folder that is inside a Git repository with at least two branches (for example `main` and a feature branch).

#### Steps
1. Open the `New thread` screen.
2. Select a project folder that points to a Git repository.
3. Change runtime to `New worktree`.
4. Verify a `Base branch` dropdown appears.
5. Open the dropdown and type part of a branch name in search.
6. Select a non-default branch from the filtered list.
7. Submit the first message to trigger worktree creation.
8. In the opened thread, confirm `cwd` points to a new worktree path under `~/.codex/worktrees/`.
9. In terminal, run `git -C <new-worktree-path> rev-parse --abbrev-ref HEAD` and `git -C <new-worktree-path> merge-base HEAD <selected-base-branch>`.

#### Expected Results
- `Base branch` selector is visible only in `New worktree` mode.
- Dropdown supports search/filter for branch names.
- Worktree creation succeeds and creates a new branch named `codex/<id>`.
- New worktree branch is based on the selected branch (merge-base confirms expected ancestry).

#### Rollback/Cleanup
- Remove temporary worktree after verification: `git -C <repo-root> worktree remove <new-worktree-path>`.
- Delete temporary branch if needed: `git -C <repo-root> branch -D codex/<id>`.
