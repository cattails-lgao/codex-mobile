### Default mode can follow plan mode in the same thread

#### Feature/Change Name
Composer collaboration mode changes send `default` explicitly so a thread can leave plan mode without opening a new chat.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A Codex account/session with both Default and Plan collaboration modes available
3. A project folder selected for a new or existing thread

#### Steps
1. Select Plan mode in the composer
2. Send a prompt asking Codex to create a plan
3. After the turn completes, switch the composer back to Default mode
4. Send a follow-up prompt asking Codex to implement the plan in the same thread
5. Repeat the Default follow-up once more in the same thread

#### Expected Results
- The implementation prompts run in Default mode instead of staying in Plan mode
- The thread remains usable without opening a new chat
- The composer selection and the backend turn mode stay aligned across consecutive turns

#### Rollback/Cleanup
- Archive the test thread if it was created only for verification

---
