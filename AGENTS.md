# AGENTS.md
only merge if user asks for it

## Detached HEAD: Merge To Local `main` Without Creating A Branch (only merge if user asks for it)

- If working in detached `HEAD`, commit there first.
- Then apply that commit onto local `main` from the main worktree using fast-forward merge or cherry-pick.

## Merging Worktree Branch to Main With Conflicts

When merging a worktree branch into `main` and conflicts arise:

1. Run `git merge <branch> --no-commit` from the main worktree (`/Users/igor/Git-projects/codex-web-local`).
2. Identify conflicted files with `git diff --name-only --diff-filter=U`.
3. For each conflicted file, resolve using a Python script that replaces the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) with the correctly merged content — keeping changes from **both** sides.
4. Do **not** blindly `--ours` or `--theirs` — manually combine both sides.
5. After fixing, `git add <file>` and `git commit`.
6. Note: the worktree workspace (`zpw/`) is restricted — `StrReplace` tool cannot edit files in the main worktree. Use `Shell` or a Python script instead.

## Commit After Each Task

- Always create a commit after completing each discrete task or sub-task.
- Do not batch multiple tasks into a single commit.
- Each commit message should describe the specific change made.

## Completion Verification Requirement

- After completing a task that changes behavior or UI, always run a Playwright verification in headless mode.
- Before taking any screenshot, wait a few seconds to ensure the UI has fully loaded.
- Always capture a screenshot of the changed result and display that screenshot in chat when reporting completion.

## Browser Automation: Prefer Playwright CLI Over Cursor Browser Tool

- For all browser interactions (navigation, clicking, typing, screenshots, snapshots), prefer the Playwright CLI skill in headless mode over the Cursor IDE browser MCP tool.
- Playwright CLI is faster, more reliable, and works in headless environments without a desktop.
- Use headless mode by default; only add `--headed` when a live visual check is explicitly needed.
- Skill location: `~/.codex/skills/playwright/SKILL.md` (wrapper script: `~/.codex/skills/playwright/scripts/playwright_cli.sh`).
