### Feature: Markdown file links with backticked filename labels render correctly

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- Light and dark themes are both available.
- Local file exists at `/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt`.

#### Steps
1. In light theme, send a message containing: `Added [`TrustedBrowserLauncher.kt`](/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt)`.
2. Confirm the rendered message shows one clickable file link with visible text `TrustedBrowserLauncher.kt`.
3. Click the link and confirm it opens local browse for `/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt`.
4. Right-click the same link and choose `Copy link`, then paste it into a text field and inspect it.
5. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- The markdown link renders as one clickable file link instead of splitting around backticks.
- The visible link text is the markdown label `TrustedBrowserLauncher.kt`, without backtick glyphs.
- Clicking opens the local browse route for the full file path.
- Copied link includes the full encoded path and still resolves to the same file.
- Light and dark theme message surfaces keep the link readable and styled consistently.

#### Rollback/Cleanup
- No cleanup required.
