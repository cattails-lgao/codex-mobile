### Header Git branch dropdown with commit reset

#### Feature/Change Name
Thread header Git dropdown replaces the simple review action with a commits/branches picker, Review access, safe branch switching, selected-commit file details, branch reset-to-commit, and reset-history commit preservation.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread whose `cwd` is inside a Git repository with at least two branches and several commits
3. Use a disposable local branch with at least two commits ahead of its reset target.
4. Ensure the repository has no tracked uncommitted changes for successful branch switch/reset paths: `git -C <thread-cwd> status --porcelain`
5. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open the Git dropdown in the thread header.
2. Confirm the trigger shows the current branch, or the detached commit subject if the repository is already detached.
3. Confirm the menu initially shows only commits on the left and branches on the right, with no commit-files panel before a commit is selected.
4. Confirm the left column defaults to the current branch and shows no more than 50 recent commits with short SHA, subject, and date.
5. Confirm the open dropdown visually layers above the sidebar and above the Review pane if the pane is already open.
6. Confirm the top action is styled as a button, reads `Review Worktree Changes`, and shows `+`/`-` line counts; click it and confirm the dropdown stays open while the review pane opens above it directly to changes without showing a `Findings` tab or `Run review` button; click the Review pane `X` and confirm only the pane closes while the dropdown stays open; click `Review Worktree Changes` again and confirm the pane toggles open.
7. Type part of a commit subject or short SHA in the left commit search and confirm the commit list filters.
8. Turn off `Reset-history refs` and confirm the commit list reloads without saved reset-history refs.
9. Turn `Reset-history refs` back on and confirm saved reset-history commits reappear when available.
10. Toggle `Reset-history refs` while the commit list is still loading and confirm the list reloads for the new toggle state instead of staying on the previous result.
11. Type part of a branch name in search and confirm the branch list filters.
12. Click a different branch row and confirm the left commit list changes to that branch without immediately switching checkout.
13. Use the branch row `Checkout` action with a clean worktree and confirm the header updates to that branch.
14. Confirm local branches appear first and remote branches appear at the end of the branch list.
15. Select a remote branch row and confirm it can load commits but does not show a `Checkout` action.
16. Select an older commit on the disposable local branch and confirm the dropdown widens and shows a left-side file panel with that commit subject, file changes, per-file `+`/`-` line counts, and a `Reset` button without changing HEAD.
17. Click a commit ref badge and confirm the full commit SHA is copied to the clipboard without changing the selected commit.
18. Click a file in the selected commit details and confirm the dropdown closes, clears the selected commit state for the next open, and the Review pane opens in commit mode with that file selected without auto-centering the first hunk; if the Review pane previously used base-branch comparison, confirm the commit review meta row shows the commit SHA and does not show `vs <base-branch>`.
19. Click `Reset` for the selected commit and confirm the header stays on that branch instead of entering detached HEAD.
20. Confirm `git -C <thread-cwd> rev-parse --abbrev-ref HEAD` still prints the branch name and `git -C <thread-cwd> rev-parse --short HEAD` matches the selected commit.
21. Reopen/select the same branch and confirm commits that were ahead of the reset target still appear, with the selected branch HEAD marked `current`.
22. Repeat reset on the same branch several times and confirm the dropdown still opens quickly and shows recent reset-history commits.
23. Create a tracked uncommitted change, try to switch branch or reset to a commit, and confirm the dropdown shows a dirty-worktree error instead of switching or resetting.
24. Create only an untracked file whose path includes leading/trailing whitespace and does not exist in the target commit, try to reset to a commit, and confirm the reset proceeds while the exact untracked filename remains in place.
25. Create only an untracked file whose path includes leading/trailing whitespace and exists in the target commit, try to reset to that target, and confirm the reset proceeds and the exact untracked filename is moved under `.codex/untracked-backups/` instead of being overwritten or renamed incorrectly.
26. Add or inspect a commit that changes a file whose name includes leading/trailing whitespace, then select that commit and confirm the commit file list shows the exact path, correct `+`/`-` counts, and opens the same path in the Review pane.
27. Create an untracked nested file whose parent path is a tracked file in the target commit, or the inverse file/directory case, and confirm checkout/reset moves the conflicting untracked path to `.codex/untracked-backups/` before the Git operation.
28. Force a checkout/reset failure after an untracked backup move, such as by making the target branch unavailable in a disposable repository, and confirm the moved untracked file is restored to its original path.
29. Open a commit file in the Review pane, navigate to a different thread or repository cwd, and confirm the commit-scoped file/sha state clears and the pane closes instead of showing the old commit against the new repo.
30. At a mobile viewport around 375px wide, select a commit and confirm the dropdown fits inside the viewport with branches first, commits second, and selected-commit files last, stacked vertically instead of squeezed into columns.
31. Narrow the Review pane file list and confirm changed-file rows do not inherit folder-depth indentation, long names truncate on one line instead of wrapping vertically, and the `+`/`-` counts remain visible.
32. At a mobile viewport around 375px wide, open the Review pane, scroll the diff content vertically, and confirm the `X` close button remains visible and tappable in the top-right corner.
33. Switch to dark theme and repeat steps 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, and 32.

