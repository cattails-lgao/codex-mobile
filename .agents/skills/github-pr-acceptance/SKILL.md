# GitHub PR Acceptance

## When To Use

Use this skill when the user explicitly asks to accept/merge a pull request on GitHub (not just locally).

## Goal

Ensure the PR is shown as **MERGED** on GitHub, with `mergedAt` and `mergeCommit` populated.

## Workflow

1. Perform local integration first
- Merge intended work into local `main` using repository merge rules.

2. Push `main` to canonical remote
- For this project, canonical remote is `https://github.com/friuns2/codexUI.git`.

3. Verify PR state
- Run:
  - `gh pr view <number> --repo friuns2/codexUI --json state,mergedAt,mergeCommit,mergeStateStatus,url`
- If `state` is `MERGED`, stop.

4. If still `OPEN`
- If `mergeStateStatus` is `DIRTY` (common after rebase or cross-repo PR):
  - push reconciled branch to PR head ref.
  - if still open, create a no-content linkage merge commit on `main` against exact PR head SHA:
    - `git checkout main`
    - `git merge --no-ff -s ours <pr-head-sha> -m "Merge pull request #<number> from <owner>/<branch>"`
  - push `main` again.

5. Final verification (mandatory)
- Re-run `gh pr view ...` and confirm:
  - `state: MERGED`
  - `mergedAt` is non-null
  - `mergeCommit` is non-null

## Notes

- Local merge alone is not enough when user asks for GitHub acceptance.
- Cross-repo PRs may remain open even after equivalent code lands if ancestry/linkage is missing.
- If contributor attribution matters, avoid rewriting PR commit ancestry where possible.
