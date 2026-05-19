### Feature: Sandbox approval requests recognize newer Codex payloads

#### Prerequisites
- App is running from this repository with a Codex CLI/app-server version that can request approvals.
- `bubblewrap` is installed so sandboxed command approvals can be triggered.
- Approval policy is set to request approval on sandbox escalation.

#### Steps
1. Start a thread and ask Codex to run a command that requires approval outside the current sandbox.
2. Wait for the pending request panel to appear.
3. Confirm the request is shown as an approval prompt, not the generic fallback with `Return Empty Result` and `Reject Request`.
4. Verify the panel offers approval choices (`Yes`, `Yes for Session`, decline text field, `Skip`).
5. If the approval payload includes a command preview or writable root, verify that preview text is shown in the panel.

#### Expected Results
- Sandbox-related approval requests are classified as approvals even when Codex sends newer method or payload variants.
- The approval UI offers normal approval actions instead of the unknown-request fallback buttons.
- The request stays attached to the correct thread rather than only appearing as a global pending request.

#### Rollback/Cleanup
- Decline or skip the pending approval request after verification.
