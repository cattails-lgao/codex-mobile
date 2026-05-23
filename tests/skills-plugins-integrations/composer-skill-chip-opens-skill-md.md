### Composer skill chip opens SKILL.md

#### Feature/Change Name
Selected skill labels in the thread composer open that skill's `SKILL.md` in the web file browser.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer skill picker
3. Browser pop-ups from the local dev origin are allowed
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open any thread with the composer enabled.
2. Open the `Skills` picker and select an installed skill.
3. Confirm the selected skill appears as a green chip above the input field.
4. Click the skill name on the green chip.
5. Confirm a new tab opens to `/codex-local-browse.../SKILL.md` for that skill.
6. Return to the composer and click the chip `x`.
7. Confirm the skill is removed and no file-browser tab is opened by the remove action.
8. Switch to dark theme and repeat steps 2 through 7.

#### Expected Results
- The skill chip label is clickable and opens the selected skill's `SKILL.md` in the web file browser.
- Skill paths that point at a skill directory are normalized to the nested `SKILL.md` file.
- The remove button still only removes the skill from the composer.
- The chip and focus/hover states remain readable in light theme and dark theme.

#### Rollback/Cleanup
- Close any file-browser tabs opened during validation.

---
