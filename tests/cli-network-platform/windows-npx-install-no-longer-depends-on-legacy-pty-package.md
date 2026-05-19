### Feature: Windows npx install no longer depends on legacy PTY package

#### Prerequisites
- A Windows machine with Node.js and npm installed.
- No globally installed `codexapp` package.
- Clear any previous temporary npm cache for `codexapp` if needed.

#### Steps
1. Run `npx codexapp --no-login` on Windows.
2. Confirm npm does not print deprecation warnings for `prebuild-install`, `npmlog`, `are-we-there-yet`, or `gauge` during package install.
3. Exit the app, then run `npx codexapp --no-login` again.
4. Run `npm i -g codexapp` on Windows.
5. Start the globally installed CLI with `codexapp --no-login`.
6. On macOS or Linux, start the app normally and confirm the integrated terminal still opens in a thread.
7. Repeat the integrated terminal check in both light theme and dark theme.

#### Expected Results
- Windows `npx` install no longer pulls `node-pty-prebuilt-multiarch` as a required install dependency.
- The deprecated `prebuild-install` dependency chain warnings no longer appear for `codexapp` installation.
- Re-running `npx codexapp --no-login` works without getting stuck in the same failed temporary install loop.
- Global installation succeeds on Windows.
- Integrated terminal continues to work through `node-pty` on supported hosts.
- Light theme and dark theme terminal surfaces remain readable and unchanged.

#### Rollback/Cleanup
- Remove the global package with `npm rm -g codexapp` if it was installed only for verification.

#### Prerequisites
- App is running from this repository.
- At least one thread can run a long response (for example, request a large code explanation).

#### Steps
1. Send a prompt that keeps the assistant generating for several seconds.
2. Immediately click the `Stop` button before the first assistant chunk fully completes.
3. Confirm generation halts.
4. Repeat with a resumed/existing in-progress thread (reload app while a turn is running, then click `Stop`).

#### Expected Results
- No error appears saying `turn/interrupt requires turnId`.
- Turn is interrupted successfully in both immediate-stop and resumed-thread scenarios.
- Thread state exits in-progress and the stop control returns to idle.

#### Rollback/Cleanup
- None.
