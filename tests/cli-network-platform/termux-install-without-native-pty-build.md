### Termux install without native PTY build

#### Feature/Change Name
Android Termux installs can complete when `node-pty` has no compatible native build.

#### Prerequisites/Setup
1. Android device or emulator with Termux installed.
2. Node.js and npm available in Termux.
3. Network access to npm and GitHub.
4. A macOS or Linux desktop remains available for supported-host integrated terminal checks.
5. Light theme and dark theme are available from the appearance switcher on the desktop check.

#### Steps
1. In Termux, run `npm i -g codexapp@latest` after the fixed version is published.
2. Confirm installation does not fail if npm cannot build `node-pty` for `android-arm64`.
3. Run `codexapp --no-login` in Termux.
4. Open the printed URL and confirm the app loads.
5. Open a thread and confirm the integrated terminal reports unavailable instead of crashing the server if native PTY support is missing.
6. On macOS or Linux, run `npm i -g codexapp@latest`, then start `codexapp --no-login`.
7. Open a thread in light theme and confirm the integrated terminal still opens on the supported host.
8. Switch to dark theme and confirm the integrated terminal remains readable.

#### Expected Results
- Termux install completes even when `node-pty` cannot build on Android.
- The Termux app server starts and the browser UI loads.
- Missing native PTY support disables only the integrated terminal, not the whole app.
- Supported hosts still install `node-pty` and keep integrated terminal behavior in light theme and dark theme.

#### Rollback/Cleanup
- Remove test global installs with `npm rm -g codexapp`.

---
