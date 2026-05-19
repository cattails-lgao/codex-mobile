### Feature: Remove GitHub trending projects from the new-thread screen

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- Any previously saved local storage value for `codex-web-local.github-trending-projects.v1` may still exist from older builds.

#### Steps
1. Open Settings and inspect the available rows.
2. Confirm there is no `GitHub trending projects` toggle.
3. Return to the home/new-thread screen and confirm no trending cards or scope dropdown are shown.
4. Refresh the page and confirm the UI stays unchanged even if the old local storage key exists.

#### Expected Results
- Settings no longer offers any GitHub trending projects preference.
- The home/new-thread screen no longer renders a trending projects section.
- Refreshing does not restore the removed feature from stale local storage.

#### Rollback/Cleanup
- None.
