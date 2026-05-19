### Selected skills visible on sent chat messages

#### Feature/Change Name
Selected composer skills are shown as skill chips on the user message after send/history load.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer `Skills` dropdown
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open an existing thread or start a new thread.
2. Open the composer `Skills` dropdown and select one skill.
3. Type and send a short message.
4. Confirm the sent user message shows a `Skill` chip with the selected skill name.
5. Click the skill chip and confirm the current browser tab opens the skill `SKILL.md` file through the local browse view.
6. Refresh or reopen the thread and confirm the same skill chip remains visible and clickable in history.
7. Switch to dark theme and repeat steps 2-6 with another message.

#### Expected Results
- Selected skills are visible on the user message, not only in the composer before send.
- Skill chips show the skill name and expose the skill path in the tooltip.
- Skill chips link to the selected skill file using the local browse route in the current tab.
- Skill chips remain visible after thread history reload.
- Skill chips are readable in both light and dark themes.

#### Rollback/Cleanup
- Remove disposable test messages/threads if needed.

---
