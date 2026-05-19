### Feature: Empty project new thread action

#### Prerequisites
- App server is running from this repository.
- At least one workspace root is registered that has no threads.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme.
2. Find the empty project row in the sidebar that shows `No threads`.
3. Click that project's new thread icon.
4. Confirm the home composer opens and the folder dropdown is set to the empty project's workspace root.
5. Switch to dark theme and repeat steps 2-4.

#### Expected Results
- The new thread icon works for projects with zero threads.
- The new thread screen uses the clicked project's registered workspace root instead of leaving the folder blank or reusing another project.
- Light and dark theme sidebar and composer surfaces remain readable.

#### Rollback/Cleanup
- No cleanup is required unless a test message is sent; delete that test thread if created.