#### Preserved Prior Coverage
1. Click `Review Worktree Changes` and confirm the review pane opens; click it again and confirm the pane toggles.
2. Type part of a branch name in search and confirm the branch list filters.
3. Select a different branch with a clean worktree using the checkout action and confirm the header updates to that branch.
4. Select a branch row and confirm recent commits load with short SHA, subject, and date.
5. Confirm remote branch rows are inspectable, appear after local branches, and do not trigger local reset without a supported local branch action.
6. Select an older commit on the disposable local branch and confirm the header stays on that branch instead of entering detached HEAD.
7. Confirm `git -C <thread-cwd> rev-parse --abbrev-ref HEAD` still prints the branch name and `git -C <thread-cwd> rev-parse --short HEAD` matches the selected commit after reset.
8. Reopen/select the same branch and confirm commits that were ahead of the reset target still appear, with the selected branch HEAD marked `current`.
9. Repeat reset on the same branch several times and confirm the dropdown still opens quickly and shows recent reset-history commits.
10. Create a tracked uncommitted change, try to switch branch or reset to a commit, and confirm the dropdown shows a dirty-worktree error instead of switching or resetting.
11. Create only an untracked file, try to reset to a commit, and confirm the reset proceeds while preserving the untracked file in place or moving it to `.codex/untracked-backups/` if the target would overwrite it.
12. Switch to dark theme and repeat the branch filtering, commit loading, reset-history, dirty-worktree, and untracked-file checks.

