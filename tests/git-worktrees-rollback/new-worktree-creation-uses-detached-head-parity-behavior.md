### Feature: New worktree creation uses detached HEAD parity behavior

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Select a Git-backed folder on `New thread`.

#### Steps
1. Set runtime to `New worktree`.
2. Choose any base branch in `Base branch` dropdown.
3. Send first message to trigger worktree creation.
4. Copy resulting worktree `cwd` from thread context.
5. Run `git -C <worktree-cwd> status --branch --porcelain`.
6. Run `git -C <worktree-cwd> rev-parse --abbrev-ref HEAD`.

#### Expected Results
- Worktree is created successfully.
- Git status reports detached HEAD state (no local branch checkout).
- `rev-parse --abbrev-ref HEAD` returns `HEAD`.

#### Rollback/Cleanup
- Remove test worktree when done: `git -C <repo-root> worktree remove <worktree-cwd>`.
