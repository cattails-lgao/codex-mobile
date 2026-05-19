### Editable current folder path in the folder picker

#### Feature/Change Name
The `Select folder` dialog now lets the user edit the current folder path directly, reload that folder on `Enter` or blur, and open the typed path without first clicking a child row.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open the home/new-thread route
3. Have at least two accessible local directories available for navigation
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the `Select folder` dialog from the new-thread folder chooser
2. Confirm the `Current folder` field is an editable text input instead of static text
3. Type a different absolute path and press `Enter`
4. Confirm the folder list reloads for the typed path
5. Edit the path again, click outside the input, and confirm blur also reloads the listing
6. Type a valid absolute path and click `Open`
7. Reopen the dialog, switch to dark theme, and confirm the editable current-folder input remains readable and focusable

#### Expected Results
- The current-folder path can be typed into directly
- Pressing `Enter` on a changed path reloads the folder listing for that path
- Blurring a changed path also reloads the folder listing for that path
- Clicking `Open` uses the typed path when it is valid
- The input remains readable and has visible focus treatment in both light theme and dark theme

#### Rollback/Cleanup
- Return the chooser to the original folder if the test changed the selected project path

---