#### Expected Results
- The header dropdown exposes Review, current checkout state, a left-side commit list, and a right-side searchable branch list before a commit is selected.
- The selected-commit file panel is hidden until commit selection, then appears on the left and expands the dropdown width.
- Each selected-commit file row shows added and removed line counts, using `-` for binary or unavailable counts.
- The dropdown layer is viewport-positioned and appears above the sidebar when open.
- The Review pane renders above the open dropdown and app chrome.
- Clicking the dropdown `Review Worktree Changes` button keeps the dropdown open while toggling the Review pane.
- Clicking the Review pane `X` while the dropdown is open closes only the Review pane and leaves the dropdown open.
- The `Review Worktree Changes` button shows current worktree added and removed line counts.
- The Review pane toolbar keeps `Refresh` but does not show a `Findings` tab or `Run review` button.
- The current branch commit list loads by default and is capped at 50 commits.
- The commit list can be searched by SHA, subject, or date without changing the selected branch.
- Reset-history refs can be shown or hidden from the commit list without changing the selected branch.
- Reset-history toggles are keyed by both branch and reset-history state, so an in-flight load for one state does not suppress loading the other state.
- Branch switching and branch reset-to-commit are blocked by tracked uncommitted changes, but untracked-only changes are preserved and allowed.
- Commit selection opens file details without resetting or detaching HEAD.
- Commit ref badges copy the full SHA to the clipboard without triggering commit selection.
- Commit file names and untracked file names with leading/trailing whitespace are parsed from NUL-delimited Git output and are not trimmed before display, counting, backup, or Review-pane navigation.
- The selected commit `Reset` button resets the local branch to that commit instead of detaching HEAD.
- Remote branches are inspectable but cannot be checked out directly from this control.
- Clicking a selected commit file opens the Review pane against that commit diff and selects that path without auto-centering the selected hunk.
- Commit review mode shows the selected commit SHA in the Review pane meta row and never shows a base-branch comparison label.
- Clicking a selected commit file clears the dropdown commit selection before closing, so reopening starts without the stale file panel.
- Changed-file rows in the Review pane file list do not inherit folder-depth indentation, so long names have enough room to truncate horizontally instead of wrapping one character per line when the list is narrow.
- Remote branches appear after local branches in the branch list.
- Prior branch-search, inline-commit, remote-branch inspection, reset-to-commit, dirty-worktree, and untracked-file manual coverage remains represented in the section.
- The branch commit list still shows commits that were ahead of the reset target by reading saved internal reset-history refs.
- Reset-history refs are bounded so repeated resets do not grow commit-list inputs without limit.
- Untracked files that would collide with target tracked files are moved to `.codex/untracked-backups/` before checkout/reset, preserving exact Git path bytes from NUL-delimited output.
- Untracked file/directory conflicts are detected when either the untracked path or target path is the other's directory prefix.
- If checkout/reset fails after moving untracked files into `.codex/untracked-backups/`, those files are restored to their original paths.
- Commit-scoped Review pane state is cleared when navigating to another thread or repository cwd.
- The selected branch HEAD commit is marked `current` in the commit list.
- The mobile Review pane keeps its close button visible above the app chrome in both light theme and dark theme.
- The mobile Review pane diff area scrolls vertically without moving or hiding the pane header.
- The Review pane overlay, toolbar, file list, file sheet, and diff surfaces use dark backgrounds and borders in dark theme instead of showing light surfaces.
- On mobile, branches, commits, and selected-commit file details stack vertically in that order and stay inside the viewport in both light theme and dark theme.
- Loading and error messages remain visible in the dropdown without using browser alerts.
- Dropdown surfaces, text, badges, and errors are readable in both light theme and dark theme.

#### Rollback/Cleanup
- Switch back to the original branch used before the test.
- Reset or delete the disposable local branch used for commit reset validation.
- Revert or discard the tracked dirty-worktree file created for the blocked-switch validation.
- Delete any untracked files created for untracked preservation validation.
- Delete any tracked test commits/files created for whitespace-path commit-list validation.
- Inspect and remove test-only files under `.codex/untracked-backups/` after confirming backup behavior.
- Clear any copied commit SHA from the clipboard if the test environment requires clipboard cleanup.

#### Performance Audit Evidence
- `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser` completed after the review-summary changes.
- Latest report: `output/playwright/browser-runtime-profile-home-2026-05-12T12-50-45-771Z.json`.
- Follow-up report after the commit-review meta-label fix: `output/playwright/browser-runtime-profile-home-2026-05-12T13-04-36-811Z.json`.
- Follow-up report after review-state and untracked-backup fixes: `output/playwright/browser-runtime-profile-home-2026-05-16T02-15-38-533Z.json`.
- The profile showed one `thread/list:first-page` request, one `skills/list` request, one `rateLimitsRead` request, and the existing `threadRead=3` warning. No duplicate review-summary request was introduced on the home route.
- The latest profile showed one `thread/list:first-page` request and existing startup warnings for `threadRead=4` and `skillsList=2`; no review-summary fanout was introduced.
- The review-summary path now uses one tracked `git diff --numstat` plus NUL-delimited `git ls-files --others --exclude-standard -z`; untracked line counts are streamed from disk instead of reading full files into memory.

---
