### Feature: Default runtime uses workspace-write sandbox with on-request approvals

#### Prerequisites
- App server is running from this repository.
- No `CODEXUI_SANDBOX_MODE` or `CODEXUI_APPROVAL_POLICY` environment overrides are set for the launch shell.

#### Steps
1. Start the app normally from this repository without passing `--sandbox-mode` or `--approval-policy`.
2. Open the startup logs or terminal output and find the runtime summary.
3. Confirm the reported sandbox mode is `workspace-write`.
4. Confirm the reported approval policy is `on-request`.
5. Restart the app with explicit overrides, for example `--sandbox-mode danger-full-access --approval-policy never`, and confirm those override the defaults.
6. With those overrides still active, trigger an account flow that uses the temporary app-server path (for example a quota/account inspection request).
7. Confirm the temporary app-server request succeeds under the active override settings and does not behave as if it were still using the original startup defaults.

#### Expected Results
- Default launch uses `workspace-write` sandbox mode.
- Default launch uses `on-request` approval policy.
- Explicit CLI flags still override the defaults when provided.
- Temporary app-server spawns in account routes use the current env-derived runtime args, including CLI overrides.

#### Rollback/Cleanup
- Remove any temporary CLI overrides before leaving the environment.
