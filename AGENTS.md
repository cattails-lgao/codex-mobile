# AGENTS.md

## Build And Restart Runbook

- Build the project with `npm run build`.
- Port `4172` is retired and must not be used for debugging, testing, or deployment.
- The only runtime environment is the `4173` instance.
- After each change, do not run manual browser testing or Playwright verification unless the user explicitly asks for it.
- The `4173` instance must run in an isolated `tmux` session in the background.
- The `4173` instance must start without password protection; always include `--no-password` in the launch command.
- Recommended update flow:
  1. `npm run build`
  2. `tmux has-session -t codexui-prod 2>/dev/null && tmux kill-session -t codexui-prod`
  3. `tmux new-session -d -s codexui-prod 'cd /projects/srv/codexui && node dist-cli/index.js --port 4173 --no-tunnel --no-password'`

## "Push to main or commit to main" Means Merge To Local Main

- When the user says "push", interpret it as: merge the current work into local `main`
- Do not push to any remote unless the user explicitly asks to push to a remote.

## Merge to local main flow for worktree:

1. In the worktree, commit changes and create a branch.
   - `git add -A && git commit -m "<message>"`
   - `git switch -c <your-branch>`
2. If the user asks for a **single merge commit**, do this exact sequence in the main worktree:
   - find pre-merge `main` from reflog (example: `git reflog main`)
   - `git checkout main`
   - `git reset --hard <pre-merge-main-commit>`
   - `git checkout <your-branch>`
   - `git rebase main`
   - `git checkout main`
   - `git merge --no-ff <your-branch> -m "Merge branch '<your-branch>' into main"`
3. Otherwise, merge into local `main` from the main worktree:
   - `git checkout <your-branch>`
   - `git rebase main`
   - `git checkout main`
   - `git merge --no-ff <your-branch>`

## Commit After Each Task

- Always create a commit after completing each discrete task or sub-task.
- Do not batch multiple tasks into a single commit.
- Each commit message should describe the specific change made.

## Completion Requirement

- Do not run routine testing after each change.
- Default completion for any change is:
  1. `npm run build`
  2. restart the `tmux` session on port `4173`
- Manual browser checks, Playwright verification, screenshots, and CJS smoke tests are only required when the user explicitly asks for them.
- If explicitly requested, run browser automation against `http://127.0.0.1:4173`.

## Browser Automation: Prefer Playwright CLI Over Cursor Browser Tool

- For all browser interactions (navigation, clicking, typing, screenshots, snapshots), prefer the Playwright CLI skill in headless mode over the Cursor IDE browser MCP tool.
- Do not run Playwright for routine task completion unless the user explicitly asks for it.
- Playwright CLI is faster, more reliable, and works in headless environments without a desktop.
- Use headless mode by default; only add `--headed` when a live visual check is explicitly needed.
- Skill location: `~/.codex/skills/playwright/SKILL.md` (wrapper script: `~/.codex/skills/playwright/scripts/playwright_cli.sh`).
- Minimum reporting format in completion messages:
  - tested URL
  - viewport(s)
  - assertion/result summary
  - screenshot absolute path(s)
  - CJS command/result (only when the user explicitly requested CJS verification)

## NPX Testing Rule

- For any `npx` package behavior test, **publish first**, then test the published `@latest` package.
- Do not rely on local unpublished changes when validating `npx` behavior.
- Run `npx` validation on the Oracle host (not local machine) unless user explicitly asks otherwise.
- For Playwright verification of `npx` behavior, use the Oracle host Tailscale URL (for example `http://100.127.77.25:<port>`) instead of `localhost`.

## A1 Playwright Verification (From Mac via Tailscale)

- Use this flow only when the user explicitly asks to validate UI behavior on Oracle A1 from the local Mac machine.
- On A1, start the app server with Codex CLI available in `PATH`:
  - `export PATH="$HOME/.npm-global/bin:$PATH"`
  - `node dist-cli/index.js --port 4173 --no-tunnel --no-password`
- From Mac, run Playwright against Tailscale URL (`http://100.127.77.25:4173`), not localhost.
- Verify success with both checks:
  - UI assertion in Playwright (new project/folder appears in sidebar or selector).
  - Filesystem assertion on A1 (`test -d /home/ubuntu/<project-name>`).
- Save screenshot artifact under `output/playwright/` and include it in the report.
