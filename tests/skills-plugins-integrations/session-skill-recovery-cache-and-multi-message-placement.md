### Session skill recovery cache and multi-message placement

#### Feature/Change Name
Recovered selected-skill metadata is cached per session log and attached to the latest user message in the turn.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer `Skills` dropdown
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open an existing thread or start a new thread.
2. Select one skill from the composer `Skills` dropdown.
3. Type and send a short message.
4. Refresh or reopen the same thread twice.
5. Confirm the sent user message still shows one skill chip and does not accumulate duplicate chips.
6. Switch to dark theme and repeat steps 2-5 with another message.
7. Run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts`.

#### Expected Results
- Skill metadata recovered from session JSONL remains visible after repeated history loads.
- Repeated loads reuse the unchanged session recovery parse instead of reparsing the same log for every turn-bearing RPC.
- In turns with multiple user-message items, recovered skill chips are attached to the latest user message in that turn.
- Skill chips remain readable in both light and dark themes.

#### Rollback/Cleanup
- Remove disposable test messages/threads if needed.

---
