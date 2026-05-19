### Feature: Default runtime uses unrestricted sandbox and no approvals

#### Prerequisites
- Build artifacts are available (or run directly from source in this repo).
- No `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` environment variables are exported in the shell.

#### Steps
1. Start the app from this repository without passing `--sandbox-mode` or `--approval-policy`.
2. Observe startup logs for the printed runtime config lines.
3. Confirm the logs show `Codex sandbox: danger-full-access` and `Approval policy: never`.
4. Stop the app and restart with explicit overrides, for example `--sandbox-mode workspace-write --approval-policy on-request`.
5. Confirm startup logs now show the override values.

#### Expected Results
- Default startup (no flags/env) uses `danger-full-access` sandbox and `never` approval policy.
- Explicit CLI overrides still take precedence and are applied correctly.

#### Rollback/Cleanup
- Unset any temporary env vars used for override checks.
