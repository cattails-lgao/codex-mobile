### Feature: Backticked bare filenames render as file links

#### Prerequisites
- App is running from this repository.
- An active thread is open with a project `cwd`.
- Optional: file exists at `<project cwd>/redroid_mainactivity.png`.
- Verify once in light theme and once in dark theme.

#### Steps
1. Send this exact message:
   `redroid_mainactivity.png`
2. In the rendered message, confirm it appears as one clickable file link.
3. Click the link and confirm it opens local browse for `<project cwd>/redroid_mainactivity.png`.
4. Switch between light and dark theme and confirm the file-link chip remains readable.

#### Expected Results
- The backticked bare filename renders as `a.message-file-link`, not inline code.
- The link href resolves through `/codex-local-browse` using the current project `cwd`.
- The title contains the resolved file path, and the visible text is `redroid_mainactivity.png`.
- Light and dark themes both show the link with readable contrast.

#### Rollback/Cleanup
- Remove `<project cwd>/redroid_mainactivity.png` if it was created only for this verification.

---
