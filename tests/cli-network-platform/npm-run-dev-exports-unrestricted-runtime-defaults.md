### Feature: npm run dev exports unrestricted runtime defaults

#### Prerequisites
- Node and pnpm are installed.
- No shell-level `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` overrides are set.

#### Steps
1. Run `npm run dev` from the repository root.
2. In a second terminal, run `ps eww -p $(pgrep -f "vite" | head -n 1)`.
3. Confirm the process environment contains `CODEXUI_SANDBOX_MODE=danger-full-access` and `CODEXUI_APPROVAL_POLICY=never`.
4. Stop dev server and run `CODEXUI_SANDBOX_MODE=workspace-write CODEXUI_APPROVAL_POLICY=on-request npm run dev`.
5. Re-check the Vite process environment values.

#### Expected Results
- Default `npm run dev` includes `CODEXUI_SANDBOX_MODE=danger-full-access` and `CODEXUI_APPROVAL_POLICY=never`.
- Explicit shell overrides still take precedence when provided.

#### Rollback/Cleanup
- Stop running dev servers and unset temporary env overrides.
