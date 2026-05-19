### Terminal quick commands from project files

#### Feature/Change Name
Terminal quick commands are discovered from the current project instead of using a static built-in npm list.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. Open a thread or new chat whose working directory has a `package.json` with scripts
3. Optionally create executable candidates under the project root and `scripts/`, such as `check.sh`, `scripts/check.sh`, or `scripts/build.cmd`
4. Optionally add `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb` to verify package-manager detection
5. Optionally add a `Makefile` with simple targets such as `test:` or `build:`

#### Steps
1. Open the terminal panel for that project
2. Open the `Run...` dropdown
3. Verify each `package.json` script appears with the detected package manager, such as `pnpm run <script>`, `yarn <script>`, `bun run <script>`, or `npm run <script>`
4. Verify simple `Makefile` targets appear as `make <target>`
5. Verify root-level `*.sh` / `*.cmd` files appear as `./<file>`
6. Verify `scripts/*.sh` and `scripts/*.cmd` files appear as `./scripts/<file>`
7. Select one discovered command and confirm it is sent to the terminal
8. Reopen the dropdown after running commands multiple times
9. If the project has more commands than fit in the menu, scroll the dropdown and verify lower-priority entries such as `./scripts/<file>.sh` remain reachable
10. From a closed terminal state on a remote server, select a command immediately after opening the `Run...` menu and confirm it runs after the terminal attaches

#### Expected Results
- The dropdown is based on the current project `cwd`
- Static defaults like `npm run dev` do not appear unless they exist in that project's `package.json`
- Package script commands use the lockfile-preferred package manager
- Make targets are listed after package scripts
- Root and `scripts/` script-file commands are listed after Make targets
- Commands are sorted by most-used and then most-recent usage, and the dropdown scrolls instead of hiding entries beyond the first five
- Selecting a command while the terminal is still mounting waits for the attach flow instead of dropping the command

#### Rollback/Cleanup
- Remove any temporary files created under the project root or `scripts/`

---
