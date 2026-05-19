### Feature: Approval request uses legacy in-conversation request card only

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open a thread where Codex can trigger an approval request (for example a command or file-change approval).

#### Steps
1. Trigger an approval request in an existing thread.
2. Observe the conversation timeline where server requests are rendered.
3. Observe the composer area at the bottom of the thread.
4. Confirm the approval controls are shown in the in-conversation request card.
5. Confirm no separate composer waiting-state approval panel is rendered.

#### Expected Results
- Exactly one approval UI is visible for the active pending request.
- The approval UI appears in the conversation request card.
- Composer continues to show the standard composer UI without a separate approval panel.

#### Rollback/Cleanup
- No cleanup required.
