### Windows codex app-server spawn via real binary resolution

#### Feature/Change Name
On Windows, the `codex` on `PATH` is typically an npm/pnpm `.cmd` shim that
wraps the `@openai/codex` JS launcher. Spawning it through `cmd.exe` corrupts
arguments that contain both quotes and spaces (e.g.
`-c model_providers.opencode_zen.name="OpenCode Zen"`), so the app-server
exits at startup and every `/codex-api/rpc` call returns
`codex app-server exited unexpectedly`. The bridge now resolves the real
`codex.exe` from the installed package (direct `vendor` layout, or the
platform optional dependency resolved from the symlink-real package dir, the
same way the JS launcher does) and spawns it directly.

#### Prerequisites/Setup
1. Windows host with Node managed by fnm/nvm and `codex` installed globally
   via `pnpm add -g @openai/codex` or `npm install -g @openai/codex`.
2. Confirm `where codex` reports a `.cmd`/`.bat` shim (e.g.
   `C:\Users\<user>\AppData\Local\pnpm\bin\codex.CMD`).
3. Confirm the real binary exists under the package `vendor`
   (`node_modules\@openai\codex\vendor\<triple>\bin\codex.exe` or the platform
   optional dependency).

#### Steps
1. Run `pnpm run dev` from a normal (non-sandboxed) terminal and open the app.
2. Open a new chat and confirm no `Codex CLI not found` banner appears.
3. Send a message and confirm the turn runs (working state, no
   `codex app-server exited unexpectedly` error).
4. Open the browser devtools network tab, POST to `/codex-api/rpc`
   (`provider/list`) and confirm a 200 JSON-RPC response instead of 502.
5. Verify an actual `codex.exe app-server` process is running (Task Manager or
   `Get-CimInstance Win32_Process -Filter "Name='codex.exe'"`).

#### Expected Results
- No `Codex CLI not found` banner and no 502 from `/codex-api/rpc`.
- The app-server process is `codex.exe`, not `cmd.exe /d /s /c ... codex ...`.
- Chat turns complete normally.

#### Rollback/Cleanup
- Restart the dev server if the app-server was started with stale code.
- If the resolution fallback is hit, the previous behavior (shim via cmd.exe)
  applies; report the resolved command and exit code.
