### Automation panel dark action row specificity fix

#### Feature/Change Name
Automation rename action row dark-theme override is scoped with the component base rule.

#### Prerequisites/Setup
1. Start local Vite: `pnpm run dev --host 127.0.0.1 --port 4173`.
2. Use an account or fixture state with at least one automation-backed thread.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/` and open the automation thread rename panel.
2. Confirm the sticky action row uses a white background and light border.
3. Switch to dark theme and reopen the same panel.
4. Confirm the sticky action row uses a dark zinc background and dark border, with readable buttons and no light strip at the bottom.

#### Expected Results
- The base light action row remains unchanged in light theme.
- In dark theme, the action row reliably uses dark styling from the scoped component rule regardless of global stylesheet injection order.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.

---
