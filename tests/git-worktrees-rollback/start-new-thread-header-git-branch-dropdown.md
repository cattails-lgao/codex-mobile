### Feature: Start new thread header Git branch dropdown

#### Prerequisites
- App server is running from this repository.
- At least one Git-backed workspace folder is available in the Start new thread folder dropdown.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme.
2. Click the sidebar or header new thread icon to open Start new thread.
3. Select a Git-backed folder.
4. Confirm the header actions next to the terminal control show the Git checkout branch dropdown.
5. Open the branch dropdown and confirm branch search/options are available.
6. Switch to dark theme and repeat steps 2-5.

#### Expected Results
- Start new thread shows the same header Git checkout dropdown used by existing thread pages when the selected folder is a Git repository.
- Switching the selected folder updates the dropdown branch state for that folder.
- Non-Git folders do not show the Git checkout dropdown.
- Light and dark theme header controls remain readable and aligned.

#### Rollback/Cleanup
- If a branch was switched during testing, switch back to the original branch before continuing.
