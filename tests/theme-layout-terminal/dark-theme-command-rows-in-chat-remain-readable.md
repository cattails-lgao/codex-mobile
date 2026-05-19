### Feature: Dark theme command rows in chat remain readable

#### Prerequisites
- App is running from this repository.
- Open any thread that contains command execution entries.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Open a thread with one or more command execution rows in the conversation.
2. Verify command label text, grouped command label text, and status text in collapsed rows.
3. Locate a file-change summary row (for example: `▶ 2 files changed · 2 edited`) and verify the chevron and summary text are readable.
4. Expand a command row to show output and inspect the output panel border contrast.
5. Confirm status colors for running/success/error command rows are distinguishable in dark mode.
6. Toggle back to `Light` theme and confirm command rows still use the existing light styling.

#### Expected Results
- Command labels and grouped command labels are readable against dark row backgrounds.
- File-change summary rows keep readable chevron and summary text in dark mode.
- Default status text is readable in dark mode.
- Running/success/error status colors remain visible in dark mode.
- Expanded command output border is visible without using a bright light-theme border.
- Light theme command row styling is unchanged.

#### Rollback/Cleanup
- Return appearance setting to the previous user preference.
