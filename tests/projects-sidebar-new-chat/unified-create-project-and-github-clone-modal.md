### Feature: Unified create project and GitHub clone modal

Prerequisites/setup:
- Run the app with access to `git` and network access to `github.com`.
- Have a small public GitHub repository URL available for testing.

Steps:
1. Open the app in light theme and navigate to the new chat screen.
2. Confirm the folder actions show `Select folder` and `Create Project`.
3. Click `Create Project` and confirm a modal opens with `New project` and `Clone from GitHub` modes.
4. In `New project`, keep or edit the destination folder, enter a single folder name, and submit.
5. Confirm the created project folder is selected in the new chat folder selector and appears as a project root.
6. Reopen the modal, switch to `Clone from GitHub`, paste a valid `https://github.com/<owner>/<repo>` URL, and submit.
7. Confirm the cloned repository folder is selected in the new chat folder selector and appears as a project root.
8. Switch the app to dark theme and repeat opening the modal.
9. Confirm the modal, tabs, inputs, error message, and buttons have readable contrast and stable spacing.

Expected results:
- New project creation and GitHub cloning share one modal and destination folder field.
- Created and cloned folders are registered as project roots and selected for the new chat.
- After cloning, the folder selector immediately includes the cloned project without a full page refresh.
- Invalid project names or non-GitHub URLs show an inline modal error without changing the selected folder.
- A stalled clone eventually fails with an error instead of keeping the request open indefinitely.
- Light and dark themes render the unified modal consistently with the existing new-chat controls.

Rollback/cleanup:
- Remove the created project folder from the filesystem if it was only used for testing.
- Remove the cloned repository folder from the filesystem if it was only used for testing.
- Remove the test projects from the app project list if they are no longer needed.
