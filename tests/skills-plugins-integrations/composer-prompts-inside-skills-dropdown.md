### Composer prompts inside Skills dropdown

#### Feature/Change Name
The composer control row uses one `Skills` dropdown for both skills and saved prompts. The `+` action creates a prompt, prompt rows can be inserted or removed from the same menu, and there is no separate `Prompt` control.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Open any existing thread so the composer controls are enabled
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the composer controls and confirm `Skills` appears and no separate `Prompt` control is present
2. Open `Skills` and verify the popup matches the wider card-like layout with large stacked label/description rows
3. Confirm skill rows have compact source markers, such as `R` for repo, `U` for user, `S` for system, or `P` for plugin
4. Click the `+` action in the `Skills` dropdown, enter a unique prompt name such as `ui-test-prompt`, and enter sample content such as `Prompt dropdown smoke test`
5. Reopen `Skills` and confirm the new prompt appears with a `Prompt` marker and an inline `×` remove action
6. Click the prompt row and confirm the prompt text is inserted into the composer draft without toggling a skill
7. Reopen `Skills`, click the `×` button for `ui-test-prompt`, and confirm the removal dialog
8. Confirm the prompt disappears from the dropdown while skill rows remain available
9. Type `/` into the composer and verify no slash skill picker appears
10. Switch to dark theme and repeat the visibility check for the combined `Skills` dropdown contents

#### Expected Results
- The composer shows one `Skills` dropdown for skills and prompts; no standalone `Prompt` dropdown is rendered
- The combined `Skills` popup uses the wider rounded layout with vertically stacked label/description rows
- Skill rows show readable source markers that distinguish repo, user, system, and plugin-provided skills
- Prompt rows show a readable `Prompt` marker and are the only rows with an inline remove action
- Typing `/` in the composer does not open a skill picker
- The `+` action creates a markdown file in the Codex prompt store and adds it to the `Skills` dropdown immediately
- Selecting a saved prompt appends its content into the draft without sending the message
- Clicking `×` removes only the targeted prompt and updates the dropdown immediately
- Light theme and dark theme both keep the new control, menu, and remove action readable and usable

#### Rollback/Cleanup
- Delete any temporary verification prompt created during the test

---
