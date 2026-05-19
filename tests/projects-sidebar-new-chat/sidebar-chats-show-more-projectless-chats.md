### Sidebar chats show more projectless chats

#### Feature/Change Name
The sidebar Chats section lists the first 10 projectless chats, offers Show more for the rest, and no longer shows the per-section filter button.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Thread history contains more than 10 projectless chats
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Chats section.
2. Count the visible projectless chat rows and confirm only 10 rows are shown initially.
3. Click Show more and confirm older projectless chat rows beyond the first 10 appear.
4. Click Show less and confirm the Chats section returns to 10 visible rows.
5. Confirm the Chats section header only shows the New chat action and does not show a filter button.
6. Use the main sidebar search button and confirm global thread search still opens and filters chats/projects without the 10-row browsing limit.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- The Chats section shows 10 projectless chats by default according to the selected chat sort mode.
- Show more expands the section to all projectless chats, and Show less restores the 10-row default.
- The Chats header does not include a filter action.
- The New chat action remains available.
- The main sidebar search remains functional.
- Rows and header actions remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---
